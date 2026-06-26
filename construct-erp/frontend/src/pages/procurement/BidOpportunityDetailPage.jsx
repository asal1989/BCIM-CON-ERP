import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Target, ArrowLeft, FileText, BarChart2, Upload, Clock, X, Trash2, Plus,
} from 'lucide-react';
import { bidOpportunityAPI } from '../../api/client';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';

const STATUS_STEPS = ['prospect', 'pursuing', 'bid_prepared', 'submitted', 'won'];
const STATUS_COLORS = {
  prospect:'bg-slate-700 text-slate-300', pursuing:'bg-blue-900/40 text-blue-300',
  bid_prepared:'bg-violet-900/40 text-violet-300', submitted:'bg-amber-900/40 text-amber-300',
  won:'bg-emerald-900/40 text-emerald-300', lost:'bg-red-900/40 text-red-300', dropped:'bg-slate-700 text-slate-400',
};
const STATUS_TRANSITIONS = {
  prospect:     ['pursuing', 'dropped'],
  pursuing:     ['bid_prepared', 'dropped'],
  bid_prepared: ['submitted', 'dropped'],
  submitted:    ['won', 'lost', 'dropped'],
  won: [], lost: [], dropped: [],
};
const NEXT_LABEL = { pursuing:'Mark Pursuing', bid_prepared:'Bid Prepared', submitted:'Mark Submitted',
                     won:'Mark Won', lost:'Mark Lost', dropped:'Drop' };
