// src/pages/tender-mgmt/TenderIssuanceDetailPage.jsx
// Section A — Detail: scope items, invited vendors, bids, comparison, award
import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Gavel, FileText, Users, BarChart3, Award, Send,
  Plus, Trash2, X, CheckCircle2, XCircle, Loader2, IndianRupee,
  Calendar, Clock, Building2, Package, AlertCircle, ShieldCheck,
  ChevronDown, ChevronUp, Tag, Layers,
} from 'lucide-react';
import { tenderAPI } from '../../api/client';
import api from '../../api/client';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtL = (n) => n != null ? `₹${parseFloat(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';
const fmtCr = (n) => n != null ? `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';

const STATUS_LABEL = {
  draft:'Draft', published:'Published', bid_open:'Bid Open',
  evaluation:'Evaluation', awarded:'Awarded', cancelled:'Cancelled',
};
const STATUS_COLORS = {
  draft:      'bg-slate-100 text-slate-900 border border-slate-200',
  published:  'bg-blue-50 text-blue-700 border border-blue-200',
  bid_open:   'bg-violet-50 text-violet-700 border border-violet-200',
  evaluation: 'bg-amber-50 text-amber-700 border border-amber-200',
  awarded:    'bg-emerald-50 text-emerald-700 border border-emerald-200',
  cancelled:  'bg-red-50 text-red-600 border border-red-200',
};

const WORKFLOW_STEPS = [
  { key: 'draft',      label: 'Draft' },
  { key: 'published',  label: 'Published' },
  { key: 'bid_open',   label: 'Bids Open' },
  { key: 'evaluation', label: 'Evaluation' },
  { key: 'awarded',    label: 'Awarded' },
];
const STEP_IDX = { draft: 0, published: 1, bid_open: 2, evaluation: 3, awarded: 4, cancelled: -1 };

const TABS = [
  { key: 'overview',  label: 'Overview',    icon: FileText },
  { key: 'scope',     label: 'Scope Items', icon: Layers },
  { key: 'vendors',   label: 'Vendors',     icon: Users },
  { key: 'bids',      label: 'Bids',        icon: BarChart3 },
  { key: 'comparison',label: 'Comparison',  icon: Award },
];

