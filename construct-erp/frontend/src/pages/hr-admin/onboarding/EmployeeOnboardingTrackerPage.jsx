// src/pages/hr-admin/onboarding/EmployeeOnboardingTrackerPage.jsx
// Per-employee onboarding tracker — a full page (not a modal) so it can be
// deep-linked from notifications/alerts and printed.
import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, CheckCircle2, Circle, Clock, FileText, Laptop, GraduationCap,
  ClipboardList, ChevronDown, ShieldCheck, Ban,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { hrOnboardingAPI, hrEmployeesAPI } from '../../../api/client';
import { B, fade, avatarGrad, initials } from '../../../components/hr/DashboardKit';

const STAGE_LABELS = {
  profile: 'Profile', documents: 'Documents', assets: 'Assets & IT',
  email: 'Email / ERP Access', training: 'Training', orientation: 'Orientation',
  probation: 'Probation', confirmation: 'Confirmation', other: 'Other',
};
const STAGE_ORDER = ['profile', 'documents', 'assets', 'email', 'training', 'orientation', 'probation', 'confirmation'];

const STATUS_META = {
  done: { label: 'Done', icon: CheckCircle2, bg: 'bg-emerald-50', text: 'text-emerald-700' },
  pending: { label: 'Pending', icon: Circle, bg: 'bg-amber-50', text: 'text-amber-700' },
  not_applicable: { label: 'N/A', icon: Ban, bg: 'bg-gray-100', text: 'text-gray-500' },
};

function fmtDate(d) { return d ? new Date(d).toLocaleDateString('en-IN') : '—'; }

