// src/pages/hr-admin/PayrollPage.jsx  — Modern redesign
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  CreditCard, Play, Check, IndianRupee, Download, AlertCircle,
  CheckCircle, Clock, Banknote, TrendingDown, Users, X, ChevronDown,
  FileText, ArrowRight, Trash2,
} from 'lucide-react';
import { hrPayrollAPI, hrEmployeesAPI, projectAPI } from '../../api/client';
import toast from 'react-hot-toast';

// ── helpers ───────────────────────────────────────────────────────────────────
const MONTHS = ['','January','February','March','April','May','June','July','August','September','October','November','December'];
const fmt = (v) => `₹${parseFloat(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fade = (d = 0) => ({ initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.38, delay: d, ease: [0.16, 1, 0.3, 1] } });

const AVATAR_GRADS = [
  ['#6366F1','#4F46E5'],['#0EA5E9','#0284C7'],['#10B981','#059669'],
  ['#F59E0B','#D97706'],['#EF4444','#DC2626'],['#8B5CF6','#7C3AED'],
];
const avatarGrad = (n) => AVATAR_GRADS[(n?.charCodeAt(0)||0) % AVATAR_GRADS.length];
const initials = (n) => (n||'U').split(' ').map(x=>x[0]).join('').slice(0,2).toUpperCase();

const STATUS_CFG = {
  draft:            { label: 'Draft',      bg: 'bg-gray-100',     text: 'text-gray-600',   dot: 'bg-gray-400',    ring: 'ring-gray-200'    },
  pending_approval: { label: 'Pending',    bg: 'bg-amber-50',     text: 'text-amber-700',  dot: 'bg-amber-400',   ring: 'ring-amber-200'   },
  approved:         { label: 'Approved',   bg: 'bg-blue-50',      text: 'text-blue-700',   dot: 'bg-blue-500',    ring: 'ring-blue-200'    },
  paid:             { label: 'Paid',       bg: 'bg-emerald-50',   text: 'text-green-700',  dot: 'bg-emerald-500', ring: 'ring-emerald-200' },
};

// ── Workflow stepper ──────────────────────────────────────────────────────────
const STEPS = [
  { id: 'generate', label: 'Generate',  icon: Play         },
  { id: 'review',   label: 'Review',    icon: FileText     },
  { id: 'approve',  label: 'Approve',   icon: Check        },
  { id: 'disburse', label: 'Disburse',  icon: IndianRupee   },
];

function getWorkflowStep(records) {
  if (records.length === 0) return 0;
  const allPaid     = records.every(r => r.status === 'paid');
  const allApproved = records.every(r => r.status === 'approved' || r.status === 'paid');
  const hasPending  = records.some(r => r.status === 'pending_approval');
  const hasDraft    = records.some(r => r.status === 'draft');
  if (allPaid)       return 3;
  if (allApproved)   return 2;
  if (hasPending && !hasDraft) return 2;
  if (hasPending)   return 1;
  return 1;
}

function WorkflowStepper({ step }) {
  return (
    <div className="flex items-center gap-0">
      {STEPS.map((s, i) => {
        const done    = i < step;
        const current = i === step;
        return (
          <React.Fragment key={s.id}>
            <div className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all ${
              done    ? 'text-emerald-600' :
              current ? 'text-indigo-700 bg-indigo-50' :
                        'text-gray-400'
            }`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-all ${
                done    ? 'bg-emerald-100 text-emerald-600' :
                current ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200' :
                          'bg-gray-100 text-gray-400'
              }`}>
                {done ? <CheckCircle className="w-4 h-4" /> : <s.icon className="w-3.5 h-3.5" />}
              </div>
              <span className={`text-sm font-medium ${current ? 'text-indigo-700' : ''}`}>{s.label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <ArrowRight className={`w-4 h-4 flex-shrink-0 ${i < step ? 'text-emerald-400' : 'text-gray-200'}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ── Pay Modal ─────────────────────────────────────────────────────────────────