// ─────────────────────────────────────────────────────────────────────────────
export default function TenderIssuanceDetailPage() {
  const { id }  = useParams();
  const navigate = useNavigate();
  const qc       = useQueryClient();

  const [tab, setTab]             = useState('overview');
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [showAddScope, setShowAddScope] = useState(false);
  const [scopeForm, setScopeForm] = useState({ item_code:'', description:'', unit:'', quantity:'' });
  const [showAddVendor, setShowAddVendor] = useState(false);
  const [vendorSearch, setVendorSearch]   = useState('');
  const [selectedVids, setSelectedVids]   = useState([]);
  const [showAddBid, setShowAddBid]       = useState(false);
  const [bidForm, setBidForm] = useState({
    vendor_id:'', bid_reference:'', submission_date:'', bid_amount:'',
    discount_pct:'0', validity_days:'90', completion_days:'', remarks:'',
    technical_score:'', financial_score:'', emd_submitted: false, emd_reference:'',
  });
  const [awardBidId, setAwardBidId]   = useState('');
  const [showAward, setShowAward]     = useState(false);
  const [editScoped, setEditScoped]   = useState(null);

  // ── Main data ────────────────────────────────────────────────────────────────
  const { data, isLoading, isError } = useQuery({
    queryKey: ['ti-detail', id],
    queryFn:  () => tenderAPI.get(id).then(r => r.data?.data),
    enabled:  !!id,
  });
  const tender = data;

  // ── Bids (refreshed separately on bids tab) ──────────────────────────────────
  const { data: bidsData, isLoading: bidsLoading } = useQuery({
    queryKey: ['ti-bids', id],
    queryFn:  () => tenderAPI.listBids(id).then(r => r.data?.data ?? []),
    enabled:  !!id && ['bids','comparison'].includes(tab),
  });
  const bids = bidsData || [];

  // ── Comparison ───────────────────────────────────────────────────────────────
  const { data: compData } = useQuery({
    queryKey: ['ti-comparison', id],
    queryFn:  () => tenderAPI.getBidComparison(id).then(r => r.data),
    enabled:  !!id && tab === 'comparison',
  });

  // ── Vendor search ────────────────────────────────────────────────────────────
  const { data: vendorList } = useQuery({
    queryKey: ['vendors-list', vendorSearch],
    queryFn:  () => api.get('/vendors', { params: { search: vendorSearch, limit: 20 } })
                    .then(r => (Array.isArray(r.data) ? r.data : r.data?.data ?? [])),
    enabled:  showAddVendor,
  });

  // ── Mutations ────────────────────────────────────────────────────────────────
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['ti-detail', id] });
    qc.invalidateQueries({ queryKey: ['ti-list'] });
    qc.invalidateQueries({ queryKey: ['ti-stats'] });
  };

  const publishMut = useMutation({
    mutationFn: () => tenderAPI.publish(id),
    onSuccess: () => { invalidate(); toast.success('Tender published'); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });
  const openBidsMut = useMutation({
    mutationFn: () => tenderAPI.openBids(id),
    onSuccess: () => { invalidate(); toast.success('Bids opened'); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });
  const evaluateMut = useMutation({
    mutationFn: () => tenderAPI.evaluate(id),
    onSuccess: () => { invalidate(); toast.success('Moved to evaluation'); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });
  const cancelMut = useMutation({
    mutationFn: (d) => tenderAPI.cancel(id, d),
    onSuccess: () => { invalidate(); setShowCancel(false); toast.success('Tender cancelled'); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });
  const awardMut = useMutation({
    mutationFn: (d) => tenderAPI.award(id, d),
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ['ti-bids', id] });
      setShowAward(false);
      toast.success('Tender awarded! PO created.');
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });

  // Scope items
  const addScopeMut = useMutation({
    mutationFn: (d) => tenderAPI.addScopeItem(id, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ti-detail', id] }); setShowAddScope(false); setScopeForm({ item_code:'', description:'', unit:'', quantity:'' }); toast.success('Item added'); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });
  const updateScopeMut = useMutation({
    mutationFn: ({ iid, d }) => tenderAPI.updateScopeItem(id, iid, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ti-detail', id] }); setEditScoped(null); toast.success('Item updated'); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });
  const removeScopeMut = useMutation({
    mutationFn: (iid) => tenderAPI.removeScopeItem(id, iid),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ti-detail', id] }); toast.success('Item removed'); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });

  // Vendors
  const inviteVendorsMut = useMutation({
    mutationFn: (d) => tenderAPI.inviteVendors(id, d),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['ti-detail', id] });
      setShowAddVendor(false); setSelectedVids([]);
      toast.success(`${r.data?.inserted_count || 0} vendor(s) invited`);
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });
  const removeVendorMut = useMutation({
    mutationFn: (vid) => tenderAPI.removeVendor(id, vid),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ti-detail', id] }); toast.success('Vendor removed'); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });

  // Bids
  const addBidMut = useMutation({
    mutationFn: (d) => tenderAPI.submitBid(id, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ti-bids', id] });
      qc.invalidateQueries({ queryKey: ['ti-comparison', id] });
      setShowAddBid(false);
      setBidForm({ vendor_id:'', bid_reference:'', submission_date:'', bid_amount:'', discount_pct:'0', validity_days:'90', completion_days:'', remarks:'', technical_score:'', financial_score:'', emd_submitted: false, emd_reference:'' });
      toast.success('Bid recorded');
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Bid already exists for this vendor'),
  });

  // ── Loading / error states ────────────────────────────────────────────────────
  if (isLoading) return (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="w-7 h-7 animate-spin text-cyan-500" />
    </div>
  );
  if (isError || !tender) return (
    <div className="flex flex-col items-center justify-center h-full text-slate-900 font-medium gap-3">
      <AlertCircle className="w-8 h-8 text-red-400" />
      <p>Tender not found</p>
      <button onClick={() => navigate(-1)} className="text-sm text-cyan-600 hover:underline">Go back</button>
    </div>
  );

  const stepIdx = STEP_IDX[tender.status] ?? -1;
  const isCancelled = tender.status === 'cancelled';

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex-shrink-0">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => navigate('/tender-management/issue')}
            className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
            <ArrowLeft className="w-4 h-4 text-slate-600" />
          </button>
          <div className="w-8 h-8 rounded-lg bg-cyan-100 flex items-center justify-center">
            <Gavel className="w-4 h-4 text-cyan-700" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono text-slate-500">{tender.tender_number}</span>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[tender.status]}`}>
                {STATUS_LABEL[tender.status]}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-900 capitalize border border-slate-200">
                {tender.tender_type}
              </span>
            </div>
            <h1 className="font-medium text-slate-900 font-medium truncate">{tender.title}</h1>
          </div>
        </div>

        {/* Workflow stepper */}
        {!isCancelled && (
          <div className="flex items-center gap-0 mb-3 overflow-x-auto">
            {WORKFLOW_STEPS.map((step, i) => {
              const done    = i < stepIdx;
              const current = i === stepIdx;
              return (
                <React.Fragment key={step.key}>
                  <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium flex-shrink-0 ${
                    current ? 'bg-cyan-600 text-white' :
                    done    ? 'bg-emerald-100 text-emerald-700' :
                              'bg-slate-100 text-slate-400'
                  }`}>
                    {done && <CheckCircle2 className="w-3 h-3" />}
                    {step.label}
                  </div>
                  {i < WORKFLOW_STEPS.length - 1 && (
                    <div className={`h-px w-6 flex-shrink-0 ${i < stepIdx ? 'bg-emerald-300' : 'bg-slate-200'}`} />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {tender.status === 'draft' && (
            <button onClick={() => publishMut.mutate()} disabled={publishMut.isPending}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-60 transition-colors">
              <Send className="w-3.5 h-3.5" /> Publish Tender
            </button>
          )}
          {tender.status === 'published' && (
            <button onClick={() => openBidsMut.mutate()} disabled={openBidsMut.isPending}
              className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-60 transition-colors">
              <Users className="w-3.5 h-3.5" /> Open Bid Submission
            </button>
          )}
          {tender.status === 'bid_open' && (
            <button onClick={() => { evaluateMut.mutate(); setTab('bids'); }} disabled={evaluateMut.isPending}
              className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-60 transition-colors">
              <BarChart3 className="w-3.5 h-3.5" /> Start Evaluation
            </button>
          )}
          {tender.status === 'evaluation' && (
            <button onClick={() => setShowAward(true)}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors">
              <Award className="w-3.5 h-3.5" /> Award Tender
            </button>
          )}
          {!['awarded','cancelled'].includes(tender.status) && (
            <button onClick={() => setShowCancel(true)}
              className="flex items-center gap-1.5 border border-red-200 text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors">
              <XCircle className="w-3.5 h-3.5" /> Cancel
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-slate-200 px-6 flex-shrink-0">
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                  tab === t.key
                    ? 'border-cyan-500 text-cyan-700'
                    : 'border-transparent text-slate-900 font-medium hover:text-slate-700'
                }`}>
                <Icon className="w-3.5 h-3.5" />{t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* ── Overview ────────────────────────────────────────────────────── */}
        {tab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-4xl">
            {/* Tender Details */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="font-medium text-slate-900 mb-4 flex items-center gap-2">
                <FileText className="w-4 h-4 text-cyan-500" /> Tender Details
              </h3>
              <dl className="space-y-3 text-sm">
                {[
                  ['Tender Number',  tender.tender_number],
                  ['Type',           tender.tender_type],
                  ['Work Package',   tender.work_package || '—'],
                  ['Project',        tender.project_name || '—'],
                  ['Project Code',   tender.project_code || '—'],
                  ['Created By',     tender.created_by_name || '—'],
                  ['Published By',   tender.published_by_name || '—'],
                  ['Published At',   tender.published_at ? dayjs(tender.published_at).format('DD MMM YYYY') : '—'],
                ].map(([l, v]) => (
                  <div key={l} className="flex gap-2">
                    <dt className="text-slate-900 font-medium w-32 flex-shrink-0">{l}</dt>
                    <dd className="text-slate-900 font-medium capitalize">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* Financial & Dates */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="font-medium text-slate-900 mb-4 flex items-center gap-2">
                <IndianRupee className="w-4 h-4 text-emerald-500" /> Financial & Dates
              </h3>
              <dl className="space-y-3 text-sm">
                {[
                  ['Estimated Value',   fmtL(tender.estimated_value)],
                  ['Awarded Amount',    tender.awarded_amount ? fmtL(tender.awarded_amount) : '—'],
                  ['Awarded Vendor',    tender.awarded_vendor_name || '—'],
                  ['Award Date',        tender.award_date ? dayjs(tender.award_date).format('DD MMM YYYY') : '—'],
                  ['Pre-Bid Date',      tender.pre_bid_date ? dayjs(tender.pre_bid_date).format('DD MMM YYYY') : '—'],
                  ['Bid Close Date',    tender.bid_close_date ? dayjs(tender.bid_close_date).format('DD MMM YYYY') : '—'],
                  ['Expected Start',    tender.expected_start_date ? dayjs(tender.expected_start_date).format('DD MMM YYYY') : '—'],
                  ['Duration',          tender.contract_duration ? `${tender.contract_duration} days` : '—'],
                ].map(([l, v]) => (
                  <div key={l} className="flex gap-2">
                    <dt className="text-slate-900 font-medium w-32 flex-shrink-0">{l}</dt>
                    <dd className="text-slate-900 font-medium font-medium">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* EMD */}
            {tender.emd_required && (
              <div className="bg-amber-50 rounded-xl border border-amber-200 p-5">
                <h3 className="font-medium text-amber-700 mb-3 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4" /> EMD Details
                </h3>
                <dl className="space-y-2 text-sm">
                  <div className="flex gap-2"><dt className="text-amber-600 w-28">EMD Amount</dt><dd className="font-medium text-amber-800">{fmtL(tender.emd_amount)}</dd></div>
                </dl>
              </div>
            )}

            {/* Description */}
            {tender.description && (
              <div className="bg-white rounded-xl border border-slate-200 p-5 md:col-span-2">
                <h3 className="font-medium text-slate-900 mb-2">Description</h3>
                <p className="text-sm text-slate-900 leading-relaxed whitespace-pre-wrap">{tender.description}</p>
              </div>
            )}

            {/* Cancellation notice */}
            {tender.status === 'cancelled' && tender.cancellation_reason && (
              <div className="bg-red-50 rounded-xl border border-red-200 p-4 md:col-span-2">
                <p className="text-sm font-medium text-red-700 mb-1">Cancellation Reason</p>
                <p className="text-sm text-red-600">{tender.cancellation_reason}</p>
              </div>
            )}
          </div>
        )}

        {/* ── Scope Items ─────────────────────────────────────────────────── */}
        {tab === 'scope' && (
          <div className="max-w-3xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-slate-700">Scope Items ({tender.scope_items?.length ?? 0})</h3>
              {!['awarded','cancelled'].includes(tender.status) && (
                <button onClick={() => setShowAddScope(true)}
                  className="flex items-center gap-1.5 bg-cyan-600 hover:bg-cyan-700 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors">
                  <Plus className="w-3.5 h-3.5" /> Add Item
                </button>
              )}
            </div>

            {!tender.scope_items?.length ? (
              <div className="bg-white rounded-xl border border-slate-200 py-12 text-center">
                <Layers className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-slate-500">No scope items yet</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-left">
                      <th className="px-4 py-3 font-medium text-slate-900 font-medium w-10">#</th>
                      <th className="px-4 py-3 font-medium text-slate-500">Item Code</th>
                      <th className="px-4 py-3 font-medium text-slate-500">Description</th>
                      <th className="px-4 py-3 font-medium text-slate-500">Unit</th>
                      <th className="px-4 py-3 font-medium text-slate-900 font-medium text-right">Quantity</th>
                      {!['awarded','cancelled'].includes(tender.status) && (
                        <th className="px-4 py-3 w-20" />
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {tender.scope_items.map((item, idx) => (
                      <tr key={item.id} className="hover:bg-slate-50">
                        {editScoped?.id === item.id ? (
                          <>
                            <td className="px-4 py-2 text-slate-400">{idx + 1}</td>
                            <td className="px-4 py-2"><input className="border rounded px-2 py-1 text-xs w-full focus:outline-none focus:ring-1 focus:ring-cyan-300" value={editScoped.item_code} onChange={e => setEditScoped(s => ({...s, item_code: e.target.value}))} /></td>
                            <td className="px-4 py-2"><input className="border rounded px-2 py-1 text-xs w-full focus:outline-none focus:ring-1 focus:ring-cyan-300" value={editScoped.description} onChange={e => setEditScoped(s => ({...s, description: e.target.value}))} /></td>
                            <td className="px-4 py-2"><input className="border rounded px-2 py-1 text-xs w-20 focus:outline-none focus:ring-1 focus:ring-cyan-300" value={editScoped.unit} onChange={e => setEditScoped(s => ({...s, unit: e.target.value}))} /></td>
                            <td className="px-4 py-2 text-right"><input type="number" className="border rounded px-2 py-1 text-xs w-24 focus:outline-none focus:ring-1 focus:ring-cyan-300 text-right" value={editScoped.quantity} onChange={e => setEditScoped(s => ({...s, quantity: e.target.value}))} /></td>
                            <td className="px-4 py-2">
                              <div className="flex gap-1">
                                <button onClick={() => updateScopeMut.mutate({ iid: item.id, d: editScoped })} className="text-emerald-600 hover:bg-emerald-50 rounded p-1"><CheckCircle2 className="w-4 h-4" /></button>
                                <button onClick={() => setEditScoped(null)} className="text-slate-900 font-medium hover:bg-slate-100 rounded p-1"><X className="w-4 h-4" /></button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-4 py-2.5 text-slate-400">{idx + 1}</td>
                            <td className="px-4 py-2.5 font-mono text-slate-900 text-xs">{item.item_code || '—'}</td>
                            <td className="px-4 py-2.5 text-black">{item.description}</td>
                            <td className="px-4 py-2.5 text-slate-600">{item.unit}</td>
                            <td className="px-4 py-2.5 text-right text-black">{parseFloat(item.quantity || 0).toLocaleString('en-IN')}</td>
                            {!['awarded','cancelled'].includes(tender.status) && (
                              <td className="px-4 py-2.5">
                                <div className="flex gap-1 justify-end">
                                  <button onClick={() => setEditScoped({ ...item })} className="p-1 text-slate-900 font-medium hover:text-cyan-600 hover:bg-cyan-50 rounded"><FileText className="w-3.5 h-3.5" /></button>
                                  <button onClick={() => { if (window.confirm('Remove this item?')) removeScopeMut.mutate(item.id); }} className="p-1 text-slate-900 font-medium hover:text-red-600 hover:bg-red-50 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                                </div>
                              </td>
                            )}
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Add scope modal */}
            {showAddScope && (
              <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-medium text-black">Add Scope Item</h3>
                    <button onClick={() => setShowAddScope(false)} className="p-1 hover:bg-slate-100 rounded"><X className="w-4 h-4" /></button>
                  </div>
                  <div className="space-y-3">
                    <input placeholder="Item Code (optional)" value={scopeForm.item_code} onChange={e => setScopeForm(f => ({...f, item_code: e.target.value}))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300" />
                    <input placeholder="Description *" value={scopeForm.description} onChange={e => setScopeForm(f => ({...f, description: e.target.value}))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300" />
                    <div className="grid grid-cols-2 gap-2">
                      <input placeholder="Unit (e.g. sqm)" value={scopeForm.unit} onChange={e => setScopeForm(f => ({...f, unit: e.target.value}))} className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300" />
                      <input type="number" placeholder="Quantity" value={scopeForm.quantity} onChange={e => setScopeForm(f => ({...f, quantity: e.target.value}))} className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300" />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 mt-4">
                    <button onClick={() => setShowAddScope(false)} className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600">Cancel</button>
                    <button onClick={() => addScopeMut.mutate(scopeForm)} disabled={!scopeForm.description || addScopeMut.isPending}
                      className="px-4 py-2 text-sm bg-cyan-600 text-white rounded-lg font-medium disabled:opacity-60 flex items-center gap-2">
                      {addScopeMut.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Add Item
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Invited Vendors ─────────────────────────────────────────────── */}
        {tab === 'vendors' && (
          <div className="max-w-3xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-slate-700">
                Invited Vendors ({tender.invited_vendors?.length ?? 0})
              </h3>
              {!['awarded','cancelled'].includes(tender.status) && (
                <button onClick={() => setShowAddVendor(true)}
                  className="flex items-center gap-1.5 bg-cyan-600 hover:bg-cyan-700 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors">
                  <Plus className="w-3.5 h-3.5" /> Invite Vendors
                </button>
              )}
            </div>

            {!tender.invited_vendors?.length ? (
              <div className="bg-white rounded-xl border border-slate-200 py-12 text-center">
                <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-slate-500">No vendors invited yet</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-left">
                      <th className="px-4 py-3 font-medium text-slate-500">Vendor</th>
                      <th className="px-4 py-3 font-medium text-slate-500">Contact</th>
                      <th className="px-4 py-3 font-medium text-slate-500">Email</th>
                      <th className="px-4 py-3 font-medium text-slate-500">Responded</th>
                      <th className="px-4 py-3 font-medium text-slate-500">Invited At</th>
                      {!['awarded','cancelled'].includes(tender.status) && <th className="px-4 py-3 w-16" />}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {tender.invited_vendors.map(v => (
                      <tr key={v.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <div className="font-medium text-black">{v.vendor_name}</div>
                          <div className="text-xs text-slate-400">{v.vendor_code}</div>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{v.contact_person || '—'}</td>
                        <td className="px-4 py-3 text-slate-600">{v.email || '—'}</td>
                        <td className="px-4 py-3">
                          {v.responded
                            ? <span className="flex items-center gap-1 text-emerald-600 text-xs font-medium"><CheckCircle2 className="w-3.5 h-3.5" /> Yes</span>
                            : <span className="text-slate-900 font-medium text-xs">Pending</span>
                          }
                        </td>
                        <td className="px-4 py-3 text-slate-900 font-medium text-xs">{dayjs(v.invited_at).format('DD MMM YY')}</td>
                        {!['awarded','cancelled'].includes(tender.status) && (
                          <td className="px-4 py-3">
                            <button onClick={() => removeVendorMut.mutate(v.vendor_id)}
                              className="p-1 text-slate-900 font-medium hover:text-red-600 hover:bg-red-50 rounded">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Invite vendors modal */}
            {showAddVendor && (
              <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[80vh]">
                  <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
                    <h3 className="font-medium text-black">Invite Vendors</h3>
                    <button onClick={() => { setShowAddVendor(false); setSelectedVids([]); }} className="p-1 hover:bg-slate-100 rounded"><X className="w-4 h-4" /></button>
                  </div>
                  <div className="p-4 border-b border-slate-100">
                    <input
                      placeholder="Search vendors..."
                      value={vendorSearch}
                      onChange={e => setVendorSearch(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300"
                    />
                  </div>
                  <div className="flex-1 overflow-y-auto p-2">
                    {(vendorList || []).map(v => {
                      const sel = selectedVids.includes(v.id);
                      return (
                        <button key={v.id} onClick={() => setSelectedVids(prev => sel ? prev.filter(x => x !== v.id) : [...prev, v.id])}
                          className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-left text-sm transition-colors ${sel ? 'bg-cyan-50 border border-cyan-200' : 'hover:bg-slate-50'}`}>
                          <div className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${sel ? 'bg-cyan-600 border-cyan-600' : 'border-slate-300'}`}>
                            {sel && <CheckCircle2 className="w-3 h-3 text-white" />}
                          </div>
                          <div>
                            <div className="font-medium text-black">{v.name}</div>
                            <div className="text-xs text-slate-400">{v.vendor_code} · {v.contact_person}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100">
                    <span className="text-xs text-slate-500">{selectedVids.length} selected</span>
                    <div className="flex gap-2">
                      <button onClick={() => { setShowAddVendor(false); setSelectedVids([]); }} className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg text-slate-600">Cancel</button>
                      <button onClick={() => inviteVendorsMut.mutate({ vendor_ids: selectedVids })} disabled={!selectedVids.length || inviteVendorsMut.isPending}
                        className="px-4 py-1.5 text-sm bg-cyan-600 text-white rounded-lg font-medium disabled:opacity-60 flex items-center gap-2">
                        {inviteVendorsMut.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Invite Selected
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Bids ────────────────────────────────────────────────────────── */}
        {tab === 'bids' && (
          <div className="max-w-4xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-slate-700">Received Bids ({bids.length})</h3>
              {['bid_open','evaluation'].includes(tender.status) && (
                <button onClick={() => setShowAddBid(true)}
                  className="flex items-center gap-1.5 bg-cyan-600 hover:bg-cyan-700 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors">
                  <Plus className="w-3.5 h-3.5" /> Record Bid
                </button>
              )}
            </div>

            {bidsLoading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-cyan-500" /></div>
            ) : !bids.length ? (
              <div className="bg-white rounded-xl border border-slate-200 py-12 text-center">
                <BarChart3 className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-slate-500">No bids received yet</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-left">
                      <th className="px-4 py-3 font-medium text-slate-500">Vendor</th>
                      <th className="px-4 py-3 font-medium text-slate-500">Bid Ref</th>
                      <th className="px-4 py-3 font-medium text-slate-900 font-medium text-right">Bid Amount</th>
                      <th className="px-4 py-3 font-medium text-slate-900 font-medium text-right">Disc%</th>
                      <th className="px-4 py-3 font-medium text-slate-900 font-medium text-right">Final Amount</th>
                      <th className="px-4 py-3 font-medium text-slate-900 font-medium text-center">T-Score</th>
                      <th className="px-4 py-3 font-medium text-slate-900 font-medium text-center">F-Score</th>
                      <th className="px-4 py-3 font-medium text-slate-500">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {bids.map(b => (
                      <tr key={b.id} className={`hover:bg-slate-50 ${b.is_winner ? 'bg-emerald-50' : ''}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {b.is_winner && <Award className="w-4 h-4 text-emerald-600 flex-shrink-0" />}
                            <div>
                              <div className="font-medium text-black">{b.vendor_name}</div>
                              {b.submission_date && <div className="text-xs text-slate-400">{dayjs(b.submission_date).format('DD MMM YY')}</div>}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-900 text-xs">{b.bid_reference || '—'}</td>
                        <td className="px-4 py-3 text-right text-slate-700">{fmtL(b.bid_amount)}</td>
                        <td className="px-4 py-3 text-right text-slate-500">{b.discount_pct || 0}%</td>
                        <td className="px-4 py-3 text-right font-medium text-black">{fmtL(b.final_amount)}</td>
                        <td className="px-4 py-3 text-center text-slate-600">{b.technical_score ?? '—'}</td>
                        <td className="px-4 py-3 text-center text-slate-600">{b.financial_score ?? '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            b.status === 'awarded'     ? 'bg-emerald-100 text-emerald-700' :
                            b.status === 'shortlisted' ? 'bg-blue-100 text-blue-700' :
                            b.status === 'rejected'    ? 'bg-red-100 text-red-600' :
                                                         'bg-slate-100 text-slate-600'
                          }`}>{b.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Record Bid Modal */}
            {showAddBid && (
              <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
                  <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
                    <h3 className="font-medium text-black">Record Vendor Bid</h3>
                    <button onClick={() => setShowAddBid(false)} className="p-1 hover:bg-slate-100 rounded"><X className="w-4 h-4" /></button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-5 space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-900 mb-1">Vendor *</label>
                      <select value={bidForm.vendor_id} onChange={e => setBidForm(f => ({...f, vendor_id: e.target.value}))}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300">
                        <option value="">— Select Vendor —</option>
                        {(tender.invited_vendors || []).map(v => (
                          <option key={v.vendor_id} value={v.vendor_id}>{v.vendor_name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-900 mb-1">Bid Reference</label>
                        <input value={bidForm.bid_reference} onChange={e => setBidForm(f => ({...f, bid_reference: e.target.value}))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-900 mb-1">Submission Date</label>
                        <input type="date" value={bidForm.submission_date} onChange={e => setBidForm(f => ({...f, submission_date: e.target.value}))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-900 mb-1">Bid Amount (₹) *</label>
                        <input type="number" min="0" value={bidForm.bid_amount} onChange={e => setBidForm(f => ({...f, bid_amount: e.target.value}))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-900 mb-1">Discount %</label>
                        <input type="number" min="0" max="100" value={bidForm.discount_pct} onChange={e => setBidForm(f => ({...f, discount_pct: e.target.value}))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-900 mb-1">Technical Score</label>
                        <input type="number" min="0" max="100" value={bidForm.technical_score} onChange={e => setBidForm(f => ({...f, technical_score: e.target.value}))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-900 mb-1">Financial Score</label>
                        <input type="number" min="0" max="100" value={bidForm.financial_score} onChange={e => setBidForm(f => ({...f, financial_score: e.target.value}))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-900 mb-1">Completion (days)</label>
                        <input type="number" min="1" value={bidForm.completion_days} onChange={e => setBidForm(f => ({...f, completion_days: e.target.value}))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300" />
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <input type="checkbox" id="emd_sub" checked={bidForm.emd_submitted} onChange={e => setBidForm(f => ({...f, emd_submitted: e.target.checked}))} className="accent-cyan-600" />
                      <label htmlFor="emd_sub" className="text-sm text-slate-600">EMD Submitted</label>
                      {bidForm.emd_submitted && (
                        <input value={bidForm.emd_reference} onChange={e => setBidForm(f => ({...f, emd_reference: e.target.value}))} placeholder="EMD Reference" className="ml-2 border border-slate-200 rounded-lg px-3 py-1.5 text-sm w-40 focus:outline-none focus:ring-2 focus:ring-cyan-300" />
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-900 mb-1">Remarks</label>
                      <textarea value={bidForm.remarks} onChange={e => setBidForm(f => ({...f, remarks: e.target.value}))} rows={2} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300 resize-none" />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-100">
                    <button onClick={() => setShowAddBid(false)} className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600">Cancel</button>
                    <button onClick={() => addBidMut.mutate(bidForm)} disabled={!bidForm.vendor_id || !bidForm.bid_amount || addBidMut.isPending}
                      className="px-4 py-2 text-sm bg-cyan-600 text-white rounded-lg font-medium disabled:opacity-60 flex items-center gap-2">
                      {addBidMut.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Record Bid
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Bid Comparison ──────────────────────────────────────────────── */}
        {tab === 'comparison' && (
          <div className="max-w-full space-y-5">
            {!compData || !compData.bids?.length ? (
              <div className="bg-white rounded-xl border border-slate-200 py-16 text-center">
                <BarChart3 className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-slate-900 font-medium font-medium">No bids to compare yet</p>
                <p className="text-slate-900 font-medium text-sm">Record bids from the Bids tab first</p>
              </div>
            ) : (
              <>
                {/* L1 Analysis */}
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-5 py-3 bg-slate-50 border-b border-slate-200">
                    <h3 className="font-medium text-slate-700">L1 Analysis</h3>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-left border-b border-slate-100">
                        <th className="px-4 py-3 font-medium text-slate-500">Rank</th>
                        <th className="px-4 py-3 font-medium text-slate-500">Vendor</th>
                        <th className="px-4 py-3 font-medium text-slate-900 font-medium text-right">Final Amount</th>
                        <th className="px-4 py-3 font-medium text-slate-900 font-medium text-right">% over L1</th>
                        <th className="px-4 py-3 font-medium text-slate-900 font-medium text-center">Tech Score</th>
                        <th className="px-4 py-3 font-medium text-slate-900 font-medium text-center">Fin Score</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(compData.l1_analysis || []).map(b => (
                        <tr key={b.bid_id} className={`${b.is_l1 ? 'bg-emerald-50' : 'hover:bg-slate-50'}`}>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-medium px-2 py-1 rounded ${b.is_l1 ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                              L{b.rank}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-medium text-slate-900 font-medium flex items-center gap-2">
                            {b.is_l1 && <Award className="w-4 h-4 text-emerald-600" />}
                            {b.vendor_name}
                            {b.is_winner && <span className="text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">AWARDED</span>}
                          </td>
                          <td className="px-4 py-3 text-right font-medium text-black">{fmtL(b.final_amount)}</td>
                          <td className={`px-4 py-3 text-right font-medium ${b.is_l1 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {b.is_l1 ? '—' : `+${b.premium_over_l1_pct}%`}
                          </td>
                          <td className="px-4 py-3 text-center text-slate-600">{b.technical_score ?? '—'}</td>
                          <td className="px-4 py-3 text-center text-slate-600">{b.financial_score ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Scope-wise comparison matrix */}
                {compData.scope_items?.length > 0 && compData.bids?.length > 0 && (
                  <div className="bg-white rounded-xl border border-slate-200 overflow-auto">
                    <div className="px-5 py-3 bg-slate-50 border-b border-slate-200">
                      <h3 className="font-medium text-slate-700">Item-wise Rate Comparison</h3>
                    </div>
                    <table className="w-full text-sm min-w-max">
                      <thead>
                        <tr className="bg-slate-50 text-left border-b border-slate-100">
                          <th className="px-4 py-3 font-medium text-slate-500">Item</th>
                          <th className="px-4 py-3 font-medium text-slate-500">Description</th>
                          <th className="px-4 py-3 font-medium text-slate-500">Unit</th>
                          <th className="px-4 py-3 font-medium text-slate-900 font-medium text-right">Qty</th>
                          {compData.bids.map(b => (
                            <th key={b.id} className="px-4 py-3 font-medium text-slate-900 font-medium text-right whitespace-nowrap">
                              {b.vendor_name}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {compData.scope_items.map(si => (
                          <tr key={si.id} className="hover:bg-slate-50">
                            <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{si.item_code || '—'}</td>
                            <td className="px-4 py-2.5 text-black">{si.description}</td>
                            <td className="px-4 py-2.5 text-slate-500">{si.unit}</td>
                            <td className="px-4 py-2.5 text-right text-slate-600">{parseFloat(si.quantity || 0).toLocaleString('en-IN')}</td>
                            {compData.bids.map(b => {
                              const cell = compData.matrix?.[si.id]?.[b.id];
                              return (
                                <td key={b.id} className="px-4 py-2.5 text-right">
                                  {cell?.unit_rate != null
                                    ? <div>
                                        <div className="font-medium text-black">{fmtL(cell.unit_rate)}</div>
                                        <div className="text-xs text-slate-400">{fmtL(cell.amount)}</div>
                                      </div>
                                    : <span className="text-slate-300">—</span>
                                  }
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                        {/* Total row */}
                        <tr className="bg-slate-50 font-semibold">
                          <td colSpan={4} className="px-4 py-3 text-right text-slate-600">Final Bid Total</td>
                          {compData.bids.map(b => (
                            <td key={b.id} className={`px-4 py-3 text-right ${b.is_winner ? 'text-emerald-700' : 'text-black'}`}>
                              {fmtL(b.final_amount || b.bid_amount)}
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Cancel Modal ──────────────────────────────────────────────────────── */}
      {showCancel && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="font-medium text-slate-900 font-medium mb-3">Cancel Tender</h3>
            <p className="text-sm text-slate-900 font-medium mb-3">Please provide a reason for cancellation:</p>
            <textarea
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value)}
              rows={3} placeholder="Cancellation reason..."
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 resize-none mb-4"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowCancel(false)} className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600">Keep Tender</button>
              <button onClick={() => cancelMut.mutate({ cancellation_reason: cancelReason })} disabled={cancelMut.isPending}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg font-medium disabled:opacity-60 flex items-center gap-2">
                {cancelMut.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Confirm Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Award Modal ───────────────────────────────────────────────────────── */}
      {showAward && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="font-medium text-slate-900 font-medium mb-3 flex items-center gap-2">
              <Award className="w-5 h-5 text-emerald-600" /> Award Tender
            </h3>
            <p className="text-sm text-slate-900 font-medium mb-4">Select the winning bid to award. A PO will be auto-created.</p>
            <div className="space-y-2 mb-5 max-h-60 overflow-y-auto">
              {bids.filter(b => b.status !== 'rejected').map(b => (
                <label key={b.id} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${awardBidId === b.id ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                  <input type="radio" name="award_bid" value={b.id} checked={awardBidId === b.id} onChange={() => setAwardBidId(b.id)} className="accent-emerald-600" />
                  <div className="flex-1">
                    <div className="font-medium text-black">{b.vendor_name}</div>
                    <div className="text-sm text-slate-600">{fmtL(b.final_amount || b.bid_amount)}</div>
                  </div>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowAward(false)} className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600">Cancel</button>
              <button onClick={() => awardMut.mutate({ bid_id: awardBidId })} disabled={!awardBidId || awardMut.isPending}
                className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg font-medium disabled:opacity-60 flex items-center gap-2">
                {awardMut.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Award Tender
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
