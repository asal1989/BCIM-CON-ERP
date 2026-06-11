// src/pages/approvals/ApprovalsPage.jsx
// Unified "My Approvals" home page — shows all pending items across every module
import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { approvalsAPI, mrsAPI } from '../../api/client';
import { PageHeader, KpiCard as ThemeKpiCard, Theme } from '../../theme';
import useAuthStore from '../../store/authStore';
import {
  CheckCircle2, XCircle, Eye, RefreshCw, Clock, AlertTriangle,
  FileText, Briefcase, Layers, Shield, Receipt, ShoppingCart, Package,
  ChevronRight, MessageSquare, X, CheckCheck, Bell, Landmark,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
dayjs.extend(relativeTime);

// ─── helpers ──────────────────────────────────────────────────────────────────
const fmt = (n) => n > 0 ? `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '—';
const daysAgo = (d) => {
  const diff = Math.floor((Date.now() - new Date(d)) / 86400000);
  return diff === 0 ? 'Today' : diff === 1 ? '1 day ago' : `${diff} days ago`;
};

const TYPE_META = {
  'SC Bill':          { icon: Receipt,      bg: 'bg-indigo-100',  text: 'text-indigo-700',  border: 'border-indigo-200',  dot: '#4F46E5' },
  'Work Order':       { icon: Briefcase,    bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200', dot: '#059669' },
  'Measurement Book': { icon: Layers,       bg: 'bg-teal-100',    text: 'text-teal-700',    border: 'border-teal-200',    dot: '#0D9488' },
  'NMR Muster Roll':  { icon: FileText,     bg: 'bg-blue-100',    text: 'text-blue-700',    border: 'border-blue-200',    dot: '#1D4ED8' },
  'Retention Release':{ icon: Shield,       bg: 'bg-amber-100',   text: 'text-amber-700',   border: 'border-amber-200',   dot: '#D97706' },
  'NCR':              { icon: AlertTriangle,bg: 'bg-red-100',     text: 'text-red-700',     border: 'border-red-200',     dot: '#DC2626' },
  'Submittal':        { icon: FileText,     bg: 'bg-purple-100',  text: 'text-purple-700',  border: 'border-purple-200',  dot: '#7C3AED' },
  'Purchase Order':   { icon: ShoppingCart, bg: 'bg-orange-100',  text: 'text-orange-700',  border: 'border-orange-200',  dot: '#EA580C' },
  'MRS':              { icon: Package,      bg: 'bg-cyan-100',    text: 'text-cyan-700',    border: 'border-cyan-200',    dot: '#0891B2' },
};

// Human-readable status labels for PO and procurement WO
const PO_STATUS_LABEL = {
  'pending':        'Awaiting Procurement Approval',
  'verified_audit': 'Awaiting MD Authorization',
  'released_mgmt':  'Awaiting MD Authorization',
};
const WO_STATUS_LABEL = {
  'draft':     'Awaiting Procurement Approval',
  'pending':   'Awaiting Procurement Approval',
  'submitted': 'Awaiting MD Authorization',
  'active':    'Awaiting MD Authorization',
};

// Human-readable MRS status labels for the approvals page
const MRS_STATUS_LABEL = {
  'pending':         'Awaiting Store Manager',
  'stores_verified': 'Awaiting Project Manager',
  'verified_tower':  'Awaiting Project Manager',
  'approved_pm':     'Awaiting Project Director',
  'approved_srpm':   'Awaiting Project Director',
  'approved_mgmt':   'Awaiting MD Approval',
  'approved_md':     'Fully Approved',
  'rejected':        'Rejected',
};

const STATUS_BADGE = {
  submitted:      'bg-blue-100 text-blue-700',
  under_review:   'bg-amber-100 text-amber-700',
  pending:        'bg-slate-100 text-slate-600',
  draft:          'bg-slate-100 text-slate-500',
  checked:        'bg-teal-100 text-teal-700',
  open:           'bg-red-100 text-red-700',
  in_progress:    'bg-orange-100 text-orange-700',
  verified_audit: 'bg-green-100 text-green-700',
  released_mgmt:  'bg-green-100 text-green-700',
};

const URGENCY_COLOR = (daysOld) =>
  daysOld >= 7 ? 'border-l-red-500' :
  daysOld >= 3 ? 'border-l-amber-500' :
  'border-l-blue-400';

// ─── Approve / Reject inline comment modal ────────────────────────────────────
function ActionModal({ item, actionType, onConfirm, onClose }) {
  const [comment, setComment] = useState('');
  const isApprove = actionType === 'approve' || actionType === 'check';

  const mbCheckable = item.entity_type === 'sc_mb' && item.status === 'submitted';
  const actionLabel = mbCheckable && isApprove ? 'Mark Checked' : isApprove ? 'Approve' : 'Reject';
  const resolvedAction = mbCheckable && isApprove ? 'check' : actionType;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className={clsx('px-5 py-4 flex items-center justify-between',
          isApprove ? 'bg-emerald-600' : 'bg-red-600')}>
          <div>
            <p className="font-bold text-white text-sm">
              {actionLabel} — {item.ref_no}
            </p>
            <p className="text-xs mt-0.5 text-white/70">{item.doc_type} · {item.party_name}</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg bg-white/15 flex items-center justify-center text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-2 gap-3 mb-4">
            {[
              { l: 'Document',  v: item.ref_no },
              { l: 'Type',      v: item.doc_type },
              { l: 'Party',     v: item.party_name },
              { l: 'Project',   v: item.project_name },
            ].map(({ l, v }) => (
              <div key={l} className="bg-slate-50 rounded-xl p-2.5">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{l}</p>
                <p className="text-xs font-semibold text-slate-800 mt-0.5 truncate">{v || '—'}</p>
              </div>
            ))}
          </div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
            {isApprove ? 'Approval Remarks (optional)' : 'Rejection Reason *'}
          </label>
          <textarea value={comment} onChange={e => setComment(e.target.value)}
            rows={3} placeholder={isApprove ? 'Add any remarks…' : 'State the reason for rejection…'}
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-300 resize-none" />
        </div>
        <div className="flex justify-end gap-3 px-5 py-4 border-t bg-slate-50">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-100">Cancel</button>
          <button
            onClick={() => onConfirm(item, resolvedAction, comment)}
            disabled={!isApprove && !comment.trim()}
            className={clsx('px-5 py-2 text-white text-sm font-bold rounded-lg disabled:opacity-40',
              isApprove ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700')}>
            {actionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MD Authorization Modal (MRS only) ───────────────────────────────────────
function MDAuthModal({ mrsId, mrsRef, onClose, onAuthorized }) {
  const qc = useQueryClient();

  const { data: mrsData, isLoading } = useQuery({
    queryKey: ['mrs-detail-for-md', mrsId],
    queryFn: () => mrsAPI.get(mrsId).then(r => r.data?.data ?? r.data),
    enabled: !!mrsId,
    staleTime: 0,
  });

  const items = mrsData?.items || [];

  const [approvedItems, setApprovedItems] = useState(null);
  const [remarks, setRemarks] = useState('');

  // Init approvedItems once items load
  const resolvedItems = approvedItems ?? items.map(it => ({
    id: it.id,
    material_name: it.material_name || it.material,
    unit: it.unit,
    qty: String(it.quantity ?? it.qty ?? ''),
    original_qty: it.quantity ?? it.qty,
    included: true,
  }));

  const toggle  = (idx) => setApprovedItems(resolvedItems.map((it, i) => i === idx ? { ...it, included: !it.included } : it));
  const setQty  = (idx, v) => setApprovedItems(resolvedItems.map((it, i) => i === idx ? { ...it, qty: v } : it));

  const includedCount = resolvedItems.filter(it => it.included).length;

  const authMut = useMutation({
    mutationFn: (data) => mrsAPI.approve(mrsId, 'approve-md', data),
    onSuccess: () => {
      toast.success('MRS authorized by MD');
      qc.invalidateQueries({ queryKey: ['my-approvals'] });
      onAuthorized();
      onClose();
    },
    onError: e => toast.error(e?.response?.data?.error || 'Authorization failed'),
  });

  const handleAuthorize = () => {
    authMut.mutate({
      approved_items: resolvedItems.map(it => ({
        id: it.id,
        qty: parseFloat(it.qty) || 0,
        included: it.included,
      })),
      remarks,
    });
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-green-800 px-6 py-4 flex items-start justify-between flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Landmark size={16} className="opacity-80" /> MD Authorization
            </h2>
            <p className="text-xs text-green-200 mt-0.5">{mrsRef} — review &amp; approve line items</p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between px-5 py-2.5 bg-green-50 border-b border-green-100 flex-shrink-0">
          <p className="text-xs text-green-800 font-medium">
            Check items to include · edit quantities if needed · uncheck to exclude
          </p>
          <div className="flex items-center gap-2">
            <button onClick={() => setApprovedItems(resolvedItems.map(it => ({ ...it, included: true })))}
              className="text-[10px] font-bold text-green-700 hover:underline">Select All</button>
            <span className="text-green-300">|</span>
            <button onClick={() => setApprovedItems(resolvedItems.map(it => ({ ...it, included: false })))}
              className="text-[10px] font-bold text-red-500 hover:underline">Clear All</button>
          </div>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {isLoading ? (
            <div className="flex justify-center py-10">
              <div className="w-6 h-6 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : resolvedItems.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">No line items found</p>
          ) : resolvedItems.map((it, idx) => (
            <div key={it.id || idx} className={clsx(
              'flex items-center gap-3 border rounded-xl px-4 py-3 transition-all',
              it.included ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-200 opacity-50'
            )}>
              <input type="checkbox" checked={it.included} onChange={() => toggle(idx)}
                className="w-4 h-4 accent-green-700 cursor-pointer flex-shrink-0" />
              <span className="flex-1 text-sm font-semibold text-slate-800 truncate min-w-0">{it.material_name}</span>
              <span className="text-xs text-slate-500 bg-white border border-slate-200 rounded px-2 py-0.5 font-mono flex-shrink-0">{it.unit}</span>
              <span className="text-[10px] text-slate-400 whitespace-nowrap flex-shrink-0">
                Req: <span className="font-bold text-slate-600">{it.original_qty}</span>
              </span>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className="text-[10px] text-green-700 font-bold whitespace-nowrap">Approve:</span>
                <input type="number" min="0" step="any"
                  value={it.qty} onChange={e => setQty(idx, e.target.value)}
                  disabled={!it.included}
                  className="w-24 h-8 bg-white border border-slate-200 rounded-lg px-2 text-sm font-mono text-right outline-none focus:border-green-500 disabled:bg-slate-100 disabled:text-slate-400 transition" />
              </div>
            </div>
          ))}
        </div>

        {/* Remarks */}
        <div className="px-5 py-3 border-t border-slate-100 flex-shrink-0">
          <label className="text-xs font-bold text-slate-700 block mb-1.5">MD Remarks (optional)</label>
          <textarea rows={2} value={remarks} onChange={e => setRemarks(e.target.value)}
            placeholder="Authorization notes, conditions, or special instructions…"
            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm outline-none focus:border-green-400 resize-none transition" />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-slate-100 bg-slate-50 flex-shrink-0">
          <div>
            <span className={clsx('text-sm font-bold', includedCount === 0 ? 'text-red-500' : 'text-green-700')}>
              {includedCount} of {resolvedItems.length} items authorized
            </span>
            {includedCount === 0 && <p className="text-[11px] text-red-400">Please select at least one item</p>}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose}
              className="px-4 h-9 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-white transition">
              Cancel
            </button>
            <button onClick={handleAuthorize}
              disabled={authMut.isPending || includedCount === 0 || isLoading}
              className="px-5 h-9 rounded-lg bg-green-700 text-white text-sm font-semibold hover:bg-green-800 disabled:opacity-50 transition shadow-sm">
              {authMut.isPending ? 'Authorizing…' : `Authorize ${includedCount} Item${includedCount !== 1 ? 's' : ''} →`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Single Approval Card ─────────────────────────────────────────────────────
function ApprovalCard({ item, onApprove, onReject, onView, onMDReview }) {
  const meta   = TYPE_META[item.doc_type] || TYPE_META['SC Bill'];
  const Icon   = meta.icon;
  const daysOld = Math.floor((Date.now() - new Date(item.created_at)) / 86400000);
  const isUrgent = daysOld >= 3;

  return (
    <div className={clsx(
      'bg-white rounded-xl border border-slate-200 border-l-4 shadow-sm hover:shadow-md transition-all',
      URGENCY_COLOR(daysOld)
    )}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Type icon */}
          <div className={clsx('w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0', meta.bg)}>
            <Icon className={clsx('w-4.5 h-4.5', meta.text)} style={{ width:18, height:18 }} />
          </div>

          {/* Main content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-0.5">
              {/* Doc type badge */}
              <span className={clsx('text-[10px] px-2 py-0.5 rounded-full font-bold', meta.bg, meta.text)}>
                {item.doc_type}
              </span>
              {/* Status badge */}
              <span className={clsx('text-[10px] px-2 py-0.5 rounded-full font-semibold capitalize',
                STATUS_BADGE[item.status] || 'bg-slate-100 text-slate-600')}>
                {item.doc_type === 'MRS'
                  ? (MRS_STATUS_LABEL[item.status] || (item.status || '').replace(/_/g,' '))
                  : item.doc_type === 'Purchase Order'
                  ? (PO_STATUS_LABEL[item.status] || (item.status || '').replace(/_/g,' '))
                  : item.entity_type === 'work_order'
                  ? (WO_STATUS_LABEL[item.status] || (item.status || '').replace(/_/g,' '))
                  : (item.status || '').replace(/_/g,' ')}
              </span>
              {/* Urgent badge */}
              {isUrgent && (
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-red-100 text-red-700 flex items-center gap-0.5">
                  <AlertTriangle style={{width:10,height:10}} /> {daysOld}d pending
                </span>
              )}
            </div>

            {/* Reference + party */}
            <div className="flex items-center gap-2 mt-1">
              <span className="font-mono text-xs font-bold text-slate-800">{item.ref_no}</span>
              <span className="text-slate-300">·</span>
              <span className="text-xs font-semibold text-slate-700 truncate max-w-[200px]">{item.party_name}</span>
            </div>

            {/* Project + extra info */}
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="text-[11px] text-slate-500">{item.project_name}</span>
              {item.extra_info && (
                <>
                  <span className="text-slate-300">·</span>
                  <span className="text-[11px] text-slate-500 italic truncate max-w-[200px]">{item.extra_info}</span>
                </>
              )}
            </div>

            {/* Meta row */}
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              {item.amount > 0 && (
                <span className="text-xs font-bold text-indigo-700">{fmt(item.amount)}</span>
              )}
              {item.submitted_by && (
                <span className="text-[10px] text-slate-400">by {item.submitted_by}</span>
              )}
              <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                <Clock style={{width:10,height:10}} /> {daysAgo(item.created_at)}
              </span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
            <button onClick={() => onView(item)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
              title="View details">
              <Eye style={{width:16,height:16}} />
            </button>
            {/* MD-stage items: MRS approved_mgmt, PO verified_audit/released_mgmt, WO submitted/active */}
            {(item.entity_type === 'mrs' && item.status === 'approved_mgmt') ||
             (item.entity_type === 'po' && ['verified_audit','released_mgmt'].includes(item.status)) ||
             (item.entity_type === 'work_order' && ['submitted','active'].includes(item.status)) ? (
              <button onClick={() => onApprove(item)}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-green-700 text-white rounded-lg text-xs font-bold hover:bg-green-800 transition-colors">
                <Landmark style={{width:13,height:13}} /> Review &amp; Authorize
              </button>
            ) : (
              <>
                {item.entity_type === 'sc_mb' && item.status === 'submitted' && (
                  <button onClick={() => onApprove(item)}
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-bold hover:bg-amber-600 transition-colors">
                    <CheckCircle2 style={{width:13,height:13}} /> Check
                  </button>
                )}
                <button onClick={() => onApprove(item)}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 transition-colors">
                  <CheckCircle2 style={{width:13,height:13}} /> Approve
                </button>
              </>
            )}
            <button onClick={() => onReject(item)}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-red-500 text-white rounded-lg text-xs font-bold hover:bg-red-600 transition-colors">
              <XCircle style={{width:13,height:13}} /> Reject
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ApprovalsPage() {
  const { user }    = useAuthStore();
  const navigate    = useNavigate();
  const qc          = useQueryClient();
  const [filter,    setFilter]   = useState('All');
  const [search,    setSearch]   = useState('');
  const [actionModal, setAction] = useState(null);  // { item, type }
  const [mdModal,   setMDModal]  = useState(null);  // { id, ref }

  const { data: raw, isLoading, refetch } = useQuery({
    queryKey: ['my-approvals'],
    queryFn:  () => approvalsAPI.getPending().then(r => r.data),
    staleTime: 0, gcTime: 0, refetchOnMount: 'always',
    refetchInterval: 60000, // auto-refresh every 60s
  });

  const items   = raw?.data    || [];
  const summary = raw?.summary || {};
  const total   = raw?.total   || 0;

  // Filter tabs — built from actual data
  const tabs = useMemo(() => {
    const types = [...new Set(items.map(i => i.doc_type))];
    return ['All', ...types];
  }, [items]);

  const filtered = useMemo(() => {
    let list = filter === 'All' ? items : items.filter(i => i.doc_type === filter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(i =>
        [i.ref_no, i.party_name, i.project_name, i.doc_type, i.extra_info].some(v => v?.toLowerCase().includes(q))
      );
    }
    return list;
  }, [items, filter, search]);

  // Urgency groups
  const urgent  = filtered.filter(i => Math.floor((Date.now()-new Date(i.created_at))/86400000) >= 3);
  const normal  = filtered.filter(i => Math.floor((Date.now()-new Date(i.created_at))/86400000) < 3);

  const actionMut = useMutation({
    mutationFn: ({ item, action, comment }) =>
      approvalsAPI.doAction({ entity_type: item.entity_type, entity_id: item.id, action, comments: comment }),
    onSuccess: (_, vars) => {
      const label = vars.action === 'approve' ? 'Approved' : vars.action === 'check' ? 'Checked' : 'Rejected';
      toast.success(`${label} — ${vars.item.ref_no}`);
      qc.invalidateQueries({ queryKey: ['my-approvals'] });
      setAction(null);
    },
    onError: e => toast.error(e?.response?.data?.error || 'Action failed'),
  });

  const handleView     = (item) => navigate(item.action_url);
  const handleApprove  = (item) => setAction({ item, type: 'approve' });
  const handleReject   = (item) => setAction({ item, type: 'reject' });
  const handleConfirm  = (item, action, comment) => actionMut.mutate({ item, action, comment });
  const handleMDReview = (item) => setMDModal({ id: item.id, ref: item.ref_no });

  // KPI summary
  const kpiItems = Object.entries(summary).slice(0, 5);
  const daysOldAvg = items.length
    ? Math.round(items.reduce((s, i) => s + Math.floor((Date.now()-new Date(i.created_at))/86400000), 0) / items.length)
    : 0;

  return (
    <div style={{ background: Theme.pageBg, minHeight:'100vh' }}>
      <PageHeader
        title="My Approvals"
        subtitle={`Welcome back, ${user?.name?.split(' ')[0] || 'User'} — ${total} item${total!==1?'s':''} waiting for your action`}
        breadcrumbs={[{ label:'Home' },{ label:'My Approvals' }]}
        actions={
          <button onClick={() => refetch()}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg transition"
            style={{ background:'rgba(255,255,255,0.12)', border:'1px solid rgba(255,255,255,0.25)', color:'#fff' }}>
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        }
      />

      <div className="p-5 md:p-6 max-w-[1400px] mx-auto space-y-5">

        {/* KPI summary cards */}
        {items.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <ThemeKpiCard icon={Bell}         label="Total Pending"    value={total}        color="blue"    sub="Across all modules" />
            <ThemeKpiCard icon={AlertTriangle}label="Urgent (3+ days)" value={urgent.length} color="red"    sub="Needs immediate action" />
            {kpiItems.map(([type, count]) => {
              const meta = TYPE_META[type] || TYPE_META['SC Bill'];
              return (
                <div key={type} className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-sm">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">{type}</p>
                  <p className="text-2xl font-bold text-slate-800 leading-none">{count}</p>
                  <p className="text-[11px] text-slate-500 mt-1">pending</p>
                </div>
              );
            })}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && total === 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm py-20 text-center">
            <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-5"
              style={{ background:`linear-gradient(135deg, ${Theme.navyLight}22 0%, ${Theme.navy}11 100%)` }}>
              <CheckCheck className="w-10 h-10" style={{ color: Theme.navy }} />
            </div>
            <h2 className="text-xl font-bold text-slate-700">All Clear!</h2>
            <p className="text-sm text-slate-400 mt-2 max-w-xs mx-auto">
              You have no pending approvals right now. New items will appear here automatically.
            </p>
            <div className="flex items-center justify-center gap-3 mt-6">
              <button onClick={() => navigate('/dashboard')}
                className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white rounded-xl"
                style={{ background:`linear-gradient(135deg, ${Theme.navyLight} 0%, ${Theme.navyDark} 100%)` }}>
                Go to Dashboard <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Loading state */}
        {isLoading && (
          <div className="space-y-3">
            {[1,2,3,4,5].map(n => (
              <div key={n} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                <div className="flex gap-3">
                  <div className="w-9 h-9 bg-slate-100 rounded-xl animate-pulse flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 bg-slate-100 rounded animate-pulse w-1/4" />
                    <div className="h-3 bg-slate-100 rounded animate-pulse w-1/2" />
                    <div className="h-3 bg-slate-100 rounded animate-pulse w-1/3" />
                  </div>
                  <div className="flex gap-2">
                    <div className="w-20 h-8 bg-slate-100 rounded-lg animate-pulse" />
                    <div className="w-16 h-8 bg-slate-100 rounded-lg animate-pulse" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {!isLoading && total > 0 && (
          <>
            {/* Search + Tab filters */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1 max-w-sm">
                <svg className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search by ref no., party, project…"
                  className="pl-9 pr-3 py-2 border border-slate-200 bg-white rounded-xl text-sm w-full focus:outline-none shadow-sm" />
              </div>
              <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 shadow-sm overflow-x-auto">
                {tabs.map(tab => (
                  <button key={tab} onClick={() => setFilter(tab)}
                    className={clsx('px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all',
                      filter === tab ? 'text-white shadow-sm' : 'text-slate-600 hover:text-slate-800 hover:bg-slate-50')}
                    style={filter === tab ? { background:`linear-gradient(135deg, ${Theme.navyLight} 0%, ${Theme.navyDark} 100%)` } : {}}>
                    {tab}
                    {tab !== 'All' && (
                      <span className="ml-1.5 opacity-70">
                        ({summary[tab] || 0})
                      </span>
                    )}
                    {tab === 'All' && <span className="ml-1.5 opacity-70">({total})</span>}
                  </button>
                ))}
              </div>
            </div>

            {/* Urgent section */}
            {urgent.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-5 rounded-full bg-red-500" />
                  <h2 className="text-sm font-bold text-red-700">
                    Urgent — Pending 3+ Days ({urgent.length})
                  </h2>
                  <span className="text-xs text-slate-400">These items need immediate attention</span>
                </div>
                <div className="space-y-2.5">
                  {urgent.map(item => (
                    <ApprovalCard key={item.id + item.entity_type}
                      item={item}
                      onApprove={handleApprove}
                      onReject={handleReject}
                      onView={handleView}
                      onMDReview={handleMDReview} />
                  ))}
                </div>
              </div>
            )}

            {/* Normal section */}
            {normal.length > 0 && (
              <div>
                {urgent.length > 0 && (
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-2 h-5 rounded-full bg-blue-400" />
                    <h2 className="text-sm font-bold text-slate-700">
                      Recent — Last 3 Days ({normal.length})
                    </h2>
                  </div>
                )}
                <div className="space-y-2.5">
                  {normal.map(item => (
                    <ApprovalCard key={item.id + item.entity_type}
                      item={item}
                      onApprove={handleApprove}
                      onReject={handleReject}
                      onView={handleView}
                      onMDReview={handleMDReview} />
                  ))}
                </div>
              </div>
            )}

            {/* No results after filter */}
            {filtered.length === 0 && (
              <div className="bg-white rounded-xl border border-slate-100 py-12 text-center shadow-sm">
                <p className="text-slate-400 font-medium">No items match your filter</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Action modal */}
      {actionModal && (
        <ActionModal
          item={actionModal.item}
          actionType={actionModal.type}
          onConfirm={handleConfirm}
          onClose={() => setAction(null)} />
      )}

      {/* MD Authorization modal (MRS only) */}
      {mdModal && (
        <MDAuthModal
          mrsId={mdModal.id}
          mrsRef={mdModal.ref}
          onClose={() => setMDModal(null)}
          onAuthorized={() => qc.invalidateQueries({ queryKey: ['my-approvals'] })} />
      )}
    </div>
  );
}
