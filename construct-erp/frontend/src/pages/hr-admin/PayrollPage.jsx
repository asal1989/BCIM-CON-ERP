// src/pages/hr-admin/PayrollPage.jsx  — Modern redesign
import React, { useState, useEffect } from 'react';
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

// ── Salary Breakup donut (Zoho People / GreytHR style detail panel) ───────────
function SalaryBreakupPanel({ record }) {
  if (!record) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-5 flex flex-col items-center justify-center text-center gap-2" style={{ minHeight: 220 }}>
        <Users className="w-6 h-6 text-gray-300" />
        <p className="text-xs text-gray-400">Select an employee to see their salary breakup</p>
      </div>
    );
  }
  const basic   = parseFloat(record.basic || 0) + parseFloat(record.hra || 0);
  const allow   = parseFloat(record.conveyance || 0) + parseFloat(record.medical || 0) + parseFloat(record.special_allowance || 0);
  const other   = Math.max(0, parseFloat(record.gross_earnings || 0) - basic - allow);
  const gross   = parseFloat(record.gross_earnings || 0) || 1;
  const circ    = 2 * Math.PI * 46;
  const basicLen = (basic / gross) * circ;
  const allowLen = (allow / gross) * circ;
  const otherLen = (other / gross) * circ;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      <p className="text-sm font-bold text-gray-900">Salary Breakup</p>
      <p className="text-xs text-gray-400 mb-3 truncate">{record.employee_name}</p>
      <svg viewBox="0 0 120 120" className="mx-auto block" style={{ width: 110, height: 110 }}>
        <circle cx="60" cy="60" r="46" fill="none" stroke="#F1F5F9" strokeWidth="16" />
        {basic > 0 && <circle cx="60" cy="60" r="46" fill="none" stroke="#4F46E5" strokeWidth="16"
          strokeDasharray={`${basicLen} ${circ}`} strokeDashoffset="0" transform="rotate(-90 60 60)" strokeLinecap="round" />}
        {allow > 0 && <circle cx="60" cy="60" r="46" fill="none" stroke="#0891B2" strokeWidth="16"
          strokeDasharray={`${allowLen} ${circ}`} strokeDashoffset={-basicLen} transform="rotate(-90 60 60)" />}
        {other > 0 && <circle cx="60" cy="60" r="46" fill="none" stroke="#F59E0B" strokeWidth="16"
          strokeDasharray={`${otherLen} ${circ}`} strokeDashoffset={-(basicLen + allowLen)} transform="rotate(-90 60 60)" />}
        <text x="60" y="56" fontSize="15" fontWeight="700" fill="#0F172A" textAnchor="middle">{fmt(gross === 1 ? 0 : gross).replace('.00','')}</text>
        <text x="60" y="72" fontSize="9" fill="#94A3B8" textAnchor="middle">gross</text>
      </svg>
      <div className="flex flex-col gap-2 mt-3.5">
        {[['Basic + HRA', '#4F46E5', basic], ['Allowances', '#0891B2', allow], ['Other Earnings', '#F59E0B', other]].map(([label, color, val]) => (
          <div key={label} className="flex justify-between items-center">
            <span className="flex items-center gap-1.5 text-xs text-gray-700">
              <span className="w-2 h-2 rounded-sm inline-block" style={{ background: color }} />{label}
            </span>
            <span className="text-xs font-bold text-gray-900">{fmt(val)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ComplianceSnapshot({ totals }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      <p className="text-sm font-bold text-gray-900 mb-3">Compliance Snapshot</p>
      <div className="flex flex-col gap-2.5">
        {[['Employee PF', totals.pf_employee], ['ESI', totals.esi_employee], ['TDS', totals.tds]].map(([label, val]) => (
          <div key={label} className="flex justify-between">
            <span className="text-xs text-gray-500">{label}</span>
            <span className="text-xs font-bold text-gray-900">{fmt(val)}</span>
          </div>
        ))}
      </div>
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
  const [selectedId, setSelectedId] = useState(null);
  const [rowSearch,  setRowSearch]  = useState('');

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

  useEffect(() => {
    if (records.length && !records.some(r => r.id === selectedId)) setSelectedId(records[0].id);
  }, [records, selectedId]);

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

      {/* ── Payslips (master-detail, Zoho People / GreytHR style) ────────────── */}
      {isLoading ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center justify-center py-16 gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-emerald-200 border-t-emerald-600 animate-spin" />
          <p className="text-sm text-gray-400">Loading payroll…</p>
        </div>
      ) : records.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center justify-center py-16 gap-4">
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
        <motion.div {...fade(0.14)} className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4 items-start">

          {/* List */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
              <p className="text-sm font-bold text-gray-900">Employee Payslips</p>
              <div className="flex items-center gap-1.5 bg-gray-50 rounded-lg px-3 py-1.5">
                <FileText className="w-3.5 h-3.5 text-gray-400" />
                <input value={rowSearch} onChange={e => setRowSearch(e.target.value)} placeholder="Search"
                  className="bg-transparent text-xs text-gray-700 focus:outline-none w-24" />
              </div>
            </div>

            <div className="divide-y divide-gray-50 max-h-[560px] overflow-y-auto">
              {records
                .filter(r => !rowSearch.trim() || r.employee_name?.toLowerCase().includes(rowSearch.trim().toLowerCase()))
                .map(r => {
                const [g1, g2] = avatarGrad(r.employee_name);
                const st = STATUS_CFG[r.status] || STATUS_CFG.draft;
                const active = selectedId === r.id;
                return (
                  <div
                    key={r.id}
                    onClick={() => setSelectedId(r.id)}
                    className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${active ? 'bg-indigo-50/60' : 'hover:bg-gray-50'}`}
                  >
                    <div className="w-10 h-10 rounded-[11px] flex-shrink-0 flex items-center justify-center text-white text-xs font-bold"
                      style={{ background: `linear-gradient(135deg, ${g1}, ${g2})` }}>
                      {initials(r.employee_name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13.5px] font-bold text-gray-900 truncate">{r.employee_name}</p>
                      <p className="text-[11.5px] text-gray-400 truncate">{r.department_name || '—'} · {r.employee_code}</p>
                    </div>
                    <div className="text-right w-24 flex-shrink-0 hidden sm:block">
                      <p className="text-[10px] text-gray-400 font-semibold">GROSS</p>
                      <p className="text-[13px] font-bold text-gray-900" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(r.gross_earnings)}</p>
                    </div>
                    <div className="text-right w-24 flex-shrink-0 hidden md:block">
                      <p className="text-[10px] text-gray-400 font-semibold">NET PAY</p>
                      <p className="text-[13px] font-bold text-emerald-600" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(r.net_pay)}</p>
                    </div>
                    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full flex-shrink-0 ${st.bg} ${st.text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                      {st.label}
                    </span>
                    <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
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
                  </div>
                );
              })}
            </div>

            {/* Footer totals */}
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-t border-gray-100">
              <p className="text-sm font-bold text-gray-700">{records.length} employees</p>
              <div className="flex items-center gap-5">
                <div className="text-right">
                  <p className="text-[10px] text-gray-400 font-semibold">GROSS</p>
                  <p className="text-sm font-bold text-gray-800">{fmt(totals.gross_earnings)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-gray-400 font-semibold">NET PAY</p>
                  <p className="text-sm font-bold text-emerald-700">{fmt(totals.net_pay)}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Detail panel */}
          <div className="flex flex-col gap-4">
            <SalaryBreakupPanel record={records.find(r => r.id === selectedId) || null} />
            <ComplianceSnapshot totals={totals} />
          </div>
        </motion.div>
      )}

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
