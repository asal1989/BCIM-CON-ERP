// RecruitmentPage.jsx — Recruitment core hiring pipeline (Phase 1)
// Requisition -> Job Opening -> Candidate -> Interview -> Approval -> Offer
// -> Joining Tracker -> Employee. Dashboard/Reports/Settings, AI resume
// parsing, Outlook integration, background/medical verification modules,
// and Talent Pool are intentionally out of scope for this phase.
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, X, Pencil, Users, Briefcase, ClipboardList, UserCheck, Send,
  TrendingUp, CheckCircle2, Calendar, Star, ChevronRight, ThumbsUp, ThumbsDown,
  FileText, UserPlus, Settings, Trash2, Mail, Printer,
} from 'lucide-react';
import { clsx } from 'clsx';
import dayjs from 'dayjs';
import toast from 'react-hot-toast';
import { hrRecruitmentAPI } from '../../api/client';
import { PageHeader } from '../../theme';
import { FIELD_HL } from '../../constants/fieldStyles';

const INP = `w-full h-9 rounded-lg px-3 text-xs font-medium outline-none transition-all border ${FIELD_HL}`;
const TA  = `w-full rounded-lg px-3 py-2 text-xs outline-none transition-all border ${FIELD_HL} resize-none`;
const TABS = ['Requisitions', 'Job Openings', 'Candidates', 'Joining Tracker', 'Talent Pool', 'Settings'];

const REQ_STATUS_C = { pending_hr_review: 'amber', pending_management_approval: 'blue', approved: 'green', rejected: 'red', converted: 'slate' };
const REQ_STATUS_LABEL = { pending_hr_review: 'Pending HR Review', pending_management_approval: 'Pending Management Approval', approved: 'Approved', rejected: 'Rejected', converted: 'Converted' };
const JOB_STATUS_C = { open: 'green', on_hold: 'yellow', closed: 'slate', filled: 'blue' };
const APP_STATUSES = ['applied', 'shortlisted', 'interview_scheduled', 'interview_done', 'selected', 'offer_sent', 'offer_accepted', 'offer_declined', 'joined', 'rejected', 'on_hold'];
const APP_STATUS_C = { applied: 'slate', shortlisted: 'blue', interview_scheduled: 'yellow', interview_done: 'yellow', selected: 'emerald', offer_sent: 'purple', offer_accepted: 'emerald', offer_declined: 'red', joined: 'emerald', rejected: 'red', on_hold: 'slate' };
const APPROVAL_STAGE_LABEL = { hr: 'HR', department_manager: 'Department Manager', project_manager: 'Project Manager', hr_head: 'HR Head' };

