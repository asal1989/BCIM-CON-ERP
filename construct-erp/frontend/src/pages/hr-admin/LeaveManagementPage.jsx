// src/pages/hr-admin/LeaveManagementPage.jsx  — Fixed: reject modal, balance adjust, cancel, validation
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Calendar, Check, X, Plus, Users, Clock,
  CheckCircle, XCircle, AlertCircle, RefreshCw, Edit2, Trash2,
  SlidersHorizontal,
} from 'lucide-react';
import { hrLeaveAPI, hrMastersAPI, hrEmployeesAPI } from '../../api/client';
import toast from 'react-hot-toast';

// ── helpers ───────────────────────────────────────────────────────────────────
const B = { navy:'#0A1F5C', blue:'#2563EB', yellow:'#F4C430' };
const fade = (d = 0) => ({ initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.35, delay: d, ease: [0.16, 1, 0.3, 1] } });
const AVATAR_GRADS = [['#6366F1','#4F46E5'],['#0EA5E9','#0284C7'],['#10B981','#059669'],['#F59E0B','#D97706'],['#EF4444','#DC2626'],['#8B5CF6','#7C3AED']];
const avatarGrad = (n) => AVATAR_GRADS[(n?.charCodeAt(0)||0) % AVATAR_GRADS.length];
const initials = (n) => (n||'U').split(' ').map(x=>x[0]).join('').slice(0,2).toUpperCase();

const STATUS_CFG = {
  pending:   { label: 'Pending',   bg: 'bg-amber-50',  text: 'text-amber-700',  dot: 'bg-amber-400',  icon: Clock       },
  approved:  { label: 'Approved',  bg: 'bg-green-50',  text: 'text-green-700',  dot: 'bg-green-500',  icon: CheckCircle },
  rejected:  { label: 'Rejected',  bg: 'bg-red-50',    text: 'text-red-700',    dot: 'bg-red-500',    icon: XCircle     },
  cancelled: { label: 'Cancelled', bg: 'bg-gray-100',  text: 'text-gray-500',   dot: 'bg-gray-400',   icon: X           },
};

const inp   = "w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-slate-900 font-medium focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50 transition-all";
const label = "text-xs font-bold text-gray-600 uppercase tracking-wide block mb-1.5";

