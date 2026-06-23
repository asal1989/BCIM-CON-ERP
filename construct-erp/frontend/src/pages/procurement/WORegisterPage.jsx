// src/pages/procurement/WORegisterPage.jsx
import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import {
  Activity,
  AlertCircle,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  ChevronRight,
  Download,
  FileText,
  Hammer,
  Package,
  Plus,
  Receipt,
  Search,
  X,
  XCircle,
} from 'lucide-react';
import dayjs from 'dayjs';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import { projectAPI, subcontractorAPI, vendorAPI } from '../../api/client';
import useAuthStore from '../../store/authStore';

/* ── WO approval stages (mirrors WorkOrderPage.jsx) ── */
const WO_STAGES = [
  { id: 'procurement-approve', label: 'Procurement Approve', reqStatuses: ['draft', 'pending'] },
  { id: 'md-approve',          label: 'MD Authorize',        reqStatuses: ['submitted'] },
];
const WO_STAGE_NUM = { draft: 1, pending: 1, submitted: 2, approved: 3, active: 2, rejected: 0, completed: 3, terminated: 0, closed: 3 };
const BILL_STATUS_CFG = {
  pending:  { cls: 'bg-amber-50 text-amber-700 border-amber-200',    label: 'Pending' },
  approved: { cls: 'bg-blue-50  text-blue-700  border-blue-200',     label: 'Approved' },
  paid:     { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'Paid' },
  rejected: { cls: 'bg-red-50   text-red-600   border-red-200',      label: 'Rejected' },
};