const fmtL = (n) => n != null ? `₹${parseFloat(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';

export default function BidOpportunityDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState('overview');
  const [showTransition, setShowTransition] = useState(false);
  const [transStatus, setTransStatus] = useState('');
  const [transNote, setTransNote] = useState('');
  const [transReason, setTransReason] = useState('');
  const [editForm, setEditForm] = useState(null);
  const [costEdit, setCostEdit] = useState(null); // array being edited

  const { data, isLoading } = useQuery({
    queryKey: ['bid-opp', id],
    queryFn: () => bidOpportunityAPI.get(id).then(r => r.data?.data),
  });

  const qInvalidate = () => qc.invalidateQueries({ queryKey: ['bid-opp', id] });

  const transMut = useMutation({
    mutationFn: (d) => bidOpportunityAPI.transition(id, d),
    onSuccess: () => { qInvalidate(); qc.invalidateQueries({ queryKey: ['bid-opp-stats'] }); toast.success('Status updated'); setShowTransition(false); setTransNote(''); setTransReason(''); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });

  const updateMut = useMutation({
    mutationFn: (d) => bidOpportunityAPI.update(id, d),
    onSuccess: () => { qInvalidate(); toast.success('Saved'); setEditForm(null); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });

  const costSaveMut = useMutation({
    mutationFn: (items) => bidOpportunityAPI.saveCostItems(id, { items }),
    onSuccess: () => { qInvalidate(); toast.success('Cost estimate saved'); setCostEdit(null); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });

  if (isLoading) return <div className="text-slate-900 font-medium py-12 text-center">Loading…</div>;
  if (!data) return <div className="text-slate-900 font-medium py-12 text-center">Opportunity not found</div>;

  const opp = data;
  const transitions = STATUS_TRANSITIONS[opp.status] || [];
  const isFinal = ['won', 'lost', 'dropped'].includes(opp.status);

  const tabs = [
    { key: 'overview',    label: 'Overview',      icon: FileText },
    { key: 'cost',        label: 'Cost Estimate',  icon: BarChart2 },
    { key: 'documents',   label: 'Documents',      icon: Upload },
    { key: 'activity',    label: 'Activity Log',   icon: Clock },
  ];

  // Cost items editing
  const costItems = costEdit || opp.cost_items || [];
  const costTotal = costItems.reduce((s, i) => s + parseFloat(i.amount || 0), 0);

  const probColor = (p) => p >= 70 ? 'text-emerald-400' : p >= 40 ? 'text-amber-400' : 'text-red-400';

  return (
    <div className="space-y-5">
      {/* Back + Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 text-slate-900 font-medium hover:text-white"><ArrowLeft className="w-5 h-5" /></button>
        <div className="flex-1">
          <h1 className="text-xl font-medium text-white">{opp.project_name}</h1>
          <p className="text-sm text-slate-400">{opp.opportunity_number} · {opp.client_name}</p>
        </div>
        <span className={`text-xs px-3 py-1 rounded-full font-medium ${STATUS_COLORS[opp.status] || 'bg-slate-700 text-slate-300'}`}>
          {opp.status}
        </span>
      </div>

      {/* Status actions */}
      {!isFinal && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-slate-900 font-medium mr-2">Move to:</span>
            {transitions.map(s => (
              <button key={s}
                onClick={() => { setTransStatus(s); setShowTransition(true); }}
                className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                  s === 'won' ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-600' :
                  s === 'lost' || s === 'dropped' ? 'border-red-700 text-red-400 hover:bg-red-900/20' :
                  'bg-blue-600 hover:bg-blue-500 text-white border-blue-600'
                }`}>
                {NEXT_LABEL[s] || s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="w-full overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        <div className="flex gap-1 bg-slate-800 border border-slate-700 rounded-xl p-1 min-w-max">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap
                ${tab === t.key ? 'bg-emerald-600 text-white' : 'text-slate-900 font-medium hover:text-white'}`}>
              <t.icon className="w-3.5 h-3.5" />{t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Overview Tab ── */}
      {tab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wide">Opportunity Details</h3>
              <button onClick={() => setEditForm({ ...opp })} className="text-xs text-slate-900 font-medium hover:text-white">Edit</button>
            </div>
            {[
              ['Opportunity #', opp.opportunity_number],
              ['Client', opp.client_name],
              ['Location', opp.project_location || '—'],
              ['Sector', opp.sector],
              ['Source', opp.source],
              ['Estimated Value', fmtL(opp.estimated_value)],
              ['Bid Value', fmtL(opp.bid_value)],
              ['Submission Date', opp.bid_submission_date ? dayjs(opp.bid_submission_date).format('DD-MM-YYYY') : '—'],
              ['Decision Date', opp.decision_date ? dayjs(opp.decision_date).format('DD-MM-YYYY') : '—'],
              ['Bid Manager', opp.bid_manager_name || '—'],
              ['Estimator', opp.estimator_name || '—'],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between text-sm">
                <span className="text-slate-400">{k}</span>
                <span className="text-white">{v}</span>
              </div>
            ))}
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wide">Win Probability</h3>
            <div className="flex items-end gap-3">
              <span className={`text-5xl font-medium ${probColor(opp.win_probability)}`}>{opp.win_probability}%</span>
            </div>
            <div className="w-full bg-slate-700 rounded-full h-2.5">
              <div className={`h-2.5 rounded-full transition-all ${
                opp.win_probability >= 70 ? 'bg-emerald-500' : opp.win_probability >= 40 ? 'bg-amber-500' : 'bg-red-500'
              }`} style={{ width: `${opp.win_probability}%` }} />
            </div>
            <p className="text-sm text-slate-900 font-medium mt-2 whitespace-pre-wrap">{opp.scope_summary || 'No scope summary'}</p>
            {opp.lost_reason && (
              <div className="p-3 bg-red-900/20 border border-red-700 rounded-lg">
                <p className="text-xs text-red-400 font-medium">Lost Reason</p>
                <p className="text-slate-300 text-sm mt-1">{opp.lost_reason}</p>
              </div>
            )}
            {opp.dropped_reason && (
              <div className="p-3 bg-slate-700/50 border border-slate-600 rounded-lg">
                <p className="text-xs text-slate-900 font-medium font-medium">Dropped Reason</p>
                <p className="text-slate-300 text-sm mt-1">{opp.dropped_reason}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Cost Estimate Tab ── */}
      {tab === 'cost' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-white font-semibold">Cost Estimate</h3>
            <div className="flex gap-2">
              {costEdit ? (
                <>
                  <button onClick={() => setCostEdit(null)} className="px-3 py-1.5 border border-slate-600 text-slate-900 font-medium rounded-lg text-sm">Discard</button>
                  <button onClick={() => costSaveMut.mutate(costEdit)} disabled={costSaveMut.isPending}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-sm">
                    {costSaveMut.isPending ? 'Saving…' : 'Save'}
                  </button>
                </>
              ) : (
                <button onClick={() => setCostEdit(opp.cost_items?.length ? [...opp.cost_items] : [{ category: '', description: '', quantity: '', unit: '', rate: '', amount: '', margin_pct: 0 }])}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm">Edit</button>
              )}
            </div>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  {['Category', 'Description', 'Qty', 'Unit', 'Rate (₹)', 'Amount (₹)', 'Margin %', ''].map(h => (
                    <th key={h} className="text-left px-3 py-2.5 text-slate-900 font-medium text-xs">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {costItems.map((item, idx) => (
                  <tr key={idx} className="border-b border-slate-700/50">
                    {costEdit ? (
                      <>
                        <td className="px-3 py-2"><input value={item.category} onChange={e => { const a = [...costEdit]; a[idx].category = e.target.value; setCostEdit(a); }}
                          className="w-24 px-2 py-1 bg-slate-700 border border-slate-600 rounded text-white text-xs focus:outline-none" /></td>
                        <td className="px-3 py-2"><input value={item.description} onChange={e => { const a = [...costEdit]; a[idx].description = e.target.value; setCostEdit(a); }}
                          className="w-40 px-2 py-1 bg-slate-700 border border-slate-600 rounded text-white text-xs focus:outline-none" /></td>
                        <td className="px-3 py-2"><input type="number" value={item.quantity} onChange={e => { const a = [...costEdit]; a[idx].quantity = e.target.value; a[idx].amount = ((parseFloat(e.target.value)||0) * (parseFloat(a[idx].rate)||0)).toFixed(2); setCostEdit(a); }}
                          className="w-20 px-2 py-1 bg-slate-700 border border-slate-600 rounded text-white text-xs focus:outline-none" /></td>
                        <td className="px-3 py-2"><input value={item.unit} onChange={e => { const a = [...costEdit]; a[idx].unit = e.target.value; setCostEdit(a); }}
                          className="w-16 px-2 py-1 bg-slate-700 border border-slate-600 rounded text-white text-xs focus:outline-none" /></td>
                        <td className="px-3 py-2"><input type="number" value={item.rate} onChange={e => { const a = [...costEdit]; a[idx].rate = e.target.value; a[idx].amount = ((parseFloat(a[idx].quantity)||0) * (parseFloat(e.target.value)||0)).toFixed(2); setCostEdit(a); }}
                          className="w-24 px-2 py-1 bg-slate-700 border border-slate-600 rounded text-white text-xs focus:outline-none" /></td>
                        <td className="px-3 py-2 text-slate-300 text-xs">{item.amount ? `₹${parseFloat(item.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}</td>
                        <td className="px-3 py-2"><input type="number" value={item.margin_pct} onChange={e => { const a = [...costEdit]; a[idx].margin_pct = e.target.value; setCostEdit(a); }}
                          className="w-16 px-2 py-1 bg-slate-700 border border-slate-600 rounded text-white text-xs focus:outline-none" /></td>
                        <td className="px-3 py-2">
                          <button onClick={() => { const a = [...costEdit]; a.splice(idx, 1); setCostEdit(a); }} className="text-slate-900 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-2.5 text-slate-900 font-medium text-xs">{item.category}</td>
                        <td className="px-3 py-2.5 text-slate-300">{item.description}</td>
                        <td className="px-3 py-2.5 text-slate-900 font-medium text-xs">{item.quantity}</td>
                        <td className="px-3 py-2.5 text-slate-900 font-medium text-xs">{item.unit}</td>
                        <td className="px-3 py-2.5 text-slate-300 text-xs">{fmtL(item.rate)}</td>
                        <td className="px-3 py-2.5 text-slate-300 font-medium">{fmtL(item.amount)}</td>
                        <td className="px-3 py-2.5 text-slate-900 font-medium text-xs">{item.margin_pct}%</td>
                        <td />
                      </>
                    )}
                  </tr>
                ))}
                {costEdit && (
                  <tr>
                    <td colSpan={8} className="px-3 py-2">
                      <button onClick={() => setCostEdit(c => [...c, { category: '', description: '', quantity: '', unit: '', rate: '', amount: '', margin_pct: 0 }])}
                        className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300">
                        <Plus className="w-3 h-3" /> Add Row
                      </button>
                    </td>
                  </tr>
                )}
                {costItems.length > 0 && (
                  <tr className="border-t border-slate-600 bg-slate-750">
                    <td colSpan={5} className="px-3 py-2.5 text-slate-900 font-medium text-sm">Total</td>
                    <td className="px-3 py-2.5 text-white font-bold">{fmtL(costTotal)}</td>
                    <td colSpan={2} />
                  </tr>
                )}
              </tbody>
            </table>
            {costItems.length === 0 && !costEdit && (
              <div className="text-center py-8 text-slate-500">No cost estimate items</div>
            )}
          </div>
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
                try { await bidOpportunityAPI.uploadDocs(id, fd); qInvalidate(); toast.success('Uploaded'); }
                catch { toast.error('Upload failed'); }
                e.target.value = '';
              }}
              className="block text-sm text-slate-900 font-medium file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-emerald-600 file:text-white file:text-sm file:cursor-pointer hover:file:bg-emerald-500"
            />
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
            {(opp.documents || []).length === 0
              ? <div className="text-center py-8 text-slate-500">No documents</div>
              : (
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-slate-700">{['File', 'Type', 'Uploaded By', 'Date', ''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-slate-900 font-medium font-medium">{h}</th>
                  ))}</tr></thead>
                  <tbody>
                    {opp.documents.map(d => (
                      <tr key={d.id} className="border-b border-slate-700/50">
                        <td className="px-4 py-3 text-slate-300">{d.file_name}</td>
                        <td className="px-4 py-3 text-slate-900 font-medium text-xs">{d.doc_type}</td>
                        <td className="px-4 py-3 text-slate-400">{d.uploaded_by_name || '—'}</td>
                        <td className="px-4 py-3 text-slate-900 font-medium text-xs">{dayjs(d.uploaded_at).format('DD-MM-YYYY HH:mm')}</td>
                        <td className="px-4 py-3">
                          <button onClick={async () => { await bidOpportunityAPI.removeDoc(id, d.id); qInvalidate(); toast.success('Deleted'); }}
                            className="text-slate-900 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
          </div>
        </div>
      )}

      {/* ── Activity Log Tab ── */}
      {tab === 'activity' && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
          <h3 className="text-sm font-medium text-slate-300 mb-4">Activity Timeline</h3>
          {(opp.activity_log || []).length === 0
            ? <p className="text-slate-900 font-medium text-sm">No activity yet</p>
            : (
              <div className="relative">
                <div className="absolute left-2.5 top-0 bottom-0 w-px bg-slate-700" />
                <div className="space-y-4">
                  {opp.activity_log.map(log => (
                    <div key={log.id} className="flex gap-4 relative">
                      <div className="w-5 h-5 rounded-full bg-slate-700 border-2 border-slate-600 flex items-center justify-center z-10 mt-0.5 shrink-0">
                        <div className="w-2 h-2 rounded-full bg-emerald-500" />
                      </div>
                      <div className="flex-1 pb-1">
                        <div className="flex items-center gap-2">
                          {log.to_status && (
                            <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[log.to_status] || 'bg-slate-700 text-slate-300'}`}>
                              {log.to_status}
                            </span>
                          )}
                          {!log.to_status && <span className="text-xs text-slate-900 font-medium capitalize">{log.action}</span>}
                          {log.from_status && (
                            <span className="text-xs text-slate-600">from {log.from_status}</span>
                          )}
                        </div>
                        {log.note && <p className="text-sm text-slate-300 mt-1">{log.note}</p>}
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-slate-500">{log.performed_by_name || 'System'}</span>
                          <span className="text-xs text-slate-600">·</span>
                          <span className="text-xs text-slate-500">{dayjs(log.performed_at).format('DD-MM-YYYY HH:mm')}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
        </div>
      )}

      {/* Status Transition Modal */}
      {showTransition && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-white capitalize">Move to: {transStatus}</h2>
              <button onClick={() => setShowTransition(false)} className="text-slate-900 font-medium hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-900 font-medium mb-1">Note</label>
                <textarea value={transNote} onChange={e => setTransNote(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none h-20 resize-none"
                  placeholder="Optional note…" />
              </div>
              {(transStatus === 'lost' || transStatus === 'dropped') && (
                <div>
                  <label className="block text-xs text-slate-900 font-medium mb-1">{transStatus === 'lost' ? 'Lost Reason' : 'Drop Reason'}</label>
                  <textarea value={transReason} onChange={e => setTransReason(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none h-16 resize-none"
                    placeholder="Reason…" />
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={() => setShowTransition(false)} className="flex-1 py-2 border border-slate-600 text-slate-900 font-medium rounded-lg text-sm">Cancel</button>
              <button
                onClick={() => transMut.mutate({ status: transStatus, note: transNote, lost_reason: transReason, dropped_reason: transReason })}
                disabled={transMut.isPending}
                className={`flex-1 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50 ${
                  transStatus === 'won' ? 'bg-emerald-600 hover:bg-emerald-500' :
                  transStatus === 'lost' || transStatus === 'dropped' ? 'bg-red-600 hover:bg-red-500' : 'bg-blue-600 hover:bg-blue-500'
                }`}>
                {transMut.isPending ? 'Updating…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
