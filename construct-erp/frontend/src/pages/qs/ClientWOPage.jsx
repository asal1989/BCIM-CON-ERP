// src/pages/qs/ClientWOPage.jsx — Client Work Orders received from clients
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FileSignature, Plus, X, Search, Building2, Calendar,
  ChevronRight, Edit2, Trash2, IndianRupee, CheckCircle2,
  Clock, AlertTriangle, TrendingUp, RefreshCw, ArrowUpRight,
  FilePlus, Layers, Banknote, Receipt,
} from 'lucide-react';
import { clsx } from 'clsx';
import dayjs from 'dayjs';
import { clientWOAPI, projectAPI } from '../../api/client';
import useAuthStore from '../../store/authStore';
import toast from 'react-hot-toast';

const inr = v => `₹${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (num, den) => den > 0 ? Math.min(100, Math.round((Number(num) / Number(den)) * 100)) : 0;

const STATUS_CFG = {
  draft:      { label: 'Draft',      cls: 'bg-slate-100 text-slate-600 border-slate-200',   dot: 'bg-slate-400' },
  active:     { label: 'Active',     cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  completed:  { label: 'Completed',  cls: 'bg-blue-50 text-blue-700 border-blue-200',       dot: 'bg-blue-500' },
  terminated: { label: 'Terminated', cls: 'bg-red-50 text-red-600 border-red-200',          dot: 'bg-red-400' },
  closed:     { label: 'Closed',     cls: 'bg-gray-100 text-gray-500 border-gray-200',      dot: 'bg-gray-400' },
};

const STATUSES = ['draft', 'active', 'completed', 'terminated', 'closed'];

const EMPTY_FORM = {
  project_id: '', client_name: '', wo_number: '', wo_date: '',
  title: '', description: '', scope: '', contract_value: '',
  gst_percentage: '18', retention_percentage: '0', status: 'active', notes: '',
};

const EMPTY_AMEND = { description: '', amount_change: '', amendment_date: '' };

function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] || STATUS_CFG.draft;
  return (
    <span className={clsx('inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border', cfg.cls)}>
      <span className={clsx('w-1.5 h-1.5 rounded-full', cfg.dot)} />
      {cfg.label}
    </span>
  );
}

function BillingBar({ billed, total }) {
  const p = pct(billed, total);
  return (
    <div className="w-full">
      <div className="flex justify-between text-xs text-gray-500 mb-1">
        <span>Billed {p}%</span>
        <span>{inr(billed)} / {inr(total)}</span>
      </div>
      <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
        <div className={clsx('h-full rounded-full transition-all', p >= 100 ? 'bg-emerald-500' : p >= 60 ? 'bg-blue-500' : 'bg-amber-400')}
          style={{ width: `${p}%` }} />
      </div>
    </div>
  );
}

// ── Create/Edit Modal ─────────────────────────────────────────────────────────
function WOModal({ open, onClose, initial, projects, onSaved }) {
  const [form, setForm] = useState(initial || EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const isEdit = !!initial?.id;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.title.trim()) return toast.error('Title is required');
    setSaving(true);
    try {
      const payload = { ...form, contract_value: Number(form.contract_value) || 0,
        gst_percentage: Number(form.gst_percentage) || 18,
        retention_percentage: Number(form.retention_percentage) || 0 };
      if (isEdit) await clientWOAPI.update(initial.id, payload);
      else        await clientWOAPI.create(payload);
      toast.success(isEdit ? 'Work order updated' : 'Work order created');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Save failed');
    } finally { setSaving(false); }
  }

  if (!open) return null;
  const inp = 'w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200 transition-colors bg-white';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-2">
            <FileSignature size={18} className="text-blue-600" />
            <h2 className="font-bold text-gray-900">{isEdit ? 'Edit Work Order' : 'New Client Work Order'}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className="overflow-y-auto px-6 py-5 space-y-4 flex-1">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-600 mb-1">Work Order Title *</label>
              <input required className={inp} placeholder="e.g. Structural Works — Tower A" value={form.title} onChange={set('title')} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Project</label>
              <select className={inp} value={form.project_id} onChange={set('project_id')}>
                <option value="">— Select project —</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.project_code ? `[${p.project_code}] ` : ''}{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Client / Owner</label>
              <input className={inp} placeholder="e.g. Divyasree Developers" value={form.client_name} onChange={set('client_name')} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">WO Number</label>
              <input className={inp} placeholder="e.g. DIV/WO/2024/001" value={form.wo_number} onChange={set('wo_number')} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">WO Date</label>
              <input type="date" className={inp} value={form.wo_date} onChange={set('wo_date')} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Contract Value (₹)</label>
              <input type="number" min="0" step="0.01" className={inp} placeholder="0.00" value={form.contract_value} onChange={set('contract_value')} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">GST %</label>
              <input type="number" min="0" max="28" step="0.01" className={inp} value={form.gst_percentage} onChange={set('gst_percentage')} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Retention %</label>
              <input type="number" min="0" max="20" step="0.01" className={inp} value={form.retention_percentage} onChange={set('retention_percentage')} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Status</label>
              <select className={inp} value={form.status} onChange={set('status')}>
                {STATUSES.map(s => <option key={s} value={s}>{STATUS_CFG[s]?.label || s}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-600 mb-1">Scope / Description</label>
              <textarea rows={3} className={inp + ' resize-none'} placeholder="Brief scope of work…" value={form.scope} onChange={set('scope')} />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-600 mb-1">Notes</label>
              <textarea rows={2} className={inp + ' resize-none'} placeholder="Internal notes…" value={form.notes} onChange={set('notes')} />
            </div>
          </div>
        </form>
        <div className="px-6 py-4 border-t flex justify-end gap-3">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">Cancel</button>
          <button onClick={handleSubmit} disabled={saving}
            className="px-5 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 transition-colors">
            {saving ? 'Saving…' : isEdit ? 'Update' : 'Create Work Order'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Amendment Modal ───────────────────────────────────────────────────────────
function AmendModal({ open, onClose, woId, currentValue, onSaved }) {
  const [form, setForm] = useState(EMPTY_AMEND);
  const [saving, setSaving] = useState(false);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const newTotal = Number(currentValue || 0) + Number(form.amount_change || 0);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.description.trim()) return toast.error('Description required');
    setSaving(true);
    try {
      await clientWOAPI.addAmendment(woId, {
        description: form.description,
        amount_change: Number(form.amount_change) || 0,
        amendment_date: form.amendment_date || null,
      });
      toast.success('Amendment added');
      setForm(EMPTY_AMEND);
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed');
    } finally { setSaving(false); }
  }

  if (!open) return null;
  const inp = 'w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200 bg-white';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="font-bold text-gray-900">Add Amendment / Variation</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Description *</label>
            <textarea required rows={3} className={inp + ' resize-none'} placeholder="Describe the variation or change…" value={form.description} onChange={set('description')} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Amount Change (₹)</label>
              <input type="number" step="0.01" className={inp} placeholder="+/- amount" value={form.amount_change} onChange={set('amount_change')} />
              <p className="text-xs text-gray-400 mt-1">Use negative for deductions</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Amendment Date</label>
              <input type="date" className={inp} value={form.amendment_date} onChange={set('amendment_date')} />
            </div>
          </div>
          <div className="p-3 rounded-xl bg-blue-50 border border-blue-100 text-sm">
            <div className="flex justify-between text-gray-600 mb-1">
              <span>Current Contract Value</span><span className="font-semibold">{inr(currentValue)}</span>
            </div>
            <div className="flex justify-between text-gray-600 mb-2">
              <span>Change Amount</span>
              <span className={clsx('font-semibold', Number(form.amount_change) < 0 ? 'text-red-600' : 'text-emerald-600')}>
                {Number(form.amount_change) >= 0 ? '+' : ''}{inr(form.amount_change || 0)}
              </span>
            </div>
            <div className="flex justify-between text-gray-900 font-bold border-t border-blue-200 pt-2">
              <span>Revised Value</span><span>{inr(newTotal)}</span>
            </div>
          </div>
        </form>
        <div className="px-5 py-4 border-t flex justify-end gap-3">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-200 hover:bg-gray-50">Cancel</button>
          <button onClick={handleSubmit} disabled={saving}
            className="px-5 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60">
            {saving ? 'Saving…' : 'Add Amendment'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Detail Panel ──────────────────────────────────────────────────────────────
function DetailPanel({ wo, onClose, onEdit, onAmend, onDelAmend, refetch }) {
  if (!wo) return null;
  const currentVal = wo.amendments?.length
    ? wo.amendments[wo.amendments.length - 1].revised_contract_value
    : wo.contract_value;
  const billed = wo.ra_bills?.reduce((s, b) => s + Number(b.net_amount || 0), 0) || 0;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-white shadow-2xl flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b bg-gradient-to-r from-blue-600 to-blue-700 text-white">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-blue-200 text-xs font-semibold mb-1">{wo.wo_number || 'No WO#'}</p>
              <h3 className="font-bold text-lg leading-snug">{wo.title}</h3>
              {wo.client_name && <p className="text-blue-100 text-sm mt-0.5">{wo.client_name}</p>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={onEdit} className="p-1.5 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"><Edit2 size={14} /></button>
              <button onClick={onClose} className="p-1.5 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"><X size={14} /></button>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-3 text-sm text-blue-100">
            {wo.project_name && <span className="flex items-center gap-1"><Layers size={12} />{wo.project_name}</span>}
            {wo.wo_date && <span className="flex items-center gap-1"><Calendar size={12} />{dayjs(wo.wo_date).format('DD MMM YYYY')}</span>}
            <StatusBadge status={wo.status} />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Financial Summary */}
          <div className="px-6 py-4 border-b">
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="p-3 rounded-xl bg-gray-50 border border-gray-100 text-center">
                <p className="text-xs text-gray-500 mb-1">Contract Value</p>
                <p className="font-bold text-gray-900 text-sm">{inr(currentVal)}</p>
              </div>
              <div className="p-3 rounded-xl bg-blue-50 border border-blue-100 text-center">
                <p className="text-xs text-blue-600 mb-1">Billed</p>
                <p className="font-bold text-blue-700 text-sm">{inr(billed)}</p>
              </div>
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-100 text-center">
                <p className="text-xs text-amber-600 mb-1">Balance</p>
                <p className="font-bold text-amber-700 text-sm">{inr(Number(currentVal) - billed)}</p>
              </div>
            </div>
            <BillingBar billed={billed} total={currentVal} />
            <div className="flex gap-4 mt-3 text-xs text-gray-500">
              {wo.gst_percentage > 0 && <span>GST {wo.gst_percentage}%</span>}
              {wo.retention_percentage > 0 && <span>Retention {wo.retention_percentage}%</span>}
            </div>
          </div>

          {wo.scope && (
            <div className="px-6 py-4 border-b">
              <p className="text-xs font-semibold text-gray-500 mb-2">SCOPE OF WORK</p>
              <p className="text-sm text-gray-700 whitespace-pre-line">{wo.scope}</p>
            </div>
          )}

          {/* Amendments */}
          <div className="px-6 py-4 border-b">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-gray-500">AMENDMENTS / VARIATIONS ({wo.amendments?.length || 0})</p>
              <button onClick={onAmend}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 transition-colors">
                <Plus size={12} /> Add
              </button>
            </div>
            {wo.amendments?.length ? (
              <div className="space-y-2">
                {wo.amendments.map(a => (
                  <div key={a.id} className="p-3 rounded-xl border border-gray-100 bg-gray-50 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold text-blue-600">Amdt #{a.amendment_number}</span>
                        {a.amendment_date && <span className="text-xs text-gray-400">{dayjs(a.amendment_date).format('DD MMM YYYY')}</span>}
                      </div>
                      <p className="text-sm text-gray-700">{a.description}</p>
                      <div className="flex gap-3 mt-1.5 text-xs">
                        <span className={clsx('font-semibold', Number(a.amount_change) < 0 ? 'text-red-600' : 'text-emerald-600')}>
                          {Number(a.amount_change) >= 0 ? '+' : ''}{inr(a.amount_change)}
                        </span>
                        <span className="text-gray-400">→ Revised: {inr(a.revised_contract_value)}</span>
                      </div>
                    </div>
                    <button onClick={() => onDelAmend(wo.id, a.id)}
                      className="p-1 text-gray-300 hover:text-red-500 transition-colors shrink-0">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400 text-center py-4">No amendments yet</p>
            )}
          </div>

          {/* RA Bills */}
          <div className="px-6 py-4">
            <p className="text-xs font-semibold text-gray-500 mb-3">LINKED RA BILLS ({wo.ra_bills?.length || 0})</p>
            {wo.ra_bills?.length ? (
              <div className="space-y-2">
                {wo.ra_bills.map(b => (
                  <div key={b.id} className="flex items-center justify-between p-3 rounded-xl border border-gray-100 hover:border-blue-200 transition-colors">
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{b.bill_number || `Bill`}</p>
                      {b.bill_date && <p className="text-xs text-gray-400">{dayjs(b.bill_date).format('DD MMM YYYY')}</p>}
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-gray-900">{inr(b.net_amount)}</p>
                      <StatusBadge status={b.status} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400 text-center py-4">No RA bills linked to this work order</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ClientWOPage() {
  const qc = useQueryClient();
  const { user } = useAuthStore();

  const [filterProject, setFilterProject] = useState('');
  const [filterStatus, setFilterStatus]   = useState('');
  const [search, setSearch]               = useState('');
  const [showModal, setShowModal]         = useState(false);
  const [editWO, setEditWO]               = useState(null);
  const [detailWO, setDetailWO]           = useState(null);
  const [showAmend, setShowAmend]         = useState(false);

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectAPI.list().then(r => r.data?.data || []),
  });

  const { data: wos = [], isLoading, refetch } = useQuery({
    queryKey: ['client-work-orders', filterProject, filterStatus],
    queryFn: () => clientWOAPI.list({
      project_id: filterProject || undefined,
      status: filterStatus || undefined,
    }).then(r => r.data?.data || []),
  });

  const { data: woDetail, refetch: refetchDetail } = useQuery({
    queryKey: ['client-wo-detail', detailWO?.id],
    queryFn: () => clientWOAPI.get(detailWO.id).then(r => r.data?.data),
    enabled: !!detailWO?.id,
  });

  const deleteMut = useMutation({
    mutationFn: id => clientWOAPI.remove(id),
    onSuccess: () => { toast.success('Work order deleted'); qc.invalidateQueries({ queryKey: ['client-work-orders'] }); setDetailWO(null); },
    onError: e => toast.error(e?.response?.data?.error || 'Delete failed'),
  });

  const delAmendMut = useMutation({
    mutationFn: ({ woId, aid }) => clientWOAPI.delAmendment(woId, aid),
    onSuccess: () => { toast.success('Amendment removed'); refetchDetail(); qc.invalidateQueries({ queryKey: ['client-work-orders'] }); },
    onError: e => toast.error(e?.response?.data?.error || 'Failed'),
  });

  const filtered = wos.filter(w => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (w.title || '').toLowerCase().includes(q)
      || (w.wo_number || '').toLowerCase().includes(q)
      || (w.client_name || '').toLowerCase().includes(q)
      || (w.project_name || '').toLowerCase().includes(q);
  });

  // Summary stats
  const totalVal = wos.reduce((s, w) => s + Number(w.current_contract_value || 0), 0);
  const totalBilled = wos.reduce((s, w) => s + Number(w.billed_amount || 0), 0);
  const activeCount = wos.filter(w => w.status === 'active').length;

  function openEdit(wo) {
    setEditWO({
      ...wo,
      wo_date: wo.wo_date ? dayjs(wo.wo_date).format('YYYY-MM-DD') : '',
      contract_value: wo.contract_value || '',
      gst_percentage: wo.gst_percentage ?? 18,
      retention_percentage: wo.retention_percentage ?? 0,
    });
    setShowModal(true);
  }

  function handleSaved() {
    qc.invalidateQueries({ queryKey: ['client-work-orders'] });
    if (detailWO) refetchDetail();
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Page header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Client Work Orders</h1>
            <p className="text-sm text-gray-500 mt-0.5">Work orders received from clients — track contract value, amendments and billing progress</p>
          </div>
          <button onClick={() => { setEditWO(null); setShowModal(true); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors shadow-sm">
            <Plus size={16} /> New Work Order
          </button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Total Work Orders', value: wos.length, sub: `${activeCount} active`, icon: FileSignature, color: 'text-blue-600', bg: 'bg-blue-50' },
            { label: 'Total Contract Value', value: inr(totalVal), icon: IndianRupee, color: 'text-emerald-600', bg: 'bg-emerald-50' },
            { label: 'Total Billed', value: inr(totalBilled), sub: `${pct(totalBilled, totalVal)}% of contract`, icon: Receipt, color: 'text-amber-600', bg: 'bg-amber-50' },
            { label: 'Balance to Bill', value: inr(totalVal - totalBilled), icon: TrendingUp, color: 'text-purple-600', bg: 'bg-purple-50' },
          ].map(({ label, value, sub, icon: Icon, color, bg }) => (
            <div key={label} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-1">{label}</p>
                  <p className="text-xl font-bold text-gray-900">{value}</p>
                  {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
                </div>
                <div className={clsx('w-9 h-9 rounded-xl flex items-center justify-center', bg)}>
                  <Icon size={16} className={color} />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm mb-4 flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-48">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 bg-gray-50"
              placeholder="Search by title, WO#, client…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400 bg-gray-50"
            value={filterProject} onChange={e => setFilterProject(e.target.value)}>
            <option value="">All Projects</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400 bg-gray-50"
            value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">All Statuses</option>
            {STATUSES.map(s => <option key={s} value={s}>{STATUS_CFG[s]?.label}</option>)}
          </select>
          <button onClick={() => refetch()} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            <RefreshCw size={14} className="text-gray-500" />
          </button>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="text-center py-16 text-gray-400 text-sm">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <FileSignature size={32} className="text-gray-200 mx-auto mb-3" />
              <p className="font-semibold text-gray-400">No work orders found</p>
              <p className="text-sm text-gray-300 mt-1">Create your first client work order to get started</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/60">
                    {['WO #', 'Title / Client', 'Project', 'WO Date', 'Contract Value', 'Billed', 'Balance', 'Status', ''].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(wo => {
                    const curVal = Number(wo.current_contract_value || 0);
                    const billed = Number(wo.billed_amount || 0);
                    const balance = curVal - billed;
                    return (
                      <tr key={wo.id} onClick={() => setDetailWO(wo)}
                        className="border-b border-gray-50 hover:bg-blue-50/30 cursor-pointer transition-colors">
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs text-blue-600 font-semibold">{wo.wo_number || '—'}</span>
                        </td>
                        <td className="px-4 py-3 max-w-xs">
                          <p className="font-semibold text-gray-800 truncate">{wo.title}</p>
                          {wo.client_name && <p className="text-xs text-gray-400">{wo.client_name}</p>}
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-xs whitespace-nowrap">
                          {wo.project_code ? `[${wo.project_code}] ` : ''}{wo.project_name || '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                          {wo.wo_date ? dayjs(wo.wo_date).format('DD MMM YYYY') : '—'}
                        </td>
                        <td className="px-4 py-3 font-semibold text-gray-800 whitespace-nowrap tabular-nums">
                          {inr(curVal)}
                          {Number(wo.amendment_count) > 0 && (
                            <span className="ml-1.5 text-xs text-blue-500 font-normal">+{wo.amendment_count} amdt</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-blue-600 font-semibold whitespace-nowrap tabular-nums">{inr(billed)}</td>
                        <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                          <span className={clsx('font-semibold', balance < 0 ? 'text-red-600' : 'text-gray-800')}>{inr(balance)}</span>
                        </td>
                        <td className="px-4 py-3"><StatusBadge status={wo.status} /></td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                            <button onClick={() => openEdit(wo)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                              <Edit2 size={13} className="text-gray-400" />
                            </button>
                            <button onClick={() => deleteMut.mutate(wo.id)}
                              className="p-1.5 hover:bg-red-50 rounded-lg transition-colors">
                              <Trash2 size={13} className="text-gray-300 hover:text-red-500" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <WOModal open={showModal} onClose={() => { setShowModal(false); setEditWO(null); }}
        initial={editWO} projects={projects} onSaved={handleSaved} />

      {detailWO && (
        <DetailPanel
          wo={woDetail || detailWO}
          onClose={() => setDetailWO(null)}
          onEdit={() => { openEdit(woDetail || detailWO); }}
          onAmend={() => setShowAmend(true)}
          onDelAmend={(woId, aid) => delAmendMut.mutate({ woId, aid })}
          refetch={refetchDetail}
        />
      )}

      {showAmend && detailWO && (
        <AmendModal
          open={showAmend}
          onClose={() => setShowAmend(false)}
          woId={detailWO.id}
          currentValue={
            woDetail?.amendments?.length
              ? woDetail.amendments[woDetail.amendments.length - 1].revised_contract_value
              : woDetail?.contract_value || detailWO.contract_value
          }
          onSaved={() => { refetchDetail(); qc.invalidateQueries({ queryKey: ['client-work-orders'] }); }}
        />
      )}
    </div>
  );
}
