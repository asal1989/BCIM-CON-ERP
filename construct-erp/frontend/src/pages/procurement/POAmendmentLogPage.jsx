import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import {
  FileSignature,
  Plus,
  Search,
  Filter,
  RefreshCw,
  BadgeIndianRupee,
  CalendarDays,
  CheckCircle2,
  XCircle,
  FileText,
  ClipboardList,
  AlertTriangle,
  Trash2,
  Send,
  Loader2,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import useAuthStore from '../../store/authStore';
import { poAPI, vendorAPI, poAmendmentAPI } from '../../api/client';

const REASON_OPTIONS = [
  'Quantity Revision',
  'Rate Revision',
  'Scope Addition',
  'Scope Deletion',
  'Delivery Date Extension',
  'GST Correction',
  'Payment Terms Change',
  'Specification Change',
  'Others',
];

const APPROVAL_THRESHOLD = 200000; // ₹2,00,000 — increase beyond this needs higher authority re-approval
const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const inrFull = v => `₹${Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

// ─────────────────────────────────────────────────────────────────────────────
// LINE-ITEM AMENDMENT EDITOR — revise qty/rate per item against a live PO.
// On submit this creates a new "-A{n}" PO (the convention already used across
// this app's reconciliation reports) carrying the revised items, plus a
// po_amendments log entry for the approval history below.
// ─────────────────────────────────────────────────────────────────────────────
function POAmendEditor({ poId, pos, onClose, onSubmitted }) {
  const user = useAuthStore(state => state.user);
  const [selectedPoId, setSelectedPoId] = useState(poId || '');
  const [reasonCode, setReasonCode] = useState(REASON_OPTIONS[0]);
  const [remarks, setRemarks] = useState('');
  const [raisedBy, setRaisedBy] = useState(user?.name || '');
  const [items, setItems] = useState([]);

  const ctxQuery = useQuery({
    queryKey: ['po-amend-context', selectedPoId],
    queryFn: () => poAPI.amendmentContext(selectedPoId).then(r => r.data?.data),
    enabled: !!selectedPoId,
  });
  const ctx = ctxQuery.data;

  useEffect(() => {
    if (!ctx) return;
    setItems((ctx.items || []).map(it => ({
      po_item_id: it.id,
      material_name: it.material_name,
      unit: it.unit,
      original_gst_rate: num(it.gst_rate),
      gst_rate: num(it.gst_rate),
      original_qty: num(it.quantity),
      revised_qty: num(it.quantity),
      original_rate: num(it.rate),
      revised_rate: num(it.rate),
      received_qty: num(it.received_quantity),
    })));
  }, [ctx]);

  const updateItem = (idx, field, value) => setItems(prev => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  const removeItem = idx => setItems(prev => prev.filter((_, i) => i !== idx));
  const addBlankItem = () => setItems(prev => [...prev, {
    po_item_id: null, material_name: '', unit: 'Nos', original_gst_rate: 0, gst_rate: 0,
    original_qty: 0, revised_qty: 0, original_rate: 0, revised_rate: 0, received_qty: 0,
  }]);

  const originalTotal = useMemo(() => items.reduce((s, it) => {
    const basic = num(it.original_qty) * num(it.original_rate);
    return s + basic + basic * (num(it.original_gst_rate) / 100);
  }, 0), [items]);
  const revisedTotal  = useMemo(() => items.reduce((s, it) => {
    const basic = num(it.revised_qty) * num(it.revised_rate);
    return s + basic + basic * (num(it.gst_rate) / 100);
  }, 0), [items]);
  const difference = revisedTotal - originalTotal;
  const requiresReApproval = Math.abs(difference) > APPROVAL_THRESHOLD;
  const underReceivedWarnings = items.filter(it => num(it.revised_qty) < num(it.received_qty) && num(it.received_qty) > 0);

  const submitMut = useMutation({
    mutationFn: () => poAPI.submitAmendment(selectedPoId, {
      reason_code: reasonCode,
      reason_remarks: remarks,
      raised_by: raisedBy,
      items: items.filter(it => it.material_name?.trim()).map(it => ({
        po_item_id: it.po_item_id,
        material_name: it.material_name,
        unit: it.unit,
        gst_rate: it.gst_rate,
        quantity: num(it.revised_qty),
        rate: num(it.revised_rate),
      })),
    }),
    onSuccess: (res) => {
      toast.success(`${res.data?.data?.po?.po_ref_no || 'Amendment'} created`);
      onSubmitted();
    },
    onError: err => toast.error(err?.response?.data?.error || 'Unable to submit amendment'),
  });

  const handleSubmit = () => {
    if (!selectedPoId) return toast.error('Select a PO to amend');
    if (!raisedBy.trim()) return toast.error('Enter who is raising this amendment');
    if (!items.some(it => it.material_name?.trim())) return toast.error('Add at least one line item');
    submitMut.mutate();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl my-6">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div>
            <h2 className="text-base font-medium text-slate-900">New PO Amendment</h2>
            <p className="text-xs text-slate-500 mt-0.5">Revise quantities/rates — saved as a new {ctx?.next_amendment_ref || '-A{n}'} purchase order</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="col-span-2">
              <label className="block text-xs text-slate-500 mb-1">Purchase Order *</label>
              <select
                value={selectedPoId}
                onChange={e => setSelectedPoId(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400">
                <option value="">Select PO to amend</option>
                {(pos || []).map(po => (
                  <option key={po.id} value={po.id}>
                    {po.po_ref_no || po.serial_no_formatted || po.po_number} — {po.vendor_name}
                  </option>
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

          {!selectedPoId ? (
            <div className="py-10 text-center text-sm text-slate-400">Select a purchase order above to load its line items.</div>
          ) : ctxQuery.isLoading ? (
            <div className="py-10 text-center text-sm text-slate-400 flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading PO items…</div>
          ) : ctxQuery.isError ? (
            <div className="py-10 text-center text-sm text-red-500 flex flex-col items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              {ctxQuery.error?.response?.data?.error || 'Failed to load PO items'}
              <button onClick={() => ctxQuery.refetch()} className="text-xs text-indigo-600 hover:underline mt-1">Retry</button>
            </div>
          ) : (
            <>
              <div className="border border-slate-200 rounded-lg overflow-hidden">
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
                        const origBasic = num(it.original_qty) * num(it.original_rate);
                        const revBasic = num(it.revised_qty) * num(it.revised_rate);
                        const origAmt = origBasic + origBasic * (num(it.original_gst_rate) / 100);
                        const revAmt = revBasic + revBasic * (num(it.gst_rate) / 100);
                        const diff = revAmt - origAmt;
                        const underReceived = num(it.revised_qty) < num(it.received_qty) && num(it.received_qty) > 0;
                        return (
                          <tr key={idx} className="border-t border-slate-100">
                            <td className="px-3 py-2">
                              <input
                                value={it.material_name}
                                onChange={e => updateItem(idx, 'material_name', e.target.value)}
                                placeholder="Item description"
                                className="w-full min-w-[160px] border border-slate-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-300" />
                              {underReceived && (
                                <div className="flex items-center gap-1 text-amber-600 text-[11px] mt-1">
                                  <AlertTriangle className="w-3 h-3" />
                                  Below {it.received_qty} already received
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
                                  underReceived ? 'border-amber-400' : 'border-slate-200')} />
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
                              {diff !== 0 ? `${diff > 0 ? '+' : ''}${inrFull(diff)}` : '—'}
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

              {underReceivedWarnings.length > 0 && (
                <div className="flex items-start gap-2 px-4 py-3 rounded-md bg-amber-50 text-amber-700 ring-1 ring-amber-200 text-sm">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{underReceivedWarnings.length} item{underReceivedWarnings.length > 1 ? 's' : ''} have revised quantity below what's already received via GRN. Confirm this is intentional.</span>
                </div>
              )}
              {requiresReApproval && (
                <div className="flex items-start gap-2 px-4 py-3 rounded-md bg-orange-50 text-orange-700 ring-1 ring-orange-200 text-sm">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>Value change of {inrFull(Math.abs(difference))} exceeds the {inrFull(APPROVAL_THRESHOLD)} threshold — flag for higher-authority approval.</span>
                </div>
              )}

              <div className="bg-slate-50 rounded-lg p-4 grid grid-cols-3 gap-4">
                <div>
                  <div className="text-xs text-slate-500 uppercase mb-1">Original Value</div>
                  <div className="text-base font-semibold text-slate-700">{inrFull(originalTotal)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 uppercase mb-1">Revised Value</div>
                  <div className="text-base font-semibold text-slate-900">{inrFull(revisedTotal)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 uppercase mb-1">Difference</div>
                  <div className={clsx('text-base font-semibold', difference > 0 ? 'text-orange-600' : difference < 0 ? 'text-sky-600' : 'text-slate-500')}>
                    {difference !== 0 ? `${difference > 0 ? '+' : ''}${inrFull(difference)}` : '—'}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex gap-3 px-5 pb-5">
          <button onClick={onClose} className="flex-1 py-2.5 bg-slate-100 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-200 transition-all">Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={submitMut.isPending || !selectedPoId}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 shadow-sm transition-all disabled:opacity-60">
            {submitMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {submitMut.isPending ? 'Submitting…' : 'Submit Amendment'}
          </button>
        </div>
      </div>
    </div>
  );
}

const asArray = payload => {
  if (Array.isArray(payload)) return payload;
  return payload?.data || payload?.rows || payload?.items || [];
};

const clean = value => String(value || '').trim().toLowerCase();
const poRef = po => po?.po_ref_no || po?.serial_no_formatted || po?.po_number || po?.poNo || '';
const money = value => `₹${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmt = value => (value ? dayjs(value).format('DD MMM YYYY') : '—');

const AMENDMENT_TYPES = ['Qty Change', 'Rate Change', 'Date Extension', 'Item Addition', 'Item Deletion', 'Cancellation'];
const STATUS_COLORS = {
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  rejected: 'bg-rose-50 text-rose-700 border-rose-200',
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
      <div className="text-[11px] font-medium tracking-[0.18em] text-slate-900 font-medium uppercase mt-1">{label}</div>
      <div className="text-xs text-slate-900 font-medium mt-1.5 leading-tight">{sub}</div>
    </div>
  );
}

// Editing/deleting an amendment is restricted to procurement & super admin users
function canManageProcurement(user) {
  if (!user) return false;
  const role = (user.role || '').toLowerCase();
  return role === 'super_admin' || role.includes('procurement');
}

export default function POAmendmentLogPage() {
  const qc = useQueryClient();
  const user = useAuthStore(state => state.user);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [showDetail, setShowDetail] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    po_id: '',
    amendment_type: 'Qty Change',
    description: '',
    value_impact: '',
    impact_type: 'increase',
    raised_by: user?.name || '',
    amendment_date: dayjs().format('YYYY-MM-DD'),
  });

  const amendmentQuery = useQuery({
    queryKey: ['procurement-po-amendments'],
    queryFn: () => poAmendmentAPI.list().then(r => asArray(r.data)).catch(() => []),
  });
  const poQuery = useQuery({
    queryKey: ['procurement-po-amendment-pos'],
    queryFn: async () => {
      const list = asArray((await poAPI.list()).data);
      const detailed = await Promise.all(
        list.map(async po => {
          try {
            const res = await poAPI.get(po.id);
            return res.data?.data || res.data || po;
          } catch {
            return po;
          }
        })
      );
      return detailed;
    },
  });
  const vendorQuery = useQuery({
    queryKey: ['procurement-po-amendment-vendors'],
    queryFn: () => vendorAPI.list().then(r => asArray(r.data)).catch(() => []),
  });

  const createMut = useMutation({
    mutationFn: payload => poAmendmentAPI.create(payload),
    onSuccess: () => {
      toast.success('PO amendment logged');
      setShowModal(false);
      setForm({
        po_id: '',
        amendment_type: 'Qty Change',
        description: '',
        value_impact: '',
        impact_type: 'increase',
        raised_by: user?.name || '',
        amendment_date: dayjs().format('YYYY-MM-DD'),
      });
      qc.invalidateQueries({ queryKey: ['procurement-po-amendments'] });
    },
    onError: err => toast.error(err?.response?.data?.error || 'Unable to log amendment'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => poAmendmentAPI.update(id, data),
    onSuccess: () => {
      toast.success('Amendment updated');
      setShowModal(false);
      setEditingId(null);
      qc.invalidateQueries({ queryKey: ['procurement-po-amendments'] });
    },
    onError: err => toast.error(err?.response?.data?.error || 'Unable to update amendment'),
  });

  const approveMut = useMutation({
    mutationFn: id => poAmendmentAPI.approve(id),
    onSuccess: () => {
      toast.success('Amendment approved');
      qc.invalidateQueries({ queryKey: ['procurement-po-amendments'] });
    },
    onError: err => toast.error(err?.response?.data?.error || 'Unable to approve'),
  });
  const rejectMut = useMutation({
    mutationFn: id => poAmendmentAPI.reject(id),
    onSuccess: () => {
      toast.success('Amendment rejected');
      qc.invalidateQueries({ queryKey: ['procurement-po-amendments'] });
    },
    onError: err => toast.error(err?.response?.data?.error || 'Unable to reject'),
  });
  const deleteMut = useMutation({
    mutationFn: id => poAmendmentAPI.delete(id),
    onSuccess: () => {
      toast.success('Amendment deleted');
      qc.invalidateQueries({ queryKey: ['procurement-po-amendments'] });
    },
    onError: err => toast.error(err?.response?.data?.error || 'Unable to delete'),
  });

  const poLookup = useMemo(() => {
    const map = new Map();
    (poQuery.data || []).forEach(po => map.set(po.id, po));
    return map;
  }, [poQuery.data]);

  const vendorLookup = useMemo(() => {
    const map = new Map();
    (vendorQuery.data || []).forEach(v => map.set(v.id, v));
    return map;
  }, [vendorQuery.data]);

  const amendments = useMemo(() => {
    return (amendmentQuery.data || []).map(row => ({
      ...row,
      status_view: row.status || 'pending',
      po: row.po_id ? poLookup.get(row.po_id) : null,
      vendor: row.vendor_id ? vendorLookup.get(row.vendor_id) : null,
      searchText: [
        row.amendment_no,
        row.amendment_type,
        row.description,
        row.raised_by,
        row.po_ref_no,
        row.po_number,
        row.serial_no_formatted,
        row.vendor_name,
      ].map(clean).join(' '),
    }));
  }, [amendmentQuery.data, poLookup, vendorLookup]);

  const filtered = useMemo(() => {
    const q = clean(search);
    return amendments.filter(row => {
      if (filterStatus !== 'all' && row.status_view !== filterStatus) return false;
      if (filterType !== 'all' && row.amendment_type !== filterType) return false;
      if (!q) return true;
      return clean(row.searchText).includes(q);
    });
  }, [amendments, filterStatus, filterType, search]);

  const stats = useMemo(() => ({
    total: amendments.length,
    pending: amendments.filter(a => a.status_view === 'pending').length,
    approved: amendments.filter(a => a.status_view === 'approved').length,
    impact: amendments.reduce((sum, a) => sum + (a.impact_type === 'increase' ? Number(a.value_impact || 0) : a.impact_type === 'decrease' ? -Number(a.value_impact || 0) : 0), 0),
  }), [amendments]);

  const refresh = async () => {
    await Promise.all([amendmentQuery.refetch(), poQuery.refetch(), vendorQuery.refetch()]);
    toast.success('PO amendments refreshed');
  };

  const openNew = () => {
    setEditingId(null);
    setForm({
      po_id: '',
      amendment_type: 'Qty Change',
      description: '',
      value_impact: '',
      impact_type: 'increase',
      raised_by: user?.name || '',
      amendment_date: dayjs().format('YYYY-MM-DD'),
    });
    setShowModal(true);
  };

  const openEdit = (a) => {
    setEditingId(a.id);
    setForm({
      po_id: a.po_id || '',
      amendment_type: a.amendment_type || 'Qty Change',
      description: a.description || '',
      value_impact: a.value_impact ?? '',
      impact_type: a.impact_type || 'increase',
      raised_by: a.raised_by || user?.name || '',
      amendment_date: a.amendment_date ? dayjs(a.amendment_date).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
    });
    setShowModal(true);
  };

  const handleSave = () => {
    if (!form.po_id || !form.amendment_type || !form.description || !form.raised_by || !form.amendment_date) {
      toast.error('Fill all required fields');
      return;
    }
    if (editingId) {
      updateMut.mutate({ id: editingId, data: form });
    } else {
      createMut.mutate(form);
    }
  };

  const selectedPo = form.po_id ? poLookup.get(form.po_id) : null;

  return (
    <div className="p-6 md:p-7 max-w-7xl mx-auto min-h-screen bg-[#f4f6f9]">
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4 mb-5">
        <div>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.28em] text-indigo-500 font-medium mb-1.5">
            <FileSignature className="w-3.5 h-3.5" />
            Procurement
          </div>
          <h1 className="text-2xl md:text-[28px] font-medium text-slate-900 leading-tight">PO Amendment Log</h1>
          <p className="text-sm text-slate-900 font-medium mt-1.5 max-w-2xl">
            Real amendment ledger linked to live purchase orders and vendors.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refresh}
            className="inline-flex items-center gap-2 px-4 h-10 rounded-xl border border-slate-200 bg-white text-slate-900 text-sm font-medium hover:border-indigo-300 hover:text-indigo-700 transition-all shadow-sm"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <button
            onClick={openNew}
            className="inline-flex items-center gap-2 px-4 h-10 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-medium hover:border-indigo-300 hover:text-indigo-700 transition-all shadow-sm"
            title="Log a non-item change (date extension, payment terms, etc.) without revising line items"
          >
            <FileText className="w-4 h-4" />
            Log Other Change
          </button>
          <button
            onClick={() => setShowEditor(true)}
            className="inline-flex items-center gap-2 px-4 h-10 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-all shadow-sm"
          >
            <Plus className="w-4 h-4" />
            New Amendment
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatCard label="Amendments" value={stats.total} sub="Live records only" icon={ClipboardList} tone="indigo" />
        <StatCard label="Pending" value={stats.pending} sub="Awaiting action" icon={CalendarDays} tone="amber" />
        <StatCard label="Approved" value={stats.approved} sub="Completed approvals" icon={CheckCircle2} tone="emerald" />
        <StatCard label="Net Impact" value={money(stats.impact)} sub="Increase minus decrease" icon={BadgeIndianRupee} tone="rose" />
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-3 md:p-4 shadow-sm mb-5">
        <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr_0.9fr_auto] gap-3 items-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search PO, vendor, AMD..."
              className="w-full h-10 bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-indigo-400"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium tracking-[0.18em] uppercase text-slate-900 font-medium mb-1">Status</label>
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
            <label className="block text-[11px] font-medium tracking-[0.18em] uppercase text-slate-900 font-medium mb-1">Type</label>
            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
              className="w-full h-10 bg-slate-50 border border-slate-200 rounded-xl px-3 text-sm text-slate-900 outline-none focus:border-indigo-400"
            >
              <option value="all">All Types</option>
              {AMENDMENT_TYPES.map(type => <option key={type}>{type}</option>)}
            </select>
          </div>

          <div className="flex items-end gap-2">
            <button
              onClick={() => {
                setSearch('');
                setFilterStatus('all');
                setFilterType('all');
              }}
              className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-slate-900 font-medium text-sm font-medium hover:text-indigo-700 hover:border-indigo-300 transition-all"
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
            <p className="text-xs text-slate-900 font-medium mt-0.5">Linked to real purchase orders and vendors</p>
          </div>
          <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">
            {filtered.length} row{filtered.length === 1 ? '' : 's'}
          </span>
        </div>

        {amendmentQuery.isLoading || poQuery.isLoading || vendorQuery.isLoading ? (
          <div className="p-5 space-y-2">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-14 rounded-xl bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-14 text-center">
            <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-600">No amendments logged yet</p>
            <p className="text-xs text-slate-900 font-medium mt-1">Create the first amendment against a live purchase order.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {filtered.map(a => (
              <div key={a.id} className="p-4 hover:bg-slate-50/70 transition-colors">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className={clsx('mt-1 w-3 h-3 rounded-full shrink-0', a.status_view === 'approved' ? 'bg-emerald-500' : a.status_view === 'pending' ? 'bg-amber-400' : 'bg-rose-400')} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-medium text-sm text-indigo-700">{poRef(a) || 'PO'}</span>
                        <span className="text-slate-900 font-medium text-xs">—</span>
                        <span className="text-sm font-medium">{a.amendment_no}</span>
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-900 border border-slate-200">{a.amendment_type}</span>
                        <span className={clsx('px-2 py-0.5 rounded text-xs font-medium border', STATUS_COLORS[a.status_view])}>{a.status_view}</span>
                      </div>
                      <p className="text-xs text-slate-900 font-medium mb-2">
                        {a.vendor_name || a.vendor?.name || 'Vendor'} · {fmt(a.amendment_date)} · Raised by: {a.raised_by || '—'}
                      </p>
                      <div className="bg-slate-50 border-l-2 border-indigo-600 rounded px-3 py-2 text-xs text-slate-700">
                        {a.description}
                        {Number(a.value_impact || 0) !== 0 && (
                          <span className={clsx('ml-2 font-medium', a.impact_type === 'increase' ? 'text-emerald-700' : 'text-rose-600')}>
                            · Value Impact: {a.impact_type === 'increase' ? '+' : a.impact_type === 'decrease' ? '-' : ''}{money(a.value_impact)}
                          </span>
                        )}
                      </div>
                      {a.status_view === 'approved' && a.approved_by_name && (
                        <p className="text-xs text-slate-900 font-medium mt-1">Approved by {a.approved_by_name} on {fmt(a.approved_at)}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 items-center" onClick={e => e.stopPropagation()}>
                    <button onClick={() => setShowDetail(a)} className="text-xs border border-slate-200 rounded px-2 py-1 hover:bg-slate-100">Details</button>
                    {a.status_view === 'pending' && (
                      <>
                        <button
                          onClick={() => window.confirm(`Approve amendment ${a.amendment_no}?\n\n"${a.description?.slice(0, 120)}"`) && approveMut.mutate(a.id)}
                          disabled={approveMut.isPending}
                          className="text-xs border border-emerald-200 text-emerald-700 rounded px-2 py-1 hover:bg-emerald-50 disabled:opacity-50">
                          Approve
                        </button>
                        <button
                          onClick={() => window.confirm(`Reject amendment ${a.amendment_no}?\n\nThis will permanently mark it as rejected.`) && rejectMut.mutate(a.id)}
                          disabled={rejectMut.isPending}
                          className="text-xs border border-rose-200 text-rose-600 rounded px-2 py-1 hover:bg-rose-50 disabled:opacity-50">
                          Reject
                        </button>
                        {canManageProcurement(user) && (
                          <button
                            onClick={() => openEdit(a)}
                            className="text-xs border border-amber-200 text-amber-700 rounded px-2 py-1 hover:bg-amber-50">
                            Edit
                          </button>
                        )}
                      </>
                    )}
                    {canManageProcurement(user) && (
                      <button
                        onClick={() => window.confirm(`Delete amendment ${a.amendment_no}? This cannot be undone.`) && deleteMut.mutate(a.id)}
                        disabled={deleteMut.isPending}
                        className="text-xs border border-slate-200 text-slate-500 rounded px-2 py-1 hover:bg-red-50 hover:border-red-200 hover:text-red-600 disabled:opacity-50">
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-6">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div>
                <h2 className="text-base font-medium text-slate-900">{editingId ? 'Edit Amendment' : 'Log Amendment'}</h2>
                <p className="text-xs text-slate-900 font-medium mt-0.5">Linked to live purchase orders</p>
              </div>
              <button onClick={() => { setShowModal(false); setEditingId(null); }} className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-900 font-medium hover:text-slate-900 transition-all">×</button>
            </div>

            <div className="p-5 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-900 font-medium mb-1">PO Number *</label>
                  <select
                    value={form.po_id}
                    onChange={e => {
                      const po = poLookup.get(e.target.value);
                      setForm(prev => ({
                        ...prev,
                        po_id: e.target.value,
                        raised_by: prev.raised_by || user?.name || '',
                      }));
                    }}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400"
                  >
                    <option value="">Select PO</option>
                    {(poQuery.data || []).map(po => (
                      <option key={po.id} value={po.id}>
                        {poRef(po)} - {(po.vendor_name || '')}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-900 font-medium mb-1">Vendor</label>
                  <input
                    value={selectedPo?.vendor_name || '—'}
                    disabled
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-slate-50 text-slate-700"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-900 font-medium mb-1">Amendment Type *</label>
                  <select
                    value={form.amendment_type}
                    onChange={e => setForm(prev => ({ ...prev, amendment_type: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400"
                  >
                    {AMENDMENT_TYPES.map(type => <option key={type}>{type}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-900 font-medium mb-1">Date *</label>
                  <input
                    type="date"
                    value={form.amendment_date}
                    onChange={e => setForm(prev => ({ ...prev, amendment_date: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-900 font-medium mb-1">Value Impact (₹)</label>
                  <input
                    type="number"
                    value={form.value_impact}
                    onChange={e => setForm(prev => ({ ...prev, value_impact: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-900 font-medium mb-1">Impact Type</label>
                  <select
                    value={form.impact_type}
                    onChange={e => setForm(prev => ({ ...prev, impact_type: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400"
                  >
                    <option value="increase">Increase</option>
                    <option value="decrease">Decrease</option>
                    <option value="none">None</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-slate-900 font-medium mb-1">Raised By *</label>
                  <input
                    value={form.raised_by}
                    onChange={e => setForm(prev => ({ ...prev, raised_by: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400"
                    placeholder="Logged by"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-900 font-medium mb-1">Description / Reason *</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
                  rows={4}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 resize-none"
                  placeholder="Describe the amendment..."
                />
              </div>
            </div>

            <div className="flex gap-3 px-5 pb-5">
              <button
                type="button"
                onClick={() => { setShowModal(false); setEditingId(null); }}
                className="flex-1 py-2.5 bg-slate-100 text-slate-900 text-sm font-medium rounded-lg hover:bg-slate-200 transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={createMut.isPending || updateMut.isPending}
                className="flex-1 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 shadow-sm transition-all disabled:opacity-60"
              >
                {(createMut.isPending || updateMut.isPending) ? 'Saving…' : editingId ? 'Save Changes' : 'Submit Amendment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDetail && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md my-6">
            <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-medium text-slate-900">{showDetail.amendment_no}</h2>
                <p className="text-xs text-slate-900 font-medium mt-0.5">{poRef(showDetail)}</p>
              </div>
              <button onClick={() => setShowDetail(null)} className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-900 font-medium hover:text-slate-900 transition-all">×</button>
            </div>
            <div className="p-5 space-y-2 text-sm">
              {[
                ['Vendor', showDetail.vendor_name],
                ['Type', showDetail.amendment_type],
                ['Description', showDetail.description],
                ['Value Impact', showDetail.value_impact ? `${showDetail.impact_type === 'increase' ? '+' : showDetail.impact_type === 'decrease' ? '-' : ''}${money(showDetail.value_impact)}` : 'No change'],
                ['Date', fmt(showDetail.amendment_date)],
                ['Raised By', showDetail.raised_by],
                ['Status', showDetail.status_view],
                ['Approved By', showDetail.approved_by_name || '—'],
                ['Approval Date', fmt(showDetail.approved_at)],
              ].map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <span className="text-slate-900 font-medium w-28 shrink-0">{k}</span>
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

      {showEditor && (
        <POAmendEditor
          pos={poQuery.data || []}
          onClose={() => setShowEditor(false)}
          onSubmitted={() => {
            setShowEditor(false);
            qc.invalidateQueries({ queryKey: ['procurement-po-amendments'] });
            qc.invalidateQueries({ queryKey: ['procurement-po-amendment-pos'] });
          }}
        />
      )}
    </div>
  );
}
