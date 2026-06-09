import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { scAPI, projectAPI } from '../../api/client';
import {
  RefreshCw, ShieldCheck, CheckCircle, X,
  MessageSquare, AlertCircle, ChevronRight,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import dayjs from 'dayjs';

const fmt  = v => `₹${Number(v||0).toLocaleString('en-IN',{maximumFractionDigits:0})}`;
const fmt2 = v => `₹${Number(v||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}`;

const STATUS_META = {
  submitted:    { bg:'bg-blue-100',    text:'text-blue-700',    label:'Pending',      dot:'bg-blue-500' },
  under_review: { bg:'bg-amber-100',   text:'text-amber-700',   label:'Under Review', dot:'bg-amber-500' },
  queried:      { bg:'bg-orange-100',  text:'text-orange-700',  label:'Queried',      dot:'bg-orange-500' },
  approved:     { bg:'bg-emerald-100', text:'text-emerald-700', label:'Approved',     dot:'bg-emerald-500' },
  rejected:     { bg:'bg-red-100',     text:'text-red-700',     label:'Rejected',     dot:'bg-red-500' },
  paid:         { bg:'bg-teal-100',    text:'text-teal-700',    label:'Paid',         dot:'bg-teal-500' },
};

// ─── Bill Approval Card ───────────────────────────────────────────────────────
function BillApprovalCard({ bill, stages }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState('');   // '' | 'approve' | 'reject' | 'query'
  const [comments, setComments] = useState('');

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['sc-bills-approval'] });
    setMode(''); setComments('');
  };

  const approveMut = useMutation({
    mutationFn: () => scAPI.approveBill(bill.id, { comments }),
    onSuccess: () => { toast.success('Bill approved ✓'); invalidate(); },
    onError:   e  => toast.error(e?.response?.data?.error || 'Approval failed'),
  });
  const rejectMut = useMutation({
    mutationFn: () => scAPI.rejectBill(bill.id, { comments }),
    onSuccess: () => { toast.success('Bill rejected'); invalidate(); },
    onError:   e  => toast.error(e?.response?.data?.error || 'Rejection failed'),
  });
  const queryMut = useMutation({
    mutationFn: () => scAPI.queryBill(bill.id, { comments }),
    onSuccess: () => { toast.success('Query sent to bill raiser'); invalidate(); },
    onError:   e  => toast.error(e?.response?.data?.error || 'Failed to send query'),
  });

  const stageIdx   = stages.indexOf(bill.current_stage);
  const meta       = STATUS_META[bill.status] || STATUS_META.submitted;
  const canAct     = ['submitted','under_review'].includes(bill.status);
  const isRejected = bill.status === 'rejected';
  const isQueried  = bill.status === 'queried';

  const pendingMut = approveMut.isPending || rejectMut.isPending || queryMut.isPending;

  return (
    <div className={clsx(
      'bg-white rounded-2xl border overflow-hidden shadow-sm',
      isRejected ? 'border-red-200'
        : bill.status === 'approved' ? 'border-emerald-200'
        : isQueried  ? 'border-orange-200'
        : 'border-slate-100'
    )}>
      {/* ── Header ── */}
      <div className="px-5 py-4 border-b border-slate-100">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="font-mono text-sm font-bold text-purple-600">{bill.bill_number}</span>
              <span className={clsx('text-xs px-2 py-0.5 rounded-full font-semibold flex items-center gap-1', meta.bg, meta.text)}>
                <span className={clsx('w-1.5 h-1.5 rounded-full', meta.dot)}/>
                {meta.label}
              </span>
              <span className="text-xs text-slate-400 capitalize">
                Stage: {(bill.current_stage||'').replace(/_/g,' ')}
              </span>
              <span className="text-xs text-slate-400">
                {dayjs(bill.bill_date).format('DD MMM YYYY')}
              </span>
            </div>
            <div className="font-semibold text-slate-800 truncate">{bill.sc_name}</div>
            <div className="text-xs text-slate-400">{bill.wo_number} · {bill.project_name}</div>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="text-xl font-bold text-purple-700">{fmt(bill.net_payable)}</div>
            <div className="text-xs text-slate-400">Gross: {fmt(bill.gross_amount)}</div>
          </div>
        </div>

        {/* Stage progress bar */}
        {stages.length > 0 && (
          <div className="flex items-center gap-1 mt-3">
            {stages.map((s, i) => (
              <React.Fragment key={s}>
                <div className={clsx(
                  'flex-1 text-center text-[9px] font-semibold px-1 py-1 rounded leading-tight',
                  i < stageIdx ? 'bg-emerald-100 text-emerald-700'
                    : i === stageIdx ? 'bg-purple-100 text-purple-700'
                    : 'bg-slate-100 text-slate-400'
                )}>
                  {s.replace(/_/g,' ').replace(/\b\w/g, c => c.toUpperCase())}
                </div>
                {i < stages.length - 1 && (
                  <ChevronRight className={clsx('w-3 h-3 flex-shrink-0',
                    i < stageIdx ? 'text-emerald-400' : 'text-slate-200')} />
                )}
              </React.Fragment>
            ))}
          </div>
        )}
      </div>

      {/* ── Query banner ── */}
      {isQueried && bill.query_remarks && (
        <div className="px-5 py-3 bg-orange-50 border-b border-orange-100 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5"/>
          <div>
            <p className="text-xs font-bold text-orange-700 mb-0.5">Query from approver:</p>
            <p className="text-xs text-orange-600">{bill.query_remarks}</p>
            <p className="text-[10px] text-orange-400 mt-1">Bill can be re-submitted after addressing this query</p>
          </div>
        </div>
      )}

      {/* ── Rejection banner ── */}
      {isRejected && bill.rejection_remarks && (
        <div className="px-5 py-3 bg-red-50 border-b border-red-100 flex items-start gap-2">
          <X className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5"/>
          <div>
            <p className="text-xs font-bold text-red-700 mb-0.5">Rejection reason:</p>
            <p className="text-xs text-red-600">{bill.rejection_remarks}</p>
          </div>
        </div>
      )}

      {/* ── Bill quick-summary ── */}
      <div className="px-5 py-2 bg-slate-50/60 border-b border-slate-100">
        <div className="flex flex-wrap gap-4 text-xs text-slate-500">
          {[
            ['Period', bill.period_from ? `${dayjs(bill.period_from).format('DD MMM')} – ${dayjs(bill.period_to||bill.period_from).format('DD MMM YY')}` : '—'],
            ['GST',       fmt2(bill.gst_amount)],
            ['TDS',       fmt2(bill.tds_amount)],
            ['Retention', fmt2(bill.retention_amount)],
          ].map(([l, v]) => (
            <span key={l}><span className="font-semibold text-slate-700">{l}:</span> {v}</span>
          ))}
        </div>
      </div>

      {/* ── Action panel ── */}
      {canAct && (
        <div className="px-5 py-3 bg-slate-50">
          {mode === '' ? (
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setMode('approve')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 transition-colors">
                <CheckCircle className="w-3.5 h-3.5" /> Approve
              </button>
              <button onClick={() => setMode('query')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 text-white rounded-lg text-xs font-semibold hover:bg-orange-600 transition-colors">
                <MessageSquare className="w-3.5 h-3.5" /> Send Query
              </button>
              <button onClick={() => setMode('reject')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700 transition-colors">
                <X className="w-3.5 h-3.5" /> Reject
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Mode header */}
              <div className={clsx(
                'text-xs font-bold uppercase tracking-wide px-2 py-1 rounded',
                mode === 'approve' ? 'bg-emerald-100 text-emerald-700'
                  : mode === 'query' ? 'bg-orange-100 text-orange-700'
                  : 'bg-red-100 text-red-700'
              )}>
                {mode === 'approve' ? 'Confirm Approval'
                  : mode === 'query' ? 'Send Query to Bill Raiser'
                  : 'Confirm Rejection'}
              </div>

              {mode === 'approve' && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-xs text-emerald-700">
                  {stageIdx < stages.length - 1
                    ? `Will advance to next stage: ${(stages[stageIdx+1]||'').replace(/_/g,' ')}`
                    : '⭐ This is the final approval — bill will be marked Approved and an IPC will be generated.'}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">
                  {mode === 'approve' ? 'Approval remarks (optional)' :
                   mode === 'query'   ? 'Query remarks (required)' :
                                        'Rejection reason (required)'}
                </label>
                <textarea
                  value={comments}
                  onChange={e => setComments(e.target.value)}
                  rows={2}
                  className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-200 resize-none"
                  placeholder={
                    mode === 'approve' ? 'Add any approval notes…' :
                    mode === 'query'   ? 'Describe what needs to be addressed before approval…' :
                                         'Explain why the bill is being rejected…'
                  }
                />
              </div>

              <div className="flex gap-2">
                {mode === 'approve' && (
                  <button
                    onClick={() => approveMut.mutate()}
                    disabled={pendingMut}
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50">
                    <CheckCircle className="w-3.5 h-3.5" />
                    {approveMut.isPending ? 'Approving…' : 'Confirm Approve'}
                  </button>
                )}
                {mode === 'query' && (
                  <button
                    onClick={() => queryMut.mutate()}
                    disabled={!comments.trim() || pendingMut}
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-orange-500 text-white rounded-lg text-xs font-semibold hover:bg-orange-600 disabled:opacity-50">
                    <MessageSquare className="w-3.5 h-3.5" />
                    {queryMut.isPending ? 'Sending…' : 'Send Query'}
                  </button>
                )}
                {mode === 'reject' && (
                  <button
                    onClick={() => rejectMut.mutate()}
                    disabled={!comments.trim() || pendingMut}
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700 disabled:opacity-50">
                    <X className="w-3.5 h-3.5" />
                    {rejectMut.isPending ? 'Rejecting…' : 'Confirm Reject'}
                  </button>
                )}
                <button
                  onClick={() => { setMode(''); setComments(''); }}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-600 hover:bg-slate-100">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
const STATUS_FILTERS = [
  ['submitted',    'Pending'],
  ['under_review', 'Under Review'],
  ['queried',      'Queried'],
  ['approved',     'Approved'],
  ['rejected',     'Rejected'],
  ['',             'All'],
];

export default function SCBillApproval() {
  const [projectFilter, setProject] = useState('');
  const [statusFilter,  setStatus]  = useState('submitted');

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectAPI.list().then(r => r.data?.data ?? []),
  });

  // Load stages from settings so stage bar always reflects configured flow
  const { data: settings } = useQuery({
    queryKey: ['sc-settings'],
    queryFn:  () => scAPI.getSettings().then(r => r.data?.data),
    staleTime: 5 * 60 * 1000,
  });
  const stages = settings?.approval_stages || ['site_engineer','project_manager','qs_engineer','accounts'];

  const { data: bills = [], isLoading, refetch } = useQuery({
    queryKey: ['sc-bills-approval', projectFilter, statusFilter],
    queryFn:  () => scAPI.listBills({
      project_id: projectFilter || undefined,
      status:     statusFilter  || undefined,
    }).then(r => r.data?.data || []),
    staleTime: 0,
  });

  return (
    <div className="p-6 md:p-8 min-h-screen bg-slate-50">

      {/* ── Page header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-blue-600" />
            Bill Approval Workflow
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {bills.length} bill{bills.length !== 1 ? 's' : ''}
            {statusFilter ? ` · ${statusFilter.replace('_',' ')}` : ''}
          </p>
        </div>
        <button onClick={() => refetch()} className="p-2 border border-slate-200 bg-white rounded-xl hover:bg-slate-50">
          <RefreshCw className="w-4 h-4 text-slate-500" />
        </button>
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-wrap gap-3 mb-5">
        <select
          value={projectFilter}
          onChange={e => setProject(e.target.value)}
          className="border border-slate-200 bg-white rounded-xl px-3 py-2 text-sm min-w-48">
          <option value="">All Projects</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>

        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl flex-wrap">
          {STATUS_FILTERS.map(([v, l]) => (
            <button key={v} onClick={() => setStatus(v)}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                statusFilter === v
                  ? 'bg-white text-blue-700 shadow-sm font-semibold'
                  : 'text-slate-600 hover:text-slate-800'
              )}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* ── Bill list ── */}
      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <RefreshCw className="w-6 h-6 animate-spin text-blue-500 mr-2" />
          Loading…
        </div>
      ) : bills.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center">
          <ShieldCheck className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">No bills found for this filter</p>
        </div>
      ) : (
        <div className="space-y-4">
          {bills.map(b => (
            <BillApprovalCard key={b.id} bill={b} stages={stages} />
          ))}
        </div>
      )}
    </div>
  );
}
