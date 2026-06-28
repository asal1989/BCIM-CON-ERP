import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Banknote, Play, X, ChevronDown, ChevronUp, Clock, CreditCard, AlertCircle, CheckCircle2 } from 'lucide-react';
import dayjs from 'dayjs';
import { payrollAPI, projectAPI, default as api } from '../../api/client';
import toast from 'react-hot-toast';
import TableActions from '../../components/common/TableActions';

const inr = v => `₹${parseFloat(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const PAY_MODES = ['cash', 'neft', 'rtgs', 'upi', 'cheque'];

export default function PayrollPage() {
  const [projectId, setProjId]   = useState('');
  const [periodFrom, setFrom]    = useState(dayjs().startOf('month').format('YYYY-MM-DD'));
  const [periodTo, setTo]        = useState(dayjs().format('YYYY-MM-DD'));
  const [expanded, setExpanded]  = useState(null);
  const [payModal, setPayModal]  = useState(null);
  const [payMode, setPayMode]    = useState('cash');
  const qc = useQueryClient();

  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectAPI.list().then(r => r.data?.data).catch(() => null),
  });

  const { data: payrollData } = useQuery({
    queryKey: ['payroll', projectId, periodFrom, periodTo],
    queryFn: () => payrollAPI.list({ project_id: projectId || undefined, period_from: periodFrom, period_to: periodTo }).then(r => r.data?.data).catch(() => null),
  });

  const genMut = useMutation({
    mutationFn: () => payrollAPI.generate({ project_id: projectId, period_from: periodFrom, period_to: periodTo }),
    onSuccess: r => { toast.success(`Payroll generated for ${r.data.data?.length || 0} workers`); qc.invalidateQueries({ queryKey: ['payroll'] }); },
    onError: e => toast.error(e?.response?.data?.error || 'Failed to generate payroll'),
  });

  const payMut = useMutation({
    mutationFn: ({ id }) => payrollAPI.pay(id),
    onSuccess: () => { toast.success('Payment recorded'); setPayModal(null); qc.invalidateQueries({ queryKey: ['payroll'] }); },
    onError: e => toast.error(e?.response?.data?.error || 'Payment failed'),
  });

  const deleteMut = useMutation({
    mutationFn: id => api.delete(`/payroll/${id}`),
    onSuccess: () => { toast.success('Record deleted'); qc.invalidateQueries({ queryKey: ['payroll'] }); },
    onError: () => toast.error('Failed to delete record'),
  });

  const all = payrollData ?? [];
  const totals = all.reduce((s, r) => ({
    gross: s.gross + parseFloat(r.gross_wages || 0),
    pf:    s.pf + parseFloat(r.pf_employee || 0) + parseFloat(r.pf_employer || 0),
    esi:   s.esi + parseFloat(r.esi_employee || 0) + parseFloat(r.esi_employer || 0),
    net:   s.net + parseFloat(r.net_wages || 0),
  }), { gross: 0, pf: 0, esi: 0, net: 0 });

  const pendingCount = all.filter(r => r.payment_status === 'pending').length;
  const paidCount    = all.filter(r => r.payment_status === 'paid').length;

  return (
    <div className="p-6 space-y-6 bg-slate-50 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center text-white shadow-lg shadow-amber-500/25">
            <Banknote className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Worker Payroll</h1>
            <p className="text-xs text-slate-500">Attendance-based wages · PF/ESI deductions · Net disbursement</p>
          </div>
        </div>
        <button
          onClick={() => genMut.mutate()}
          disabled={!projectId || genMut.isPending}
          className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white text-sm font-semibold rounded-lg shadow-sm transition-all"
        >
          <Play className="w-4 h-4" />
          {genMut.isPending ? 'Generating...' : 'Generate Payroll'}
        </button>
      </div>

      {/* Controls */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col lg:flex-row gap-5 items-start lg:items-end shadow-sm">
        <div className="w-full lg:w-80 space-y-1.5">
          <label className="block text-xs font-semibold text-slate-600">Project</label>
          <select
            className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 transition-all"
            value={projectId}
            onChange={e => setProjId(e.target.value)}
          >
            <option value="">All projects</option>
            {(projects || []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="flex-1 space-y-1.5">
          <label className="block text-xs font-semibold text-slate-600">Period</label>
          <div className="flex items-center gap-3">
            <input type="date" className={dateCls} value={periodFrom} onChange={e => setFrom(e.target.value)} />
            <span className="text-slate-400 text-sm">→</span>
            <input type="date" className={dateCls} value={periodTo} onChange={e => setTo(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <SummaryCard label="Gross Wages"    value={inr(totals.gross)} color="text-amber-700"   bg="bg-amber-50"   border="border-amber-200" />
        <SummaryCard label="PF Liability"   value={inr(totals.pf)}    color="text-red-600"     bg="bg-red-50"     border="border-red-200" />
        <SummaryCard label="ESI Liability"  value={inr(totals.esi)}   color="text-blue-600"    bg="bg-blue-50"    border="border-blue-200" />
        <SummaryCard label="Net Payable"    value={inr(totals.net)}   color="text-emerald-700" bg="bg-emerald-50" border="border-emerald-200" />
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="text-xs text-slate-500 font-medium mb-1">Payment Status</div>
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-bold text-amber-600">{pendingCount}</span>
            <span className="text-xs text-slate-400">pending</span>
          </div>
          <div className="flex items-center gap-1 mt-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
            <span className="text-xs text-slate-400">{paidCount} paid</span>
          </div>
        </div>
      </div>

      {/* Records */}
      <div className="space-y-3">
        {all.map(rec => {
          const isExp    = expanded === rec.id;
          const isPaid   = rec.payment_status === 'paid';

          return (
            <div key={rec.id} className={`bg-white border rounded-xl overflow-hidden shadow-sm transition-all ${
              isExp ? 'border-amber-400 ring-2 ring-amber-400/15' : 'border-slate-200 hover:border-amber-300'
            }`}>
              {/* Row */}
              <div className="px-5 py-4 flex items-center gap-4 cursor-pointer" onClick={() => setExpanded(p => p === rec.id ? null : rec.id)}>
                {/* Avatar */}
                <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center text-amber-700 font-bold text-sm flex-shrink-0">
                  {rec.worker_name.charAt(0)}
                </div>

                {/* Worker info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-800 text-sm">{rec.worker_name}</span>
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-xs capitalize">{rec.skill_type?.replace('_', ' ')}</span>
                    {rec.gang_name && <span className="text-xs text-slate-400">{rec.gang_name}</span>}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-400">
                    <span>{dayjs(rec.period_from).format('D MMM')} – {dayjs(rec.period_to).format('D MMM YYYY')}</span>
                    <span>·</span>
                    <span>{rec.days_present} days present</span>
                    {rec.ot_hours > 0 && <><span>·</span><span className="text-amber-600">{rec.ot_hours}h OT</span></>}
                  </div>
                </div>

                {/* Status badge */}
                <span className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium flex-shrink-0 ${
                  isPaid ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                }`}>
                  {isPaid ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                  {isPaid ? 'Paid' : 'Pending'}
                </span>

                {/* Net wages */}
                <div className="text-right flex-shrink-0">
                  <div className="text-xs text-slate-400">Net</div>
                  <div className="font-bold text-emerald-600 text-base font-mono">{inr(rec.net_wages)}</div>
                </div>

                {/* Pay button */}
                {!isPaid && (
                  <button
                    onClick={e => { e.stopPropagation(); setPayModal(rec); }}
                    className="hidden md:flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold rounded-lg flex-shrink-0 transition-all"
                  >
                    <CreditCard className="w-3.5 h-3.5" /> Pay
                  </button>
                )}

                {/* Delete */}
                <div onClick={e => e.stopPropagation()}>
                  <TableActions disableEdit onDelete={() => deleteMut.mutate(rec.id)} />
                </div>

                {/* Expand chevron */}
                <div className={`w-6 h-6 flex items-center justify-center flex-shrink-0 ${isExp ? 'text-amber-500' : 'text-slate-300'}`}>
                  {isExp ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
              </div>

              {/* Expanded breakdown */}
              {isExp && (
                <div className="px-5 pb-5 border-t border-slate-100">
                  <div className="mt-4 bg-slate-50 rounded-xl border border-slate-200 p-4">
                    <div className="grid grid-cols-3 sm:grid-cols-7 gap-3 text-center">
                      <BreakItem label="Basic Pay"        value={inr(rec.basic_wages)}    color="text-slate-700" />
                      <BreakItem label="OT Wages"         value={inr(rec.ot_wages)}        color="text-amber-600" />
                      <BreakItem label="Gross"            value={inr(rec.gross_wages)}     color="text-amber-700" bold />
                      <BreakItem label="Emp. PF"          value={inr(rec.pf_employee)}     color="text-red-600" />
                      <BreakItem label="Emp. ESI"         value={inr(rec.esi_employee)}    color="text-red-600" />
                      <BreakItem label="Employer Contrib" value={inr(parseFloat(rec.pf_employer) + parseFloat(rec.esi_employer))} color="text-blue-600" />
                      <BreakItem label="Net Payable"      value={inr(rec.net_wages)}       color="text-emerald-600" bold />
                    </div>
                  </div>
                  {!isPaid && (
                    <div className="mt-3 flex justify-end">
                      <button
                        onClick={() => setPayModal(rec)}
                        className="flex items-center gap-2 px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded-lg transition-all"
                      >
                        <CreditCard className="w-4 h-4" /> Record Payment
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {all.length === 0 && (
          <div className="py-20 text-center border-2 border-dashed border-slate-200 rounded-xl bg-white">
            <Banknote className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-400">No payroll records for selected period</p>
            <p className="text-xs text-slate-300 mt-1">Select a project and generate payroll to get started</p>
          </div>
        )}
      </div>

      {/* Payment Modal */}
      {payModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Record Payment</h2>
                <p className="text-xs text-slate-500 mt-0.5">Confirm disbursement details</p>
              </div>
              <button onClick={() => setPayModal(null)} className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div className="bg-slate-50 rounded-xl p-4 text-center">
                <div className="text-sm font-semibold text-slate-800">{payModal.worker_name}</div>
                <div className="text-xs text-slate-400 mt-0.5">{dayjs(payModal.period_from).format('D MMM')} – {dayjs(payModal.period_to).format('D MMM YYYY')}</div>
                <div className="text-3xl font-bold text-emerald-600 mt-3 font-mono">{inr(payModal.net_wages)}</div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-600">Payment Mode</label>
                <select className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 outline-none focus:border-amber-400 transition-all" value={payMode} onChange={e => setPayMode(e.target.value)}>
                  {PAY_MODES.map(m => <option key={m} value={m}>{m.toUpperCase()}</option>)}
                </select>
              </div>

              <div className="flex gap-3">
                <button onClick={() => setPayModal(null)} className="flex-1 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 font-medium transition-all">
                  Cancel
                </button>
                <button onClick={() => payMut.mutate({ id: payModal.id })} disabled={payMut.isPending} className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg shadow-sm transition-all">
                  {payMut.isPending ? 'Processing...' : 'Confirm Payment'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const dateCls = 'flex-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 font-mono outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 transition-all';

function SummaryCard({ label, value, color, bg, border }) {
  return (
    <div className={`${bg} border ${border} rounded-xl p-4 shadow-sm`}>
      <div className="text-xs text-slate-500 font-medium mb-1">{label}</div>
      <div className={`text-lg font-bold font-mono ${color}`}>{value}</div>
    </div>
  );
}

function BreakItem({ label, value, color, bold }) {
  return (
    <div>
      <div className={`text-xs font-mono ${bold ? 'font-bold' : 'font-medium'} ${color}`}>{value}</div>
      <div className="text-[10px] text-slate-400 mt-0.5">{label}</div>
    </div>
  );
}
