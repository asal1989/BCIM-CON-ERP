import React, { useState } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Gavel, ArrowLeft, CheckCircle, Circle, ChevronRight, Plus, Trash2,
  Upload, Download, Users, FileText, BarChart2, X, AlertTriangle,
} from 'lucide-react';
import { tenderAPI } from '../../api/client';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';

const STATUS_STEPS = ['draft', 'published', 'bid_open', 'evaluation', 'awarded'];
const STATUS_COLORS = {
  draft:'bg-slate-700 text-slate-300', published:'bg-blue-900/40 text-blue-300',
  bid_open:'bg-violet-900/40 text-violet-300', evaluation:'bg-amber-900/40 text-amber-300',
  awarded:'bg-emerald-900/40 text-emerald-300', cancelled:'bg-red-900/40 text-red-300',
};
const fmt = (n) => n != null ? `₹${parseFloat(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';

export default function TenderDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState(searchParams.get('tab') || 'overview');
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [showAwardModal, setShowAwardModal] = useState(false);
  const [awardBidId, setAwardBidId] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['tender', id],
    queryFn: () => tenderAPI.get(id).then(r => r.data?.data),
  });

  const { data: bidsData, refetch: refetchBids } = useQuery({
    queryKey: ['tender-bids', id],
    queryFn: () => tenderAPI.listBids(id).then(r => r.data?.data ?? []),
    enabled: tab === 'bids',
  });

  const { data: compData, refetch: refetchComp } = useQuery({
    queryKey: ['tender-comparison', id],
    queryFn: () => tenderAPI.getBidComparison(id).then(r => r.data),
    enabled: tab === 'bids',
  });

  const mutation = (fn, msgs) => useMutation({
    mutationFn: fn,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tender', id] }); qc.invalidateQueries({ queryKey: ['tender-bids', id] }); toast.success(msgs.ok); },
    onError: (e) => toast.error(e.response?.data?.error || msgs.err),
  });

  const publishMut  = mutation(() => tenderAPI.publish(id),  { ok: 'Tender published', err: 'Publish failed' });
  const openMut     = mutation(() => tenderAPI.openBids(id), { ok: 'Bids opened', err: 'Failed' });
  const evalMut     = mutation(() => tenderAPI.evaluate(id), { ok: 'Moved to evaluation', err: 'Failed' });
  const cancelMut   = mutation((d) => tenderAPI.cancel(id, d), { ok: 'Tender cancelled', err: 'Cancel failed' });
  const awardMut    = mutation((d) => tenderAPI.award(id, d), { ok: 'Tender awarded! PO created.', err: 'Award failed' });

  const scopeMut = useMutation({
    mutationFn: ({ action, itemId, data: d }) => {
      if (action === 'add') return tenderAPI.addScopeItem(id, d);
      if (action === 'delete') return tenderAPI.removeScopeItem(id, itemId);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tender', id] }),
    onError: (e) => toast.error(e.response?.data?.error || 'Error'),
  });

  const vendorMut = useMutation({
    mutationFn: ({ action, vendorId }) => {
      if (action === 'remove') return tenderAPI.removeVendor(id, vendorId);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tender', id] }),
    onError: (e) => toast.error(e.response?.data?.error || 'Error'),
  });

  const bidActionMut = useMutation({
    mutationFn: ({ action, bidId, data: d }) => {
      if (action === 'shortlist') return tenderAPI.shortlistBid(id, bidId);
      if (action === 'reject')    return tenderAPI.rejectBid(id, bidId, d);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tender-bids', id] }); refetchComp(); toast.success('Updated'); },
    onError: (e) => toast.error(e.response?.data?.error || 'Error'),
  });

  const [newScope, setNewScope] = useState({ description: '', unit: '', quantity: '' });

  if (isLoading) return <div className="text-slate-900 font-medium py-12 text-center">Loading…</div>;
  if (!data) return <div className="text-slate-900 font-medium py-12 text-center">Tender not found</div>;

  const tender = data;
  const isCancelled = tender.status === 'cancelled';
  const isAwarded   = tender.status === 'awarded';
  const stepIdx = STATUS_STEPS.indexOf(tender.status);

  const tabs = [
    { key: 'overview',   label: 'Overview',     icon: FileText },
    { key: 'scope',      label: 'Scope Items',  icon: BarChart2 },
    { key: 'vendors',    label: 'Bidders',       icon: Users },
    { key: 'bids',       label: 'Bids & Comparison', icon: Gavel },
    { key: 'documents',  label: 'Documents',    icon: Upload },
  ];

  return (
    <div className="space-y-5">
      {/* Back + Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 text-slate-900 font-medium hover:text-white"><ArrowLeft className="w-5 h-5" /></button>
        <div className="flex-1">
          <h1 className="text-xl font-medium text-white">{tender.title}</h1>
          <p className="text-sm text-slate-400">{tender.tender_number} · {tender.project_name || 'No project'}</p>
        </div>
        <span className={`text-xs px-3 py-1 rounded-full font-medium ${STATUS_COLORS[tender.status] || 'bg-slate-700 text-slate-300'}`}>
          {tender.status}
        </span>
      </div>

      {/* Status stepper */}
      {!isCancelled && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <div className="flex items-center gap-0">
            {STATUS_STEPS.map((s, i) => (
              <React.Fragment key={s}>
                <div className={`flex flex-col items-center ${i <= stepIdx ? 'text-violet-400' : 'text-slate-600'}`}>
                  {i <= stepIdx ? <CheckCircle className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
                  <span className="text-xs mt-1 capitalize">{s.replace('_', ' ')}</span>
                </div>
                {i < STATUS_STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-1 mb-4 ${i < stepIdx ? 'bg-violet-500' : 'bg-slate-700'}`} />
                )}
              </React.Fragment>
            ))}
          </div>
          {/* Action buttons */}
          <div className="flex gap-2 mt-4 flex-wrap">
            {tender.status === 'draft'      && <button onClick={() => publishMut.mutate()} className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg">Publish</button>}
            {tender.status === 'published'  && <button onClick={() => openMut.mutate()}    className="px-4 py-1.5 bg-violet-600 hover:bg-violet-500 text-white text-sm rounded-lg">Open Bids</button>}
            {tender.status === 'bid_open'   && <button onClick={() => evalMut.mutate()}    className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-sm rounded-lg">Start Evaluation</button>}
            {tender.status === 'evaluation' && <button onClick={() => { setTab('bids'); setShowAwardModal(true); }} className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm rounded-lg">Award Tender</button>}
            {!isAwarded && !isCancelled     && <button onClick={() => setShowCancelModal(true)} className="px-4 py-1.5 border border-red-700 text-red-400 text-sm rounded-lg hover:bg-red-900/20">Cancel</button>}
            {isAwarded && tender.po_id      && <Link to={`/procurement/po?highlight=${tender.po_id}`} className="px-4 py-1.5 bg-emerald-700 text-white text-sm rounded-lg flex items-center gap-1">View PO <ChevronRight className="w-3 h-3" /></Link>}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-800 border border-slate-700 rounded-xl p-1">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors
              ${tab === t.key ? 'bg-violet-600 text-white' : 'text-slate-900 font-medium hover:text-white'}`}>
            <t.icon className="w-3.5 h-3.5" />{t.label}
          </button>
        ))}
      </div>

      {/* ── Overview Tab ── */}
      {tab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wide">Tender Details</h3>
            {[
              ['Tender Number', tender.tender_number],
              ['Type', tender.tender_type],
              ['Work Package', tender.work_package || '—'],
              ['Estimated Value', fmt(tender.estimated_value)],
              ['Awarded Amount', fmt(tender.awarded_amount)],
              ['Bid Close Date', tender.bid_close_date ? dayjs(tender.bid_close_date).format('DD MMM YYYY') : '—'],
              ['Pre-Bid Date', tender.pre_bid_date ? dayjs(tender.pre_bid_date).format('DD MMM YYYY') : '—'],
              ['Contract Duration', tender.contract_duration ? `${tender.contract_duration} days` : '—'],
              ['EMD Required', tender.emd_required ? `Yes — ${fmt(tender.emd_amount)}` : 'No'],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between text-sm">
                <span className="text-slate-400">{k}</span>
                <span className="text-white text-right max-w-xs">{v}</span>
              </div>
            ))}
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wide">Scope of Work</h3>
            <p className="text-sm text-slate-300 whitespace-pre-wrap">{tender.scope_of_work || tender.description || 'No description provided'}</p>
            {tender.awarded_vendor_name && (
              <div className="mt-4 p-3 bg-emerald-900/20 border border-emerald-700 rounded-lg">
                <p className="text-xs text-emerald-400 font-medium">Awarded to</p>
                <p className="text-white font-medium mt-1">{tender.awarded_vendor_name}</p>
                <p className="text-emerald-300 text-sm">{fmt(tender.awarded_amount)}</p>
              </div>
            )}
            {isCancelled && (
              <div className="p-3 bg-red-900/20 border border-red-700 rounded-lg">
                <p className="text-xs text-red-400 font-medium flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Cancelled</p>
                <p className="text-slate-300 text-sm mt-1">{tender.cancellation_reason || 'No reason provided'}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Scope Items Tab ── */}
      {tab === 'scope' && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700">
                {['#', 'Code', 'Description', 'Unit', 'Quantity', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-slate-900 font-medium font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(tender.scope_items || []).map((item, idx) => (
                <tr key={item.id} className="border-b border-slate-700/50">
                  <td className="px-4 py-3 text-slate-500">{idx + 1}</td>
                  <td className="px-4 py-3 text-slate-900 font-medium font-mono text-xs">{item.item_code || '—'}</td>
                  <td className="px-4 py-3 text-white">{item.description}</td>
                  <td className="px-4 py-3 text-slate-400">{item.unit}</td>
                  <td className="px-4 py-3 text-slate-300">{item.quantity}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => scopeMut.mutate({ action: 'delete', itemId: item.id })}
                      className="text-slate-900 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
              {/* Add row */}
              <tr className="border-b border-slate-700/50 bg-slate-750">
                <td className="px-4 py-2 text-slate-500">+</td>
                <td className="px-4 py-2"><input placeholder="Code" value={newScope.item_code || ''} onChange={e => setNewScope(p => ({ ...p, item_code: e.target.value }))} className="w-full px-2 py-1 bg-slate-700 border border-slate-600 rounded text-white text-xs focus:outline-none" /></td>
                <td className="px-4 py-2"><input placeholder="Description *" value={newScope.description} onChange={e => setNewScope(p => ({ ...p, description: e.target.value }))} className="w-full px-2 py-1 bg-slate-700 border border-slate-600 rounded text-white text-xs focus:outline-none" /></td>
                <td className="px-4 py-2"><input placeholder="Unit *" value={newScope.unit} onChange={e => setNewScope(p => ({ ...p, unit: e.target.value }))} className="w-24 px-2 py-1 bg-slate-700 border border-slate-600 rounded text-white text-xs focus:outline-none" /></td>
                <td className="px-4 py-2"><input type="number" placeholder="Qty" value={newScope.quantity} onChange={e => setNewScope(p => ({ ...p, quantity: e.target.value }))} className="w-24 px-2 py-1 bg-slate-700 border border-slate-600 rounded text-white text-xs focus:outline-none" /></td>
                <td className="px-4 py-2">
                  <button
                    disabled={!newScope.description || !newScope.unit}
                    onClick={() => {
                      scopeMut.mutate({ action: 'add', data: { ...newScope, sort_order: (tender.scope_items || []).length } });
                      setNewScope({ description: '', unit: '', quantity: '' });
                    }}
                    className="px-3 py-1 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white rounded text-xs">Add</button>
                </td>
              </tr>
            </tbody>
          </table>
          {!tender.scope_items?.length && <div className="text-center py-8 text-slate-500">No scope items yet</div>}
        </div>
      )}

      {/* ── Vendors/Bidders Tab ── */}
      {tab === 'vendors' && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-700 flex items-center justify-between">
            <h3 className="text-sm font-medium text-white">Invited Vendors ({(tender.invited_vendors || []).length})</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700">
                {['Vendor', 'Contact', 'Email', 'Responded', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-slate-900 font-medium font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(tender.invited_vendors || []).map(v => (
                <tr key={v.id} className="border-b border-slate-700/50">
                  <td className="px-4 py-3 text-white font-medium">{v.vendor_name}</td>
                  <td className="px-4 py-3 text-slate-400">{v.contact_person || '—'}</td>
                  <td className="px-4 py-3 text-slate-400">{v.email || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${v.responded ? 'bg-emerald-900/40 text-emerald-300' : 'bg-slate-700 text-slate-400'}`}>
                      {v.responded ? 'Yes' : 'Pending'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => vendorMut.mutate({ action: 'remove', vendorId: v.vendor_id })}
                      className="text-slate-900 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!tender.invited_vendors?.length && <div className="text-center py-8 text-slate-500">No vendors invited yet</div>}
        </div>
      )}

      {/* ── Bids & Comparison Tab ── */}
      {tab === 'bids' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-white font-semibold">Bids Received ({(bidsData || []).length})</h3>
            <Link to={`/procurement/tenders/${id}/bid-entry`}
              className="flex items-center gap-1 px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white text-sm rounded-lg">
              <Plus className="w-3.5 h-3.5" /> Enter Bid
            </Link>
          </div>
          {/* L1 Analysis */}
          {compData?.l1_analysis?.length > 0 && (
            <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
              <div className="p-3 border-b border-slate-700 bg-slate-750">
                <h4 className="text-sm font-medium text-slate-300">L1 Analysis</h4>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700">
                    {['Rank', 'Vendor', 'Final Amount', 'Premium over L1', 'Tech Score', 'Status'].map(h => (
                      <th key={h} className="text-left px-4 py-2.5 text-slate-900 font-medium text-xs font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {compData.l1_analysis.map(b => (
                    <tr key={b.bid_id} className={`border-b border-slate-700/50 ${b.is_l1 ? 'bg-emerald-900/10' : ''}`}>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs font-medium ${b.is_l1 ? 'text-emerald-400' : 'text-slate-500'}`}>L{b.rank}</span>
                      </td>
                      <td className="px-4 py-2.5 text-white font-medium">{b.vendor_name}</td>
                      <td className="px-4 py-2.5 text-slate-300">{fmt(b.final_amount)}</td>
                      <td className="px-4 py-2.5">
                        {b.is_l1
                          ? <span className="text-emerald-400 text-xs font-semibold">L1 ★</span>
                          : <span className="text-amber-400 text-xs">+{b.premium_over_l1_pct}%</span>}
                      </td>
                      <td className="px-4 py-2.5 text-slate-400">{b.technical_score ?? '—'}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex gap-1">
                          {!b.is_winner && tender.status === 'evaluation' && (
                            <>
                              <button onClick={() => bidActionMut.mutate({ action: 'shortlist', bidId: b.bid_id })}
                                className="text-xs px-2 py-0.5 bg-blue-600/30 text-blue-300 border border-blue-700 rounded hover:bg-blue-600/50">Shortlist</button>
                              <button onClick={() => bidActionMut.mutate({ action: 'reject', bidId: b.bid_id })}
                                className="text-xs px-2 py-0.5 bg-red-600/30 text-red-300 border border-red-700 rounded hover:bg-red-600/50">Reject</button>
                            </>
                          )}
                          {b.is_winner && <span className="text-xs px-2 py-0.5 bg-emerald-900/40 text-emerald-300 border border-emerald-700 rounded">Awarded ✓</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Bid items comparison matrix */}
          {compData?.scope_items?.length > 0 && compData?.bids?.length > 0 && (
            <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-x-auto">
              <div className="p-3 border-b border-slate-700">
                <h4 className="text-sm font-medium text-slate-300">Rate Comparison Matrix</h4>
              </div>
              <table className="text-xs whitespace-nowrap">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left px-4 py-2.5 text-slate-400">Item</th>
                    <th className="px-4 py-2.5 text-slate-900 font-medium text-right">Unit</th>
                    <th className="px-4 py-2.5 text-slate-900 font-medium text-right">Qty</th>
                    {compData.bids.map(b => (
                      <th key={b.id} className={`px-4 py-2.5 text-right ${b.is_winner ? 'text-emerald-400' : 'text-slate-400'}`}>
                        {b.vendor_name} {b.is_winner ? '★' : ''}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {compData.scope_items.map(si => {
                    const itemRates = compData.bids.map(b => parseFloat(compData.matrix?.[si.id]?.[b.id]?.unit_rate || 0));
                    const minRate = Math.min(...itemRates.filter(r => r > 0));
                    return (
                      <tr key={si.id} className="border-b border-slate-700/50">
                        <td className="px-4 py-2 text-slate-300 max-w-xs truncate">{si.description}</td>
                        <td className="px-4 py-2 text-slate-900 font-medium text-right">{si.unit}</td>
                        <td className="px-4 py-2 text-slate-900 font-medium text-right">{si.quantity}</td>
                        {compData.bids.map(b => {
                          const cell = compData.matrix?.[si.id]?.[b.id];
                          const rate = parseFloat(cell?.unit_rate || 0);
                          const isL1 = rate > 0 && rate === minRate;
                          return (
                            <td key={b.id} className={`px-4 py-2 text-right ${isL1 ? 'text-emerald-400 font-medium bg-emerald-900/10' : 'text-slate-300'}`}>
                              {rate > 0 ? `₹${rate.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                  <tr className="border-t border-slate-600 bg-slate-750">
                    <td colSpan={3} className="px-4 py-2 text-slate-900 font-medium font-semibold">Total</td>
                    {compData.bids.map(b => (
                      <td key={b.id} className={`px-4 py-2 text-right font-medium ${b.is_winner ? 'text-emerald-400' : 'text-white'}`}>
                        {fmt(b.final_amount || b.bid_amount)}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          {(!bidsData || bidsData.length === 0) && (
            <div className="text-center py-12 text-slate-500">No bids submitted yet</div>
          )}
        </div>
      )}

      {/* ── Documents Tab ── */}
      {tab === 'documents' && (
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-slate-900 font-medium mb-2">Upload Documents</label>
            <input type="file" multiple
              onChange={async (e) => {
                const fd = new FormData();
                Array.from(e.target.files).forEach(f => fd.append('files', f));
                fd.append('doc_type', 'general');
                try {
                  await tenderAPI.uploadDocs(id, fd);
                  qc.invalidateQueries({ queryKey: ['tender', id] });
                  toast.success('Uploaded');
                } catch { toast.error('Upload failed'); }
                e.target.value = '';
              }}
              className="block text-sm text-slate-900 font-medium file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-violet-600 file:text-white file:text-sm file:cursor-pointer hover:file:bg-violet-500"
            />
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
            {(tender.documents || []).length === 0
              ? <div className="text-center py-8 text-slate-500">No documents</div>
              : (
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-slate-700">{['File', 'Type', 'Uploaded By', 'Date', ''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-slate-900 font-medium font-medium">{h}</th>
                  ))}</tr></thead>
                  <tbody>
                    {tender.documents.map(d => (
                      <tr key={d.id} className="border-b border-slate-700/50">
                        <td className="px-4 py-3 text-slate-300">{d.file_name}</td>
                        <td className="px-4 py-3 text-slate-900 font-medium text-xs">{d.doc_type}</td>
                        <td className="px-4 py-3 text-slate-400">{d.uploaded_by_name || '—'}</td>
                        <td className="px-4 py-3 text-slate-900 font-medium text-xs">{dayjs(d.uploaded_at).format('DD MMM YY HH:mm')}</td>
                        <td className="px-4 py-3">
                          <button onClick={async () => {
                            await tenderAPI.removeDoc(id, d.id);
                            qc.invalidateQueries({ queryKey: ['tender', id] });
                            toast.success('Deleted');
                          }} className="text-slate-900 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
          </div>
        </div>
      )}

      {/* Cancel Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-lg font-medium text-white mb-4">Cancel Tender</h2>
            <textarea
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none h-24 resize-none"
              placeholder="Reason for cancellation…"
              value={cancelReason} onChange={e => setCancelReason(e.target.value)}
            />
            <div className="flex gap-3 mt-4">
              <button onClick={() => setShowCancelModal(false)} className="flex-1 py-2 border border-slate-600 text-slate-900 font-medium rounded-lg text-sm">Back</button>
              <button
                onClick={() => { cancelMut.mutate({ cancellation_reason: cancelReason }); setShowCancelModal(false); }}
                className="flex-1 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-medium">
                Confirm Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Award Modal */}
      {showAwardModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-lg font-medium text-white mb-4">Award Tender</h2>
            <p className="text-sm text-slate-900 font-medium mb-4">Select the winning bid. A Purchase Order will be auto-created.</p>
            <select
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none mb-4"
              value={awardBidId} onChange={e => setAwardBidId(e.target.value)}
            >
              <option value="">Select bid…</option>
              {(bidsData || []).filter(b => b.status !== 'rejected').map(b => (
                <option key={b.id} value={b.id}>{b.vendor_name} — {fmt(b.final_amount || b.bid_amount)}</option>
              ))}
            </select>
            <div className="flex gap-3">
              <button onClick={() => setShowAwardModal(false)} className="flex-1 py-2 border border-slate-600 text-slate-900 font-medium rounded-lg text-sm">Cancel</button>
              <button
                disabled={!awardBidId || awardMut.isPending}
                onClick={() => { awardMut.mutate({ bid_id: awardBidId }); setShowAwardModal(false); }}
                className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium">
                {awardMut.isPending ? 'Awarding…' : 'Award & Create PO'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
