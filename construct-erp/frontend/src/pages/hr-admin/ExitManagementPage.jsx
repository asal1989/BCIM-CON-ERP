// ExitManagementPage.jsx — Resignation -> Notice Period -> Clearance ->
// Asset Return -> Exit Interview -> Full & Final Settlement -> Exited.
// The FnF step itself hands off to the existing, already-comprehensive
// FnFSettlementPage/hr-fnf.routes.js flow rather than duplicating it.
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, X, LogOut, ClipboardCheck, PackageCheck, MessageSquareText,
  ArrowRight, ThumbsUp, ThumbsDown,
} from 'lucide-react';
import { clsx } from 'clsx';
import dayjs from 'dayjs';
import toast from 'react-hot-toast';
import { hrExitAPI, hrEmployeesAPI } from '../../api/client';
import { PageHeader } from '../../theme';
import { FIELD_HL } from '../../constants/fieldStyles';

const INP = `w-full h-9 rounded-lg px-3 text-xs font-medium outline-none transition-all border ${FIELD_HL}`;
const TA = `w-full rounded-lg px-3 py-2 text-xs outline-none transition-all border ${FIELD_HL} resize-none`;
const EXIT_REASONS = ['resignation', 'termination', 'retirement', 'absconding', 'end_of_contract', 'death'];
const STATUS_C = {
  submitted: 'amber', manager_approved: 'blue', notice_period: 'blue', clearance_pending: 'purple',
  clearance_done: 'purple', fnf_linked: 'emerald', exited: 'slate', withdrawn: 'slate', rejected: 'red',
};
const STATUS_LABEL = {
  submitted: 'Pending Manager Approval', manager_approved: 'Approved', notice_period: 'Notice Period',
  clearance_pending: 'Clearance in Progress', clearance_done: 'Clearance Complete', fnf_linked: 'F&F in Progress',
  exited: 'Exited', withdrawn: 'Withdrawn', rejected: 'Rejected',
};
const Field = ({ label, children, wide }) => (
  <div className={wide ? 'col-span-2' : ''}><label className="block text-[11px] text-slate-500 mb-1">{label}</label>{children}</div>
);
const Badge = ({ color = 'slate', children }) => (
  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold bg-${color}-100 text-${color}-700 whitespace-nowrap`}>{children}</span>
);

function ExitRequestForm({ employees, onClose, onSaved }) {
  const [f, setF] = useState({ employee_id: '', exit_reason: 'resignation', resignation_date: dayjs().format('YYYY-MM-DD'), notice_period_days: 30, reason_details: '' });
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const mut = useMutation({
    mutationFn: (d) => hrExitAPI.create(d),
    onSuccess: () => { toast.success('Exit request raised'); onSaved(); onClose(); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed'),
  });
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold">Raise Exit Request</h3>
          <button onClick={onClose}><X size={16} /></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Employee *" wide>
            <select value={f.employee_id} onChange={e => set('employee_id', e.target.value)} className={INP}>
              <option value="">Select employee…</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name} ({e.employee_code})</option>)}
            </select>
          </Field>
          <Field label="Exit Reason">
            <select value={f.exit_reason} onChange={e => set('exit_reason', e.target.value)} className={INP}>
              {EXIT_REASONS.map(r => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
            </select>
          </Field>
          <Field label="Resignation Date"><input type="date" value={f.resignation_date} onChange={e => set('resignation_date', e.target.value)} className={INP} /></Field>
          <Field label="Notice Period (days)"><input type="number" value={f.notice_period_days} onChange={e => set('notice_period_days', e.target.value)} className={INP} /></Field>
          <Field label="Details" wide><textarea rows={2} value={f.reason_details} onChange={e => set('reason_details', e.target.value)} className={TA} /></Field>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="h-9 px-4 rounded-xl border text-xs">Cancel</button>
          <button onClick={() => mut.mutate(f)} disabled={mut.isPending || !f.employee_id} className="h-9 px-5 rounded-xl bg-blue-600 text-white text-xs font-semibold disabled:opacity-50">
            {mut.isPending ? 'Saving…' : 'Raise Request'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ExitDrawer({ id, onClose, onChanged }) {
  const qc = useQueryClient();
  const [interviewForm, setInterviewForm] = useState(false);
  const { data: req } = useQuery({ queryKey: ['hr-exit', id], queryFn: () => hrExitAPI.get(id).then(r => r.data?.data) });

  const refresh = () => { qc.invalidateQueries({ queryKey: ['hr-exit', id] }); qc.invalidateQueries({ queryKey: ['hr-exits'] }); onChanged(); };
  const approveMut = useMutation({
    mutationFn: (d) => hrExitAPI.managerApproval(id, d),
    onSuccess: () => { toast.success('Updated'); refresh(); }, onError: (e) => toast.error(e?.response?.data?.error || 'Failed'),
  });
  const startClearanceMut = useMutation({
    mutationFn: () => hrExitAPI.startClearance(id),
    onSuccess: () => { toast.success('Clearance started'); refresh(); }, onError: (e) => toast.error(e?.response?.data?.error || 'Failed'),
  });
  const clearanceMut = useMutation({
    mutationFn: ({ dept, status, remarks }) => hrExitAPI.actionClearance(id, dept, { status, remarks }),
    onSuccess: () => { toast.success('Recorded'); refresh(); }, onError: (e) => toast.error(e?.response?.data?.error || 'Failed'),
  });
  const interviewMut = useMutation({
    mutationFn: (d) => hrExitAPI.submitInterview(id, d),
    onSuccess: () => { toast.success('Exit interview saved'); setInterviewForm(false); refresh(); }, onError: (e) => toast.error(e?.response?.data?.error || 'Failed'),
  });
  const linkFnfMut = useMutation({
    mutationFn: () => hrExitAPI.linkFnf(id),
    onSuccess: (r) => { toast.success('Linked to Full & Final Settlement — continue there'); refresh(); }, onError: (e) => toast.error(e?.response?.data?.error || 'Failed'),
  });
  const completeMut = useMutation({
    mutationFn: () => hrExitAPI.complete(id),
    onSuccess: () => { toast.success('Exit completed — employee deactivated'); refresh(); }, onError: (e) => toast.error(e?.response?.data?.error || 'Failed'),
  });
  const withdrawMut = useMutation({
    mutationFn: () => hrExitAPI.withdraw(id),
    onSuccess: () => { toast.success('Withdrawn'); refresh(); onClose(); }, onError: (e) => toast.error(e?.response?.data?.error || 'Failed'),
  });

  if (!req) return null;
  const [iv, setIv] = [interviewForm, setInterviewForm];
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex justify-end" onClick={onClose}>
      <div className="bg-white w-full max-w-2xl h-full overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b px-5 py-4 z-10">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-bold text-slate-800 text-lg">{req.employee_name}</h3>
              <p className="text-xs text-slate-500">{req.designation_name || '—'} · {req.department_name || '—'} · {req.exit_reason.replace(/_/g, ' ')}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge color={STATUS_C[req.status]}>{STATUS_LABEL[req.status]}</Badge>
              <button onClick={onClose}><X size={18} /></button>
            </div>
          </div>
          <div className="w-full h-1.5 bg-slate-100 rounded-full mt-3 overflow-hidden">
            <div className="h-full bg-blue-500" style={{ width: `${req.progress_pct}%` }} />
          </div>
        </div>

        <div className="p-5 space-y-5">
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm bg-slate-50 rounded-xl p-4">
            <div><p className="text-[10px] font-bold text-slate-400 uppercase">Resignation Date</p><p>{dayjs(req.resignation_date).format('DD-MM-YYYY')}</p></div>
            <div><p className="text-[10px] font-bold text-slate-400 uppercase">Last Working Day</p><p>{dayjs(req.confirmed_last_working_day || req.proposed_last_working_day).format('DD-MM-YYYY')}</p></div>
            <div><p className="text-[10px] font-bold text-slate-400 uppercase">Notice Period</p><p>{req.notice_period_days} days</p></div>
            {req.reason_details && <div className="col-span-2"><p className="text-[10px] font-bold text-slate-400 uppercase">Details</p><p>{req.reason_details}</p></div>}
          </div>

          {req.status === 'submitted' && (
            <div className="flex gap-2">
              <button onClick={() => approveMut.mutate({ action: 'approve' })} className="h-9 px-4 rounded-xl bg-emerald-600 text-white text-xs font-semibold flex items-center gap-1.5"><ThumbsUp size={13} /> Approve</button>
              <button onClick={() => { const r = window.prompt('Rejection reason:'); if (r) approveMut.mutate({ action: 'reject', rejection_reason: r }); }} className="h-9 px-4 rounded-xl bg-red-50 text-red-700 text-xs font-semibold flex items-center gap-1.5"><ThumbsDown size={13} /> Reject</button>
              <button onClick={() => withdrawMut.mutate()} className="h-9 px-4 rounded-xl border text-xs font-semibold ml-auto">Withdraw</button>
            </div>
          )}

          {req.status === 'notice_period' && (
            <div>
              <p className="text-sm text-slate-600 mb-3">Employee is serving notice period. Start clearance once ready.</p>
              <button onClick={() => startClearanceMut.mutate()} className="h-9 px-4 rounded-xl bg-blue-600 text-white text-xs font-semibold flex items-center gap-1.5">
                <ClipboardCheck size={13} /> Start Clearance
              </button>
            </div>
          )}

          {['clearance_pending', 'clearance_done'].includes(req.status) && (
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase mb-2 flex items-center gap-1.5"><ClipboardCheck size={13} /> Department Clearance</p>
              <div className="space-y-2">
                {(req.clearance || []).map(c => (
                  <div key={c.department} className="flex items-center justify-between border border-slate-200 rounded-xl px-4 py-2.5">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{c.department}</p>
                      {c.cleared_by_name && <p className="text-[11px] text-slate-500">{c.cleared_by_name} · {dayjs(c.cleared_at).format('DD-MM-YYYY')}</p>}
                      {c.remarks && <p className="text-[11px] text-slate-500">{c.remarks}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge color={c.status === 'cleared' ? 'green' : c.status === 'issues' ? 'red' : 'amber'}>{c.status}</Badge>
                      {c.status === 'pending' && (
                        <>
                          <button onClick={() => clearanceMut.mutate({ dept: c.department, status: 'cleared' })} className="h-7 px-2 rounded-lg bg-emerald-50 text-emerald-700"><ThumbsUp size={12} /></button>
                          <button onClick={() => { const r = window.prompt('Issue notes:'); clearanceMut.mutate({ dept: c.department, status: 'issues', remarks: r || '' }); }} className="h-7 px-2 rounded-lg bg-red-50 text-red-700"><ThumbsDown size={12} /></button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {req.pending_assets?.length > 0 && (
                <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <p className="text-xs font-bold text-amber-800 flex items-center gap-1.5 mb-1"><PackageCheck size={13} /> {req.pending_assets.length} asset(s) not yet returned</p>
                  <p className="text-[11px] text-amber-700">{req.pending_assets.map(a => a.asset_name).join(', ')} — return via Employee Management → Assets.</p>
                </div>
              )}
            </div>
          )}

          {req.status !== 'submitted' && (
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase mb-2 flex items-center gap-1.5"><MessageSquareText size={13} /> Exit Interview</p>
              {req.interview ? (
                <div className="border border-slate-200 rounded-xl p-3 text-sm">
                  <p className="text-slate-700">{req.interview.primary_reason}</p>
                  <p className="text-[11px] text-slate-400 mt-1">Rating: {req.interview.satisfaction_rating}/5 · Would recommend: {req.interview.would_recommend ? 'Yes' : 'No'}</p>
                </div>
              ) : iv ? (
                <ExitInterviewForm onSave={(d) => interviewMut.mutate(d)} onCancel={() => setIv(false)} pending={interviewMut.isPending} />
              ) : (
                <button onClick={() => setIv(true)} className="h-8 px-3 rounded-lg bg-slate-100 text-xs font-medium text-slate-600">Record Exit Interview</button>
              )}
            </div>
          )}

          {req.status === 'clearance_done' && (
            <button onClick={() => linkFnfMut.mutate()} disabled={linkFnfMut.isPending} className="h-9 px-4 rounded-xl bg-blue-600 text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50">
              Start Full & Final Settlement <ArrowRight size={13} />
            </button>
          )}

          {req.status === 'fnf_linked' && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
              <p className="text-xs text-blue-800">F&F settlement created — complete it under <strong>HR Admin → Full &amp; Final Settlement</strong>, then return here to finalize the exit.</p>
              <button onClick={() => completeMut.mutate()} disabled={completeMut.isPending} className="h-8 px-3 mt-2 rounded-lg bg-blue-600 text-white text-xs font-semibold disabled:opacity-50">
                Mark Exit Complete (once F&F is paid)
              </button>
            </div>
          )}

          {req.status === 'exited' && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm text-slate-600">Employee record deactivated — exit process complete.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function ExitInterviewForm({ onSave, onCancel, pending }) {
  const [f, setF] = useState({ interview_date: dayjs().format('YYYY-MM-DD'), primary_reason: '', satisfaction_rating: 3, would_recommend: true, feedback: '' });
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  return (
    <div className="border border-slate-200 rounded-xl p-3 space-y-2">
      <Field label="Primary Reason for Leaving"><input value={f.primary_reason} onChange={e => set('primary_reason', e.target.value)} className={INP} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Satisfaction (1-5)">
          <select value={f.satisfaction_rating} onChange={e => set('satisfaction_rating', e.target.value)} className={INP}>
            {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </Field>
        <Field label="Would Recommend BCIM?">
          <select value={f.would_recommend} onChange={e => set('would_recommend', e.target.value === 'true')} className={INP}>
            <option value="true">Yes</option><option value="false">No</option>
          </select>
        </Field>
      </div>
      <Field label="Feedback"><textarea rows={2} value={f.feedback} onChange={e => set('feedback', e.target.value)} className={TA} /></Field>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="h-8 px-3 rounded-lg border text-xs">Cancel</button>
        <button onClick={() => onSave(f)} disabled={pending} className="h-8 px-3 rounded-lg bg-blue-600 text-white text-xs font-semibold disabled:opacity-50">{pending ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  );
}

export default function ExitManagementPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [filterStatus, setFilterStatus] = useState('');

  const { data: employees = [] } = useQuery({ queryKey: ['hr-employees-exit'], queryFn: () => hrEmployeesAPI.list().then(r => (r.data?.data || []).filter(e => e.is_active)) });
  const { data: exits = [], isLoading } = useQuery({ queryKey: ['hr-exits', filterStatus], queryFn: () => hrExitAPI.list({ status: filterStatus || undefined }).then(r => r.data?.data || []) });
  const refresh = () => qc.invalidateQueries({ queryKey: ['hr-exits'] });

  const STATUSES = ['submitted', 'notice_period', 'clearance_pending', 'clearance_done', 'fnf_linked', 'exited'];

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#f5f6fa]">
      <PageHeader title="Exit Management" subtitle="Resignation through Full &amp; Final settlement"
        breadcrumbs={[{ label: 'HR & Admin' }, { label: 'Exit Management' }]}
        actions={<button onClick={() => setShowForm(true)} className="h-9 px-4 rounded-xl bg-blue-600 text-white text-xs font-semibold flex items-center gap-2"><Plus size={14} /> Raise Exit Request</button>}
      />
      <div className="flex gap-2 px-5 pt-4 flex-wrap">
        {STATUSES.map(s => (
          <button key={s} onClick={() => setFilterStatus(s === filterStatus ? '' : s)}
            className={clsx('h-8 px-3 rounded-lg text-xs font-medium', filterStatus === s ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600')}>
            {STATUS_LABEL[s]}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-auto p-5">
        <div className="grid grid-cols-1 gap-3 max-w-4xl">
          {isLoading ? <p className="text-center py-16 text-slate-400 text-sm">Loading…</p> : exits.length === 0 ? (
            <div className="text-center py-16 text-slate-400 text-sm flex flex-col items-center gap-2"><LogOut className="w-8 h-8 opacity-30" /> No exit requests</div>
          ) : exits.map(e => (
            <button key={e.id} onClick={() => setOpenId(e.id)} className="text-left bg-white rounded-xl border border-slate-200 px-5 py-4 hover:shadow-sm hover:border-blue-300">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-slate-800">{e.employee_name}</p>
                  <p className="text-[11px] text-slate-500">{e.designation_name || '—'} · {e.department_name || '—'} · {e.exit_reason.replace(/_/g, ' ')}</p>
                </div>
                <div className="text-right">
                  <Badge color={STATUS_C[e.status]}>{STATUS_LABEL[e.status]}</Badge>
                  <p className="text-[10px] text-slate-400 mt-1">{e.progress_pct}% complete</p>
                </div>
              </div>
              {['clearance_pending', 'clearance_done'].includes(e.status) && (
                <p className="text-[11px] text-slate-400 mt-2">Clearance: {e.clearance_done_count}/{e.clearance_total_count} depts · {e.assets_pending_return} asset(s) pending return</p>
              )}
            </button>
          ))}
        </div>
      </div>
      {showForm && <ExitRequestForm employees={employees} onClose={() => setShowForm(false)} onSaved={refresh} />}
      {openId && <ExitDrawer id={openId} onClose={() => setOpenId(null)} onChanged={refresh} />}
    </div>
  );
}
