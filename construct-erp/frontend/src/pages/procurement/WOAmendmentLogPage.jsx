// src/pages/procurement/WOAmendmentLogPage.jsx
// Register of every amendment/variation logged against vendor Work Orders.
// Mirrors the "PO Amendment Log" page's pattern (StatCards, boxed filter bar,
// card-list history) with full parity: line-item revision amendments are
// persisted as a new "-A{n}" versioned work order (same convention as POs)
// and go through a pending → approved/rejected workflow. A simpler
// "Log Other Change" ledger entry (no item revision, no new WO) remains
// available for pure notes/date extensions.
import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import dayjs from 'dayjs';
import toast from 'react-hot-toast';
import {
  FileSignature, Search, FileText, Calendar, Building2, ExternalLink,
  Plus, X, RefreshCw, Filter, ClipboardList, CalendarDays, BadgeIndianRupee,
  TrendingUp, Trash2, CheckCircle2, XCircle, AlertTriangle, Send, Loader2,
  ClipboardEdit,
} from 'lucide-react';
import { clsx } from 'clsx';
import { subcontractorAPI, projectAPI } from '../../api/client';
import useAuthStore from '../../store/authStore';

const inr = v => Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
const money = v => `₹${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmt = v => (v ? dayjs(v).format('DD-MM-YYYY') : '—');
const clean = v => String(v || '').trim().toLowerCase();
const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };

// Same gate as WorkOrderPage's canAmendWO — procurement roles + admins.
const WO_AMEND_ROLES = ['admin', 'management', 'project_manager', 'purchase_executive', 'contracts_manager'];
function canAmendWO(user) {
  if (!user) return false;
  const role = (user.role || '').toLowerCase();
  return role === 'super_admin' || role === 'managing_director'
    || role.includes('procurement') || WO_AMEND_ROLES.includes(role);
}
// Editing/deleting an amendment is restricted to procurement & super admin, same as PO.
function canManageProcurement(user) {
  if (!user) return false;
  const role = (user.role || '').toLowerCase();
  return role === 'super_admin' || role.includes('procurement');
}

const STATUS_COLORS = {
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  rejected: 'bg-rose-50 text-rose-700 border-rose-200',
};

const REASON_OPTIONS = [
  'Quantity Revision', 'Rate Revision', 'Scope Addition', 'Scope Deletion',
  'GST Correction', 'Duration Extension', 'Terms Change', 'Others',
];
const REASON_CONFIG = {
  'Quantity Revision': { focus: 'items', hint: 'Edit the Rev Qty column in the line items below.' },
  'Rate Revision':     { focus: 'items', hint: 'Edit the Rev Rate column in the line items below.' },
  'Scope Addition':    { focus: 'items', hint: 'Use "Add line item" below to add new scope.' },
  'Scope Deletion':    { focus: 'items', hint: 'Remove line items below using the delete (🗑) button.' },
  'GST Correction':    { focus: 'items', hint: 'Edit the Rev GST% column in the line items below.' },
  'Duration Extension':{ focus: 'terms', hint: 'Update the End Date in the terms section below.' },
  'Terms Change':      { focus: 'terms', hint: 'Edit Terms & Conditions in the section below.' },
  'Others':            { focus: 'both',  hint: 'Edit line items and/or the terms section below as needed.' },
};

function StatCard({ label, value, sub, icon: Icon, tone = 'indigo' }) {
  const tones = {
    indigo: 'bg-indigo-50 text-indigo-600 border-indigo-100',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
    rose: 'bg-rose-50 text-rose-600 border-rose-100',
  };
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className={clsx('w-9 h-9 rounded-lg border flex items-center justify-center', tones[tone])}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div className="text-2xl font-medium text-slate-900">{value}</div>
      <div className="text-[11px] font-medium tracking-[0.18em] text-slate-900 uppercase mt-1">{label}</div>
      <div className="text-xs text-slate-500 font-medium mt-1.5 leading-tight">{sub}</div>
    </div>
  );
}

/* ── Simple "Log Other Change" modal — a note-only ledger entry, no new WO ── */
const EMPTY_FORM = { wo_id: '', description: '', amount_change: '', amendment_date: '' };
function AddAmendmentModal({ open, onClose, onSaved }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [woSearch, setWoSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const { data: workOrders = [] } = useQuery({
    queryKey: ['work-orders-for-amendment'],
    queryFn: () => subcontractorAPI.listWorkOrders().then(r => r.data?.data || []),
    enabled: open,
  });

  const filteredWOs = useMemo(() => {
    const q = woSearch.toLowerCase();
    return !q ? workOrders : workOrders.filter(w =>
      String(w.wo_number || '').toLowerCase().includes(q) ||
      String(w.vendor_name || '').toLowerCase().includes(q) ||
      String(w.project_name || '').toLowerCase().includes(q));
  }, [workOrders, woSearch]);

  const selectedWO   = workOrders.find(w => String(w.id) === String(form.wo_id));
  const currentValue = Number(selectedWO?.total_value || selectedWO?.contract_amount || 0);
  const newTotal     = currentValue + Number(form.amount_change || 0);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.wo_id) return toast.error('Select a work order');
    if (!form.description.trim()) return toast.error('Description required');
    setSaving(true);
    try {
      await subcontractorAPI.addWOAmendment(form.wo_id, {
        description: form.description,
        amount_change: Number(form.amount_change) || 0,
        amendment_date: form.amendment_date || null,
      });
      toast.success('Amendment added');
      setForm(EMPTY_FORM); setWoSearch('');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to add amendment');
    } finally { setSaving(false); }
  }

  if (!open) return null;
  const inp = 'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 bg-white';
  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md my-6">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div>
            <h2 className="text-base font-medium text-slate-900">Log Other Change</h2>
            <p className="text-xs text-slate-500 mt-0.5">Note-only ledger entry — does not create a new WO revision</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Work Order *</label>
            <input className={inp + ' mb-2'} placeholder="Search WO number, vendor, project…"
              value={woSearch} onChange={e => setWoSearch(e.target.value)} />
            <select required className={inp} value={form.wo_id} onChange={set('wo_id')}>
              <option value="">Select work order…</option>
              {filteredWOs.map(w => (
                <option key={w.id} value={w.id}>
                  {w.wo_number || '(no number)'} — {w.vendor_name || 'Unknown vendor'} — ₹{inr(w.total_value || w.contract_amount)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Description *</label>
            <textarea required rows={3} className={inp + ' resize-none'}
              placeholder="Describe the variation, scope change, or extension…"
              value={form.description} onChange={set('description')} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Amount Change (₹)</label>
              <input type="number" step="0.01" className={inp} placeholder="+/- amount"
                value={form.amount_change} onChange={set('amount_change')} />
              <p className="text-[11px] text-slate-400 mt-1">Use negative for deductions</p>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Amendment Date</label>
              <input type="date" className={inp} value={form.amendment_date} onChange={set('amendment_date')} />
            </div>
          </div>
          {selectedWO && (
            <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-100 text-sm">
              <div className="flex justify-between text-slate-600 mb-1">
                <span>Current Order Value</span><span className="font-semibold">₹{inr(currentValue)}</span>
              </div>
              <div className="flex justify-between text-slate-600 mb-2">
                <span>Change Amount</span>
                <span className={clsx('font-semibold', Number(form.amount_change) < 0 ? 'text-rose-600' : 'text-emerald-600')}>
                  {Number(form.amount_change) >= 0 ? '+' : ''}₹{inr(form.amount_change || 0)}
                </span>
              </div>
              <div className="flex justify-between text-slate-900 font-bold border-t border-indigo-200 pt-2">
                <span>Revised Value</span><span>₹{inr(newTotal)}</span>
              </div>
            </div>
          )}
        </form>
        <div className="flex gap-3 px-5 pb-5">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 bg-slate-100 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-200 transition-all">Cancel</button>
          <button onClick={handleSubmit} disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 shadow-sm transition-all disabled:opacity-60">
            {saving ? 'Saving…' : 'Submit Amendment'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Full item-revision editor — creates a new "-A{n}" WO + pending amendment ── */
function WOAmendEditor({ workOrders, onClose, onSubmitted }) {
  const user = useAuthStore(state => state.user);
  const [selectedWoId, setSelectedWoId] = useState('');
  const [reasonCode, setReasonCode] = useState(REASON_OPTIONS[0]);
  const [remarks, setRemarks] = useState('');
  const [raisedBy, setRaisedBy] = useState(user?.name || '');
  const [items, setItems] = useState([]);
  const [showTerms, setShowTerms] = useState(false);
  const [termsConditions, setTermsConditions] = useState('');
  const [endDate, setEndDate] = useState('');
  const [origTerms, setOrigTerms] = useState({ tc: '', end: '' });

  const ctxQuery = useQuery({
    queryKey: ['wo-amend-context', selectedWoId],
    queryFn: () => subcontractorAPI.woAmendmentContext(selectedWoId).then(r => r.data?.data),
    enabled: !!selectedWoId,
  });
  const ctx = ctxQuery.data;

  useEffect(() => {
    if (!ctx) return;
    setItems((ctx.items || []).map(it => ({
      wo_item_id: it.id,
      description: it.description,
      unit: it.unit,
      original_gst_rate: num(it.gst_rate),
      gst_rate: num(it.gst_rate),
      original_qty: num(it.quantity),
      revised_qty: num(it.quantity),
      original_rate: num(it.rate),
      revised_rate: num(it.rate),
      billed_qty: num(it.billed_quantity),
    })));
    const tc = ctx.terms_conditions || '';
    const end = ctx.end_date ? String(ctx.end_date).slice(0, 10) : '';
    setTermsConditions(tc);
    setEndDate(end);
    setOrigTerms({ tc, end });
  }, [ctx]);

  const reasonCfg = REASON_CONFIG[reasonCode] || REASON_CONFIG['Others'];
  useEffect(() => {
    if (reasonCfg.focus === 'terms' || reasonCfg.focus === 'both') setShowTerms(true);
  }, [reasonCode]); // eslint-disable-line react-hooks/exhaustive-deps

  const termsChanged = termsConditions !== origTerms.tc || endDate !== origTerms.end;

  const updateItem = (idx, field, value) => setItems(prev => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  const removeItem = idx => setItems(prev => prev.filter((_, i) => i !== idx));
  const addBlankItem = () => setItems(prev => [...prev, {
    wo_item_id: null, description: '', unit: 'Nos', original_gst_rate: 18, gst_rate: 18,
    original_qty: 0, revised_qty: 0, original_rate: 0, revised_rate: 0, billed_qty: 0,
  }]);

  const originalTotal = useMemo(() => items.reduce((s, it) => s + num(it.original_qty) * num(it.original_rate), 0), [items]);
  const revisedTotal  = useMemo(() => items.reduce((s, it) => s + num(it.revised_qty) * num(it.revised_rate), 0), [items]);
  const difference = revisedTotal - originalTotal;
  const underBilledWarnings = items.filter(it => num(it.revised_qty) < num(it.billed_qty) && num(it.billed_qty) > 0);

  const submitMut = useMutation({
    mutationFn: () => subcontractorAPI.submitWOAmendment(selectedWoId, {
      reason_code: reasonCode,
      reason_remarks: remarks,
      raised_by: raisedBy,
      terms_conditions: termsConditions,
      end_date: endDate || null,
      items: items.filter(it => it.description?.trim()).map(it => ({
        wo_item_id: it.wo_item_id,
        description: it.description,
        unit: it.unit,
        gst_rate: it.gst_rate,
        quantity: num(it.revised_qty),
        rate: num(it.revised_rate),
      })),
    }),
    onSuccess: (res) => {
      toast.success(`${res.data?.data?.wo?.wo_number || 'Amendment'} created — pending approval`);
      onSubmitted();
    },
    onError: err => toast.error(err?.response?.data?.error || 'Unable to submit amendment'),
  });

  const handleSubmit = () => {
    if (!selectedWoId) return toast.error('Select a WO to amend');
    if (!raisedBy.trim()) return toast.error('Enter who is raising this amendment');
    if (!items.some(it => it.description?.trim()) && !termsChanged) {
      return toast.error('Change at least one line item or a term');
    }
    submitMut.mutate();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl my-6">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div>
            <h2 className="text-base font-medium text-slate-900">New WO Amendment</h2>
            <p className="text-xs text-slate-500 mt-0.5">Revise quantities/rates — saved as a new {ctx?.next_amendment_ref || '-A{n}'} work order, pending approval</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="col-span-2">
              <label className="block text-xs text-slate-500 mb-1">Work Order *</label>
              <select
                value={selectedWoId}
                onChange={e => setSelectedWoId(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400">
                <option value="">Select WO to amend</option>
                {(workOrders || []).map(w => (
                  <option key={w.id} value={w.id}>{w.wo_number} — {w.vendor_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Reason for Amendment</label>
              <select
                value={reasonCode}
                onChange={e => setReasonCode(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400">
                {REASON_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Raised By *</label>
              <input
                value={raisedBy}
                onChange={e => setRaisedBy(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400" />
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">Remarks</label>
            <textarea
              rows={2}
              value={remarks}
              onChange={e => setRemarks(e.target.value)}
              placeholder="Add context for this amendment…"
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 resize-none" />
          </div>

          {selectedWoId && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100 text-xs">
              <ClipboardList className="w-4 h-4 mt-0.5 shrink-0" />
              <span><span className="font-semibold">{reasonCode}:</span> {reasonCfg.hint}</span>
            </div>
          )}

          {!selectedWoId ? (
            <div className="py-10 text-center text-sm text-slate-400">Select a work order above to load its line items.</div>
          ) : ctxQuery.isLoading ? (
            <div className="py-10 text-center text-sm text-slate-400 flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading WO items…</div>
          ) : ctxQuery.isError ? (
            <div className="py-10 text-center text-sm text-red-500 flex flex-col items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              {ctxQuery.error?.response?.data?.error || 'Failed to load WO items'}
              <button onClick={() => ctxQuery.refetch()} className="text-xs text-indigo-600 hover:underline mt-1">Retry</button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Line Items</span>
                {(reasonCfg.focus === 'items' || reasonCfg.focus === 'both') && (
                  <span className="text-[10px] font-bold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">edit here</span>
                )}
              </div>
              <div className={clsx('border rounded-lg overflow-hidden',
                (reasonCfg.focus === 'items' || reasonCfg.focus === 'both') ? 'border-indigo-300 ring-1 ring-indigo-100' : 'border-slate-200')}>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                        <th className="text-left px-3 py-2.5 font-medium">Item</th>
                        <th className="text-left px-2 py-2.5 font-medium">Unit</th>
                        <th className="text-right px-2 py-2.5 font-medium">Orig Qty</th>
                        <th className="text-right px-2 py-2.5 font-medium">Rev Qty</th>
                        <th className="text-right px-2 py-2.5 font-medium">Orig Rate</th>
                        <th className="text-right px-2 py-2.5 font-medium">Rev Rate</th>
                        <th className="text-right px-2 py-2.5 font-medium">Orig GST%</th>
                        <th className="text-right px-2 py-2.5 font-medium">Rev GST%</th>
                        <th className="text-right px-2 py-2.5 font-medium">Diff ₹</th>
                        <th className="px-2 py-2.5"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it, idx) => {
                        const origAmt = num(it.original_qty) * num(it.original_rate);
                        const revAmt = num(it.revised_qty) * num(it.revised_rate);
                        const diff = revAmt - origAmt;
                        const underBilled = num(it.revised_qty) < num(it.billed_qty) && num(it.billed_qty) > 0;
                        return (
                          <tr key={idx} className="border-t border-slate-100">
                            <td className="px-3 py-2">
                              <input
                                value={it.description}
                                onChange={e => updateItem(idx, 'description', e.target.value)}
                                placeholder="Item description"
                                className="w-full min-w-[160px] border border-slate-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-300" />
                              {underBilled && (
                                <div className="flex items-center gap-1 text-amber-600 text-[11px] mt-1">
                                  <AlertTriangle className="w-3 h-3" />
                                  Below {it.billed_qty} already billed
                                </div>
                              )}
                            </td>
                            <td className="px-2 py-2">
                              <input
                                value={it.unit}
                                onChange={e => updateItem(idx, 'unit', e.target.value)}
                                className="w-16 border border-slate-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-300" />
                            </td>
                            <td className="px-2 py-2 text-right text-slate-400">{it.original_qty}</td>
                            <td className="px-2 py-2">
                              <input
                                type="number"
                                value={it.revised_qty}
                                onChange={e => updateItem(idx, 'revised_qty', e.target.value)}
                                className={clsx('w-20 text-right border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-300',
                                  underBilled ? 'border-amber-400' : 'border-slate-200')} />
                            </td>
                            <td className="px-2 py-2 text-right text-slate-400">{it.original_rate}</td>
                            <td className="px-2 py-2">
                              <input
                                type="number"
                                value={it.revised_rate}
                                onChange={e => updateItem(idx, 'revised_rate', e.target.value)}
                                className="w-20 text-right border border-slate-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-300" />
                            </td>
                            <td className="px-2 py-2 text-right text-slate-400">{it.original_gst_rate}</td>
                            <td className="px-2 py-2">
                              <input
                                type="number"
                                value={it.gst_rate}
                                onChange={e => updateItem(idx, 'gst_rate', e.target.value)}
                                className="w-16 text-right border border-slate-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-300" />
                            </td>
                            <td className={clsx('px-2 py-2 text-right font-medium whitespace-nowrap',
                              diff > 0 ? 'text-orange-600' : diff < 0 ? 'text-sky-600' : 'text-slate-400')}>
                              {diff !== 0 ? `${diff > 0 ? '+' : ''}${money(diff)}` : '—'}
                            </td>
                            <td className="px-2 py-2 text-right">
                              <button onClick={() => removeItem(idx)} className="text-slate-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                            </td>
                          </tr>
                        );
                      })}
                      {items.length === 0 && (
                        <tr><td colSpan={10} className="px-4 py-8 text-center text-slate-400 text-sm">No line items yet. Add one below.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <button onClick={addBlankItem} className="flex items-center gap-1.5 px-4 py-2.5 text-sm text-indigo-600 hover:bg-slate-50 transition-colors w-full justify-center border-t border-slate-100">
                  <Plus className="w-3.5 h-3.5" /> Add line item
                </button>
              </div>

              {underBilledWarnings.length > 0 && (
                <div className="flex items-start gap-2 px-4 py-3 rounded-md bg-amber-50 text-amber-700 ring-1 ring-amber-200 text-sm">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{underBilledWarnings.length} item{underBilledWarnings.length > 1 ? 's' : ''} have revised quantity below what's already billed. Confirm this is intentional.</span>
                </div>
              )}

              <div className="bg-slate-50 rounded-lg p-4 grid grid-cols-3 gap-4">
                <div>
                  <div className="text-xs text-slate-500 uppercase mb-1">Original Value</div>
                  <div className="text-base font-semibold text-slate-700">{money(originalTotal)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 uppercase mb-1">Revised Value</div>
                  <div className="text-base font-semibold text-slate-900">{money(revisedTotal)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 uppercase mb-1">Difference</div>
                  <div className={clsx('text-base font-semibold', difference > 0 ? 'text-orange-600' : difference < 0 ? 'text-sky-600' : 'text-slate-500')}>
                    {difference !== 0 ? `${difference > 0 ? '+' : ''}${money(difference)}` : '—'}
                  </div>
                </div>
              </div>

              <div className={clsx('border rounded-lg overflow-hidden',
                (reasonCfg.focus === 'terms' || reasonCfg.focus === 'both') ? 'border-indigo-300 ring-1 ring-indigo-100' : 'border-slate-200')}>
                <button type="button" onClick={() => setShowTerms(s => !s)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors">
                  <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
                    <FileText className="w-4 h-4 text-indigo-500" />
                    End Date / Terms &amp; Conditions
                    {(reasonCfg.focus === 'terms' || reasonCfg.focus === 'both') && (
                      <span className="text-[10px] font-bold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">edit here</span>
                    )}
                    {termsChanged && <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">edited</span>}
                  </span>
                  <span className="text-xs text-indigo-600 font-medium">{showTerms ? 'Hide' : 'Edit terms'}</span>
                </button>
                {showTerms && (
                  <div className="p-4 space-y-4">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1 flex items-center gap-1.5">
                        <CalendarDays className="w-3.5 h-3.5" /> End Date
                      </label>
                      <input type="date" value={endDate}
                        onChange={e => setEndDate(e.target.value)}
                        className="w-full max-w-xs border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400" />
                      {endDate !== origTerms.end && origTerms.end && (
                        <p className="text-[11px] text-slate-400 mt-1">was {dayjs(origTerms.end).format('DD-MM-YYYY')}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Terms &amp; Conditions</label>
                      <textarea rows={5} value={termsConditions}
                        onChange={e => setTermsConditions(e.target.value)}
                        placeholder="Full terms and conditions text…"
                        className={clsx('w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100 resize-y',
                          termsConditions !== origTerms.tc ? 'border-indigo-400 bg-indigo-50/40' : 'border-slate-200')} />
                    </div>
                    {termsChanged && (
                      <p className="text-[11px] text-indigo-600 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        These changes will be saved on the new {ctx?.next_amendment_ref || 'revised'} WO.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex gap-3 px-5 pb-5">
          <button onClick={onClose} className="flex-1 py-2.5 bg-slate-100 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-200 transition-all">Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={submitMut.isPending || !selectedWoId}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 shadow-sm transition-all disabled:opacity-60">
            {submitMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {submitMut.isPending ? 'Submitting…' : 'Submit Amendment'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function WOAmendmentLogPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const user = useAuthStore(s => s.user);
  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [addOpen, setAddOpen] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [showDetail, setShowDetail] = useState(null);

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectAPI.list().then(r => r.data?.data || []),
  });

  const woQuery = useQuery({
    queryKey: ['work-orders-for-amendment-page'],
    queryFn: () => subcontractorAPI.listWorkOrders().then(r => r.data?.data || []),
  });

  const amendmentQuery = useQuery({
    queryKey: ['wo-amendments', projectFilter],
    queryFn: () => subcontractorAPI.listWOAmendments({
      project_id: projectFilter || undefined,
    }).then(r => r.data?.data || []),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['wo-amendments'] });
    qc.invalidateQueries({ queryKey: ['work-orders-for-amendment-page'] });
  };

  const deleteMut = useMutation({
    mutationFn: ({ woId, aid }) => subcontractorAPI.delWOAmendment(woId, aid),
    onSuccess: () => { toast.success('Amendment deleted'); invalidate(); },
    onError: err => toast.error(err?.response?.data?.error || 'Unable to delete'),
  });
  const approveMut = useMutation({
    mutationFn: id => subcontractorAPI.approveWOAmendment(id),
    onSuccess: () => { toast.success('Amendment approved'); invalidate(); },
    onError: err => toast.error(err?.response?.data?.error || 'Unable to approve'),
  });
  const rejectMut = useMutation({
    mutationFn: id => subcontractorAPI.rejectWOAmendment(id),
    onSuccess: () => { toast.success('Amendment rejected'); invalidate(); },
    onError: err => toast.error(err?.response?.data?.error || 'Unable to reject'),
  });

  const amendments = useMemo(() => (amendmentQuery.data || []).map(row => ({
    ...row,
    status_view: row.status || 'approved',
    searchText: [row.wo_number, row.vendor_name, row.project_name, row.description, row.created_by_name]
      .map(clean).join(' '),
  })), [amendmentQuery.data]);

  const filtered = useMemo(() => {
    const q = clean(search);
    return amendments.filter(row => {
      if (filterStatus !== 'all' && row.status_view !== filterStatus) return false;
      if (!q) return true;
      return clean(row.searchText).includes(q);
    });
  }, [amendments, filterStatus, search]);

  const stats = useMemo(() => {
    const increases = amendments.filter(a => Number(a.amount_change ?? a.value_impact) > 0 || a.impact_type === 'increase');
    const decreases = amendments.filter(a => Number(a.amount_change) < 0 || a.impact_type === 'decrease');
    const totalImpact = amendments.reduce((s, a) => s + Number(a.amount_change || 0), 0);
    return {
      total: amendments.length,
      pending: amendments.filter(a => a.status_view === 'pending').length,
      wosAmended: new Set(amendments.map(a => a.wo_id)).size,
      increases: increases.length,
      decreases: decreases.length,
      impact: totalImpact,
    };
  }, [amendments]);

  const refresh = async () => {
    await Promise.all([amendmentQuery.refetch(), woQuery.refetch()]);
    toast.success('WO amendments refreshed');
  };

  return (
    <div className="p-6 md:p-7 max-w-7xl mx-auto min-h-screen bg-[#f4f6f9]">
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4 mb-5">
        <div>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.28em] text-indigo-500 font-medium mb-1.5">
            <FileSignature className="w-3.5 h-3.5" />
            Procurement
          </div>
          <h1 className="text-2xl md:text-[28px] font-medium text-slate-900 leading-tight">WO Amendment Log</h1>
          <p className="text-sm text-slate-500 font-medium mt-1.5 max-w-2xl">
            Register of every variation, extension or scope change logged against vendor work orders.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refresh}
            className="inline-flex items-center gap-2 px-4 h-10 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-medium hover:border-indigo-300 hover:text-indigo-700 transition-all shadow-sm"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          {canAmendWO(user) && (
            <>
              <button
                onClick={() => setAddOpen(true)}
                className="inline-flex items-center gap-2 px-4 h-10 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-medium hover:border-indigo-300 hover:text-indigo-700 transition-all shadow-sm"
                title="Log a non-item change (date extension, note, etc.) without revising line items"
              >
                <ClipboardEdit className="w-4 h-4" />
                Log Other Change
              </button>
              <button
                onClick={() => setShowEditor(true)}
                className="inline-flex items-center gap-2 px-4 h-10 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-all shadow-sm"
              >
                <Plus className="w-4 h-4" />
                New Amendment
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatCard label="Amendments" value={stats.total} sub="Live records only" icon={ClipboardList} tone="indigo" />
        <StatCard label="Pending" value={stats.pending} sub="Awaiting approval" icon={CalendarDays} tone="amber" />
        <StatCard label="WOs Amended" value={stats.wosAmended} sub="Distinct work orders" icon={Building2} tone="emerald" />
        <StatCard label="Net Impact" value={money(stats.impact)} sub="Increase minus decrease" icon={BadgeIndianRupee} tone="rose" />
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-3 md:p-4 shadow-sm mb-5">
        <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr_0.9fr_auto] gap-3 items-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search WO number, vendor, description…"
              className="w-full h-10 bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-indigo-400"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium tracking-[0.18em] uppercase text-slate-500 mb-1">Status</label>
            <div className="flex items-center gap-2 flex-wrap">
              {['all', 'pending', 'approved', 'rejected'].map(status => (
                <button
                  key={status}
                  onClick={() => setFilterStatus(status)}
                  className={clsx(
                    'h-10 px-3 rounded-xl border text-sm font-medium transition-all',
                    filterStatus === status
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-slate-900 border-slate-200 hover:border-indigo-300'
                  )}
                >
                  {status === 'all' ? 'All' : status}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium tracking-[0.18em] uppercase text-slate-500 mb-1">Project</label>
            <select
              value={projectFilter}
              onChange={e => setProjectFilter(e.target.value)}
              className="w-full h-10 bg-slate-50 border border-slate-200 rounded-xl px-3 text-sm text-slate-900 outline-none focus:border-indigo-400"
            >
              <option value="">All Projects</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          <div className="flex items-end gap-2">
            <button
              onClick={() => { setSearch(''); setProjectFilter(''); setFilterStatus('all'); }}
              className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-slate-700 font-medium text-sm hover:text-indigo-700 hover:border-indigo-300 transition-all"
            >
              <Filter className="w-4 h-4 inline mr-1.5" />
              Reset
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-medium text-slate-900">Amendment History</h2>
            <p className="text-xs text-slate-500 mt-0.5">Linked to real work orders and vendors</p>
          </div>
          <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">
            {filtered.length} row{filtered.length === 1 ? '' : 's'}
          </span>
        </div>

        {amendmentQuery.isLoading ? (
          <div className="p-5 space-y-2">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-14 rounded-xl bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-14 text-center">
            <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-600">No amendments logged yet</p>
            <p className="text-xs text-slate-500 mt-1">Create the first amendment against a live work order.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {filtered.map(a => {
              const isIncrease = Number(a.amount_change) >= 0;
              return (
                <div key={a.id} className="p-4 hover:bg-slate-50/70 transition-colors">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className={clsx('mt-1 w-3 h-3 rounded-full shrink-0', a.status_view === 'approved' ? 'bg-emerald-500' : a.status_view === 'pending' ? 'bg-amber-400' : 'bg-rose-400')} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-medium text-sm text-indigo-700">{a.wo_number || 'WO'}</span>
                          <span className="text-slate-400 text-xs">—</span>
                          <span className="text-sm font-medium">Amdt #{a.amendment_number}</span>
                          <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                            {a.project_name || 'Project'}
                          </span>
                          <span className={clsx('px-2 py-0.5 rounded text-xs font-medium border', STATUS_COLORS[a.status_view])}>{a.status_view}</span>
                        </div>
                        <p className="text-xs text-slate-500 mb-2">
                          {a.vendor_name || 'Vendor'} · {fmt(a.amendment_date)} · Raised by: {a.raised_by || a.created_by_name || '—'}
                        </p>
                        <div className="bg-slate-50 border-l-2 border-indigo-600 rounded px-3 py-2 text-xs text-slate-700">
                          {a.description}
                          <span className={clsx('ml-2 font-medium', isIncrease ? 'text-emerald-700' : 'text-rose-600')}>
                            · Value Impact: {isIncrease ? '+' : ''}{money(a.amount_change)}
                          </span>
                          <span className="ml-2 font-medium text-slate-600">
                            · Revised: {money(a.revised_order_value)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 items-center flex-wrap" onClick={e => e.stopPropagation()}>
                      <button onClick={() => setShowDetail(a)} className="text-xs border border-slate-200 rounded px-2 py-1 hover:bg-slate-100">Details</button>
                      <button
                        onClick={() => navigate('/procurement/work-orders', { state: { viewId: a.wo_id } })}
                        className="text-xs border border-indigo-200 text-indigo-700 rounded px-2 py-1 hover:bg-indigo-50 inline-flex items-center gap-1">
                        <ExternalLink className="w-3 h-3" /> View WO
                      </button>
                      {a.status_view === 'pending' && canAmendWO(user) && (
                        <>
                          <button
                            onClick={() => window.confirm(`Approve amendment #${a.amendment_number} on ${a.wo_number}?\n\n"${a.description?.slice(0, 120)}"`) && approveMut.mutate(a.id)}
                            disabled={approveMut.isPending}
                            className="text-xs border border-emerald-200 text-emerald-700 rounded px-2 py-1 hover:bg-emerald-50 disabled:opacity-50 inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Approve
                          </button>
                          <button
                            onClick={() => window.confirm(`Reject amendment #${a.amendment_number} on ${a.wo_number}?\n\nThis will permanently mark it as rejected.`) && rejectMut.mutate(a.id)}
                            disabled={rejectMut.isPending}
                            className="text-xs border border-rose-200 text-rose-600 rounded px-2 py-1 hover:bg-rose-50 disabled:opacity-50 inline-flex items-center gap-1">
                            <XCircle className="w-3 h-3" /> Reject
                          </button>
                        </>
                      )}
                      {canAmendWO(user) && (
                        <button
                          onClick={() => window.confirm(`Delete amendment #${a.amendment_number} on ${a.wo_number}? This cannot be undone.`) && deleteMut.mutate({ woId: a.wo_id, aid: a.id })}
                          disabled={deleteMut.isPending}
                          className="text-xs border border-slate-200 text-slate-500 rounded px-2 py-1 hover:bg-red-50 hover:border-red-200 hover:text-red-600 disabled:opacity-50 inline-flex items-center gap-1">
                          <Trash2 className="w-3 h-3" /> Delete
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <AddAmendmentModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSaved={invalidate}
      />

      {showEditor && (
        <WOAmendEditor
          workOrders={woQuery.data || []}
          onClose={() => setShowEditor(false)}
          onSubmitted={() => { setShowEditor(false); invalidate(); }}
        />
      )}

      {showDetail && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md my-6">
            <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-medium text-slate-900">Amdt #{showDetail.amendment_number}</h2>
                <p className="text-xs text-slate-500 mt-0.5">{showDetail.wo_number}</p>
              </div>
              <button onClick={() => setShowDetail(null)} className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:text-slate-900 transition-all">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-2 text-sm">
              {[
                ['Project', showDetail.project_name],
                ['Vendor', showDetail.vendor_name],
                ['Description', showDetail.description],
                ['Amount Change', `${Number(showDetail.amount_change) >= 0 ? '+' : ''}${money(showDetail.amount_change)}`],
                ['Revised Order Value', money(showDetail.revised_order_value)],
                ['Date', fmt(showDetail.amendment_date)],
                ['Raised By', showDetail.raised_by || showDetail.created_by_name || '—'],
                ['Status', showDetail.status_view],
              ].map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <span className="text-slate-500 w-36 shrink-0">{k}</span>
                  <span className="font-medium text-slate-800">{v}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-end px-5 pb-5">
              <button onClick={() => setShowDetail(null)} className="px-4 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
