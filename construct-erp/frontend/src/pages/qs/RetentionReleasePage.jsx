import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  ShieldCheck, Plus, X, ChevronDown, ChevronRight,
  CheckCircle, Clock, XCircle, Banknote, AlertTriangle, Trash2,
} from 'lucide-react';
import { retentionAPI } from '../../api/client';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';

// ─── Constants ────────────────────────────────────────────────────────────────
const MILESTONES = [
  { value: 'partial',    label: 'Partial Release' },
  { value: 'completion', label: 'Completion Certificate' },
  { value: 'dlp_end',   label: 'DLP Period End' },
  { value: 'final',     label: 'Final Settlement' },
];

const STATUS_CFG = {
  pending:  { label: 'Pending Approval', cls: 'bg-amber-50 text-amber-700 border border-amber-200',   icon: Clock },
  approved: { label: 'Approved',         cls: 'bg-blue-50 text-blue-700 border border-blue-200',      icon: CheckCircle },
  released: { label: 'Released',         cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200', icon: Banknote },
  rejected: { label: 'Rejected',         cls: 'bg-red-50 text-red-700 border border-red-200',         icon: XCircle },
};

const fmtL = (n) => n != null ? `₹${parseFloat(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';
const pct  = (a, b) => b > 0 ? ((a / b) * 100).toFixed(1) : '0.0';

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color = 'slate' }) {
  const ring = {
    slate:   'border-l-slate-400',
    amber:   'border-l-amber-400',
    emerald: 'border-l-emerald-500',
    blue:    'border-l-blue-500',
    red:     'border-l-red-400',
  }[color];
  return (
    <div className={`bg-white border border-slate-200 border-l-4 ${ring} rounded-xl shadow-sm p-4`}>
      <p className="text-xs font-medium text-slate-900 font-medium uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-medium text-slate-900 mt-1">{value}</p>
      {sub && <p className="text-xs text-slate-900 font-medium mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] || STATUS_CFG.pending;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium ${cfg.cls}`}>
      <Icon className="w-3 h-3" />{cfg.label}
    </span>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function RetentionReleasePage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('all');
  const [expandedProject, setExpandedProject] = useState(null);
  const [showNewModal, setShowNewModal]   = useState(false);
  const [showApprove, setShowApprove]     = useState(null);   // release id
  const [showReject, setShowReject]       = useState(null);
  const [showPayOut, setShowPayOut]       = useState(null);
  const [rejectNote, setRejectNote]       = useState('');
  const [payForm, setPayForm]             = useState({ payment_date: '', payment_ref: '' });

  // New release form state
  const [form, setForm] = useState({
    project_id: '', contractor_name: '', release_date: dayjs().format('YYYY-MM-DD'),
    milestone: 'partial', release_amount: '', remarks: '',
  });

  // ── Queries ──
  const { data: summaryData, isLoading: sumLoading } = useQuery({
    queryKey: ['retention-summary'],
    queryFn: () => retentionAPI.summary().then(r => r.data),
  });

  const { data: listData, isLoading: listLoading } = useQuery({
    queryKey: ['retention-list', statusFilter],
    queryFn: () => retentionAPI.list(statusFilter !== 'all' ? { status: statusFilter } : {}).then(r => r.data),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['retention-summary'] });
    qc.invalidateQueries({ queryKey: ['retention-list'] });
  };

  // ── Mutations ──
  const createMut = useMutation({
    mutationFn: (d) => retentionAPI.create(d),
    onSuccess: () => {
      invalidate();
      toast.success('Release request created');
      setShowNewModal(false);
      setForm({ project_id: '', contractor_name: '', release_date: dayjs().format('YYYY-MM-DD'), milestone: 'partial', release_amount: '', remarks: '' });
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });

  const approveMut = useMutation({
    mutationFn: (id) => retentionAPI.approve(id),
    onSuccess: () => { invalidate(); toast.success('Approved'); setShowApprove(null); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });

  const rejectMut = useMutation({
    mutationFn: ({ id, rejection_remarks }) => retentionAPI.reject(id, { rejection_remarks }),
    onSuccess: () => { invalidate(); toast.success('Rejected'); setShowReject(null); setRejectNote(''); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });

  const releaseMut = useMutation({
    mutationFn: ({ id, ...d }) => retentionAPI.release(id, d),
    onSuccess: () => { invalidate(); toast.success('Marked as Released'); setShowPayOut(null); setPayForm({ payment_date: '', payment_ref: '' }); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => retentionAPI.remove(id),
    onSuccess: () => { invalidate(); toast.success('Deleted'); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });

  const kpi     = summaryData?.kpi   || {};
  const summary = summaryData?.data  || [];
  const releases = listData?.data    || [];

  // When user picks project in the new-release form, auto-fill contractor name
  const onProjectChange = (project_id) => {
    const proj = summary.find(p => p.project_id === project_id);
    setForm(f => ({
      ...f,
      project_id,
      contractor_name: proj?.contractor_name || f.contractor_name,
    }));
  };

  const STATUS_TABS = [
    { key: 'all',      label: 'All' },
    { key: 'pending',  label: 'Pending' },
    { key: 'approved', label: 'Approved' },
    { key: 'released', label: 'Released' },
    { key: 'rejected', label: 'Rejected' },
  ];

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto min-h-screen bg-[#f4f6f9]">

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shadow-sm">
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-medium text-slate-900">Retention Release</h1>
            <p className="text-sm text-slate-500">Track and release retention money held across RA bills</p>
          </div>
        </div>
        <button
          onClick={() => setShowNewModal(true)}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium shadow-sm transition-colors"
        >
          <Plus className="w-4 h-4" /> New Release Request
        </button>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <KpiCard label="Total Held"          value={fmtL(kpi.total_held)}               color="slate"   sub="From certified RA bills" />
        <KpiCard label="Released"            value={fmtL(kpi.total_released)}           color="emerald" sub={`${pct(kpi.total_released, kpi.total_held)}% of total`} />
        <KpiCard label="Pending Approval"    value={fmtL(kpi.pending_approval)}         color="amber"   sub="Awaiting PM sign-off" />
        <KpiCard label="Approved (Unpaid)"   value={fmtL(kpi.approved_pending_payment)} color="blue"    sub="Ready to pay out" />
        <KpiCard label="Net Outstanding"     value={fmtL(kpi.net_outstanding)}          color="red"     sub="Remaining to release" />
      </div>

      {/* ── Project Summary Accordion ── */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden mb-6">
        <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
          <h2 className="text-xs font-medium text-slate-900 font-medium uppercase tracking-widest">Retention by Project</h2>
          <span className="text-xs text-slate-400">{summary.length} project{summary.length !== 1 ? 's' : ''}</span>
        </div>
        {sumLoading ? (
          <div className="py-8 text-center text-slate-900 font-medium text-sm">Loading…</div>
        ) : summary.length === 0 ? (
          <div className="py-8 text-center text-slate-900 font-medium text-sm">No certified RA bills with retention found</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {summary.map(proj => {
              const isOpen = expandedProject === proj.project_id;
              const relPct = pct(proj.total_released, proj.total_held);
              return (
                <div key={proj.project_id}>
                  <button
                    onClick={() => setExpandedProject(isOpen ? null : proj.project_id)}
                    className="w-full flex items-center px-5 py-3.5 hover:bg-slate-50 transition-colors text-left"
                  >
                    {isOpen
                      ? <ChevronDown className="w-4 h-4 text-slate-900 font-medium mr-3 shrink-0" />
                      : <ChevronRight className="w-4 h-4 text-slate-900 font-medium mr-3 shrink-0" />}
                    <div className="flex-1 min-w-0 grid grid-cols-2 md:grid-cols-5 gap-2 items-center">
                      <div className="col-span-2 md:col-span-1">
                        <p className="text-sm font-medium text-slate-900 font-medium truncate">{proj.project_name}</p>
                        <p className="text-xs text-slate-400">{proj.project_code} · {proj.bill_count} bills</p>
                      </div>
                      <div className="hidden md:block text-right">
                        <p className="text-xs text-slate-500">Total Held</p>
                        <p className="text-sm font-medium text-black">{fmtL(proj.total_held)}</p>
                      </div>
                      <div className="hidden md:block text-right">
                        <p className="text-xs text-slate-500">Released</p>
                        <p className="text-sm font-medium text-emerald-600">{fmtL(proj.total_released)}</p>
                      </div>
                      <div className="hidden md:block text-right">
                        <p className="text-xs text-slate-500">Pending</p>
                        <p className="text-sm font-medium text-amber-600">{fmtL(proj.pending_approval)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-slate-500">Outstanding</p>
                        <p className="text-sm font-medium text-slate-900">{fmtL(proj.net_outstanding)}</p>
                        <div className="w-full bg-slate-100 rounded-full h-1.5 mt-1">
                          <div className="h-1.5 bg-emerald-500 rounded-full" style={{ width: `${Math.min(parseFloat(relPct), 100)}%` }} />
                        </div>
                        <p className="text-xs text-slate-900 font-medium mt-0.5">{relPct}% released</p>
                      </div>
                    </div>
                  </button>
                  {isOpen && (
                    <div className="bg-slate-50 border-t border-slate-100 px-5 py-4">
                      <p className="text-xs font-medium text-slate-900 font-medium uppercase tracking-wide mb-3">Retention breakdown from RA bills</p>
                      <ProjectRetentionBills projectId={proj.project_id} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Release Requests Table ── */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50 flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-xs font-medium text-slate-900 font-medium uppercase tracking-widest">Release Requests</h2>
          <div className="flex gap-1 flex-wrap">
            {STATUS_TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setStatusFilter(t.key)}
                className={`px-3 py-1 text-xs rounded-lg font-medium transition-colors ${
                  statusFilter === t.key
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-900 font-medium hover:bg-slate-100'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {listLoading ? (
          <div className="py-12 text-center text-slate-900 font-medium text-sm">Loading…</div>
        ) : releases.length === 0 ? (
          <div className="py-12 text-center text-slate-900 font-medium text-sm">
            No release requests yet
            <br />
            <button onClick={() => setShowNewModal(true)} className="mt-2 text-indigo-600 hover:underline text-sm">
              Create the first one →
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {['Release No.', 'Project', 'Contractor', 'Milestone', 'Amount', 'Date', 'Status', 'Actions'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-900 font-medium uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {releases.map(r => (
                  <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs font-medium text-indigo-600">{r.release_number}</span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-slate-900 font-medium text-xs">{r.project_name}</p>
                      <p className="text-slate-900 font-medium text-xs">{r.project_code}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-900 text-xs">{r.contractor_name}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-900 rounded-full">
                        {MILESTONES.find(m => m.value === r.milestone)?.label || r.milestone}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-black">{fmtL(r.release_amount)}</td>
                    <td className="px-4 py-3 text-slate-900 font-medium text-xs">{dayjs(r.release_date).format('DD MMM YYYY')}</td>
                    <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {r.status === 'pending' && (
                          <>
                            <button
                              onClick={() => setShowApprove(r.id)}
                              className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs rounded-lg font-medium"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => setShowReject(r.id)}
                              className="px-2.5 py-1 border border-red-200 text-red-600 hover:bg-red-50 text-xs rounded-lg font-medium"
                            >
                              Reject
                            </button>
                            <button
                              onClick={() => { if (window.confirm('Delete this request?')) deleteMut.mutate(r.id); }}
                              className="p-1 text-slate-300 hover:text-red-500 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                        {r.status === 'approved' && (
                          <button
                            onClick={() => { setShowPayOut(r.id); setPayForm({ payment_date: dayjs().format('YYYY-MM-DD'), payment_ref: '' }); }}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs rounded-lg font-medium"
                          >
                            Mark Released
                          </button>
                        )}
                        {r.status === 'released' && r.payment_ref && (
                          <span className="text-xs text-slate-400">Ref: {r.payment_ref}</span>
                        )}
                        {r.status === 'rejected' && r.rejection_remarks && (
                          <span className="text-xs text-red-400 max-w-[120px] truncate" title={r.rejection_remarks}>
                            {r.rejection_remarks}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* MODAL: New Release Request                                             */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg border border-slate-100">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-medium text-black">New Retention Release Request</h2>
              <button onClick={() => setShowNewModal(false)} className="p-1.5 text-slate-900 font-medium hover:text-slate-900 hover:bg-slate-50 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Project picker from the summary list */}
              <div>
                <label className="block text-xs font-medium text-slate-900 mb-1.5">Project <span className="text-red-500">*</span></label>
                <select
                  value={form.project_id}
                  onChange={e => onProjectChange(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                >
                  <option value="">— Select Project —</option>
                  {summary.map(p => (
                    <option key={p.project_id} value={p.project_id}>
                      {p.project_name} (Outstanding: {fmtL(p.net_outstanding)})
                    </option>
                  ))}
                </select>
              </div>

              {/* Outstanding retention callout */}
              {form.project_id && (() => {
                const proj = summary.find(p => p.project_id === form.project_id);
                return proj ? (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-3">
                    <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                    <div className="text-xs text-amber-700 space-y-0.5">
                      <p>Total held: <strong>{fmtL(proj.total_held)}</strong></p>
                      <p>Already released: <strong>{fmtL(proj.total_released)}</strong></p>
                      <p>Net outstanding: <strong>{fmtL(proj.net_outstanding)}</strong></p>
                    </div>
                  </div>
                ) : null;
              })()}

              <div>
                <label className="block text-xs font-medium text-slate-900 mb-1.5">Contractor Name <span className="text-red-500">*</span></label>
                <input
                  value={form.contractor_name}
                  onChange={e => setForm(f => ({ ...f, contractor_name: e.target.value }))}
                  placeholder="As per RA bills"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-900 mb-1.5">Release Date <span className="text-red-500">*</span></label>
                  <input
                    type="date"
                    value={form.release_date}
                    onChange={e => setForm(f => ({ ...f, release_date: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-900 mb-1.5">Release Milestone <span className="text-red-500">*</span></label>
                  <select
                    value={form.milestone}
                    onChange={e => setForm(f => ({ ...f, milestone: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  >
                    {MILESTONES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-900 mb-1.5">Release Amount (₹) <span className="text-red-500">*</span></label>
                <input
                  type="number"
                  min="0"
                  value={form.release_amount}
                  onChange={e => setForm(f => ({ ...f, release_amount: e.target.value }))}
                  placeholder="Enter amount to release"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-900 mb-1.5">Remarks</label>
                <textarea
                  value={form.remarks}
                  onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))}
                  placeholder="Reason for release, completion details, DLP certificate no., etc."
                  rows={2}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
                />
              </div>
            </div>

            <div className="flex gap-3 px-6 pb-5">
              <button
                onClick={() => setShowNewModal(false)}
                className="flex-1 py-2.5 border border-slate-200 text-slate-900 font-medium rounded-xl text-sm hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                disabled={createMut.isPending || !form.project_id || !form.contractor_name || !form.release_amount}
                onClick={() => createMut.mutate(form)}
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-medium disabled:opacity-50"
              >
                {createMut.isPending ? 'Creating…' : 'Create Request'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* MODAL: Approve                                                         */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {showApprove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm border border-slate-100 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <h2 className="text-base font-medium text-black">Approve Release</h2>
                <p className="text-xs text-slate-500">This will authorise the payment to be made</p>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowApprove(null)} className="flex-1 py-2.5 border border-slate-200 text-slate-900 font-medium rounded-xl text-sm hover:bg-slate-50">Cancel</button>
              <button
                disabled={approveMut.isPending}
                onClick={() => approveMut.mutate(showApprove)}
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-medium disabled:opacity-50"
              >
                {approveMut.isPending ? 'Approving…' : 'Yes, Approve'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* MODAL: Reject                                                          */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {showReject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm border border-slate-100 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
                <XCircle className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h2 className="text-base font-medium text-black">Reject Request</h2>
                <p className="text-xs text-slate-500">Provide a reason for rejection</p>
              </div>
            </div>
            <textarea
              value={rejectNote}
              onChange={e => setRejectNote(e.target.value)}
              placeholder="Reason for rejection…"
              rows={3}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none mt-2"
            />
            <div className="flex gap-3 mt-4">
              <button onClick={() => { setShowReject(null); setRejectNote(''); }} className="flex-1 py-2.5 border border-slate-200 text-slate-900 font-medium rounded-xl text-sm hover:bg-slate-50">Cancel</button>
              <button
                disabled={rejectMut.isPending}
                onClick={() => rejectMut.mutate({ id: showReject, rejection_remarks: rejectNote })}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-medium disabled:opacity-50"
              >
                {rejectMut.isPending ? 'Rejecting…' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* MODAL: Mark as Released (Pay Out)                                      */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {showPayOut && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm border border-slate-100 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                <Banknote className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <h2 className="text-base font-medium text-black">Mark as Released</h2>
                <p className="text-xs text-slate-500">Record the payment made to the contractor</p>
              </div>
            </div>
            <div className="space-y-3 mt-2">
              <div>
                <label className="block text-xs font-medium text-slate-900 mb-1.5">Payment Date</label>
                <input
                  type="date"
                  value={payForm.payment_date}
                  onChange={e => setPayForm(f => ({ ...f, payment_date: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-900 mb-1.5">Payment Ref / UTR</label>
                <input
                  value={payForm.payment_ref}
                  onChange={e => setPayForm(f => ({ ...f, payment_ref: e.target.value }))}
                  placeholder="e.g. UTR123456789"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowPayOut(null)} className="flex-1 py-2.5 border border-slate-200 text-slate-900 font-medium rounded-xl text-sm hover:bg-slate-50">Cancel</button>
              <button
                disabled={releaseMut.isPending}
                onClick={() => releaseMut.mutate({ id: showPayOut, ...payForm })}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-medium disabled:opacity-50"
              >
                {releaseMut.isPending ? 'Saving…' : 'Confirm Release'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-component: RA bills retention breakdown for expanded project row ──────
function ProjectRetentionBills({ projectId }) {
  const { data, isLoading } = useQuery({
    queryKey: ['retention-project-bills', projectId],
    queryFn: () => retentionAPI.get(`?project_bills=${projectId}`)
      .catch(() => null),
    // We'll fetch from the summary detail endpoint; use a simple list API instead
    enabled: false, // disabled — we show static data from the summary
  });

  // Fetch the RA bills directly using the retention detail endpoint
  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['retention-detail-bills', projectId],
    queryFn: async () => {
      // Use a temporary ID lookup — we actually fetch summary which contains RA bills per project
      // We'll use the list API with project filter instead
      const r = await import('../../api/client').then(m => m.raBillAPI.list({ project_id: projectId }));
      return r.data?.data?.filter(b => ['certified', 'paid'].includes(b.status) && parseFloat(b.retention_amount) > 0) || [];
    },
  });

  if (detailLoading) return <p className="text-xs text-slate-400">Loading bills…</p>;
  const bills = detail || [];
  if (!bills.length) return <p className="text-xs text-slate-400">No certified RA bills with retention</p>;

  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-slate-500">
          <th className="text-left py-1.5 font-semibold">Bill No.</th>
          <th className="text-left py-1.5 font-semibold">Period</th>
          <th className="text-left py-1.5 font-semibold">Gross Amount</th>
          <th className="text-left py-1.5 font-semibold">Ret %</th>
          <th className="text-left py-1.5 font-semibold">Retention Held</th>
          <th className="text-left py-1.5 font-semibold">Status</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {bills.map(b => (
          <tr key={b.id}>
            <td className="py-1.5 font-mono text-indigo-600 font-semibold">{b.bill_number}</td>
            <td className="py-1.5 text-slate-500">
              {b.bill_period_from ? dayjs(b.bill_period_from).format('DD MMM') : '—'}
              {' – '}
              {b.bill_period_to ? dayjs(b.bill_period_to).format('DD MMM YY') : '—'}
            </td>
            <td className="py-1.5 text-slate-700">{fmtL(b.gross_amount)}</td>
            <td className="py-1.5 text-slate-500">{b.retention_percent}%</td>
            <td className="py-1.5 font-medium text-black">{fmtL(b.retention_amount)}</td>
            <td className="py-1.5">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                b.status === 'paid' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'
              }`}>{b.status}</span>
            </td>
          </tr>
        ))}
        <tr className="border-t border-slate-200">
          <td colSpan={4} className="py-2 font-medium text-slate-600">Total Retention Held</td>
          <td className="py-2 font-medium text-slate-900">
            {fmtL(bills.reduce((s, b) => s + parseFloat(b.retention_amount || 0), 0))}
          </td>
          <td />
        </tr>
      </tbody>
    </table>
  );
}