function ChecklistItem({ item, employeeId, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [remarks, setRemarks] = useState(item.remarks || '');
  const [dueDate, setDueDate] = useState(item.due_date ? item.due_date.split('T')[0] : '');
  const [location, setLocation] = useState(item.location || '');

  const mut = useMutation({
    mutationFn: (status) => hrEmployeesAPI.updateLifecycle(employeeId, item.id, { status, remarks, due_date: dueDate || null, location }),
    onSuccess: () => { toast.success('Updated'); setEditing(false); onSaved(); },
    onError: (e) => toast.error(e.response?.data?.error || 'Update failed'),
  });

  const meta = STATUS_META[item.status] || STATUS_META.pending;
  const Icon = meta.icon;

  return (
    <div className="p-4 border-b border-gray-50 last:border-0">
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 px-2 py-1 rounded-full flex items-center gap-1 text-xs font-bold flex-shrink-0 ${meta.bg} ${meta.text}`}>
          <Icon className="w-3 h-3" /> {meta.label}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-gray-900 font-bold text-sm">{item.title}</p>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{item.owner_department || 'HR'}</span>
            {item.due_date && <span className="text-[11px] text-gray-400">Due: {fmtDate(item.due_date)}</span>}
            {item.auto_source && <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-50" style={{ color: B.blue }}>Auto</span>}
          </div>
          {item.remarks && !editing && <p className="text-sm text-gray-600 mt-1">{item.remarks}</p>}
          {item.completed_at && <p className="text-xs text-emerald-600 mt-1">Completed {fmtDate(item.completed_at)}{item.completed_by_name ? ` by ${item.completed_by_name}` : ''}</p>}

          {editing && (
            <div className="mt-3 space-y-2">
              <textarea value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Remarks..."
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none" rows={2} />
              <div className="flex flex-wrap gap-2">
                <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                  className="text-sm border border-gray-200 rounded-lg px-3 py-1.5" />
                <input type="text" value={location} onChange={e => setLocation(e.target.value)} placeholder="Location"
                  className="text-sm border border-gray-200 rounded-lg px-3 py-1.5" />
              </div>
              <div className="flex gap-2">
                <button onClick={() => mut.mutate('done')} disabled={mut.isPending}
                  className="text-xs font-bold px-3 py-1.5 rounded-lg text-white" style={{ background: B.success }}>Mark Done</button>
                <button onClick={() => mut.mutate('pending')} disabled={mut.isPending}
                  className="text-xs font-bold px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600">Mark Pending</button>
                <button onClick={() => setEditing(false)} className="text-xs font-bold px-3 py-1.5 text-gray-400">Cancel</button>
              </div>
            </div>
          )}
        </div>
        {!editing && (
          <button onClick={() => setEditing(true)} className="text-xs font-bold flex-shrink-0" style={{ color: B.blue }}>Edit</button>
        )}
      </div>
    </div>
  );
}

export default function EmployeeOnboardingTrackerPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [openStage, setOpenStage] = useState(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['onboarding-tracker', id],
    queryFn: () => hrOnboardingAPI.tracker(id).then(r => r.data.data),
  });

  const verifyMut = useMutation({
    mutationFn: ({ docId, verification_status, rejection_reason }) =>
      hrEmployeesAPI.verifyDocument(id, docId, { verification_status, rejection_reason }),
    onSuccess: () => { toast.success('Document updated'); qc.invalidateQueries({ queryKey: ['onboarding-tracker', id] }); },
    onError: (e) => toast.error(e.response?.data?.error || 'Update failed'),
  });

  if (isLoading || !data) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400" style={{ background: B.bg }}>Loading tracker...</div>;
  }

  const [c1, c2] = avatarGrad(data.name);
  const stages = data.stages || {};

  return (
    <div className="min-h-screen p-4 md:p-6" style={{ background: B.bg }}>
      <button onClick={() => navigate('/hr-admin/onboarding')} className="flex items-center gap-1.5 text-sm font-bold text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to Onboarding Dashboard
      </button>

      {/* Header */}
      <motion.div {...fade(0)} className="bg-white rounded-2xl p-6 mb-6 border border-gray-100 flex flex-wrap items-center gap-5" style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
        <div className="relative w-20 h-20 flex-shrink-0">
          <svg viewBox="0 0 100 100" className="w-20 h-20 -rotate-90">
            <circle cx="50" cy="50" r="42" fill="none" stroke="#F1F5F9" strokeWidth="8" />
            <circle cx="50" cy="50" r="42" fill="none" stroke={B.success} strokeWidth="8"
              strokeDasharray={`${2 * Math.PI * 42}`} strokeDashoffset={`${2 * Math.PI * 42 * (1 - (data.progress_pct || 0) / 100)}`}
              strokeLinecap="round" />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-12 h-12 rounded-full flex items-center justify-center text-white text-sm font-bold"
              style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}>
              {initials(data.name)}
            </div>
          </div>
        </div>
        <div className="flex-1 min-w-[200px]">
          <h1 className="text-xl font-black text-gray-900">{data.name}</h1>
          <p className="text-sm text-gray-500">{data.employee_code} · {data.department_name || 'No department'} · {data.designation_name || '—'}</p>
          <p className="text-xs text-gray-400 mt-1">Joined {fmtDate(data.date_of_joining)}{data.reporting_manager_name ? ` · Reports to ${data.reporting_manager_name}` : ''}</p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-black" style={{ color: B.success }}>{data.progress_pct}%</p>
          <p className="text-xs font-bold text-gray-400 uppercase">{data.done_items}/{data.total_items} items done</p>
        </div>
      </motion.div>

      {/* Stepper */}
      <motion.div {...fade(0.05)} className="bg-white rounded-2xl p-5 mb-6 border border-gray-100 overflow-x-auto" style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
        <div className="flex items-center gap-1 min-w-max">
          {STAGE_ORDER.map((s, i) => {
            const items = stages[s] || [];
            const done = items.length > 0 && items.every(x => x.status === 'done');
            const partial = items.some(x => x.status === 'done');
            return (
              <React.Fragment key={s}>
                <button onClick={() => setOpenStage(s)} className="flex flex-col items-center gap-1.5 px-2">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${done ? 'text-white' : partial ? 'text-white' : 'bg-gray-100 text-gray-400'}`}
                    style={done ? { background: B.success } : partial ? { background: B.warning } : {}}>
                    {done ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
                  </div>
                  <span className="text-[10px] font-bold text-gray-500 whitespace-nowrap">{STAGE_LABELS[s]}</span>
                </button>
                {i < STAGE_ORDER.length - 1 && <div className="w-8 h-0.5 bg-gray-100 flex-shrink-0" />}
              </React.Fragment>
            );
          })}
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Checklist accordions */}
        <div className="lg:col-span-2 space-y-3">
          {STAGE_ORDER.filter(s => (stages[s] || []).length).map(s => {
            const items = stages[s];
            const doneCount = items.filter(x => x.status === 'done').length;
            const isOpen = openStage === s || openStage === null;
            return (
              <motion.div key={s} {...fade(0.06)} className="bg-white rounded-2xl border border-gray-100 overflow-hidden" style={{ boxShadow: '0 2px 8px rgba(10,31,92,0.05)' }}>
                <button onClick={() => setOpenStage(isOpen && openStage === s ? '__none__' : s)}
                  className="w-full px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="text-xs font-black text-gray-700 uppercase tracking-wide">{STAGE_LABELS[s]}</h3>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">{doneCount}/{items.length} done</span>
                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${openStage === s || (openStage === null) ? '' : '-rotate-90'}`} />
                  </div>
                </button>
                {(openStage === s || openStage === null) && (
                  <div>
                    {items.map(item => (
                      <ChecklistItem key={item.id} item={item} employeeId={id} onSaved={refetch} />
                    ))}
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>

        {/* Side panels */}
        <div className="space-y-4">
          <motion.div {...fade(0.08)} className="bg-white rounded-2xl p-4 border border-gray-100" style={{ boxShadow: '0 2px 8px rgba(10,31,92,0.05)' }}>
            <h3 className="text-xs font-black text-gray-700 uppercase tracking-wide mb-3 flex items-center gap-2"><FileText className="w-3.5 h-3.5" /> Documents</h3>
            <div className="space-y-2">
              {(data.documents || []).length === 0 && <p className="text-xs text-gray-400">No documents uploaded.</p>}
              {(data.documents || []).map(d => (
                <div key={d.id} className="p-2.5 rounded-lg bg-gray-50">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-gray-700 truncate">{d.doc_name || d.doc_type}</p>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${d.verification_status === 'verified' ? 'bg-emerald-50 text-emerald-600' : d.verification_status === 'rejected' ? 'bg-red-50 text-red-500' : 'bg-amber-50 text-amber-600'}`}>
                      {d.verification_status}
                    </span>
                  </div>
                  {d.verification_status === 'pending' && (
                    <div className="flex gap-2 mt-2">
                      <button onClick={() => verifyMut.mutate({ docId: d.id, verification_status: 'verified' })}
                        className="text-[11px] font-bold px-2 py-1 rounded-md text-white" style={{ background: B.success }}>
                        <ShieldCheck className="w-3 h-3 inline mr-1" />Verify
                      </button>
                      <button onClick={() => {
                        const reason = window.prompt('Rejection reason (optional):') || '';
                        verifyMut.mutate({ docId: d.id, verification_status: 'rejected', rejection_reason: reason });
                      }} className="text-[11px] font-bold px-2 py-1 rounded-md bg-red-50 text-red-500">Reject</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div {...fade(0.1)} className="bg-white rounded-2xl p-4 border border-gray-100" style={{ boxShadow: '0 2px 8px rgba(10,31,92,0.05)' }}>
            <h3 className="text-xs font-black text-gray-700 uppercase tracking-wide mb-3 flex items-center gap-2"><Laptop className="w-3.5 h-3.5" /> Assets</h3>
            <div className="space-y-2">
              {(data.assets || []).length === 0 && <p className="text-xs text-gray-400">No assets assigned.</p>}
              {(data.assets || []).map(a => (
                <div key={a.id} className="flex items-center justify-between p-2.5 rounded-lg bg-gray-50">
                  <p className="text-xs font-bold text-gray-700">{a.asset_name} <span className="text-gray-400 font-normal">({a.category})</span></p>
                  <span className="text-[10px] font-bold text-gray-500">{a.status}</span>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div {...fade(0.12)} className="bg-white rounded-2xl p-4 border border-gray-100" style={{ boxShadow: '0 2px 8px rgba(10,31,92,0.05)' }}>
            <h3 className="text-xs font-black text-gray-700 uppercase tracking-wide mb-3 flex items-center gap-2"><GraduationCap className="w-3.5 h-3.5" /> Training</h3>
            <div className="space-y-2">
              {(data.training || []).length === 0 && <p className="text-xs text-gray-400">No training records.</p>}
              {(data.training || []).map(t => (
                <div key={t.id} className="p-2.5 rounded-lg bg-gray-50">
                  <p className="text-xs font-bold text-gray-700">{t.program_title}</p>
                  <p className="text-[10px] text-gray-400">{t.attendance_status || t.status}</p>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div {...fade(0.14)} className="bg-white rounded-2xl p-4 border border-gray-100" style={{ boxShadow: '0 2px 8px rgba(10,31,92,0.05)' }}>
            <h3 className="text-xs font-black text-gray-700 uppercase tracking-wide mb-3 flex items-center gap-2"><ClipboardList className="w-3.5 h-3.5" /> Timeline</h3>
            <div className="space-y-3 max-h-[280px] overflow-y-auto">
              {(data.timeline || []).length === 0 && <p className="text-xs text-gray-400">No timeline events.</p>}
              {(data.timeline || []).map(t => (
                <div key={t.id} className="flex gap-2">
                  <Clock className="w-3.5 h-3.5 text-gray-300 flex-shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-gray-700">{t.title}</p>
                    <p className="text-[10px] text-gray-400 truncate">{t.description}</p>
                    <p className="text-[10px] text-gray-300">{fmtDate(t.event_date)}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