function PayModal({ onClose, onConfirm, isPending, month, year, count }) {
  const [form, setForm] = useState({
    payment_date: new Date().toISOString().split('T')[0],
    payment_mode: 'bank_transfer',
    payment_ref: '',
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}>
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: 0.22 }}
        className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center">
              <IndianRupee className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="font-medium text-gray-900">Mark Payroll as Paid</p>
              <p className="text-xs text-gray-400">{MONTHS[month]} {year} — {count} employees</p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-900 font-medium hover:text-slate-900 hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Warning */}
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
            <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-700">This will mark all approved payslips as paid and create payment records in Finance.</p>
          </div>

          {/* Fields */}
          <div>
            <label className="text-xs font-medium text-slate-900 font-medium uppercase tracking-wide block mb-1.5">Payment Date</label>
            <input type="date"
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-slate-900 font-medium focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50"
              value={form.payment_date}
              onChange={e => setForm(p => ({ ...p, payment_date: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-900 font-medium uppercase tracking-wide block mb-1.5">Payment Mode</label>
            <select
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-slate-900 font-medium focus:outline-none focus:border-indigo-400"
              value={form.payment_mode}
              onChange={e => setForm(p => ({ ...p, payment_mode: e.target.value }))}
            >
              <option value="bank_transfer">Bank Transfer / NEFT</option>
              <option value="cheque">Cheque</option>
              <option value="cash">Cash</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-900 font-medium uppercase tracking-wide block mb-1.5">Reference / UTR</label>
            <input
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-slate-900 font-medium focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50"
              placeholder="Transaction reference number"
              value={form.payment_ref}
              onChange={e => setForm(p => ({ ...p, payment_ref: e.target.value }))}
            />
          </div>
        </div>

        <div className="flex gap-3 px-6 pb-6">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-slate-900 text-sm font-medium hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button
            onClick={() => onConfirm(form)}
            disabled={isPending}
            className="flex-1 py-2.5 rounded-xl text-white text-sm font-medium disabled:opacity-50 transition-all hover:shadow-md"
            style={{ background: 'linear-gradient(135deg, #10B981, #059669)' }}
          >
            {isPending ? 'Processing…' : 'Confirm Payment'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function PayrollPage() {
  const navigate = useNavigate();
  const qc       = useQueryClient();
  const now      = new Date();
  const [month,      setMonth]      = useState(now.getMonth() + 1);
  const [year,       setYear]       = useState(now.getFullYear());
  const [projectId,  setProjectId]  = useState('');
  const [payModal,   setPayModal]   = useState(false);
  const [singleEmpId, setSingleEmpId] = useState('');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['hr-payroll', month, year, projectId],
    queryFn: () => hrPayrollAPI.list({ month, year, ...(projectId && { project_id: projectId }) }).then(r => r.data),
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects-list'],
    queryFn: () => projectAPI.list().then(r => r.data?.data || r.data || []),
  });
  const records = data?.data   || [];
  const totals  = data?.totals || {};

  const { data: employees = [] } = useQuery({
    queryKey: ['hr-employees-active'],
    queryFn: () => hrEmployeesAPI.list({ is_active: true }).then(r => r.data?.data || r.data || []),
  });

  const runMut = useMutation({
    mutationFn: (user_id) => {
      const payload = { month, year };
      if (user_id)   payload.user_id    = user_id;
      if (projectId) payload.project_id = projectId;
      return hrPayrollAPI.run(payload);
    },
    onSuccess: (res, user_id) => {
      const first = res.data?.data?.[0];
      const missing = res.data?.missing_salary_employees || [];
      if (user_id) {
        toast.success(first?.skipped ? `Already ${first.status} for this employee` : 'Payroll generated for this employee');
      } else {
        const proj = projects.find(p => p.id === projectId);
        const label = proj ? ` for ${proj.name}` : '';
        toast.success(`Payroll generated for ${res.data?.data?.length || 0} employees${label}`);
      }
      if (missing.length) {
        toast.error(`${missing.length} employee(s) skipped — no salary record: ${missing.slice(0,3).join(', ')}${missing.length > 3 ? '…' : ''}`, { duration: 8000 });
      }
      refetch();
    },
    onError: e => toast.error(e.response?.data?.error || 'Failed to generate payroll'),
  });

  const submitMut = useMutation({
    mutationFn: (id) => hrPayrollAPI.submit(id),
    onSuccess: () => { toast.success('Submitted for manager review'); refetch(); },
    onError: e => toast.error(e.response?.data?.error || 'Error'),
  });

  const approveMut = useMutation({
    mutationFn: (id) => hrPayrollAPI.approve(id),
    onSuccess: () => { toast.success('Payslip approved'); refetch(); },
    onError: e => toast.error(e.response?.data?.error || 'Error'),
  });

  const rejectMut = useMutation({
    mutationFn: (id) => hrPayrollAPI.reject(id, { review_remarks: 'Rejected — please review' }),
    onSuccess: () => { toast.success('Payslip sent back to draft'); refetch(); },
    onError: e => toast.error(e.response?.data?.error || 'Error'),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => hrPayrollAPI.remove(id),
    onSuccess: () => { toast.success('Payroll record removed'); refetch(); },
    onError: e => toast.error(e.response?.data?.error || 'Error'),
  });

  const bulkPayMut = useMutation({
    mutationFn: (d) => hrPayrollAPI.bulkPay(d),
    onSuccess: res => { toast.success(`Paid ${res.data?.count} employees`); setPayModal(false); refetch(); },
    onError: e => toast.error(e.response?.data?.error || 'Error'),
  });

  const hasDraft    = records.some(r => r.status === 'draft');
  const hasPending  = records.some(r => r.status === 'pending_approval');
  const hasApproved = records.some(r => r.status === 'approved');
  const workflowStep = getWorkflowStep(records);

  const [submittingAll, setSubmittingAll] = useState(false);
  const submitAll = async () => {
    setSubmittingAll(true);
    try {
      const res = await hrPayrollAPI.bulkSubmit({ month, year });
      toast.success(`${res.data?.submitted || 0} payslip(s) submitted for review`);
      refetch();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to submit');
    } finally {
      setSubmittingAll(false);
    }
  };

  const [approvingAll, setApprovingAll] = useState(false);
  const approveAll = async () => {
    setApprovingAll(true);
    try {
      const res = await hrPayrollAPI.bulkApprove({ month, year });
      toast.success(`${res.data?.approved || 0} payslip(s) approved`);
      refetch();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to approve');
    } finally {
      setApprovingAll(false);
    }
  };

  return (
    <div className="p-6 space-y-5" style={{ background: '#F8F9FA', minHeight: '100vh' }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <motion.div {...fade(0)} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #10B981, #059669)' }}>
            <CreditCard className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-medium text-gray-900">Monthly Payroll</h1>
            <p className="text-sm text-gray-500">Generate, approve and disburse salaries</p>
          </div>
        </div>

        {/* Month / Year / Project pickers */}
        <div className="flex items-center gap-2 flex-wrap">
          <select value={month} onChange={e => setMonth(parseInt(e.target.value))}
            className="px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-indigo-400 shadow-sm">
            {MONTHS.slice(1).map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
          </select>
          <select value={year} onChange={e => setYear(parseInt(e.target.value))}
            className="px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-indigo-400 shadow-sm">
            {Array.from({length: 6}, (_, i) => new Date().getFullYear() - 1 + i).map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select value={projectId} onChange={e => setProjectId(e.target.value)}
            className="px-3 py-2.5 bg-white border border-indigo-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-indigo-500 shadow-sm min-w-[160px]">
            <option value="">All Projects</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {projectId && (
            <button onClick={() => setProjectId('')}
              className="text-xs text-slate-500 hover:text-red-500 underline">
              Clear
            </button>
          )}
        </div>
      </motion.div>

      {/* ── Workflow Banner ─────────────────────────────────────────────────── */}
      <motion.div {...fade(0.06)} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <WorkflowStepper step={workflowStep} />

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => runMut.mutate()}
              disabled={runMut.isPending}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-medium disabled:opacity-50 transition-all hover:shadow-md active:scale-95"
              style={{ background: 'linear-gradient(135deg, #6366F1, #4F46E5)' }}
            >
              <Play className="w-4 h-4" />
              {runMut.isPending ? 'Generating…'
                : records.length > 0
                  ? `Regenerate${projectId ? ` — ${projects.find(p=>p.id===projectId)?.name || ''}` : ''}`
                  : `Generate Payroll${projectId ? ` — ${projects.find(p=>p.id===projectId)?.name || ''}` : ''}`}
            </button>

            {/* Single-employee run */}
            <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-xl px-2 py-1.5">
              <select value={singleEmpId} onChange={e => setSingleEmpId(e.target.value)}
                className="bg-transparent text-sm text-slate-900 focus:outline-none max-w-[180px]">
                <option value="">One employee…</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name}{emp.employee_code ? ` (${emp.employee_code})` : ''}</option>
                ))}
              </select>
              <button
                onClick={() => runMut.mutate(singleEmpId)}
                disabled={!singleEmpId || runMut.isPending}
                title="Generate payroll for just this employee"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-xs font-medium disabled:opacity-40 transition-all hover:shadow-sm active:scale-95"
                style={{ background: 'linear-gradient(135deg, #6366F1, #4F46E5)' }}
              >
                <Play className="w-3.5 h-3.5" /> Run
              </button>
            </div>

            {hasDraft && (
              <button onClick={submitAll} disabled={submittingAll}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all hover:shadow-md active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ background: 'linear-gradient(135deg, #F59E0B, #D97706)', color: '#FFF' }}
              >
                {submittingAll
                  ? <><span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin inline-block"/> Submitting…</>
                  : <><FileText className="w-4 h-4" /> Submit for Review</>}
              </button>
            )}

            {hasPending && (() => {
              const pendingWithZeroDeductions = records.filter(r =>
                r.status === 'pending_approval' &&
                parseFloat(r.advance_deduction || 0) === 0 &&
                parseFloat(r.loan_deduction || 0) === 0 &&
                parseFloat(r.other_deductions || 0) === 0
              );
              return (
                <div className="flex flex-col items-end gap-1">
                  {pendingWithZeroDeductions.length > 0 && (
                    <p className="text-xs text-amber-600 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {pendingWithZeroDeductions.length} payslip(s) have ₹0 advance/loan/other deductions — verify before approving
                    </p>
                  )}
                  <button onClick={approveAll} disabled={approvingAll}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all hover:shadow-md active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
                    style={{ background: 'linear-gradient(135deg, #3B82F6, #2563EB)', color: '#FFF' }}
                  >
                    {approvingAll
                      ? <><span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin inline-block"/> Approving…</>
                      : <><Check className="w-4 h-4" /> Approve All</>}
                  </button>
                </div>
              );
            })()}

            {hasApproved && (
              <button onClick={() => setPayModal(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-medium transition-all hover:shadow-md active:scale-95"
                style={{ background: 'linear-gradient(135deg, #10B981, #059669)' }}
              >
                <IndianRupee className="w-4 h-4" /> Mark as Paid
              </button>
            )}
          </div>
        </div>
      </motion.div>

      {/* ── Totals KPI Row ──────────────────────────────────────────────────── */}
      {records.length > 0 && (
        <motion.div {...fade(0.10)} className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Employees',       value: records.length,               icon: Users,       color: '#6366F1', bg: '#EEF2FF', isCount: true },
            { label: 'Gross Earnings',  value: fmt(totals.gross_earnings),   icon: Banknote,    color: '#0EA5E9', bg: '#E0F2FE' },
            { label: 'Total Deductions',value: fmt(totals.total_deductions), icon: TrendingDown,color: '#EF4444', bg: '#FEF2F2' },
            { label: 'Net Payable',     value: fmt(totals.net_pay),          icon: CreditCard,  color: '#10B981', bg: '#ECFDF5' },
          ].map((c, i) => (
            <div key={c.label} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-medium text-gray-500">{c.label}</p>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: c.bg }}>
                  <c.icon className="w-4 h-4" style={{ color: c.color }} />
                </div>
              </div>
              <p className="text-2xl font-medium text-gray-900">{c.value}</p>
            </div>
          ))}
        </motion.div>
      )}

      {/* ── Payroll Table ───────────────────────────────────────────────────── */}
      <motion.div {...fade(0.14)} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-emerald-200 border-t-emerald-600 animate-spin" />
            <p className="text-sm text-gray-400">Loading payroll…</p>
          </div>
        ) : records.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center">
              <CreditCard className="w-8 h-8 text-gray-300" />
            </div>
            <div className="text-center">
              <p className="font-medium text-gray-700">No payroll for {MONTHS[month]} {year}</p>
              <p className="text-sm text-slate-900 font-medium mt-1 max-w-xs">Click "Generate Payroll" to create draft payslips for all active employees</p>
            </div>
            <button onClick={() => runMut.mutate()} disabled={runMut.isPending}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-medium disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #6366F1, #4F46E5)' }}>
              <Play className="w-4 h-4" />
              {runMut.isPending ? 'Generating…' : 'Generate Payroll'}
            </button>
          </div>
        ) : (
          <>
            {/* Table header */}
            <div className="grid grid-cols-12 px-5 py-3 bg-gray-50 border-b border-gray-100 text-[11px] font-medium text-slate-900 font-medium uppercase tracking-wider">
              <div className="col-span-3">Employee</div>
              <div className="col-span-1 text-center">Days</div>
              <div className="col-span-1 text-center">LOP</div>
              <div className="col-span-2 text-right">Gross</div>
              <div className="col-span-1 text-right">PF</div>
              <div className="col-span-1 text-right">ESI</div>
              <div className="col-span-1 text-right">TDS</div>
              <div className="col-span-1 text-right font-medium text-gray-600">Net Pay</div>
              <div className="col-span-1 text-center">Status</div>
            </div>

            <div className="divide-y divide-gray-50">
              {records.map(r => {
                const [g1, g2] = avatarGrad(r.employee_name);
                const st = STATUS_CFG[r.status] || STATUS_CFG.draft;
                return (
                  <motion.div
                    key={r.id}
                    whileHover={{ backgroundColor: '#FAFAFA' }}
                    className="grid grid-cols-12 px-5 py-3.5 items-center transition-colors"
                  >
                    {/* Employee */}
                    <div className="col-span-3 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center text-white text-xs font-bold"
                        style={{ background: `linear-gradient(135deg, ${g1}, ${g2})` }}>
                        {initials(r.employee_name)}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{r.employee_name}</p>
                        <p className="text-xs text-gray-400">{r.employee_code} · {r.department_name || '—'}</p>
                      </div>
                    </div>

                    <div className="col-span-1 text-center">
                      <p className="text-sm text-gray-700">{parseFloat(r.paid_days || 0).toFixed(1)}</p>
                      <p className="text-[10px] text-gray-400">of {r.working_days}</p>
                    </div>

                    <div className="col-span-1 text-center">
                      <span className={`text-xs font-medium ${parseFloat(r.lop_days || 0) > 0 ? 'text-red-500' : 'text-gray-400'}`}>
                        {parseFloat(r.lop_days || 0).toFixed(1)}
                      </span>
                    </div>

                    <div className="col-span-2 text-right">
                      <p className="text-sm font-medium text-gray-800">{fmt(r.gross_earnings)}</p>
                    </div>

                    <div className="col-span-1 text-right text-xs text-gray-500">{fmt(r.pf_employee)}</div>
                    <div className="col-span-1 text-right text-xs text-gray-500">{fmt(r.esi_employee)}</div>
                    <div className="col-span-1 text-right text-xs text-gray-500">{fmt(r.tds)}</div>

                    <div className="col-span-1 text-right">
                      <p className="text-sm font-medium text-emerald-600">{fmt(r.net_pay)}</p>
                    </div>

                    {/* Status + Actions */}
                    <div className="col-span-1 flex items-center justify-center gap-1.5">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${st.bg} ${st.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                        {st.label}
                      </span>
                      {r.status === 'draft' && (
                        <button onClick={() => submitMut.mutate(r.id)} title="Submit for review"
                          className="w-6 h-6 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-600 flex items-center justify-center transition-colors">
                          <FileText className="w-3 h-3" />
                        </button>
                      )}
                      {r.status === 'pending_approval' && (
                        <button onClick={() => approveMut.mutate(r.id)} title="Approve"
                          className="w-6 h-6 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 flex items-center justify-center transition-colors">
                          <Check className="w-3 h-3" />
                        </button>
                      )}
                      {r.status === 'pending_approval' && (
                        <button onClick={() => rejectMut.mutate(r.id)} title="Reject — send back to draft"
                          className="w-6 h-6 rounded-lg bg-red-50 hover:bg-red-100 text-red-500 flex items-center justify-center transition-colors">
                          <X className="w-3 h-3" />
                        </button>
                      )}
                      {r.status === 'draft' && (
                        <button onClick={() => runMut.mutate(r.user_id)} disabled={runMut.isPending} title="Regenerate this employee's payslip"
                          className="w-6 h-6 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-600 flex items-center justify-center transition-colors disabled:opacity-40">
                          <Play className="w-3 h-3" />
                        </button>
                      )}
                      {r.status === 'draft' && (
                        <button
                          onClick={() => { if (window.confirm(`Remove payroll for ${r.employee_name}?`)) deleteMut.mutate(r.id); }}
                          title="Remove this draft payroll record"
                          className="w-6 h-6 rounded-lg bg-red-50 hover:bg-red-100 text-red-500 flex items-center justify-center transition-colors">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                      <button onClick={() => navigate(`/hr-admin/payroll/${r.id}/payslip`)} title="View Payslip"
                        className="w-6 h-6 rounded-lg bg-gray-100 hover:bg-gray-200 text-slate-900 font-medium flex items-center justify-center transition-colors">
                        <Download className="w-3 h-3" />
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* Footer totals */}
            <div className="px-5 py-4 bg-gray-50 border-t border-gray-100 grid grid-cols-12 items-center">
              <div className="col-span-3">
                <p className="text-sm font-medium text-gray-700">{records.length} employees</p>
              </div>
              <div className="col-span-1" />
              <div className="col-span-1" />
              <div className="col-span-2 text-right">
                <p className="text-sm font-medium text-gray-800">{fmt(totals.gross_earnings)}</p>
              </div>
              <div className="col-span-1 text-right text-xs font-medium text-gray-600">{fmt(totals.pf_employee)}</div>
              <div className="col-span-1 text-right text-xs font-medium text-gray-600">{fmt(totals.esi_employee)}</div>
              <div className="col-span-1 text-right text-xs font-medium text-gray-600">{fmt(totals.tds)}</div>
              <div className="col-span-1 text-right">
                <p className="text-sm font-medium text-emerald-700">{fmt(totals.net_pay)}</p>
              </div>
              <div className="col-span-1" />
            </div>
          </>
        )}
      </motion.div>

      {/* ── Pay Modal ───────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {payModal && (
          <PayModal
            month={month}
            year={year}
            count={records.filter(r => r.status === 'approved').length}
            onClose={() => setPayModal(false)}
            onConfirm={(form) => bulkPayMut.mutate({ month, year, ...form })}
            isPending={bulkPayMut.isPending}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