const inr = v => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATUS = {
  draft:      { cls: 'bg-slate-100  text-slate-700  border-slate-200',   label: 'Draft' },
  pending:    { cls: 'bg-amber-50   text-amber-700  border-amber-200',   label: 'Pending' },
  submitted:  { cls: 'bg-blue-50    text-blue-700   border-blue-200',    label: 'Submitted' },
  approved:   { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200',label: 'Approved' },
  active:     { cls: 'bg-teal-50    text-teal-700   border-teal-200',    label: 'Active' },
  completed:  { cls: 'bg-indigo-50  text-indigo-700 border-indigo-200',  label: 'Completed' },
  terminated: { cls: 'bg-red-50     text-red-600    border-red-200',     label: 'Terminated' },
  closed:     { cls: 'bg-gray-100   text-gray-500   border-gray-200',    label: 'Closed' },
  rejected:   { cls: 'bg-red-50     text-red-600    border-red-200',     label: 'Rejected' },
};

function StatusBadge({ status }) {
  const cfg = STATUS[status] || STATUS.pending;
  return (
    <span className={clsx('inline-flex px-2 py-0.5 rounded-full border text-[11px] font-medium', cfg.cls)}>
      {cfg.label}
    </span>
  );
}

function TH({ children, right }) {
  return <th className={clsx('px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-slate-900 font-medium whitespace-nowrap', right ? 'text-right' : 'text-left')}>{children}</th>;
}

function TD({ children, right, className = '' }) {
  return <td className={clsx('px-4 py-3 text-xs border-b border-slate-100 align-top', right ? 'text-right' : 'text-left', className)}>{children}</td>;
}

/* ─── WO Reject Reason Modal ─── */
function WORejectModal({ wo, onClose, onConfirm, isPending }) {
  const [reason, setReason] = useState('');
  const canSubmit = reason.trim().length > 0;
  return (
    <div className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
              <XCircle className="w-4 h-4 text-red-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">Reject Work Order</p>
              <p className="text-xs text-slate-500">{wo?.wo_number}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X className="w-4 h-4" /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 text-sm">
            <p className="font-semibold text-red-800">{wo?.vendor_name}</p>
            <p className="text-xs text-red-600 mt-0.5">₹{inr(wo?.total_value || wo?.contract_amount)}</p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">Rejection Reason <span className="text-red-500">*</span></label>
            <textarea
              rows={3}
              autoFocus
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. Rate not approved, scope mismatch, vendor not eligible…"
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-50 resize-none transition-all"
            />
            {!canSubmit && <p className="text-[11px] text-slate-400 mt-1">A reason is required so the team knows why this was rejected.</p>}
          </div>
        </div>
        <div className="flex gap-3 px-5 pb-5">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-colors">Cancel</button>
          <button onClick={() => onConfirm(reason.trim())} disabled={isPending || !canSubmit}
            className="flex-1 py-2.5 rounded-xl text-white text-sm font-black disabled:opacity-50 transition-all"
            style={{ background: 'linear-gradient(135deg,#EF4444,#DC2626)' }}>
            {isPending ? 'Rejecting…' : 'Reject WO'}
          </button>
        </div>
      </div>
    </div>
  );
}

function WODrawer({ wo, onClose }) {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [rejectModal, setRejectModal] = useState(false);

  const { data: detail, isLoading } = useQuery({
    queryKey: ['wo-register-detail', wo?.id],
    queryFn: () => subcontractorAPI.getWorkOrder(wo.id).then(r => r.data),
    enabled: !!wo?.id,
    staleTime: 5 * 60 * 1000,
    refetchOnMount: 'always',
  });

  const { data: billsRaw = [] } = useQuery({
    queryKey: ['wo-register-bills', wo?.id],
    queryFn: () => subcontractorAPI.listBills({ wo_id: wo.id })
      .then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    enabled: !!wo?.id,
  });
  const bills = Array.isArray(billsRaw) ? billsRaw : [];

  const approveMut = useMutation({
    mutationFn: () => subcontractorAPI.approveWorkOrder(wo.id, {}),
    onSuccess: () => {
      toast.success('Work Order approved');
      qc.invalidateQueries({ queryKey: ['wo-register-detail', wo.id] });
      qc.invalidateQueries({ queryKey: ['work-orders'] });
    },
    onError: e => toast.error(e?.response?.data?.error || 'Approval failed'),
  });
  const mdApproveMut = useMutation({
    mutationFn: () => subcontractorAPI.mdApproveWorkOrder(wo.id),
    onSuccess: () => {
      toast.success('Work Order MD authorized');
      qc.invalidateQueries({ queryKey: ['wo-register-detail', wo.id] });
      qc.invalidateQueries({ queryKey: ['work-orders'] });
    },
    onError: e => toast.error(e?.response?.data?.error || 'MD approval failed'),
  });
  const rejectMut = useMutation({
    mutationFn: (reason) => subcontractorAPI.rejectWorkOrder(wo.id, { reason }),
    onSuccess: () => {
      toast.success('Work Order rejected');
      qc.invalidateQueries({ queryKey: ['wo-register-detail', wo.id] });
      qc.invalidateQueries({ queryKey: ['work-orders'] });
    },
    onError: e => toast.error(e?.response?.data?.error || 'Rejection failed'),
  });

  const data    = { ...wo, ...(detail || {}) };
  const items   = data.items || [];
  const val     = Number(data.total_value || data.contract_amount || 0);
  const billed  = Number(data.total_billed || 0);
  const paid    = Number(data.total_paid || 0);
  const balance = Math.max(val - billed, 0);
  const liveStatus = data.status;
  const curStage   = WO_STAGE_NUM[liveStatus] ?? 1;

  // Bills summary
  const totalBilled    = bills.reduce((s, b) => s + Number(b.total_amount || 0), 0);
  const approvedBilled = bills.filter(b => ['approved','paid'].includes(b.workflow_status))
                              .reduce((s, b) => s + Number(b.total_amount || 0), 0);
  const pendingBilled  = totalBilled - approvedBilled;
  const utilPct        = val > 0 ? Math.min(100, (totalBilled / val) * 100) : 0;

  const currentStageAction = WO_STAGES.find(s => s.reqStatuses.includes(liveStatus));
  const userRole = String(user?.role || '').toLowerCase();
  const canApprove = currentStageAction?.id === 'procurement-approve'
    ? ['procurement_manager','project_manager','manager','admin','super_admin'].includes(userRole)
    : currentStageAction?.id === 'md-approve'
    ? ['md','ceo','admin','super_admin'].includes(userRole)
    : false;

  const itemsTotal = items.reduce((s, it) => s + Number(it.amount || Number(it.quantity||0)*Number(it.rate||0)), 0);

  return (
    <div className="fixed inset-0 z-[70] bg-[#f4f6f9] flex flex-col overflow-hidden">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-6 py-3.5 border-b border-slate-200 bg-white flex-shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={onClose}
            className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-600 hover:border-slate-300 transition-all mr-1">
            <X className="w-4 h-4" />
          </button>
          <div className="w-9 h-9 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center">
            <Hammer className="w-4 h-4 text-indigo-600" />
          </div>
          <div>
            <p className="text-base font-medium text-slate-900 font-mono">{data.wo_number}</p>
            <p className="text-xs text-slate-500 font-medium mt-0.5 truncate max-w-[420px]">
              {data.vendor_name || '—'} · {data.created_at ? dayjs(data.created_at).format('DD MMM YYYY') : '—'}
            </p>
          </div>
          <StatusBadge status={liveStatus} />
        </div>
        <div className="hidden md:flex items-center gap-1">
          {[
            { label: 'Contract Value', value: `₹ ${inr(val)}`,     color: 'text-slate-700' },
            { label: 'Billed',         value: `₹ ${inr(billed)}`,  color: 'text-indigo-600' },
            { label: 'Balance',        value: `₹ ${inr(balance)}`,
              color: balance > 0 ? 'text-amber-600 font-extrabold' : 'text-emerald-600 font-extrabold' },
          ].map((k, i) => (
            <div key={i} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg">
              <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">{k.label}</span>
              <span className={clsx('text-sm font-bold', k.color)}>{k.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Two-column body ── */}
      <div className="flex-1 overflow-hidden flex">

        {/* LEFT — details + BOQ */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 border-r border-slate-200">

          {/* Info grid */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              ['Vendor / Sub-Con',  data.vendor_name     || '—'],
              ['Vendor Type',       data.vendor_type     || '—'],
              ['Vendor GSTIN',      data.vendor_gstin    || '—'],
              ['Project',           data.project_name    || '—'],
              ['Start Date',        data.start_date  ? dayjs(data.start_date).format('DD MMM YYYY')  : '—'],
              ['End / Target Date', data.end_date    ? dayjs(data.end_date).format('DD MMM YYYY')    : '—'],
              ['Contract Amount',   `₹ ${inr(data.contract_amount || val)}`],
              ['Cost Head',         data.cost_head      || '—'],
              ['Work Category',     data.work_category  || '—'],
              ['Tower / Block',     data.tower_block    || '—'],
              ['Work Description',  data.work_description || data.subject || '—'],
              ['Manager',           data.manager_name   || '—'],
            ].map(([label, value]) => (
              <div key={label} className="bg-white border border-slate-200 rounded-lg p-3">
                <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-1">{label}</p>
                <p className="text-sm font-medium text-slate-800 break-words">{value}</p>
              </div>
            ))}
          </div>

          {/* BOQ line items */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
              <Package className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">BOQ Line Items</span>
              <span className="ml-auto text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100">
                {isLoading ? '…' : `${items.length} item${items.length !== 1 ? 's' : ''}`}
              </span>
            </div>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : items.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-400">No BOQ items for this work order.</div>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100">
                    {['#', 'Description', 'Unit', 'WO Qty', 'Billed', 'Balance', 'Rate (₹)', 'Amount (₹)'].map(h => (
                      <th key={h} className="px-3 py-2 text-left font-medium text-slate-500 uppercase tracking-wider bg-slate-50 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {items.map((it, idx) => {
                    const qty      = Number(it.quantity || 0);
                    const rate     = Number(it.rate || 0);
                    const bQty     = Number(it.billed_qty || 0);
                    const remQty   = Number(it.remaining_qty ?? Math.max(qty - bQty, 0));
                    const amount   = Number(it.amount || qty * rate);
                    const billedPct = qty > 0 ? Math.round((bQty / qty) * 100) : 0;
                    return (
                      <tr key={it.id || idx} className="hover:bg-slate-50 transition-colors">
                        <td className="px-3 py-2.5 text-slate-400 font-mono">{idx + 1}</td>
                        <td className="px-3 py-2.5 font-medium text-slate-800 max-w-[260px]">{it.description || `Item ${idx + 1}`}</td>
                        <td className="px-3 py-2.5">
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 font-medium uppercase">{it.unit || 'LS'}</span>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-right text-slate-700">{qty.toLocaleString('en-IN', { maximumFractionDigits: 3 })}</td>
                        <td className="px-3 py-2.5 font-mono text-right">
                          <span className="font-semibold text-emerald-700">{bQty.toLocaleString('en-IN', { maximumFractionDigits: 3 })}</span>
                          {billedPct > 0 && <span className="text-[9px] text-emerald-500 ml-1">({billedPct}%)</span>}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-right">
                          <span className={clsx('font-semibold', remQty > 0 ? 'text-amber-600' : 'text-slate-400')}>
                            {remQty.toLocaleString('en-IN', { maximumFractionDigits: 3 })}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-right text-slate-600">{inr(rate)}</td>
                        <td className="px-3 py-2.5 font-mono text-right font-semibold text-slate-800">{inr(amount)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 bg-slate-50">
                    <td colSpan={7} className="px-3 py-2.5 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Total</td>
                    <td className="px-3 py-2.5 text-right font-mono text-sm font-bold text-indigo-700">{inr(itemsTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>

          {/* Scope of Work */}
          {(data.scope_of_work || data.work_description) && (
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Scope of Work</p>
              <p className="text-sm text-slate-600 whitespace-pre-line leading-relaxed">
                {data.scope_of_work || data.work_description}
              </p>
            </div>
          )}
        </div>

        {/* RIGHT — linked bills + approval pipeline */}
        <div className="w-[420px] xl:w-[480px] flex-shrink-0 overflow-y-auto p-6 space-y-4 bg-[#f4f6f9]">

          {/* ── Linked Bills / Invoices ── */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
              <Receipt className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Linked Bills / Invoices</span>
              <span className="ml-auto text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100">
                {bills.length} {bills.length === 1 ? 'bill' : 'bills'}
              </span>
            </div>

            {bills.length > 0 && (
              <div className="grid grid-cols-3 gap-px bg-slate-100 border-b border-slate-100">
                {[
                  { label: 'Total Billed', value: inr(totalBilled),    color: 'text-slate-800' },
                  { label: 'Approved',     value: inr(approvedBilled), color: 'text-emerald-600' },
                  { label: 'Pending',      value: inr(pendingBilled),  color: 'text-amber-600' },
                ].map((k, i) => (
                  <div key={i} className="bg-white p-3 text-center">
                    <p className="text-[10px] text-slate-400 font-medium mb-0.5">{k.label}</p>
                    <p className={clsx('text-xs font-bold', k.color)}>{k.value}</p>
                  </div>
                ))}
              </div>
            )}

            {bills.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-slate-400 gap-2">
                <Receipt className="w-6 h-6 opacity-30" />
                <p className="text-xs">No bills linked to this WO yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      {['SL', 'Bill No.', 'Date', 'Amount', 'Status'].map(h => (
                        <th key={h} className="px-3 py-2 text-left font-medium text-slate-400 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {bills.map((b, i) => {
                      const st = BILL_STATUS_CFG[b.workflow_status] || BILL_STATUS_CFG.pending;
                      return (
                        <tr key={b.id || i} className="hover:bg-slate-50 transition-colors">
                          <td className="px-3 py-2.5 text-slate-400 font-mono">{i + 1}</td>
                          <td className="px-3 py-2.5 font-medium text-slate-800">{b.bill_number || '—'}</td>
                          <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">
                            {b.bill_date ? dayjs(b.bill_date).format('DD MMM YY') : '—'}
                          </td>
                          <td className="px-3 py-2.5 font-medium text-slate-800 whitespace-nowrap">₹{inr(b.total_amount)}</td>
                          <td className="px-3 py-2.5">
                            <span className={clsx('px-2 py-0.5 rounded-full text-[10px] font-medium border', st.cls)}>{st.label}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-200 bg-slate-50">
                      <td colSpan={3} className="px-3 py-2.5 text-xs font-medium text-slate-500 uppercase">Total</td>
                      <td className="px-3 py-2.5 text-xs font-bold text-indigo-700">₹{inr(totalBilled)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {/* WO Utilisation bar */}
            {val > 0 && bills.length > 0 && (
              <div className="px-4 pb-4 pt-2">
                <div className="flex justify-between text-[10px] text-slate-400 font-medium mb-1">
                  <span>WO Utilisation</span>
                  <span>{utilPct.toFixed(1)}% of ₹{inr(val)}</span>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className={clsx('h-full rounded-full transition-all', totalBilled > val ? 'bg-red-500' : 'bg-indigo-500')}
                    style={{ width: `${utilPct}%` }} />
                </div>
              </div>
            )}
          </div>

          {/* ── Approval Pipeline ── */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Approval Pipeline</span>
            </div>
            <div className="p-4">
              <div className="relative">
                <div className="absolute bg-slate-200 left-[17px] top-5" style={{ width: 1, height: 'calc(100% - 40px)' }} />
                <div className="space-y-3">
                  {WO_STAGES.map((stage, idx) => {
                    const isDone   = curStage > idx + 1;
                    const isActive = curStage === idx + 1;
                    return (
                      <div key={stage.id} className="flex items-start gap-3 relative">
                        <div className={clsx(
                          'w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 z-10 border-2 mt-0.5',
                          isDone   ? 'bg-emerald-500 border-emerald-500' :
                          isActive ? 'bg-indigo-600 border-indigo-600'   : 'bg-white border-slate-200'
                        )}>
                          {isDone
                            ? <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                            : <span className={clsx('text-xs font-bold', isActive ? 'text-white' : 'text-slate-400')}>{idx + 1}</span>}
                        </div>
                        <div className="flex-1 min-w-0 pt-1.5">
                          <p className={clsx('text-xs font-semibold',
                            isDone ? 'text-slate-500 line-through' : isActive ? 'text-slate-900' : 'text-slate-400'
                          )}>{stage.label}</p>
                        </div>
                        {isDone   && <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100 mt-0.5">Done</span>}
                        {isActive && <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100 animate-pulse mt-0.5">Pending</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Rejection reason — shown once the WO has been rejected */}
          {liveStatus === 'rejected' && data.rejection_reason && (
            <div className="border border-red-200 bg-red-50 rounded-xl p-4 space-y-1.5">
              <div className="flex items-center gap-2">
                <XCircle className="w-4 h-4 text-red-500" />
                <p className="text-sm font-medium text-red-800">Rejected</p>
              </div>
              <p className="text-xs text-red-700 pl-6">{data.rejection_reason}</p>
            </div>
          )}

          {/* ── Action panel ── */}
          {currentStageAction && (
            <div className={clsx('border rounded-xl p-4 space-y-3', canApprove ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200')}>
              <div className="flex items-center gap-3">
                <div className={clsx('w-9 h-9 rounded-lg border flex items-center justify-center',
                  canApprove ? 'bg-emerald-100 border-emerald-200' : 'bg-slate-100 border-slate-200')}>
                  <CheckCircle2 className={clsx('w-4 h-4', canApprove ? 'text-emerald-600' : 'text-slate-400')} />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900">{canApprove ? 'Action Required' : 'Awaiting Authorization'}</p>
                  <p className={clsx('text-xs font-medium', canApprove ? 'text-emerald-700' : 'text-slate-500')}>
                    {canApprove ? `${currentStageAction.label} — click to authorize` : `${currentStageAction.label} — not your approval level`}
                  </p>
                </div>
              </div>
              {canApprove ? (
                <div className="flex gap-3">
                  <button
                    onClick={() => currentStageAction.id === 'procurement-approve' ? approveMut.mutate() : mdApproveMut.mutate()}
                    disabled={approveMut.isPending || mdApproveMut.isPending}
                    className="flex-[2] h-9 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {(approveMut.isPending || mdApproveMut.isPending) ? 'Processing…' : currentStageAction.label}
                  </button>
                  <button
                    onClick={() => setRejectModal(true)}
                    disabled={rejectMut.isPending}
                    className="flex-1 h-9 rounded-lg bg-white border border-red-200 text-red-600 text-xs font-medium hover:bg-red-50 transition-colors disabled:opacity-50">
                    {rejectMut.isPending ? '…' : 'Reject'}
                  </button>
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic px-1">
                  This WO is waiting for the {currentStageAction.label} team to act.
                </p>
              )}
            </div>
          )}

        </div>{/* end right column */}
      </div>{/* end two-column body */}

      {/* Footer */}
      <div className="flex-shrink-0 flex items-center justify-between px-6 py-3 border-t border-slate-100 bg-white">
        <span className="text-xs text-slate-400">
          WO created: {data.created_at ? dayjs(data.created_at).format('DD MMM YYYY') : '—'}
        </span>
      </div>

      {rejectModal && (
        <WORejectModal
          wo={data}
          isPending={rejectMut.isPending}
          onClose={() => setRejectModal(false)}
          onConfirm={(reason) => { rejectMut.mutate(reason); setRejectModal(false); }}
        />
      )}
    </div>
  );
}

function Mini({ label, value, tone = 'text-slate-700' }) {
  return (
    <div className="rounded-lg bg-slate-50 border border-slate-100 p-2">
      <p className="text-[9px] uppercase tracking-wider text-slate-900 font-medium font-bold">{label}</p>
      <p className={clsx('text-xs font-mono font-semibold', tone)}>{value}</p>
    </div>
  );
}

function exportCsv(rows, fileName) {
  const csv = rows.map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export default function WORegisterPage() {
  const [projectId, setProjectId] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('summary');
  const [selectedWO, setSelectedWO] = useState(null);
  const [exportingXlsx, setExportingXlsx] = useState(false);

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectAPI.list().then(r => r.data?.data || r.data || []),
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors-all'],
    queryFn: () => vendorAPI.list({ limit: 500 }).then(r => r.data?.data || r.data || []),
  });

  const { data: workOrders = [], isLoading } = useQuery({
    queryKey: ['wo-register', projectId, vendorId, status],
    queryFn: () => subcontractorAPI.listWorkOrders({
      project_id: projectId || undefined,
      vendor_id: vendorId || undefined,
      status: status || undefined,
    }).then(r => r.data?.data || []),
  });

  const filtered = useMemo(() => {
    return workOrders.filter(wo => {
      const dt = wo.start_date || wo.created_at;
      const text = `${wo.wo_number || ''} ${wo.subject || ''} ${wo.vendor_name || ''} ${wo.project_name || ''}`.toLowerCase();
      if (search && !text.includes(search.toLowerCase())) return false;
      if (from && dt && dayjs(dt).isBefore(dayjs(from), 'day')) return false;
      if (to && dt && dayjs(dt).isAfter(dayjs(to), 'day')) return false;
      return true;
    });
  }, [workOrders, search, from, to]);

  const detailQueries = useQueries({
    queries: filtered.map(wo => ({
      queryKey: ['wo-register-items', wo.id],
      queryFn: () => subcontractorAPI.getWorkOrder(wo.id).then(r => r.data),
      enabled: tab === 'items' || exportingXlsx,
      staleTime: 5 * 60 * 1000,
      refetchOnMount: 'always',
    })),
  });

  const itemRows = useMemo(() => {
    return detailQueries.flatMap((q, idx) => {
      const wo = filtered[idx];
      const items = q.data?.items || [];
      return items.map((it, lineNo) => ({ ...it, lineNo: lineNo + 1, wo }));
    });
  }, [detailQueries, filtered]);

  const vendorSummary = useMemo(() => {
    const map = {};
    for (const wo of filtered) {
      const key = wo.vendor_id || wo.vendor_name || 'unknown';
      if (!map[key]) map[key] = { vendor_name: wo.vendor_name || 'Unknown', count: 0, total: 0, billed: 0, projects: new Set() };
      map[key].count += 1;
      map[key].total += Number(wo.total_value || 0);
      map[key].billed += Number(wo.total_billed || 0);
      if (wo.project_name) map[key].projects.add(wo.project_name);
    }
    return Object.values(map).map(v => ({ ...v, projects: Array.from(v.projects).join(', ') }));
  }, [filtered]);

  const totals = useMemo(() => ({
    count: filtered.length,
    value: filtered.reduce((s, w) => s + Number(w.total_value || 0), 0),
    billed: filtered.reduce((s, w) => s + Number(w.total_billed || 0), 0),
    vendors: new Set(filtered.map(w => w.vendor_id || w.vendor_name).filter(Boolean)).size,
  }), [filtered]);

  const handleExport = async () => {
    setExportingXlsx(true);

    // Wait for detail queries to finish loading (needed for Sheet 2 line items)
    let waited = 0;
    while (detailQueries.some(q => q.isLoading) && waited < 5000) {
      await new Promise(r => setTimeout(r, 1000));
      waited += 1000;
    }

    try {
      const wb = XLSX.utils.book_new();
      const dateStr = new Date().toISOString().slice(0, 10);
      const proj = projects.find(p => p.id === projectId);

      // ── Sheet 1: WO Summary ─────────────────────────────────────────────────
      const s1Headers = ['WO No', 'Date', 'Vendor', 'Project', 'Subject / Scope', 'Status', 'Total Value (₹)', 'Billed (₹)', 'Balance (₹)'];
      const s1Rows = filtered.map(wo => {
        const val    = Number(wo.total_value  || 0);
        const billed = Number(wo.total_billed || 0);
        return [
          wo.wo_number || '',
          wo.start_date ? dayjs(wo.start_date).format('DD-MM-YYYY') : '',
          wo.vendor_name  || '',
          wo.project_name || '',
          wo.subject      || '',
          (wo.status || 'pending').toUpperCase(),
          val,
          billed,
          Math.max(val - billed, 0),
        ];
      });
      const totalVal    = filtered.reduce((s, w) => s + Number(w.total_value  || 0), 0);
      const totalBilled = filtered.reduce((s, w) => s + Number(w.total_billed || 0), 0);
      s1Rows.push([]); // blank
      s1Rows.push(['TOTAL', '', '', '', '', '', totalVal, totalBilled, Math.max(totalVal - totalBilled, 0)]);

      const ws1 = XLSX.utils.aoa_to_sheet([s1Headers, ...s1Rows]);
      ws1['!cols'] = [14, 12, 22, 24, 36, 10, 16, 16, 16].map(wch => ({ wch }));
      XLSX.utils.book_append_sheet(wb, ws1, 'WO Summary');

      // ── Sheet 2: Line Item Details ──────────────────────────────────────────
      const s2Headers = ['WO No', 'Date', 'Vendor', 'Sl No', 'Description', 'UOM', 'Qty', 'Rate (₹)', 'Amount (₹)', 'Remarks'];
      const s2Rows = [];
      detailQueries.forEach((q, idx) => {
        const wo    = filtered[idx];
        const items = q.data?.items || q.data?.data?.items || [];
        items.forEach((it, i) => {
          const qty  = Number(it.quantity || 0);
          const rate = Number(it.rate || 0);
          s2Rows.push([
            wo.wo_number || '',
            wo.start_date ? dayjs(wo.start_date).format('DD-MM-YYYY') : '',
            wo.vendor_name || '',
            i + 1,
            it.description || it.item_name || '',
            it.unit || '',
            qty,
            rate,
            qty * rate,
            it.remarks || it.purpose || '',
          ]);
        });
        // If no items fetched yet, still add a summary row
        if (items.length === 0) {
          s2Rows.push([wo.wo_number || '', wo.start_date ? dayjs(wo.start_date).format('DD-MM-YYYY') : '', wo.vendor_name || '', '', '(Line items not available)', '', '', '', Number(wo.total_value || 0), '']);
        }
      });

      const ws2 = XLSX.utils.aoa_to_sheet([s2Headers, ...s2Rows]);
      ws2['!cols'] = [14, 12, 22, 6, 36, 8, 8, 12, 14, 24].map(wch => ({ wch }));
      XLSX.utils.book_append_sheet(wb, ws2, 'Line Item Details');

      // ── Sheet 3: Vendor Summary ─────────────────────────────────────────────
      const s3Headers = ['Vendor Name', 'WO Numbers', '# WOs', 'Total Value (₹)', 'Billed (₹)', 'Balance (₹)', 'Projects'];
      const s3Rows = vendorSummary.map(v => [
        v.vendor_name,
        '', // WO numbers — derive from filtered
        v.count,
        v.total,
        v.billed,
        Math.max(v.total - v.billed, 0),
        v.projects,
      ]);
      // Fill WO numbers per vendor
      const woByVendor = {};
      filtered.forEach(wo => {
        const key = wo.vendor_name || 'Unknown';
        if (!woByVendor[key]) woByVendor[key] = [];
        woByVendor[key].push(wo.wo_number);
      });
      s3Rows.forEach(row => { row[1] = (woByVendor[row[0]] || []).join(', '); });
      s3Rows.push([]);
      s3Rows.push(['TOTAL', '', vendorSummary.reduce((s, v) => s + v.count, 0), totalVal, totalBilled, Math.max(totalVal - totalBilled, 0), '']);

      const ws3 = XLSX.utils.aoa_to_sheet([s3Headers, ...s3Rows]);
      ws3['!cols'] = [26, 40, 8, 16, 16, 16, 30].map(wch => ({ wch }));
      XLSX.utils.book_append_sheet(wb, ws3, 'Vendor Summary');

      // ── Write ───────────────────────────────────────────────────────────────
      const fileName = `WO_Register_${proj?.name?.replace(/\s+/g, '_') || 'export'}_${dateStr}.xlsx`;
      XLSX.writeFile(wb, fileName);
    } finally {
      setExportingXlsx(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3 mr-2">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center">
              <Hammer className="w-4 h-4 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-sm font-medium text-slate-900">WO Register</h1>
              <p className="text-xs text-slate-500">Work order history with vendor and line item details</p>
            </div>
          </div>

          <select className="h-9 pl-3 pr-8 text-sm border border-slate-200 rounded-lg bg-white outline-none focus:border-indigo-400 min-w-[190px]" value={projectId} onChange={e => setProjectId(e.target.value)}>
            <option value="">All projects</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>

          <select className="h-9 pl-3 pr-8 text-sm border border-slate-200 rounded-lg bg-white outline-none focus:border-indigo-400 min-w-[180px]" value={vendorId} onChange={e => setVendorId(e.target.value)}>
            <option value="">All vendors</option>
            {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>

          <select className="h-9 pl-3 pr-8 text-sm border border-slate-200 rounded-lg bg-white outline-none focus:border-indigo-400" value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">All Status</option>
            <option value="draft">Draft</option>
            <option value="pending">Pending</option>
            <option value="submitted">Submitted</option>
            <option value="approved">Approved</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="terminated">Terminated</option>
            <option value="closed">Closed</option>
            <option value="rejected">Rejected</option>
          </select>

          <input type="date" className="h-9 px-3 text-sm border border-slate-200 rounded-lg bg-white outline-none focus:border-indigo-400" value={from} onChange={e => setFrom(e.target.value)} />
          <span className="text-slate-900 font-medium text-xs">to</span>
          <input type="date" className="h-9 px-3 text-sm border border-slate-200 rounded-lg bg-white outline-none focus:border-indigo-400" value={to} onChange={e => setTo(e.target.value)} />

          <div className="ml-auto flex gap-2">
            <Link to="/procurement/work-orders" className="flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors">
              <Plus className="w-4 h-4" /> New WO
            </Link>
            <button onClick={handleExport} disabled={filtered.length === 0 || exportingXlsx} className="flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 transition-colors">
              <Download className="w-4 h-4" /> {exportingXlsx ? 'Building Excel…' : 'Export Excel'}
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KPI label="Total WOs" value={totals.count} icon={FileText} />
          <KPI label="WO Value" value={`Rs ${inr(totals.value)}`} icon={Hammer} />
          <KPI label="Billed So Far" value={`Rs ${inr(totals.billed)}`} icon={Calendar} />
          <KPI label="Vendors" value={totals.vendors} icon={Building2} />
        </div>
      </div>

      <div className="border-b border-slate-200 bg-white px-6">
        {[
          ['summary', 'WO Summary', filtered.length],
          ['items', 'Line Item Details', tab === 'items' ? itemRows.length : ''],
          ['vendors', 'Vendor Summary', vendorSummary.length],
        ].map(([id, label, count]) => (
          <button key={id} onClick={() => setTab(id)} className={clsx('mr-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors', tab === id ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-900 font-medium hover:text-slate-700')}>
            {label}
            {count !== '' && <span className="ml-2 px-1.5 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-600">{count}</span>}
          </button>
        ))}
      </div>

      <div className="p-6 space-y-4">
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-center gap-3 shadow-sm">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input className="w-full h-9 bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-4 text-sm outline-none focus:border-indigo-400" placeholder="Search WO number, vendor, project, subject..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <span className="text-xs text-slate-400">{filtered.length} records</span>
        </div>

        {isLoading ? (
          <div className="py-20 text-center text-sm text-slate-400">Loading work order register...</div>
        ) : filtered.length === 0 ? (
          <div className="py-20 flex flex-col items-center text-slate-400">
            <AlertCircle className="w-10 h-10 mb-3" />
            <p className="text-sm font-medium">No work orders found for the selected filters</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              {tab === 'summary' && (
                <table className="w-full min-w-[1100px]">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr><TH>WO No</TH><TH>Date</TH><TH>Vendor</TH><TH>Project</TH><TH>Subject</TH><TH>Status</TH><TH right>Total Value</TH><TH right>Billed</TH><TH right>Balance</TH><TH></TH></tr>
                  </thead>
                  <tbody>
                    {filtered.map(wo => {
                      const value = Number(wo.total_value || 0);
                      const billed = Number(wo.total_billed || 0);
                      return (
                        <tr key={wo.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setSelectedWO(wo)}>
                          <TD className="font-mono font-medium text-indigo-700">{wo.wo_number}</TD>
                          <TD>{wo.start_date ? dayjs(wo.start_date).format('DD MMM YYYY') : '-'}</TD>
                          <TD className="font-medium text-slate-800">{wo.vendor_name || '-'}</TD>
                          <TD>{wo.project_name || '-'}</TD>
                          <TD className="max-w-[260px] truncate">{wo.subject || '-'}</TD>
                          <TD><StatusBadge status={wo.status} /></TD>
                          <TD right className="font-mono font-semibold">Rs {inr(value)}</TD>
                          <TD right className="font-mono text-emerald-700">Rs {inr(billed)}</TD>
                          <TD right className="font-mono text-slate-800">Rs {inr(value - billed)}</TD>
                          <TD right><ChevronRight className="w-4 h-4 text-slate-300 ml-auto" /></TD>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}

              {tab === 'items' && (
                <table className="w-full min-w-[1000px]">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr><TH>WO No</TH><TH>Date</TH><TH>Vendor</TH><TH>Description</TH><TH>Unit</TH><TH right>WO Qty</TH><TH right>Billed</TH><TH right>Remaining</TH><TH right>Rate</TH><TH right>Amount</TH></tr>
                  </thead>
                  <tbody>
                    {detailQueries.some(q => q.isLoading) && itemRows.length === 0 ? (
                      <tr><td colSpan={10} className="py-16 text-center text-sm text-slate-400">Loading line items...</td></tr>
                    ) : itemRows.length === 0 ? (
                      <tr><td colSpan={10} className="py-16 text-center text-sm text-slate-400">No line items found.</td></tr>
                    ) : itemRows.map((row, idx) => {
                      const qty = Number(row.quantity || 0);
                      const billedQty = Number(row.billed_qty || 0);
                      const remainingQty = Number(row.remaining_qty ?? Math.max(qty - billedQty, 0));
                      const rate = Number(row.rate || 0);
                      const amount = Number(row.amount || qty * rate);
                      return (
                        <tr key={`${row.wo.id}-${row.id || idx}`} className="hover:bg-slate-50">
                          <TD className="font-mono font-medium text-indigo-700">{row.wo.wo_number}</TD>
                          <TD>{row.wo.start_date ? dayjs(row.wo.start_date).format('DD MMM YYYY') : '-'}</TD>
                          <TD>{row.wo.vendor_name || '-'}</TD>
                          <TD className="max-w-[420px]">{row.description || '-'}</TD>
                          <TD>{row.unit || '-'}</TD>
                          <TD right className="font-mono">{qty.toLocaleString('en-IN', { maximumFractionDigits: 3 })}</TD>
                          <TD right className="font-mono text-emerald-700 font-semibold">{billedQty.toLocaleString('en-IN', { maximumFractionDigits: 3 })}</TD>
                          <TD right className={clsx('font-mono font-semibold', remainingQty > 0 ? 'text-orange-700' : 'text-slate-500')}>{remainingQty.toLocaleString('en-IN', { maximumFractionDigits: 3 })}</TD>
                          <TD right className="font-mono">Rs {inr(rate)}</TD>
                          <TD right className="font-mono font-semibold">Rs {inr(amount)}</TD>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}

              {tab === 'vendors' && (
                <table className="w-full min-w-[760px]">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr><TH>Vendor</TH><TH>Projects</TH><TH right>WO Count</TH><TH right>Total Value</TH><TH right>Billed</TH><TH right>Balance</TH></tr>
                  </thead>
                  <tbody>
                    {vendorSummary.map(v => (
                      <tr key={v.vendor_name} className="hover:bg-slate-50">
                        <TD className="font-medium text-slate-800">{v.vendor_name}</TD>
                        <TD className="max-w-[320px] truncate">{v.projects || '-'}</TD>
                        <TD right className="font-mono">{v.count}</TD>
                        <TD right className="font-mono font-semibold">Rs {inr(v.total)}</TD>
                        <TD right className="font-mono text-emerald-700">Rs {inr(v.billed)}</TD>
                        <TD right className="font-mono text-slate-800">Rs {inr(v.total - v.billed)}</TD>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>

      {selectedWO && <WODrawer wo={selectedWO} onClose={() => setSelectedWO(null)} />}
    </div>
  );
}

function KPI({ label, value, icon: Icon }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">{label}</p>
          <p className="text-lg font-medium text-slate-900 mt-1">{value}</p>
        </div>
        <div className="w-9 h-9 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center">
          <Icon className="w-4 h-4 text-indigo-600" />
        </div>
      </div>
    </div>
  );
}