// ── Apply Leave Modal ─────────────────────────────────────────────────────────
function ApplyLeaveModal({ onClose, onSuccess }) {
  const [form, setForm] = useState({ user_id: '', leave_type_id: '', from_date: '', to_date: '', half_day: false, reason: '' });
  const { data: empData } = useQuery({ queryKey: ['hr-employees-all'], queryFn: () => hrEmployeesAPI.list({ employment_status: 'active' }).then(r => r.data) });
  const { data: ltData }  = useQuery({ queryKey: ['hr-leave-types'],   queryFn: () => hrMastersAPI.listLeaveTypes().then(r => r.data) });

  const submitMut = useMutation({
    mutationFn: (data) => hrLeaveAPI.submitRequest(data),
    onSuccess: () => { toast.success('Leave applied successfully'); onSuccess(); },
    onError: e => toast.error(e.response?.data?.error || 'Error submitting leave'),
  });
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // FIX 1: validate both from_date AND to_date
  const canSubmit = form.user_id && form.leave_type_id && form.from_date && form.to_date;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}>
      <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }}
        transition={{ duration: 0.22 }} className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="relative px-6 py-5 flex items-center justify-between"
          style={{background:`linear-gradient(135deg,#0A1F5C,#1e3a8a)`}}>
          <div className="absolute inset-0 opacity-[0.07]" style={{background:'radial-gradient(circle at 80% 50%,#fff,transparent 70%)'}}/>
          <div className="relative z-10 flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-white/15 flex items-center justify-center">
              <Calendar className="w-4 h-4 text-white"/>
            </div>
            <p className="font-black text-white">Apply Leave</p>
          </div>
          <button onClick={onClose} className="relative z-10 w-7 h-7 rounded-lg bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors">
            <X className="w-4 h-4 text-white"/>
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className={label}>Employee</label>
            <select className={inp} value={form.user_id} onChange={e => set('user_id', e.target.value)}>
              <option value="">Select Employee</option>
              {(empData?.data || []).map(e => <option key={e.id} value={e.id}>{e.name} ({e.employee_code})</option>)}
            </select>
          </div>
          <div>
            <label className={label}>Leave Type</label>
            <select className={inp} value={form.leave_type_id} onChange={e => set('leave_type_id', e.target.value)}>
              <option value="">Select Type</option>
              {(ltData?.data || []).map(l => <option key={l.id} value={l.id}>{l.name} ({l.code})</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>From Date</label>
              <input type="date" className={inp} value={form.from_date} onChange={e => set('from_date', e.target.value)} />
            </div>
            <div>
              <label className={label}>To Date</label>
              <input type="date" className={inp} value={form.to_date}
                min={form.from_date || undefined}
                onChange={e => set('to_date', e.target.value)} />
            </div>
          </div>
          <label className="flex items-center gap-3 cursor-pointer group">
            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${form.half_day ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300 group-hover:border-indigo-400'}`}
              onClick={() => set('half_day', !form.half_day)}>
              {form.half_day && <Check className="w-3 h-3 text-white" />}
            </div>
            <span className="text-sm text-gray-700 select-none">Half Day</span>
          </label>
          <div>
            <label className={label}>Reason</label>
            <textarea className={inp + ' resize-none'} rows={3} value={form.reason} onChange={e => set('reason', e.target.value)} placeholder="Optional reason…" />
          </div>
        </div>
        <div className="flex gap-3 px-6 pb-6">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-bold hover:bg-gray-50 transition-colors">Cancel</button>
          <button onClick={() => submitMut.mutate(form)} disabled={submitMut.isPending || !canSubmit}
            className="flex-1 py-2.5 rounded-xl text-white text-sm font-black disabled:opacity-50 transition-all"
            style={{ background: `linear-gradient(135deg,${B.blue},${B.navy})` }}>
            {submitMut.isPending ? 'Applying…' : 'Apply Leave'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ── FIX 2: Reject Modal (replaces window.prompt) ──────────────────────────────
function RejectModal({ request, onClose, onConfirm, isPending }) {
  const [reason, setReason] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: 0.2 }} className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-red-50 flex items-center justify-center">
              <XCircle className="w-4 h-4 text-red-500"/>
            </div>
            <div>
              <p className="font-black text-gray-900 text-sm">Reject Leave</p>
              <p className="text-xs text-gray-400">{request?.employee_name}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4 text-gray-400"/>
          </button>
        </div>
        <div className="px-6 py-5 space-y-3">
          <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 text-sm text-red-700">
            <strong>{request?.leave_type_name}</strong> · {request?.days || request?.total_days || '?'} day(s)
            <br/>
            <span className="text-xs">{request?.from_date} → {request?.to_date}</span>
          </div>
          <div>
            <label className={label}>Rejection Reason <span className="text-gray-400 font-normal normal-case">(optional)</span></label>
            <textarea className={inp + ' resize-none'} rows={3}
              value={reason} onChange={e => setReason(e.target.value)}
              placeholder="e.g. Insufficient leave balance, peak project period…" autoFocus/>
          </div>
        </div>
        <div className="flex gap-3 px-6 pb-6">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-bold hover:bg-gray-50 transition-colors">Cancel</button>
          <button onClick={() => onConfirm(reason)} disabled={isPending}
            className="flex-1 py-2.5 rounded-xl text-white text-sm font-black disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg,#EF4444,#DC2626)' }}>
            {isPending ? 'Rejecting…' : 'Reject Leave'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ── FIX 3: Adjust Balance Modal ───────────────────────────────────────────────
function AdjustBalanceModal({ balance, onClose, onSave, isPending }) {
  const [adjustment, setAdjustment]   = useState('');
  const [note,       setNote]         = useState('');
  const [mode,       setMode]         = useState('add'); // 'add' | 'set'
  const current = parseFloat(balance?.closing_balance || 0);
  const adj     = parseFloat(adjustment) || 0;
  const preview = mode === 'set' ? adj : current + adj;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: 0.2 }} className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
        <div className="relative px-6 py-5 flex items-center justify-between"
          style={{background:`linear-gradient(135deg,#0A1F5C,#1e3a8a)`}}>
          <div className="absolute inset-0 opacity-[0.07]" style={{background:'radial-gradient(circle at 80% 50%,#fff,transparent 70%)'}}/>
          <div className="relative z-10">
            <p className="font-black text-white">Adjust Leave Balance</p>
            <p className="text-white/55 text-xs mt-0.5">{balance?.leave_type_name} · {balance?.employee_name || 'Employee'}</p>
          </div>
          <button onClick={onClose} className="relative z-10 w-7 h-7 rounded-lg bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors">
            <X className="w-4 h-4 text-white"/>
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm">
            <span className="text-blue-700 font-bold">Current Balance</span>
            <span className="text-blue-900 font-black text-lg">{current.toFixed(1)} days</span>
          </div>

          <div className="flex gap-2">
            {[['add','Add / Deduct'],['set','Set to Value']].map(([v,l])=>(
              <button key={v} onClick={()=>setMode(v)}
                className={`flex-1 py-2 rounded-xl text-xs font-black transition-all border ${mode===v?'bg-blue-600 text-white border-blue-600':'bg-gray-50 text-gray-600 border-gray-200 hover:border-blue-300'}`}>
                {l}
              </button>
            ))}
          </div>

          <div>
            <label className={label}>{mode === 'add' ? 'Days to Add (+) or Deduct (−)' : 'New Balance Value'}</label>
            <input type="number" step="0.5" className={inp}
              value={adjustment}
              onChange={e => setAdjustment(e.target.value)}
              placeholder={mode === 'add' ? 'e.g. 2 or -1.5' : 'e.g. 15'}/>
          </div>

          {adjustment !== '' && (
            <div className={`flex items-center justify-between rounded-xl px-4 py-3 text-sm border ${preview >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
              <span className={`font-bold ${preview >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>New Balance</span>
              <span className={`font-black text-lg ${preview >= 0 ? 'text-emerald-900' : 'text-red-900'}`}>{preview.toFixed(1)} days</span>
            </div>
          )}

          <div>
            <label className={label}>Reason / Note <span className="text-gray-400 font-normal normal-case">(optional)</span></label>
            <input className={inp} value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Annual credit, correction…"/>
          </div>
        </div>
        <div className="flex gap-3 px-6 pb-6">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-bold hover:bg-gray-50 transition-colors">Cancel</button>
          <button onClick={() => onSave({ closing_balance: preview, note })} disabled={isPending || adjustment === ''}
            className="flex-1 py-2.5 rounded-xl text-white text-sm font-black disabled:opacity-50"
            style={{ background: `linear-gradient(135deg,${B.blue},${B.navy})` }}>
            {isPending ? 'Saving…' : 'Save Balance'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Requests Tab ──────────────────────────────────────────────────────────────
function RequestsTab() {
  const qc = useQueryClient();
  const [statusF,    setStatusF]    = useState('pending');
  const [applyModal, setApplyModal] = useState(false);
  const [rejectTarget, setRejectTarget] = useState(null); // FIX 2

  const { data: reqData, isLoading } = useQuery({
    queryKey: ['hr-leave-requests', statusF],
    queryFn: () => hrLeaveAPI.listRequests({ status: statusF || undefined }).then(r => r.data),
  });
  const requests = reqData?.data || [];
  const inv = () => qc.invalidateQueries({ queryKey: ['hr-leave-requests'] });

  const approveMut = useMutation({
    mutationFn: (id) => hrLeaveAPI.approve(id),
    onSuccess: () => { toast.success('Leave approved'); inv(); },
    onError: e => toast.error(e.response?.data?.error || 'Error'),
  });

  // FIX 2: proper reject mutation
  const rejectMut = useMutation({
    mutationFn: ({ id, reason }) => hrLeaveAPI.reject(id, { rejection_reason: reason }),
    onSuccess: () => { toast.success('Leave rejected'); setRejectTarget(null); inv(); },
    onError: e => toast.error(e.response?.data?.error || 'Error'),
  });

  // FIX 3: cancel approved leave
  const cancelMut = useMutation({
    mutationFn: (id) => hrLeaveAPI.cancel(id),
    onSuccess: () => { toast.success('Leave cancelled'); inv(); },
    onError: e => toast.error(e.response?.data?.error || 'Error'),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
          {[
            { value: 'pending',  label: 'Pending'  },
            { value: 'approved', label: 'Approved' },
            { value: 'rejected', label: 'Rejected' },
            { value: '',         label: 'All'      },
          ].map(s => (
            <button key={s.value} onClick={() => setStatusF(s.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                statusF === s.value ? 'bg-white shadow-sm text-indigo-700' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {s.label}
            </button>
          ))}
        </div>
        <button onClick={() => setApplyModal(true)}
          className="ml-auto flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-black hover:shadow-md transition-all"
          style={{ background: `linear-gradient(135deg,${B.blue},${B.navy})` }}>
          <Plus className="w-4 h-4" /> Apply Leave
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 gap-3">
          <div className="w-6 h-6 rounded-full border-2 border-indigo-200 border-t-indigo-600 animate-spin" />
          <p className="text-sm text-gray-400">Loading requests…</p>
        </div>
      ) : requests.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center shadow-sm"
          style={{boxShadow:'0 2px 12px rgba(10,31,92,0.06)'}}>
          <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-7 h-7 text-gray-300" />
          </div>
          <p className="font-bold text-gray-600">No {statusF || ''} requests</p>
          <p className="text-sm text-gray-400 mt-1">Everything is up to date</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((r, i) => {
            const [g1, g2] = avatarGrad(r.employee_name);
            const st = STATUS_CFG[r.status] || STATUS_CFG.pending;
            const StIcon = st.icon;
            const days = r.days || r.total_days || '?';
            return (
              <motion.div key={r.id} {...fade(i * 0.03)}
                className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm hover:shadow-md transition-shadow"
                style={{boxShadow:'0 2px 12px rgba(10,31,92,0.06)'}}>
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center text-white text-sm font-black"
                    style={{ background: `linear-gradient(135deg, ${g1}, ${g2})` }}>
                    {initials(r.employee_name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <p className="font-black text-gray-900">{r.employee_name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{r.employee_code}</p>
                      </div>
                      <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0 ${st.bg} ${st.text}`}>
                        <StIcon className="w-3 h-3" />
                        {st.label}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-4 mt-3">
                      <div className="flex items-center gap-1.5 text-sm">
                        <div className="w-5 h-5 rounded-md bg-indigo-50 flex items-center justify-center flex-shrink-0">
                          <Calendar className="w-3 h-3 text-indigo-500" />
                        </div>
                        <span className="font-bold text-gray-800">{r.leave_type_name || 'Leave'}</span>
                        <span className="text-gray-300">·</span>
                        <span className="font-bold text-gray-700">{days} day{days !== 1 ? 's' : ''}</span>
                      </div>
                      <div className="text-sm text-gray-500">
                        {new Date(r.from_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        {r.from_date !== r.to_date && (
                          <> → {new Date(r.to_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</>
                        )}
                      </div>
                    </div>
                    {r.reason && (
                      <p className="text-xs text-gray-500 mt-2 bg-gray-50 px-3 py-2 rounded-lg">"{r.reason}"</p>
                    )}
                    {r.rejection_reason && (
                      <p className="text-xs text-red-600 mt-2 bg-red-50 px-3 py-2 rounded-lg">Rejected: "{r.rejection_reason}"</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0 self-center">
                    {r.status === 'pending' && (
                      <>
                        <button onClick={() => approveMut.mutate(r.id)}
                          disabled={approveMut.isPending}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black bg-green-50 text-green-700 hover:bg-green-100 transition-colors disabled:opacity-50">
                          <Check className="w-3.5 h-3.5" /> Approve
                        </button>
                        {/* FIX 2: opens modal instead of window.prompt */}
                        <button onClick={() => setRejectTarget(r)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black bg-red-50 text-red-600 hover:bg-red-100 transition-colors">
                          <X className="w-3.5 h-3.5" /> Reject
                        </button>
                      </>
                    )}
                    {/* FIX 3: cancel approved leave */}
                    {r.status === 'approved' && (
                      <button onClick={() => window.confirm('Cancel this approved leave?') && cancelMut.mutate(r.id)}
                        disabled={cancelMut.isPending}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors disabled:opacity-50">
                        <X className="w-3.5 h-3.5" /> Cancel
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {applyModal && (
          <ApplyLeaveModal onClose={() => setApplyModal(false)} onSuccess={() => { setApplyModal(false); inv(); }} />
        )}
        {/* FIX 2: reject modal */}
        {rejectTarget && (
          <RejectModal
            request={rejectTarget}
            onClose={() => setRejectTarget(null)}
            isPending={rejectMut.isPending}
            onConfirm={(reason) => rejectMut.mutate({ id: rejectTarget.id, reason })}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Balances Tab ──────────────────────────────────────────────────────────────
function BalancesTab() {
  const qc     = useQueryClient();
  const [userId,  setUserId]  = useState('');
  const [adjustTarget, setAdjustTarget] = useState(null); // FIX 4
  const year = new Date().getFullYear();

  const { data: empData } = useQuery({ queryKey: ['hr-employees-all'], queryFn: () => hrEmployeesAPI.list({ employment_status: 'active' }).then(r => r.data) });
  const { data: balData, isLoading } = useQuery({
    queryKey: ['hr-leave-balances-admin', userId, year],
    queryFn: () => hrLeaveAPI.getBalances({ user_id: userId || undefined, year }).then(r => r.data),
    enabled: Boolean(userId),
  });
  const balances = balData?.data || [];
  const selectedEmp = (empData?.data || []).find(e => e.id == userId);

  // FIX 4: adjust balance mutation
  const adjustMut = useMutation({
    mutationFn: ({ id, data }) => hrLeaveAPI.updateBalance(id, data),
    onSuccess: () => {
      toast.success('Leave balance updated');
      setAdjustTarget(null);
      qc.invalidateQueries({ queryKey: ['hr-leave-balances-admin', userId, year] });
    },
    onError: e => toast.error(e.response?.data?.error || 'Failed to update balance'),
  });

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm"
        style={{boxShadow:'0 2px 12px rgba(10,31,92,0.06)'}}>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex-1 min-w-48">
            <label className={label}>Select Employee</label>
            <select className={inp} value={userId} onChange={e => setUserId(e.target.value)}>
              <option value="">— Choose an employee —</option>
              {(empData?.data || []).map(e => <option key={e.id} value={e.id}>{e.name} ({e.employee_code})</option>)}
            </select>
          </div>
          {selectedEmp && (
            <div className="flex items-center gap-3 mt-5">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-sm"
                style={{ background: `linear-gradient(135deg, ${avatarGrad(selectedEmp.name)[0]}, ${avatarGrad(selectedEmp.name)[1]})` }}>
                {initials(selectedEmp.name)}
              </div>
              <div>
                <p className="font-black text-gray-900 text-sm">{selectedEmp.name}</p>
                <p className="text-xs text-gray-400">{selectedEmp.designation_name || selectedEmp.department_name || '—'}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {!userId && (
        <div className="bg-white rounded-2xl border border-gray-100 py-14 text-center shadow-sm">
          <Users className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400 text-sm font-bold">Select an employee to view leave balances</p>
        </div>
      )}

      {userId && isLoading && (
        <div className="flex items-center justify-center py-12 gap-3">
          <div className="w-6 h-6 rounded-full border-2 border-indigo-200 border-t-indigo-600 animate-spin" />
        </div>
      )}

      {userId && !isLoading && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {balances.map((b, i) => {
            const taken  = parseFloat(b.taken || 0);
            const total  = parseFloat(b.days_per_year || b.accrued || 1);
            const avail  = parseFloat(b.closing_balance || 0);
            const pct    = Math.min(100, total > 0 ? (avail / total) * 100 : 0);
            const [g1, g2] = AVATAR_GRADS[i % AVATAR_GRADS.length];
            return (
              <motion.div key={b.id} {...fade(i * 0.04)}
                className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-shadow"
                style={{boxShadow:'0 2px 12px rgba(10,31,92,0.06)'}}>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="font-black text-gray-900 text-sm">{b.leave_type_name}</p>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded mt-1 inline-block" style={{ background: `${g1}18`, color: g1 }}>{b.leave_code || b.code}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="text-3xl font-black" style={{ color: g1 }}>{avail.toFixed(1)}</div>
                  </div>
                </div>

                <div className="mb-3">
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>Available</span>
                    <span>{Math.round(pct)}%</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.6, delay: i * 0.05 }}
                      className="h-full rounded-full"
                      style={{ background: `linear-gradient(90deg, ${g1}, ${g2})` }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                  {[
                    { label: 'Accrued',   value: parseFloat(b.accrued || 0).toFixed(1) },
                    { label: 'Taken',     value: taken.toFixed(1) },
                    { label: 'Carry Fwd', value: parseFloat(b.carry_forwarded || 0).toFixed(1) },
                    { label: 'Balance',   value: avail.toFixed(1) },
                  ].map(x => (
                    <div key={x.label} className="bg-gray-50 rounded-lg px-2 py-1.5">
                      <p className="text-gray-400">{x.label}</p>
                      <p className="font-black text-gray-800 mt-0.5">{x.value}</p>
                    </div>
                  ))}
                </div>

                {/* FIX 4: Adjust Balance button */}
                <button onClick={() => setAdjustTarget({ ...b, employee_name: selectedEmp?.name })}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-xs font-black bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors border border-blue-200">
                  <SlidersHorizontal className="w-3 h-3"/> Adjust Balance
                </button>
              </motion.div>
            );
          })}
          {balances.length === 0 && (
            <div className="col-span-full bg-white rounded-2xl border border-gray-100 py-10 text-center shadow-sm text-sm text-gray-400 font-bold">
              No leave balances found for {year}
            </div>
          )}
        </div>
      )}

      {/* FIX 4: Adjust Balance Modal */}
      <AnimatePresence>
        {adjustTarget && (
          <AdjustBalanceModal
            balance={adjustTarget}
            isPending={adjustMut.isPending}
            onClose={() => setAdjustTarget(null)}
            onSave={(data) => adjustMut.mutate({ id: adjustTarget.id, data })}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Leave Types Tab ───────────────────────────────────────────────────────────
function LeaveTypesTab() {
  const qc = useQueryClient();
  const [modal, setModal] = useState(null);
  const { data } = useQuery({ queryKey: ['hr-leave-types'], queryFn: () => hrMastersAPI.listLeaveTypes().then(r => r.data) });
  const types = data?.data || [];

  const saveMut = useMutation({
    mutationFn: (d) => modal?.id ? hrMastersAPI.updateLeaveType(modal.id, d) : hrMastersAPI.createLeaveType(d),
    onSuccess: () => { toast.success('Saved'); qc.invalidateQueries({ queryKey: ['hr-leave-types'] }); setModal(null); },
    onError: e => toast.error(e.response?.data?.error || 'Error'),
  });
  const delMut = useMutation({
    mutationFn: (id) => hrMastersAPI.deleteLeaveType(id),
    onSuccess: () => { toast.success('Deleted'); qc.invalidateQueries({ queryKey: ['hr-leave-types'] }); },
    onError: e => toast.error(e.response?.data?.error || 'Error'),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setModal({})}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black hover:shadow-md transition-all"
          style={{ background: B.yellow, color: B.navy }}>
          <Plus className="w-4 h-4" /> Add Leave Type
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {types.map((t, i) => {
          const [g1, g2] = AVATAR_GRADS[i % AVATAR_GRADS.length];
          return (
            <motion.div key={t.id} {...fade(i * 0.04)}
              className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-shadow"
              style={{boxShadow:'0 2px 12px rgba(10,31,92,0.06)'}}>
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-black"
                  style={{ background: `linear-gradient(135deg, ${g1}, ${g2})` }}>
                  {t.code}
                </div>
                <div className="flex gap-1">
                  <button onClick={() => setModal(t)} className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => window.confirm(`Delete "${t.name}"?`) && delMut.mutate(t.id)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <p className="font-black text-gray-900">{t.name}</p>
              <p className="text-2xl font-black mt-2" style={{ color: g1 }}>{t.days_per_year}</p>
              <p className="text-xs text-gray-400">days per year</p>
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${t.is_paid ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                  {t.is_paid ? 'Paid' : 'Unpaid'}
                </span>
                {t.carry_forward && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">
                    CF: {t.max_carry_forward}d
                  </span>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      <AnimatePresence>
        {modal !== null && (
          <LeaveTypeModal lt={modal?.id ? modal : null} onClose={() => setModal(null)} onSave={(d) => saveMut.mutate(d)} isPending={saveMut.isPending} />
        )}
      </AnimatePresence>
    </div>
  );
}

function LeaveTypeModal({ lt, onClose, onSave, isPending }) {
  const [f, setF] = useState({
    name: lt?.name || '', code: lt?.code || '',
    days_per_year: lt?.days_per_year || 0,
    carry_forward: lt?.carry_forward || false,
    max_carry_forward: lt?.max_carry_forward || 0,
    is_paid: lt?.is_paid ?? true,
  });
  const s = (k, v) => setF(p => ({ ...p, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <p className="font-black text-gray-900">{lt ? 'Edit' : 'Add'} Leave Type</p>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className={label}>Name</label>
            <input className={inp} value={f.name} onChange={e => s('name', e.target.value)} placeholder="e.g. Earned Leave" />
          </div>
          <div>
            <label className={label}>Code</label>
            <input className={inp} value={f.code} onChange={e => s('code', e.target.value.toUpperCase())} placeholder="e.g. EL" maxLength={5} />
          </div>
          <div>
            <label className={label}>Days Per Year</label>
            <input className={inp} type="number" value={f.days_per_year} onChange={e => s('days_per_year', e.target.value)} />
          </div>
          <div className="flex gap-6">
            {[['carry_forward','Carry Forward'],['is_paid','Paid Leave']].map(([k, lbl]) => (
              <label key={k} className="flex items-center gap-2 cursor-pointer">
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${f[k] ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300'}`}
                  onClick={() => s(k, !f[k])}>
                  {f[k] && <Check className="w-3 h-3 text-white" />}
                </div>
                <span className="text-sm text-gray-700 select-none">{lbl}</span>
              </label>
            ))}
          </div>
          {f.carry_forward && (
            <div>
              <label className={label}>Max Carry Forward Days</label>
              <input className={inp} type="number" value={f.max_carry_forward} onChange={e => s('max_carry_forward', e.target.value)} />
            </div>
          )}
        </div>
        <div className="flex gap-3 px-6 pb-6">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-bold hover:bg-gray-50 transition-colors">Cancel</button>
          <button onClick={() => f.name && f.code && onSave(f)} disabled={isPending || !f.name || !f.code}
            className="flex-1 py-2.5 rounded-xl text-white text-sm font-black disabled:opacity-50"
            style={{ background: `linear-gradient(135deg,${B.blue},${B.navy})` }}>
            {isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Leave Calendar Tab ────────────────────────────────────────────────────────
function LeaveCalendarTab() {
  const today = new Date();
  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());   // 0-based

  const { data, isLoading } = useQuery({
    queryKey: ['hr-leave-requests-cal', year, month],
    queryFn: () => hrLeaveAPI.listRequests({ status: 'approved' }).then(r => r.data),
  });

  const requests = data?.data || [];

  // build a map: 'YYYY-MM-DD' -> [{name, leave_type_name}]
  const dayMap = {};
  requests.forEach(r => {
    if (!r.from_date || !r.to_date) return;
    const start = new Date(r.from_date);
    const end   = new Date(r.to_date);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().slice(0, 10);
      const [ky, km] = key.split('-').map(Number);
      if (ky === year && km - 1 === month) {
        (dayMap[key] = dayMap[key] || []).push({ name: r.employee_name, type: r.leave_type_name });
      }
    }
  });

  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const DAY_LABELS  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  const LEAVE_COLORS = ['bg-blue-100 text-blue-700','bg-green-100 text-green-700','bg-purple-100 text-purple-700',
    'bg-amber-100 text-amber-700','bg-rose-100 text-rose-700','bg-indigo-100 text-indigo-700'];
  const colorFor = (name) => LEAVE_COLORS[(name?.charCodeAt(0)||0) % LEAVE_COLORS.length];

  const prev = () => { if (month === 0) { setMonth(11); setYear(y => y-1); } else setMonth(m => m-1); };
  const next = () => { if (month === 11) { setMonth(0); setYear(y => y+1); } else setMonth(m => m+1); };

  const todayKey = today.toISOString().slice(0, 10);
  const cells = Array.from({ length: firstDay + daysInMonth }, (_, i) => i < firstDay ? null : i - firstDay + 1);

  return (
    <div className="space-y-4">
      {/* Month navigation */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center justify-between"
        style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
        <button onClick={prev} className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors text-gray-600 font-bold">‹</button>
        <span className="font-black text-gray-900 text-lg">{MONTH_NAMES[month]} {year}</span>
        <button onClick={next} className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors text-gray-600 font-bold">›</button>
      </div>

      {isLoading ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-gray-400 text-sm">Loading…</div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden" style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
          {/* Day-of-week header */}
          <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-100">
            {DAY_LABELS.map(d => (
              <div key={d} className="py-2 text-center text-xs font-black text-gray-500 uppercase tracking-wide">{d}</div>
            ))}
          </div>
          {/* Calendar grid */}
          <div className="grid grid-cols-7 divide-x divide-y divide-gray-100">
            {cells.map((day, i) => {
              if (!day) return <div key={`e-${i}`} className="min-h-[90px] bg-gray-50/50" />;
              const key = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
              const leaves = dayMap[key] || [];
              const isToday = key === todayKey;
              return (
                <div key={key} className={`min-h-[90px] p-1.5 ${isToday ? 'bg-blue-50' : 'bg-white'}`}>
                  <span className={`inline-flex w-6 h-6 items-center justify-center rounded-full text-xs font-black mb-1 ${
                    isToday ? 'bg-blue-600 text-white' : 'text-gray-700'
                  }`}>{day}</span>
                  <div className="space-y-0.5">
                    {leaves.slice(0, 3).map((l, j) => (
                      <div key={j} className={`text-[10px] font-bold px-1 py-0.5 rounded-md truncate ${colorFor(l.name)}`}
                        title={`${l.name} — ${l.type}`}>
                        {l.name?.split(' ')[0]}
                      </div>
                    ))}
                    {leaves.length > 3 && (
                      <div className="text-[10px] text-gray-400 font-bold px-1">+{leaves.length - 3} more</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Legend */}
      {Object.keys(dayMap).length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4" style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
          <p className="text-xs font-black text-gray-500 uppercase tracking-wide mb-3">Employees on Leave This Month</p>
          <div className="flex flex-wrap gap-2">
            {[...new Set(Object.values(dayMap).flat().map(l => l.name))].map(name => {
              const count = Object.values(dayMap).flat().filter(l => l.name === name).length;
              return (
                <span key={name} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${colorFor(name)}`}>
                  {name} <span className="opacity-60">· {count}d</span>
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function LeaveManagementPage() {
  const [activeTab, setActiveTab] = useState('Requests');
  const TABS = [
    { key: 'Requests',    label: 'Requests',    icon: Calendar  },
    { key: 'Balances',    label: 'Balances',    icon: RefreshCw },
    { key: 'Leave Types', label: 'Leave Types', icon: Users     },
    { key: 'Calendar',    label: 'Calendar',    icon: Calendar  },
  ];

  return (
    <div className="p-6 space-y-6 min-h-screen" style={{ background: '#F8FAFC' }}>

      {/* Header — navy gradient banner */}
      <motion.div {...fade(0)} className="relative overflow-hidden rounded-2xl"
        style={{background:`linear-gradient(135deg,#0A1F5C,#1e3a8a)`,boxShadow:'0 8px 32px rgba(10,31,92,0.2)'}}>
        <div className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-[0.07]"
          style={{background:'radial-gradient(circle,#fff,transparent 70%)',transform:'translate(25%,-25%)'}}/>
        <div className="relative z-10 px-8 py-6 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
            <Calendar className="w-5 h-5 text-white"/>
          </div>
          <div>
            <h1 className="text-2xl font-black text-white">Leave Management</h1>
            <p className="text-white/55 text-sm mt-0.5">Requests, balances &amp; leave type configuration</p>
          </div>
        </div>
      </motion.div>

      {/* Tabs */}
      <motion.div {...fade(0.05)} className="bg-white rounded-2xl border border-gray-100 p-1.5 flex gap-1 w-fit"
        style={{boxShadow:'0 2px 12px rgba(10,31,92,0.06)'}}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-black transition-all ${
              activeTab === t.key ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
            }`}>
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </motion.div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        <motion.div key={activeTab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22 }}>
          {activeTab === 'Requests'    && <RequestsTab />}
          {activeTab === 'Balances'    && <BalancesTab />}
          {activeTab === 'Leave Types' && <LeaveTypesTab />}
          {activeTab === 'Calendar'    && <LeaveCalendarTab />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