const Badge = ({ color = 'slate', children }) => (
  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold bg-${color}-100 text-${color}-700 capitalize whitespace-nowrap`}>{children}</span>
);
const Field = ({ label, children, wide }) => (
  <div className={wide ? 'col-span-2' : ''}>
    <label className="block text-[11px] text-slate-500 mb-1">{label}</label>
    {children}
  </div>
);

/* ═══════════════════════════ Requisitions ═══════════════════════════ */
function RequisitionForm({ onClose, onSaved }) {
  const [f, setF] = useState({ position: '', department: '', vacancies: 1, employment_type: 'full_time', salary_budget_min: '', salary_budget_max: '', experience_required: '', qualification: '', required_skills: '', hiring_reason: '', priority: 'medium', expected_joining_date: '' });
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const mut = useMutation({
    mutationFn: (d) => hrRecruitmentAPI.createRequisition(d),
    onSuccess: () => { toast.success('Requisition raised — pending HR review'); onSaved(); onClose(); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed'),
  });
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="text-sm font-semibold">New Job Requisition</h3>
          <button onClick={onClose}><X size={16} /></button>
        </div>
        <div className="overflow-y-auto flex-1 p-5 grid grid-cols-2 gap-3">
          <Field label="Position *" wide><input value={f.position} onChange={e => set('position', e.target.value)} className={INP} /></Field>
          <Field label="Department"><input value={f.department} onChange={e => set('department', e.target.value)} className={INP} /></Field>
          <Field label="Vacancies"><input type="number" min={1} value={f.vacancies} onChange={e => set('vacancies', e.target.value)} className={INP} /></Field>
          <Field label="Employment Type">
            <select value={f.employment_type} onChange={e => set('employment_type', e.target.value)} className={INP}>
              {['full_time', 'part_time', 'contract', 'intern', 'apprentice'].map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </select>
          </Field>
          <Field label="Priority">
            <select value={f.priority} onChange={e => set('priority', e.target.value)} className={INP}>
              {['low', 'medium', 'high', 'urgent'].map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="Salary Budget Min"><input type="number" value={f.salary_budget_min} onChange={e => set('salary_budget_min', e.target.value)} className={INP} /></Field>
          <Field label="Salary Budget Max"><input type="number" value={f.salary_budget_max} onChange={e => set('salary_budget_max', e.target.value)} className={INP} /></Field>
          <Field label="Experience Required"><input value={f.experience_required} onChange={e => set('experience_required', e.target.value)} placeholder="e.g. 3-5 years" className={INP} /></Field>
          <Field label="Qualification"><input value={f.qualification} onChange={e => set('qualification', e.target.value)} className={INP} /></Field>
          <Field label="Expected Joining Date"><input type="date" value={f.expected_joining_date} onChange={e => set('expected_joining_date', e.target.value)} className={INP} /></Field>
          <Field label="Required Skills" wide><input value={f.required_skills} onChange={e => set('required_skills', e.target.value)} className={INP} /></Field>
          <Field label="Hiring Reason" wide><textarea rows={2} value={f.hiring_reason} onChange={e => set('hiring_reason', e.target.value)} className={TA} /></Field>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t">
          <button onClick={onClose} className="h-9 px-4 rounded-xl border text-xs">Cancel</button>
          <button onClick={() => mut.mutate(f)} disabled={mut.isPending || !f.position} className="h-9 px-5 rounded-xl bg-blue-600 text-white text-xs font-semibold disabled:opacity-50">
            {mut.isPending ? 'Saving…' : 'Raise Requisition'}
          </button>
        </div>
      </div>
    </div>
  );
}

function RequisitionsTab() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [remarksFor, setRemarksFor] = useState(null); // { id, kind: 'hr'|'management', action }
  const [remarks, setRemarks] = useState('');

  const { data: reqs = [], isLoading } = useQuery({ queryKey: ['hr-requisitions'], queryFn: () => hrRecruitmentAPI.requisitions().then(r => r.data?.data || []) });
  const refresh = () => qc.invalidateQueries({ queryKey: ['hr-requisitions'] });

  const hrReviewMut = useMutation({
    mutationFn: ({ id, action, remarks }) => hrRecruitmentAPI.hrReviewRequisition(id, { action, remarks }),
    onSuccess: () => { toast.success('Reviewed'); setRemarksFor(null); setRemarks(''); refresh(); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed'),
  });
  const mgmtMut = useMutation({
    mutationFn: ({ id, action, remarks }) => hrRecruitmentAPI.managementApproveRequisition(id, { action, remarks }),
    onSuccess: () => { toast.success('Decision recorded'); setRemarksFor(null); setRemarks(''); refresh(); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed'),
  });
  const convertMut = useMutation({
    mutationFn: (id) => hrRecruitmentAPI.convertRequisition(id),
    onSuccess: () => { toast.success('Job opening created'); refresh(); qc.invalidateQueries({ queryKey: ['hr-jobs'] }); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed'),
  });

  return (
    <div className="max-w-4xl">
      <div className="flex justify-end mb-3">
        <button onClick={() => setShowForm(true)} className="h-9 px-4 rounded-xl bg-blue-600 text-white text-xs font-semibold flex items-center gap-2"><Plus size={14} /> Raise Requisition</button>
      </div>
      <div className="grid grid-cols-1 gap-3">
        {isLoading ? <p className="text-center py-16 text-slate-400 text-sm">Loading…</p> : reqs.length === 0 ? (
          <div className="text-center py-16 text-slate-400 text-sm">No requisitions yet</div>
        ) : reqs.map(r => (
          <div key={r.id} className="bg-white rounded-xl border border-slate-200 px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-mono text-slate-400">{r.requisition_no}</span>
                  <div className="font-semibold text-slate-800">{r.position}</div>
                  <Badge color={REQ_STATUS_C[r.status]}>{REQ_STATUS_LABEL[r.status]}</Badge>
                  <Badge color={r.priority === 'urgent' ? 'red' : r.priority === 'high' ? 'amber' : 'slate'}>{r.priority}</Badge>
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">{r.department || '—'} · {r.vacancies} vacanc{r.vacancies !== 1 ? 'ies' : 'y'} · {r.project_name || 'No project'}</div>
                <div className="text-[10px] text-slate-400 mt-1">Raised by {r.raised_by_name || '—'} {r.expected_joining_date ? `· Expected joining ${dayjs(r.expected_joining_date).format('DD-MM-YYYY')}` : ''}</div>
                {r.rejection_reason && r.status === 'rejected' && <p className="text-[11px] text-red-600 mt-1">Rejected: {r.rejection_reason}</p>}
              </div>
              <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                {r.status === 'pending_hr_review' && (
                  <div className="flex gap-1.5">
                    <button onClick={() => hrReviewMut.mutate({ id: r.id, action: 'approve' })} className="h-7 px-2.5 rounded-lg bg-emerald-50 text-emerald-700 text-[11px] font-semibold flex items-center gap-1"><ThumbsUp size={11} /> Approve</button>
                    <button onClick={() => setRemarksFor({ id: r.id, kind: 'hr', action: 'reject' })} className="h-7 px-2.5 rounded-lg bg-red-50 text-red-700 text-[11px] font-semibold flex items-center gap-1"><ThumbsDown size={11} /> Reject</button>
                  </div>
                )}
                {r.status === 'pending_management_approval' && (
                  <div className="flex gap-1.5">
                    <button onClick={() => mgmtMut.mutate({ id: r.id, action: 'approve' })} className="h-7 px-2.5 rounded-lg bg-emerald-50 text-emerald-700 text-[11px] font-semibold flex items-center gap-1"><ThumbsUp size={11} /> Approve</button>
                    <button onClick={() => setRemarksFor({ id: r.id, kind: 'management', action: 'reject' })} className="h-7 px-2.5 rounded-lg bg-red-50 text-red-700 text-[11px] font-semibold flex items-center gap-1"><ThumbsDown size={11} /> Reject</button>
                  </div>
                )}
                {r.status === 'approved' && (
                  <button onClick={() => convertMut.mutate(r.id)} disabled={convertMut.isPending} className="h-7 px-2.5 rounded-lg bg-blue-600 text-white text-[11px] font-semibold flex items-center gap-1 disabled:opacity-50">
                    Open Position <ChevronRight size={11} />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {remarksFor && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setRemarksFor(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-gray-900 mb-3">Reason for Rejection</h3>
            <textarea rows={3} value={remarks} onChange={e => setRemarks(e.target.value)} className={TA} placeholder="Required" />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setRemarksFor(null)} className="h-9 px-4 rounded-xl border text-xs">Cancel</button>
              <button
                disabled={!remarks}
                onClick={() => (remarksFor.kind === 'hr' ? hrReviewMut : mgmtMut).mutate({ id: remarksFor.id, action: 'reject', remarks })}
                className="h-9 px-4 rounded-xl bg-red-600 text-white text-xs font-semibold disabled:opacity-50">
                Reject
              </button>
            </div>
          </div>
        </div>
      )}
      {showForm && <RequisitionForm onClose={() => setShowForm(false)} onSaved={refresh} />}
    </div>
  );
}

/* ═══════════════════════════ Job Openings ═══════════════════════════ */
function JobForm({ job, onClose, onSaved }) {
  const isEdit = !!job;
  const [f, setF] = useState(job || { title: '', department: '', designation: '', vacancies: 1, job_type: 'full_time', experience_min: 0, experience_max: '', qualification: '', work_location: '', salary_min: '', salary_max: '', description: '', responsibilities: '', skills_required: '', status: 'open', closing_date: '' });
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const mut = useMutation({
    mutationFn: (d) => isEdit ? hrRecruitmentAPI.updateJob(job.id, d) : hrRecruitmentAPI.createJob(d),
    onSuccess: () => { toast.success(isEdit ? 'Updated' : 'Job posted'); onSaved(); onClose(); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed'),
  });
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="text-sm font-semibold">{isEdit ? 'Edit Job Opening' : 'Publish Job Opening'}</h3>
          <button onClick={onClose}><X size={16} /></button>
        </div>
        <div className="overflow-y-auto flex-1 p-5 grid grid-cols-2 gap-3">
          <Field label="Job Title *" wide><input value={f.title} onChange={e => set('title', e.target.value)} className={INP} /></Field>
          <Field label="Department"><input value={f.department || ''} onChange={e => set('department', e.target.value)} className={INP} /></Field>
          <Field label="Location"><input value={f.work_location || ''} onChange={e => set('work_location', e.target.value)} className={INP} /></Field>
          <Field label="Type">
            <select value={f.job_type} onChange={e => set('job_type', e.target.value)} className={INP}>
              {['full_time', 'part_time', 'contract', 'intern', 'apprentice'].map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </select>
          </Field>
          <Field label="Vacancies"><input type="number" value={f.vacancies} onChange={e => set('vacancies', e.target.value)} className={INP} /></Field>
          <Field label="Status">
            <select value={f.status} onChange={e => set('status', e.target.value)} className={INP}>
              {['open', 'on_hold', 'closed', 'filled'].map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
            </select>
          </Field>
          <Field label="Min Experience (yrs)"><input type="number" value={f.experience_min} onChange={e => set('experience_min', e.target.value)} className={INP} /></Field>
          <Field label="Max Experience (yrs)"><input type="number" value={f.experience_max || ''} onChange={e => set('experience_max', e.target.value)} className={INP} /></Field>
          <Field label="Min Salary (₹)"><input type="number" value={f.salary_min || ''} onChange={e => set('salary_min', e.target.value)} className={INP} /></Field>
          <Field label="Max Salary (₹)"><input type="number" value={f.salary_max || ''} onChange={e => set('salary_max', e.target.value)} className={INP} /></Field>
          <Field label="Closing Date"><input type="date" value={f.closing_date || ''} onChange={e => set('closing_date', e.target.value)} className={INP} /></Field>
          <Field label="Qualification"><input value={f.qualification || ''} onChange={e => set('qualification', e.target.value)} className={INP} /></Field>
          <Field label="Skills Required" wide><input value={f.skills_required || ''} onChange={e => set('skills_required', e.target.value)} className={INP} /></Field>
          <Field label="Description" wide><textarea rows={3} value={f.description || ''} onChange={e => set('description', e.target.value)} className={TA} /></Field>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t">
          <button onClick={onClose} className="h-9 px-4 rounded-xl border text-xs">Cancel</button>
          <button onClick={() => mut.mutate(f)} disabled={mut.isPending || !f.title} className="h-9 px-5 rounded-xl bg-blue-600 text-white text-xs font-semibold disabled:opacity-50">
            {mut.isPending ? 'Saving…' : isEdit ? 'Update' : 'Publish'}
          </button>
        </div>
      </div>
    </div>
  );
}

function JobOpeningsTab({ jobs, onEdit, onViewCandidates }) {
  return (
    <div className="grid grid-cols-1 gap-3 max-w-4xl">
      {jobs.map(j => {
        const color = JOB_STATUS_C[j.status] || 'slate';
        return (
          <div key={j.id} className="bg-white rounded-xl border border-slate-200 px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="font-semibold text-slate-800">{j.title}</div>
                  <Badge color={color}>{j.status.replace(/_/g, ' ')}</Badge>
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">{j.department || '—'} · {j.work_location || '—'} · {j.job_type?.replace(/_/g, ' ')} · {j.vacancies} opening{j.vacancies !== 1 ? 's' : ''}</div>
                <div className="flex gap-4 mt-2 text-[10px] text-slate-400 flex-wrap">
                  {(j.experience_min || 0) > 0 && <span>{j.experience_min}{j.experience_max ? `–${j.experience_max}` : '+'}y exp</span>}
                  {j.salary_min > 0 && <span>₹{Number(j.salary_min).toLocaleString('en-IN')}{j.salary_max ? `–${Number(j.salary_max).toLocaleString('en-IN')}` : ''}</span>}
                  {j.closing_date && <span>Closes {dayjs(j.closing_date).format('DD-MM-YYYY')}</span>}
                  <span className="font-medium text-blue-600">{j.applicant_count || 0} candidates</span>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={() => onViewCandidates(j.id)} className="h-7 px-2.5 rounded-lg bg-slate-100 text-[11px] font-medium text-slate-600 hover:bg-slate-200 flex items-center gap-1">
                  <Users size={11} /> View Candidates
                </button>
                <button onClick={() => onEdit(j)} className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center">
                  <Pencil size={12} className="text-slate-500" />
                </button>
              </div>
            </div>
          </div>
        );
      })}
      {jobs.length === 0 && <div className="text-center py-16 text-slate-400 text-sm">No job openings yet — approve a requisition and open a position.</div>}
    </div>
  );
}

/* ═══════════════════════════ Candidates + detail drawer ═══════════════════════════ */
function ApplicantForm({ jobId, jobs = [], onClose, onSaved }) {
  const [f, setF] = useState({ job_id: jobId || '', name: '', email: '', phone: '', current_company: '', current_designation: '', experience_years: 0, current_ctc: '', expected_ctc: '', notice_period_days: 0, source: 'portal', applied_on: dayjs().format('YYYY-MM-DD'), qualification: '', notes: '' });
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const mut = useMutation({
    mutationFn: (d) => hrRecruitmentAPI.addApplicant(d),
    onSuccess: () => { toast.success('Candidate added'); onSaved(); onClose(); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed'),
  });
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="text-sm font-semibold">Add Candidate</h3>
          <button onClick={onClose}><X size={16} /></button>
        </div>
        <div className="overflow-y-auto flex-1 p-5 grid grid-cols-2 gap-3">
          {!jobId && (
            <Field label="Job Opening *" wide>
              <select value={f.job_id} onChange={e => set('job_id', e.target.value)} className={INP}>
                <option value="">Select job…</option>
                {jobs.map(j => <option key={j.id} value={j.id}>{j.title} ({j.department || '—'})</option>)}
              </select>
            </Field>
          )}
          <Field label="Full Name *"><input value={f.name} onChange={e => set('name', e.target.value)} className={INP} /></Field>
          <Field label="Phone"><input value={f.phone || ''} onChange={e => set('phone', e.target.value)} className={INP} /></Field>
          <Field label="Email" wide><input type="email" value={f.email || ''} onChange={e => set('email', e.target.value)} className={INP} /></Field>
          <Field label="Current Company"><input value={f.current_company || ''} onChange={e => set('current_company', e.target.value)} className={INP} /></Field>
          <Field label="Current Designation"><input value={f.current_designation || ''} onChange={e => set('current_designation', e.target.value)} className={INP} /></Field>
          <Field label="Experience (yrs)"><input type="number" value={f.experience_years} onChange={e => set('experience_years', e.target.value)} className={INP} /></Field>
          <Field label="Qualification"><input value={f.qualification || ''} onChange={e => set('qualification', e.target.value)} className={INP} /></Field>
          <Field label="Current CTC"><input value={f.current_ctc || ''} onChange={e => set('current_ctc', e.target.value)} className={INP} /></Field>
          <Field label="Expected CTC"><input value={f.expected_ctc || ''} onChange={e => set('expected_ctc', e.target.value)} className={INP} /></Field>
          <Field label="Notice Period (days)"><input type="number" value={f.notice_period_days} onChange={e => set('notice_period_days', e.target.value)} className={INP} /></Field>
          <Field label="Source">
            <select value={f.source} onChange={e => set('source', e.target.value)} className={INP}>
              {['portal', 'referral', 'walk_in', 'consultant', 'campus', 'linkedin', 'other'].map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
            </select>
          </Field>
          <Field label="Notes" wide><input value={f.notes || ''} onChange={e => set('notes', e.target.value)} className={INP} /></Field>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t">
          <button onClick={onClose} className="h-9 px-4 rounded-xl border text-xs">Cancel</button>
          <button onClick={() => mut.mutate(f)} disabled={mut.isPending || !f.name || !f.job_id} className="h-9 px-5 rounded-xl bg-blue-600 text-white text-xs font-semibold disabled:opacity-50">
            {mut.isPending ? 'Saving…' : 'Add Candidate'}
          </button>
        </div>
      </div>
    </div>
  );
}

function InterviewForm({ applicantId, onClose, onSaved }) {
  const [f, setF] = useState({ round: 1, interview_type: 'hr', interviewer_name: '', scheduled_on: '', venue_or_link: '' });
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const mut = useMutation({
    mutationFn: (d) => hrRecruitmentAPI.addInterview(applicantId, d),
    onSuccess: () => { toast.success('Interview scheduled'); onSaved(); onClose(); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed'),
  });
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-semibold mb-3">Schedule Interview</h3>
        <div className="space-y-3">
          <Field label="Round"><input type="number" min={1} value={f.round} onChange={e => set('round', e.target.value)} className={INP} /></Field>
          <Field label="Type">
            <select value={f.interview_type} onChange={e => set('interview_type', e.target.value)} className={INP}>
              {['hr', 'technical', 'face_to_face', 'video', 'telephonic'].map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </select>
          </Field>
          <Field label="Interviewer"><input value={f.interviewer_name} onChange={e => set('interviewer_name', e.target.value)} className={INP} /></Field>
          <Field label="Date & Time"><input type="datetime-local" value={f.scheduled_on} onChange={e => set('scheduled_on', e.target.value)} className={INP} /></Field>
          <Field label="Venue / Meeting Link"><input value={f.venue_or_link} onChange={e => set('venue_or_link', e.target.value)} className={INP} /></Field>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="h-9 px-4 rounded-xl border text-xs">Cancel</button>
          <button onClick={() => mut.mutate(f)} disabled={mut.isPending} className="h-9 px-4 rounded-xl bg-blue-600 text-white text-xs font-semibold disabled:opacity-50">
            {mut.isPending ? 'Saving…' : 'Schedule'}
          </button>
        </div>
      </div>
    </div>
  );
}

function InterviewEvalForm({ interview, onClose, onSaved }) {
  const [f, setF] = useState({
    result: interview.result || '', rating: interview.rating || '',
    technical_knowledge: interview.technical_knowledge || '', communication_score: interview.communication_score || '',
    experience_score: interview.experience_score || '', problem_solving_score: interview.problem_solving_score || '',
    behaviour_score: interview.behaviour_score || '', safety_awareness_score: interview.safety_awareness_score || '',
    recommendation: interview.recommendation || '', feedback: interview.feedback || '',
  });
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const mut = useMutation({
    mutationFn: (d) => hrRecruitmentAPI.updateInterview(interview.id, d),
    onSuccess: () => { toast.success('Evaluation saved'); onSaved(); onClose(); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed'),
  });
  const scoreFields = [
    ['technical_knowledge', 'Technical Knowledge'], ['communication_score', 'Communication'],
    ['experience_score', 'Experience'], ['problem_solving_score', 'Problem Solving'],
    ['behaviour_score', 'Behaviour'], ['safety_awareness_score', 'Safety Awareness'],
  ];
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-semibold mb-3">Interview Evaluation</h3>
        <div className="grid grid-cols-2 gap-3">
          {scoreFields.map(([k, label]) => (
            <Field key={k} label={`${label} (1–5)`}>
              <select value={f[k]} onChange={e => set(k, e.target.value)} className={INP}>
                <option value="">—</option>
                {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </Field>
          ))}
          <Field label="Overall Rating (1–5)">
            <select value={f.rating} onChange={e => set('rating', e.target.value)} className={INP}>
              <option value="">—</option>
              {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </Field>
          <Field label="Result">
            <select value={f.result} onChange={e => set('result', e.target.value)} className={INP}>
              <option value="">—</option>
              {['pass', 'fail', 'hold', 'no_show'].map(r => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
            </select>
          </Field>
          <Field label="Recommendation" wide>
            <select value={f.recommendation} onChange={e => set('recommendation', e.target.value)} className={INP}>
              <option value="">—</option>
              {['hire', 'hold', 'reject'].map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="Feedback" wide><textarea rows={3} value={f.feedback} onChange={e => set('feedback', e.target.value)} className={TA} /></Field>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="h-9 px-4 rounded-xl border text-xs">Cancel</button>
          <button onClick={() => mut.mutate(f)} disabled={mut.isPending} className="h-9 px-4 rounded-xl bg-blue-600 text-white text-xs font-semibold disabled:opacity-50">
            {mut.isPending ? 'Saving…' : 'Save Evaluation'}
          </button>
        </div>
      </div>
    </div>
  );
}

function OfferForm({ applicantId, applicant, onClose, onSaved }) {
  const [f, setF] = useState({ position: applicant?.current_designation || '', department: '', salary: '', allowances: 0, joining_bonus: 0, probation_months: 3, notice_buyout: 0, joining_date: '' });
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const mut = useMutation({
    mutationFn: (d) => hrRecruitmentAPI.createOffer(applicantId, d),
    onSuccess: () => { toast.success('Offer drafted'); onSaved(); onClose(); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed'),
  });
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-semibold mb-3">Create Offer</h3>
        <div className="space-y-3">
          <Field label="Position"><input value={f.position} onChange={e => set('position', e.target.value)} className={INP} /></Field>
          <Field label="Department"><input value={f.department} onChange={e => set('department', e.target.value)} className={INP} /></Field>
          <Field label="Salary (CTC)"><input type="number" value={f.salary} onChange={e => set('salary', e.target.value)} className={INP} /></Field>
          <Field label="Allowances"><input type="number" value={f.allowances} onChange={e => set('allowances', e.target.value)} className={INP} /></Field>
          <Field label="Joining Bonus"><input type="number" value={f.joining_bonus} onChange={e => set('joining_bonus', e.target.value)} className={INP} /></Field>
          <Field label="Probation (months)"><input type="number" value={f.probation_months} onChange={e => set('probation_months', e.target.value)} className={INP} /></Field>
          <Field label="Joining Date"><input type="date" value={f.joining_date} onChange={e => set('joining_date', e.target.value)} className={INP} /></Field>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="h-9 px-4 rounded-xl border text-xs">Cancel</button>
          <button onClick={() => mut.mutate(f)} disabled={mut.isPending} className="h-9 px-4 rounded-xl bg-blue-600 text-white text-xs font-semibold disabled:opacity-50">
            {mut.isPending ? 'Saving…' : 'Create Draft'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CandidateDrawer({ applicantId, onClose, onChanged }) {
  const qc = useQueryClient();
  const [subTab, setSubTab] = useState('overview');
  const [showInterviewForm, setShowInterviewForm] = useState(false);
  const [evalTarget, setEvalTarget] = useState(null);
  const [showOfferForm, setShowOfferForm] = useState(false);

  const { data: app } = useQuery({ queryKey: ['hr-applicant', applicantId], queryFn: () => hrRecruitmentAPI.getApplicant(applicantId).then(r => r.data?.data) });
  const { data: approvals = [] } = useQuery({ queryKey: ['hr-approvals', applicantId], queryFn: () => hrRecruitmentAPI.approvals(applicantId).then(r => r.data?.data || []) });
  const { data: offers = [] } = useQuery({ queryKey: ['hr-offers', applicantId], queryFn: () => hrRecruitmentAPI.offers(applicantId).then(r => r.data?.data || []) });

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ['hr-applicant', applicantId] });
    qc.invalidateQueries({ queryKey: ['hr-approvals', applicantId] });
    qc.invalidateQueries({ queryKey: ['hr-offers', applicantId] });
    onChanged();
  };

  const statusMut = useMutation({
    mutationFn: (status) => hrRecruitmentAPI.updateStatus(applicantId, { status }),
    onSuccess: refreshAll, onError: (e) => toast.error(e?.response?.data?.error || 'Failed'),
  });
  const startApprovalsMut = useMutation({
    mutationFn: () => hrRecruitmentAPI.startApprovals(applicantId),
    onSuccess: () => { toast.success('Approval workflow started'); refreshAll(); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed'),
  });
  const approvalActionMut = useMutation({
    mutationFn: ({ stage, action, remarks }) => hrRecruitmentAPI.actionApproval(applicantId, stage, { action, remarks }),
    onSuccess: () => { toast.success('Recorded'); refreshAll(); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed'),
  });
  const offerActionMut = useMutation({
    mutationFn: ({ id, status }) => hrRecruitmentAPI.updateOffer(id, { status }),
    onSuccess: () => { toast.success('Updated'); refreshAll(); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed'),
  });
  const [letterFor, setLetterFor] = useState(null);
  const [letterHtml, setLetterHtml] = useState('');
  const genLetterMut = useMutation({
    mutationFn: (id) => hrRecruitmentAPI.generateOfferLetter(id, {}),
    onSuccess: (r) => { setLetterHtml(r.data?.data?.html || ''); toast.success('Letter generated'); refreshAll(); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed'),
  });
  const sendLetterMut = useMutation({
    mutationFn: (id) => hrRecruitmentAPI.sendOfferLetter(id),
    onSuccess: () => { toast.success('Offer letter emailed to candidate'); setLetterFor(null); refreshAll(); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed to send'),
  });
  const printLetter = () => {
    const w = window.open('', '_blank');
    w.document.write(letterHtml);
    w.document.close();
    w.print();
  };

  if (!app) return null;
  const SUBTABS = [
    { id: 'overview', label: 'Overview', icon: Users },
    { id: 'interviews', label: 'Interviews', icon: Calendar },
    { id: 'approvals', label: 'Approval', icon: UserCheck },
    { id: 'offer', label: 'Offer', icon: Send },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex justify-end" onClick={onClose}>
      <div className="bg-white w-full max-w-2xl h-full overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b px-5 py-4 z-10">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-bold text-slate-800 text-lg">{app.name}</h3>
              <p className="text-xs text-slate-500">{app.current_designation || '—'} · {app.current_company || '—'} · {app.job_title}</p>
            </div>
            <div className="flex items-center gap-2">
              <select value={app.status} onChange={e => statusMut.mutate(e.target.value)} className={`h-8 rounded-lg px-2 text-[11px] font-semibold border-0 outline-none bg-${APP_STATUS_C[app.status]}-100 text-${APP_STATUS_C[app.status]}-700 cursor-pointer`}>
                {APP_STATUSES.map(s => <option key={s} value={s} className="bg-white text-slate-700">{s.replace(/_/g, ' ')}</option>)}
              </select>
              <button onClick={onClose}><X size={18} /></button>
            </div>
          </div>
          <div className="flex gap-1 mt-3">
            {SUBTABS.map(t => (
              <button key={t.id} onClick={() => setSubTab(t.id)}
                className={clsx('px-3 py-1.5 text-xs font-medium rounded-lg flex items-center gap-1.5', subTab === t.id ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-50')}>
                <t.icon size={12} /> {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-5">
          {subTab === 'overview' && (
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              {[['Email', app.email], ['Phone', app.phone], ['Experience', `${app.experience_years || 0} yrs`], ['Qualification', app.qualification],
                ['Current CTC', app.current_ctc], ['Expected CTC', app.expected_ctc], ['Notice Period', `${app.notice_period_days || 0} days`], ['Source', app.source],
                ['Applied On', app.applied_on ? dayjs(app.applied_on).format('DD-MM-YYYY') : '—']].map(([label, val]) => (
                <div key={label}><p className="text-[10px] font-bold text-slate-400 uppercase">{label}</p><p className="text-slate-800">{val || '—'}</p></div>
              ))}
              {app.notes && <div className="col-span-2"><p className="text-[10px] font-bold text-slate-400 uppercase">Notes</p><p className="text-slate-700">{app.notes}</p></div>}
            </div>
          )}

          {subTab === 'interviews' && (
            <div>
              <div className="flex justify-end mb-3">
                <button onClick={() => setShowInterviewForm(true)} className="h-8 px-3 rounded-lg bg-blue-600 text-white text-xs font-semibold flex items-center gap-1.5"><Plus size={13} /> Schedule</button>
              </div>
              <div className="space-y-2">
                {(app.interviews || []).map(iv => (
                  <div key={iv.id} className="border border-slate-200 rounded-xl px-4 py-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">Round {iv.round} · <span className="capitalize">{iv.interview_type?.replace(/_/g, ' ')}</span></p>
                        <p className="text-[11px] text-slate-500">{iv.interviewer_name || '—'} · {iv.scheduled_on ? dayjs(iv.scheduled_on).format('DD-MM-YYYY HH:mm') : 'Not scheduled'}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {iv.result && <Badge color={iv.result === 'pass' ? 'green' : iv.result === 'fail' ? 'red' : 'amber'}>{iv.result}</Badge>}
                        {iv.rating && <span className="flex items-center gap-0.5 text-[11px] text-amber-600 font-semibold"><Star size={11} fill="currentColor" /> {iv.rating}</span>}
                        <button onClick={() => setEvalTarget(iv)} className="h-7 px-2.5 rounded-lg bg-slate-100 text-[11px] font-medium text-slate-600">Evaluate</button>
                      </div>
                    </div>
                    {iv.feedback && <p className="text-xs text-slate-600 mt-2">{iv.feedback}</p>}
                  </div>
                ))}
                {(!app.interviews || app.interviews.length === 0) && <p className="text-center py-10 text-slate-400 text-sm">No interviews scheduled</p>}
              </div>
            </div>
          )}

          {subTab === 'approvals' && (
            <div>
              {approvals.every(a => a.status === 'not_started') && (
                <button onClick={() => startApprovalsMut.mutate()} className="h-9 px-4 rounded-xl bg-blue-600 text-white text-xs font-semibold mb-4">Start Approval Workflow</button>
              )}
              <div className="space-y-2">
                {approvals.map(a => (
                  <div key={a.stage} className="flex items-center justify-between border border-slate-200 rounded-xl px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{APPROVAL_STAGE_LABEL[a.stage]}</p>
                      {a.approver_name && <p className="text-[11px] text-slate-500">{a.approver_name} · {dayjs(a.approved_at).format('DD-MM-YYYY')}</p>}
                      {a.remarks && <p className="text-[11px] text-slate-500">{a.remarks}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge color={a.status === 'approved' ? 'green' : a.status === 'rejected' ? 'red' : a.status === 'pending' ? 'amber' : 'slate'}>{a.status.replace(/_/g, ' ')}</Badge>
                      {a.status === 'pending' && (
                        <>
                          <button onClick={() => approvalActionMut.mutate({ stage: a.stage, action: 'approve' })} className="h-7 px-2 rounded-lg bg-emerald-50 text-emerald-700"><ThumbsUp size={12} /></button>
                          <button onClick={() => { const remarks = window.prompt('Reason for rejection:'); if (remarks) approvalActionMut.mutate({ stage: a.stage, action: 'reject', remarks }); }} className="h-7 px-2 rounded-lg bg-red-50 text-red-700"><ThumbsDown size={12} /></button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {subTab === 'offer' && (
            <div>
              <div className="flex justify-end mb-3">
                <button onClick={() => setShowOfferForm(true)} className="h-8 px-3 rounded-lg bg-blue-600 text-white text-xs font-semibold flex items-center gap-1.5"><Plus size={13} /> New Offer</button>
              </div>
              <div className="space-y-2">
                {offers.map(o => (
                  <div key={o.id} className="border border-slate-200 rounded-xl px-4 py-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-semibold text-slate-800">{o.position || 'Offer'} {o.department ? `· ${o.department}` : ''}</p>
                      <Badge color={o.status === 'accepted' ? 'green' : o.status === 'declined' ? 'red' : o.status === 'sent' ? 'blue' : 'slate'}>{o.status.replace(/_/g, ' ')}</Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-[11px] text-slate-500 mb-2">
                      <span>Salary: ₹{Number(o.salary || 0).toLocaleString('en-IN')}</span>
                      <span>Bonus: ₹{Number(o.joining_bonus || 0).toLocaleString('en-IN')}</span>
                      <span>Probation: {o.probation_months}mo</span>
                    </div>
                    <div className="flex gap-1.5 flex-wrap">
                      {o.status === 'draft' && <button onClick={() => offerActionMut.mutate({ id: o.id, status: 'sent' })} className="h-7 px-2.5 rounded-lg bg-blue-50 text-blue-700 text-[11px] font-semibold">Send Offer</button>}
                      <button onClick={() => { setLetterFor(o); setLetterHtml(o.letter_html || ''); genLetterMut.mutate(o.id); }} className="h-7 px-2.5 rounded-lg bg-slate-100 text-slate-600 text-[11px] font-semibold flex items-center gap-1"><FileText size={11} /> {o.letter_html ? 'View' : 'Generate'} Letter</button>
                      {o.letter_sent_at && <Badge color="emerald">Letter emailed {dayjs(o.letter_sent_at).format('DD-MM-YYYY')}</Badge>}
                      {o.status === 'sent' && (
                        <>
                          <button onClick={() => offerActionMut.mutate({ id: o.id, status: 'accepted' })} className="h-7 px-2.5 rounded-lg bg-emerald-50 text-emerald-700 text-[11px] font-semibold">Mark Accepted</button>
                          <button onClick={() => offerActionMut.mutate({ id: o.id, status: 'declined' })} className="h-7 px-2.5 rounded-lg bg-red-50 text-red-700 text-[11px] font-semibold">Mark Declined</button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
                {offers.length === 0 && <p className="text-center py-10 text-slate-400 text-sm">No offers created</p>}
              </div>
            </div>
          )}
        </div>
      </div>

      {showInterviewForm && <InterviewForm applicantId={applicantId} onClose={() => setShowInterviewForm(false)} onSaved={refreshAll} />}
      {evalTarget && <InterviewEvalForm interview={evalTarget} onClose={() => setEvalTarget(null)} onSaved={refreshAll} />}
      {showOfferForm && <OfferForm applicantId={applicantId} applicant={app} onClose={() => setShowOfferForm(false)} onSaved={refreshAll} />}
      {letterFor && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4" onClick={() => setLetterFor(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h3 className="text-sm font-semibold">Offer Letter</h3>
              <button onClick={() => setLetterFor(null)}><X size={16} /></button>
            </div>
            <div className="overflow-y-auto flex-1 p-5">
              {genLetterMut.isPending ? <p className="text-center py-10 text-slate-400 text-sm">Generating…</p> :
                <div className="border rounded-lg p-4 text-xs" dangerouslySetInnerHTML={{ __html: letterHtml }} />}
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t">
              <button onClick={printLetter} disabled={!letterHtml} className="h-9 px-4 rounded-xl border text-xs flex items-center gap-1.5 disabled:opacity-50"><Printer size={13} /> Print</button>
              <button onClick={() => sendLetterMut.mutate(letterFor.id)} disabled={!letterHtml || sendLetterMut.isPending || !app.email} className="h-9 px-4 rounded-xl bg-blue-600 text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50">
                <Mail size={13} /> {sendLetterMut.isPending ? 'Sending…' : 'Email to Candidate'}
              </button>
            </div>
            {!app.email && <p className="text-[11px] text-red-500 px-5 pb-3">Candidate has no email on file — add one to send.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function CandidatesTab({ jobs, filterJobId, setFilterJobId, filterStatus, setFilterStatus, onOpen }) {
  const { data: applicants = [] } = useQuery({
    queryKey: ['hr-applicants', filterJobId, filterStatus],
    queryFn: () => hrRecruitmentAPI.applicants({ job_id: filterJobId || undefined, status: filterStatus || undefined }).then(r => r.data?.data || []),
  });

  return (
    <div className="max-w-5xl">
      <div className="flex gap-2 mb-4 flex-wrap">
        <select value={filterJobId} onChange={e => setFilterJobId(e.target.value)} className="h-8 rounded-lg border border-slate-200 bg-white text-xs px-2">
          <option value="">All Jobs</option>
          {jobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
        </select>
        {APP_STATUSES.map(s => (
          <button key={s} onClick={() => setFilterStatus(s === filterStatus ? '' : s)}
            className={clsx('h-8 px-3 rounded-lg text-xs font-medium capitalize', filterStatus === s ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600')}>
            {s.replace(/_/g, ' ')}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {applicants.map(a => (
          <button key={a.id} onClick={() => onOpen(a.id)} className="text-left bg-white rounded-xl border border-slate-200 px-4 py-3 hover:shadow-sm hover:border-blue-300">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold text-sm text-slate-800 truncate">{a.name}</div>
                <div className="text-[11px] text-slate-500 truncate">{a.current_designation || '—'} · {a.current_company || '—'}</div>
              </div>
              <Badge color={APP_STATUS_C[a.status]}>{a.status.replace(/_/g, ' ')}</Badge>
            </div>
            <div className="text-[10px] text-slate-400 mt-2">{a.job_title} · Applied {dayjs(a.applied_on).format('DD-MM-YYYY')}</div>
          </button>
        ))}
        {applicants.length === 0 && <div className="col-span-3 text-center py-16 text-slate-400 text-sm">No candidates found</div>}
      </div>
    </div>
  );
}

/* ═══════════════════════════ Joining Tracker ═══════════════════════════ */
function JoiningTrackerTab() {
  const qc = useQueryClient();
  const { data: rows = [] } = useQuery({ queryKey: ['hr-joining-tracker'], queryFn: () => hrRecruitmentAPI.joiningTracker().then(r => r.data?.data || []) });
  const mut = useMutation({
    mutationFn: ({ id, d }) => hrRecruitmentAPI.updateJoiningTracker(id, d),
    onSuccess: () => { toast.success('Updated'); qc.invalidateQueries({ queryKey: ['hr-joining-tracker'] }); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed'),
  });

  return (
    <div className="max-w-4xl grid grid-cols-1 gap-3">
      {rows.map(t => (
        <div key={t.id} className="bg-white rounded-xl border border-slate-200 px-5 py-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="font-semibold text-slate-800">{t.candidate_name}</p>
              <p className="text-[11px] text-slate-500">{t.position || '—'} · {t.department || '—'} {t.joining_date ? `· Joining ${dayjs(t.joining_date).format('DD-MM-YYYY')}` : ''}</p>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold text-blue-600">{t.progress_pct}%</p>
              <p className="text-[10px] text-slate-400">HR: {t.hr_owner_name || '—'}</p>
            </div>
          </div>
          <div className="w-full h-1.5 bg-slate-100 rounded-full mb-3 overflow-hidden">
            <div className="h-full bg-blue-500" style={{ width: `${t.progress_pct}%` }} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input type="checkbox" checked={t.documents_submitted} onChange={e => mut.mutate({ id: t.id, d: { documents_submitted: e.target.checked } })} />
              Documents Submitted
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input type="checkbox" checked={t.joining_confirmed} onChange={e => mut.mutate({ id: t.id, d: { joining_confirmed: e.target.checked } })} />
              Joining Confirmed
            </label>
            <div>
              <label className="block text-[10px] text-slate-400 mb-1">Background Verification</label>
              <select value={t.background_verification_status} onChange={e => mut.mutate({ id: t.id, d: { background_verification_status: e.target.value } })} className="h-7 rounded-lg border border-slate-200 text-[11px] px-2 w-full">
                {['pending', 'verified', 'failed', 'not_required'].map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-slate-400 mb-1">Medical Clearance</label>
              <select value={t.medical_clearance_status} onChange={e => mut.mutate({ id: t.id, d: { medical_clearance_status: e.target.value } })} className="h-7 rounded-lg border border-slate-200 text-[11px] px-2 w-full">
                {['pending', 'cleared', 'failed', 'not_required'].map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
          </div>
          {t.employee_name && <p className="text-[11px] text-emerald-600 font-semibold mt-3 flex items-center gap-1"><CheckCircle2 size={12} /> Employee record linked: {t.employee_name}</p>}
        </div>
      ))}
      {rows.length === 0 && <div className="text-center py-16 text-slate-400 text-sm">No candidates in the joining pipeline yet — this fills automatically when an offer is accepted.</div>}
    </div>
  );
}

/* ═══════════════════════════ Talent Pool ═══════════════════════════ */
function TalentForm({ onClose, onSaved }) {
  const [f, setF] = useState({ name: '', email: '', phone: '', category: '', experience_years: '', current_company: '', qualification: '', notes: '' });
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const mut = useMutation({
    mutationFn: (d) => hrRecruitmentAPI.addTalent(d),
    onSuccess: () => { toast.success('Added to talent pool'); onSaved(); onClose(); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed'),
  });
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-semibold mb-3">Add to Talent Pool</h3>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name *" wide><input value={f.name} onChange={e => set('name', e.target.value)} className={INP} /></Field>
          <Field label="Phone"><input value={f.phone} onChange={e => set('phone', e.target.value)} className={INP} /></Field>
          <Field label="Email"><input type="email" value={f.email} onChange={e => set('email', e.target.value)} className={INP} /></Field>
          <Field label="Category"><input value={f.category} onChange={e => set('category', e.target.value)} className={INP} /></Field>
          <Field label="Experience (yrs)"><input type="number" value={f.experience_years} onChange={e => set('experience_years', e.target.value)} className={INP} /></Field>
          <Field label="Current Company"><input value={f.current_company} onChange={e => set('current_company', e.target.value)} className={INP} /></Field>
          <Field label="Qualification"><input value={f.qualification} onChange={e => set('qualification', e.target.value)} className={INP} /></Field>
          <Field label="Notes" wide><textarea rows={2} value={f.notes} onChange={e => set('notes', e.target.value)} className={TA} /></Field>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="h-9 px-4 rounded-xl border text-xs">Cancel</button>
          <button onClick={() => mut.mutate(f)} disabled={mut.isPending || !f.name} className="h-9 px-4 rounded-xl bg-blue-600 text-white text-xs font-semibold disabled:opacity-50">
            {mut.isPending ? 'Saving…' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConvertTalentForm({ talent, jobs, onClose, onSaved }) {
  const [jobId, setJobId] = useState('');
  const mut = useMutation({
    mutationFn: () => hrRecruitmentAPI.convertTalent(talent.id, { job_id: jobId }),
    onSuccess: () => { toast.success('Converted to candidate'); onSaved(); onClose(); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed'),
  });
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-semibold mb-3">Move {talent.name} into Hiring Pipeline</h3>
        <Field label="Job Opening *">
          <select value={jobId} onChange={e => setJobId(e.target.value)} className={INP}>
            <option value="">Select job…</option>
            {jobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
          </select>
        </Field>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="h-9 px-4 rounded-xl border text-xs">Cancel</button>
          <button onClick={() => mut.mutate()} disabled={mut.isPending || !jobId} className="h-9 px-4 rounded-xl bg-blue-600 text-white text-xs font-semibold disabled:opacity-50">
            {mut.isPending ? 'Converting…' : 'Convert'}
          </button>
        </div>
      </div>
    </div>
  );
}

function TalentPoolTab({ jobs }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [convertTarget, setConvertTarget] = useState(null);
  const { data: pool = [] } = useQuery({ queryKey: ['hr-talent-pool', search], queryFn: () => hrRecruitmentAPI.talentPool({ search: search || undefined }).then(r => r.data?.data || []) });
  const refresh = () => qc.invalidateQueries({ queryKey: ['hr-talent-pool'] });
  const delMut = useMutation({
    mutationFn: (id) => hrRecruitmentAPI.deleteTalent(id),
    onSuccess: () => { toast.success('Removed'); refresh(); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed'),
  });

  return (
    <div className="max-w-4xl">
      <div className="flex justify-between mb-3 gap-2">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, category, company…" className={`${INP} max-w-xs`} />
        <button onClick={() => setShowForm(true)} className="h-9 px-4 rounded-xl bg-blue-600 text-white text-xs font-semibold flex items-center gap-2 flex-shrink-0"><UserPlus size={14} /> Add Contact</button>
      </div>
      <div className="grid grid-cols-1 gap-3">
        {pool.map(t => (
          <div key={t.id} className="bg-white rounded-xl border border-slate-200 px-5 py-4 flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="font-semibold text-slate-800">{t.name}</div>
                {t.category && <Badge color="blue">{t.category}</Badge>}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">{t.current_company || '—'} · {t.qualification || '—'} · {t.experience_years || 0} yrs exp</div>
              <div className="text-[10px] text-slate-400 mt-1">{t.email || '—'} · {t.phone || '—'}</div>
              {t.notes && <p className="text-[11px] text-slate-500 mt-1">{t.notes}</p>}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button onClick={() => setConvertTarget(t)} className="h-7 px-2.5 rounded-lg bg-blue-50 text-blue-700 text-[11px] font-semibold">Move to Pipeline</button>
              <button onClick={() => window.confirm('Remove from talent pool?') && delMut.mutate(t.id)} className="w-7 h-7 rounded-lg hover:bg-red-50 flex items-center justify-center"><Trash2 size={12} className="text-red-500" /></button>
            </div>
          </div>
        ))}
        {pool.length === 0 && <div className="text-center py-16 text-slate-400 text-sm">No talent pool contacts yet</div>}
      </div>
      {showForm && <TalentForm onClose={() => setShowForm(false)} onSaved={refresh} />}
      {convertTarget && <ConvertTalentForm talent={convertTarget} jobs={jobs} onClose={() => setConvertTarget(null)} onSaved={refresh} />}
    </div>
  );
}

/* ═══════════════════════════ Settings (masters) ═══════════════════════════ */
function MasterList({ title, listFn, addFn, delFn, queryKey }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const { data: rows = [] } = useQuery({ queryKey: [queryKey], queryFn: () => listFn().then(r => r.data?.data || []) });
  const refresh = () => qc.invalidateQueries({ queryKey: [queryKey] });
  const addMut = useMutation({
    mutationFn: (d) => addFn(d),
    onSuccess: () => { setName(''); refresh(); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed'),
  });
  const delMut = useMutation({
    mutationFn: (id) => delFn(id),
    onSuccess: refresh, onError: (e) => toast.error(e?.response?.data?.error || 'Failed'),
  });
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <h4 className="text-xs font-bold text-slate-700 mb-3">{title}</h4>
      <div className="flex gap-2 mb-3">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Add new…" className={INP} />
        <button onClick={() => name.trim() && addMut.mutate({ name: name.trim() })} disabled={!name.trim() || addMut.isPending} className="h-9 px-3 rounded-lg bg-blue-600 text-white text-xs font-semibold flex-shrink-0 disabled:opacity-50">Add</button>
      </div>
      <div className="space-y-1.5">
        {rows.map(r => (
          <div key={r.id} className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-50 text-xs">
            <span>{r.name}</span>
            <button onClick={() => delMut.mutate(r.id)} className="text-red-500 hover:text-red-700"><Trash2 size={12} /></button>
          </div>
        ))}
        {rows.length === 0 && <p className="text-[11px] text-slate-400 py-2">None yet</p>}
      </div>
    </div>
  );
}

function RecruitmentSettingsTab() {
  return (
    <div className="max-w-4xl grid grid-cols-1 sm:grid-cols-3 gap-4">
      <MasterList title="Sources" queryKey="hr-rec-sources" listFn={hrRecruitmentAPI.sources} addFn={hrRecruitmentAPI.addSource} delFn={hrRecruitmentAPI.deleteSource} />
      <MasterList title="Skills" queryKey="hr-rec-skills" listFn={hrRecruitmentAPI.skillsMaster} addFn={hrRecruitmentAPI.addSkillMaster} delFn={hrRecruitmentAPI.deleteSkillMaster} />
      <MasterList title="Job Categories" queryKey="hr-rec-categories" listFn={hrRecruitmentAPI.jobCategories} addFn={hrRecruitmentAPI.addJobCategory} delFn={hrRecruitmentAPI.deleteJobCategory} />
    </div>
  );
}

/* ═══════════════════════════ Page shell ═══════════════════════════ */
export default function RecruitmentPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState('Requisitions');
  const [showJobForm, setShowJobForm] = useState(false);
  const [editJob, setEditJob] = useState(null);
  const [showAppForm, setShowAppForm] = useState(false);
  const [filterJobId, setFilterJobId] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [openApplicantId, setOpenApplicantId] = useState(null);

  const { data: jobs = [] } = useQuery({ queryKey: ['hr-jobs'], queryFn: () => hrRecruitmentAPI.jobs().then(r => r.data?.data || []) });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['hr-jobs'] }); qc.invalidateQueries({ queryKey: ['hr-applicants'] }); };

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#f5f6fa]">
      <PageHeader title="Recruitment" subtitle="Requisition to joining — the core hiring pipeline"
        breadcrumbs={[{ label: 'HR & Admin' }, { label: 'Recruitment' }]}
        actions={
          <div className="flex gap-2">
            {tab === 'Candidates' && <button onClick={() => setShowAppForm(true)} className="h-9 px-3 rounded-xl border border-slate-300 bg-white text-xs font-medium flex items-center gap-2"><Users size={13} /> Add Candidate</button>}
            {tab === 'Job Openings' && <button onClick={() => { setEditJob(null); setShowJobForm(true); }} className="h-9 px-4 rounded-xl bg-blue-600 text-white text-xs font-semibold flex items-center gap-2"><Plus size={14} /> Publish Job</button>}
          </div>
        }
      />

      <div className="flex gap-1 px-5 pt-3 bg-white border-b flex-shrink-0">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={clsx('px-4 py-2 text-xs font-medium rounded-t-lg border-b-2 -mb-px flex items-center gap-1.5',
              tab === t ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500')}>
            {t === 'Requisitions' && <ClipboardList size={13} />}
            {t === 'Job Openings' && <Briefcase size={13} />}
            {t === 'Candidates' && <Users size={13} />}
            {t === 'Joining Tracker' && <TrendingUp size={13} />}
            {t === 'Talent Pool' && <UserPlus size={13} />}
            {t === 'Settings' && <Settings size={13} />}
            {t}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-5">
        {tab === 'Requisitions' && <RequisitionsTab />}
        {tab === 'Job Openings' && <JobOpeningsTab jobs={jobs} onEdit={(j) => { setEditJob(j); setShowJobForm(true); }} onViewCandidates={(jobId) => { setFilterJobId(jobId); setTab('Candidates'); }} />}
        {tab === 'Candidates' && (
          <CandidatesTab jobs={jobs} filterJobId={filterJobId} setFilterJobId={setFilterJobId}
            filterStatus={filterStatus} setFilterStatus={setFilterStatus} onOpen={setOpenApplicantId} />
        )}
        {tab === 'Joining Tracker' && <JoiningTrackerTab />}
        {tab === 'Talent Pool' && <TalentPoolTab jobs={jobs} />}
        {tab === 'Settings' && <RecruitmentSettingsTab />}
      </div>

      {showJobForm && <JobForm job={editJob} onClose={() => { setShowJobForm(false); setEditJob(null); }} onSaved={refresh} />}
      {showAppForm && <ApplicantForm jobId={filterJobId} jobs={jobs} onClose={() => setShowAppForm(false)} onSaved={refresh} />}
      {openApplicantId && <CandidateDrawer applicantId={openApplicantId} onClose={() => setOpenApplicantId(null)} onChanged={refresh} />}
    </div>
  );
}
