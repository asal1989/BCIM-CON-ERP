// src/pages/stores/MaterialTransferPage.jsx — Material Transfer (MTR)
import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { mtrAPI, projectAPI } from '../../api/client';
import { PageHeader, KpiCard as ThemeKpiCard, Theme } from '../../theme';
import {
  Plus, Search, RefreshCw, X, Eye, CheckCircle2, Truck,
  ArrowRight, Clock, Package, AlertTriangle, Send,
  ChevronRight, MapPin, Hash, Calendar, User, FileText,
  Trash2, Edit2, PackageCheck, Filter, Download
} from 'lucide-react';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import dayjs from 'dayjs';

/* ── helpers ─────────────────────────────────────────────────────────────── */
const fmt = (n) => `₹${Number(n||0).toLocaleString('en-IN',{maximumFractionDigits:0})}`;
const inp = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-300 focus:border-teal-400 transition bg-white';

const TRANSFER_TYPES = {
  site_to_site:     { label: 'Site to Site',      color: 'bg-blue-100 text-blue-700' },
  store_to_site:    { label: 'Store to Site',      color: 'bg-emerald-100 text-emerald-700' },
  site_to_store:    { label: 'Site to Store',      color: 'bg-amber-100 text-amber-700' },
  inter_store:      { label: 'Inter Store',        color: 'bg-purple-100 text-purple-700' },
  return_to_store:  { label: 'Return to Store',    color: 'bg-rose-100 text-rose-700' },
};

const STATUS_META = {
  draft:            { label: 'Draft',              bg: 'bg-slate-100',    text: 'text-slate-600',   icon: Edit2 },
  pending_approval: { label: 'Pending Approval',   bg: 'bg-amber-100',    text: 'text-amber-700',   icon: Clock },
  approved:         { label: 'Approved',           bg: 'bg-blue-100',     text: 'text-blue-700',    icon: CheckCircle2 },
  issued:           { label: 'Issued',             bg: 'bg-indigo-100',   text: 'text-indigo-700',  icon: Send },
  in_transit:       { label: 'In Transit',         bg: 'bg-orange-100',   text: 'text-orange-700',  icon: Truck },
  received:         { label: 'Received',           bg: 'bg-emerald-100',  text: 'text-emerald-700', icon: PackageCheck },
  cancelled:        { label: 'Cancelled',          bg: 'bg-red-100',      text: 'text-red-700',     icon: X },
};

import { CONSTRUCTION_UNITS as UNITS } from '../../constants/units';

/* ── Field label ─────────────────────────────────────────────────────────── */
const Field = ({ label, required, children, className = '' }) => (
  <div className={className}>
    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
      {label}{required && <span className="text-red-400 ml-0.5">*</span>}
    </label>
    {children}
  </div>
);

/* ── Status badge ────────────────────────────────────────────────────────── */
const StatusBadge = ({ status }) => {
  const m = STATUS_META[status] || STATUS_META.draft;
  const Icon = m.icon;
  return (
    <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold', m.bg, m.text)}>
      <Icon size={10} />{m.label}
    </span>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════
   CREATE / EDIT MODAL
═══════════════════════════════════════════════════════════════════════════ */
function MTRForm({ mtr, projects, onClose }) {
  const qc = useQueryClient();
  const isEdit = !!mtr;

  const EMPTY_ITEM = { material_name:'', material_code:'', unit:'Nos', requested_qty:1, rate:0, source_bin:'', dest_bin:'', condition_note:'', remarks:'' };

  const [form, setForm] = useState(isEdit ? {
    transfer_date: mtr.transfer_date?.slice(0,10) || dayjs().format('YYYY-MM-DD'),
    transfer_type: mtr.transfer_type || 'site_to_site',
    from_project_id: mtr.from_project_id || '',
    from_location: mtr.from_location || '',
    to_project_id: mtr.to_project_id || '',
    to_location: mtr.to_location || '',
    purpose: mtr.purpose || '',
    vehicle_number: mtr.vehicle_number || '',
    driver_name: mtr.driver_name || '',
    driver_mobile: mtr.driver_mobile || '',
    lr_number: mtr.lr_number || '',
    remarks: mtr.remarks || '',
  } : {
    transfer_date: dayjs().format('YYYY-MM-DD'),
    transfer_type: 'site_to_site',
    from_project_id: '', from_location: '',
    to_project_id: '',   to_location: '',
    purpose: '', vehicle_number: '', driver_name: '',
    driver_mobile: '', lr_number: '', remarks: '',
  });

  const [items, setItems] = useState(
    isEdit && mtr.items?.length ? mtr.items.map(it => ({
      id: it.id,
      material_name: it.material_name,
      material_code: it.material_code || '',
      unit: it.unit,
      requested_qty: it.requested_qty,
      rate: it.rate || 0,
      source_bin: it.source_bin || '',
      dest_bin: it.dest_bin || '',
      condition_note: it.condition_note || '',
      remarks: it.remarks || '',
    })) : [{ ...EMPTY_ITEM }]
  );

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setItem = (i, k, v) => setItems(prev => prev.map((it, idx) => idx === i ? { ...it, [k]: v } : it));
  const addItem = () => setItems(prev => [...prev, { ...EMPTY_ITEM }]);
  const removeItem = (i) => setItems(prev => prev.filter((_, idx) => idx !== i));

  const totalValue = useMemo(() =>
    items.reduce((s, it) => s + (parseFloat(it.requested_qty)||0) * (parseFloat(it.rate)||0), 0), [items]);

  const mut = useMutation({
    mutationFn: (d) => isEdit ? mtrAPI.update(mtr.id, d) : mtrAPI.create(d),
    onSuccess: (r) => {
      toast.success(r.data.message || (isEdit ? 'Updated' : 'Transfer created'));
      qc.invalidateQueries({ queryKey: ['mtr-list'] });
      qc.invalidateQueries({ queryKey: ['mtr-stats'] });
      onClose();
    },
    onError: e => toast.error(e?.response?.data?.error || 'Save failed'),
  });

  const handleSave = () => {
    if (!items.some(it => it.material_name?.trim()))
      return toast.error('Add at least one material');
    if (!form.from_project_id && !form.from_location.trim())
      return toast.error('From location is required');
    if (!form.to_project_id && !form.to_location.trim())
      return toast.error('To location is required');
    mut.mutate({ ...form, items: items.filter(it => it.material_name?.trim()) });
  };

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-6 py-4"
        style={{ background: `linear-gradient(135deg, ${Theme.navy} 0%, ${Theme.navyDark} 100%)` }}>
        <div>
          <h2 className="font-bold text-white text-base flex items-center gap-2">
            <Truck size={18} className="opacity-80" />
            {isEdit ? `Edit — ${mtr.mtr_number}` : 'New Material Transfer'}
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.6)' }}>
            Transfer materials between sites, stores or locations
          </p>
        </div>
        <button onClick={onClose}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-white transition"
          style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.20)' }}>
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">

        {/* Section 1 — Transfer Details */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
            <FileText size={14} className="text-teal-500" /> Transfer Details
          </h3>
          <div className="grid grid-cols-3 gap-4">
            <Field label="Transfer Date" required>
              <input type="date" value={form.transfer_date}
                onChange={e => set('transfer_date', e.target.value)} className={inp} />
            </Field>
            <Field label="Transfer Type" required className="col-span-2">
              <div className="grid grid-cols-5 gap-2">
                {Object.entries(TRANSFER_TYPES).map(([k, v]) => (
                  <button key={k} type="button" onClick={() => set('transfer_type', k)}
                    className={clsx('px-2 py-2 rounded-lg border text-xs font-semibold transition-all text-center',
                      form.transfer_type === k
                        ? 'border-teal-500 bg-teal-50 text-teal-700'
                        : 'border-slate-200 text-slate-500 hover:border-teal-300')}>
                    {v.label}
                  </button>
                ))}
              </div>
            </Field>
          </div>

          {/* From → To */}
          <div className="grid grid-cols-2 gap-6">
            {/* FROM */}
            <div className="bg-slate-50 rounded-xl p-4 space-y-3">
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                <MapPin size={11} className="text-rose-400" /> From
              </p>
              <Field label="From Project">
                <select value={form.from_project_id} onChange={e => set('from_project_id', e.target.value)} className={inp}>
                  <option value="">— Select project —</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.project_code} — {p.name}</option>)}
                </select>
              </Field>
              <Field label="From Location / Store">
                <input value={form.from_location} onChange={e => set('from_location', e.target.value)}
                  className={inp} placeholder="e.g. Tower A Store, Site Office" />
              </Field>
            </div>
            {/* TO */}
            <div className="bg-teal-50/50 rounded-xl p-4 space-y-3">
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                <MapPin size={11} className="text-teal-500" /> To
              </p>
              <Field label="To Project">
                <select value={form.to_project_id} onChange={e => set('to_project_id', e.target.value)} className={inp}>
                  <option value="">— Select project —</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.project_code} — {p.name}</option>)}
                </select>
              </Field>
              <Field label="To Location / Store">
                <input value={form.to_location} onChange={e => set('to_location', e.target.value)}
                  className={inp} placeholder="e.g. Ground Floor Store, Block B" />
              </Field>
            </div>
          </div>

          <Field label="Purpose / Reason for Transfer">
            <textarea value={form.purpose} onChange={e => set('purpose', e.target.value)}
              rows={2} className={inp + ' resize-none'} placeholder="Describe why materials are being transferred…" />
          </Field>
        </div>

        {/* Section 2 — Transport Details */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
            <Truck size={14} className="text-teal-500" /> Transport Details <span className="text-slate-400 font-normal text-xs">(optional)</span>
          </h3>
          <div className="grid grid-cols-4 gap-4">
            <Field label="Vehicle Number">
              <input value={form.vehicle_number} onChange={e => set('vehicle_number', e.target.value)} className={inp} placeholder="TN 01 AB 1234" />
            </Field>
            <Field label="Driver Name">
              <input value={form.driver_name} onChange={e => set('driver_name', e.target.value)} className={inp} placeholder="Driver name" />
            </Field>
            <Field label="Driver Mobile">
              <input value={form.driver_mobile} onChange={e => set('driver_mobile', e.target.value)} className={inp} placeholder="9876543210" />
            </Field>
            <Field label="LR / Challan No.">
              <input value={form.lr_number} onChange={e => set('lr_number', e.target.value)} className={inp} placeholder="LR-12345" />
            </Field>
          </div>
        </div>

        {/* Section 3 — Material Items */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
              <Package size={14} className="text-teal-500" /> Materials to Transfer
            </h3>
            <button onClick={addItem}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded-lg text-xs font-semibold hover:bg-teal-700 transition">
              <Plus size={12} /> Add Item
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border border-slate-200 rounded-lg">
                  <th className="text-left px-3 py-2 text-slate-500 font-semibold rounded-l-lg">#</th>
                  <th className="text-left px-3 py-2 text-slate-500 font-semibold">Material Name *</th>
                  <th className="text-left px-3 py-2 text-slate-500 font-semibold">Code</th>
                  <th className="text-left px-3 py-2 text-slate-500 font-semibold">Unit</th>
                  <th className="text-right px-3 py-2 text-slate-500 font-semibold">Qty *</th>
                  <th className="text-right px-3 py-2 text-slate-500 font-semibold">Rate (₹)</th>
                  <th className="text-right px-3 py-2 text-slate-500 font-semibold">Amount</th>
                  <th className="text-left px-3 py-2 text-slate-500 font-semibold">From Bin</th>
                  <th className="text-left px-3 py-2 text-slate-500 font-semibold">To Bin</th>
                  <th className="text-left px-3 py-2 text-slate-500 font-semibold">Condition Note</th>
                  <th className="px-3 py-2 rounded-r-lg"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((it, i) => (
                  <tr key={i} className="hover:bg-slate-50/50">
                    <td className="px-3 py-2 text-slate-400 font-mono">{i+1}</td>
                    <td className="px-3 py-2">
                      <input value={it.material_name} onChange={e => setItem(i,'material_name',e.target.value)}
                        className="w-48 border border-slate-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-teal-300"
                        placeholder="Material description" />
                    </td>
                    <td className="px-3 py-2">
                      <input value={it.material_code} onChange={e => setItem(i,'material_code',e.target.value)}
                        className="w-24 border border-slate-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-teal-300"
                        placeholder="Code" />
                    </td>
                    <td className="px-3 py-2">
                      <select value={it.unit} onChange={e => setItem(i,'unit',e.target.value)}
                        className="w-20 border border-slate-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-teal-300">
                        {UNITS.map(u => <option key={u}>{u}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input type="number" value={it.requested_qty} min={0} step="0.001"
                        onChange={e => setItem(i,'requested_qty',e.target.value)}
                        className="w-20 border border-slate-200 rounded px-2 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-teal-300" />
                    </td>
                    <td className="px-3 py-2">
                      <input type="number" value={it.rate} min={0} step="0.01"
                        onChange={e => setItem(i,'rate',e.target.value)}
                        className="w-24 border border-slate-200 rounded px-2 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-teal-300" />
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-700">
                      {fmt((parseFloat(it.requested_qty)||0) * (parseFloat(it.rate)||0))}
                    </td>
                    <td className="px-3 py-2">
                      <input value={it.source_bin} onChange={e => setItem(i,'source_bin',e.target.value)}
                        className="w-24 border border-slate-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-teal-300"
                        placeholder="Rack/Bin" />
                    </td>
                    <td className="px-3 py-2">
                      <input value={it.dest_bin} onChange={e => setItem(i,'dest_bin',e.target.value)}
                        className="w-24 border border-slate-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-teal-300"
                        placeholder="Rack/Bin" />
                    </td>
                    <td className="px-3 py-2">
                      <input value={it.condition_note} onChange={e => setItem(i,'condition_note',e.target.value)}
                        className="w-32 border border-slate-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-teal-300"
                        placeholder="Good / Damaged…" />
                    </td>
                    <td className="px-3 py-2">
                      {items.length > 1 && (
                        <button onClick={() => removeItem(i)} className="text-slate-300 hover:text-red-500 transition">
                          <Trash2 size={13} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-teal-50/30">
                  <td colSpan={6} className="px-3 py-2 text-right text-xs font-bold text-slate-700">Total Transfer Value:</td>
                  <td className="px-3 py-2 text-right text-sm font-bold text-teal-700">{fmt(totalValue)}</td>
                  <td colSpan={3}></td>
                </tr>
              </tfoot>
            </table>
          </div>

          <Field label="Remarks">
            <input value={form.remarks} onChange={e => set('remarks', e.target.value)}
              className={inp} placeholder="Any additional remarks" />
          </Field>
        </div>
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 flex justify-between items-center px-6 py-4 border-t bg-slate-50/60">
        <p className="text-xs text-slate-400">
          {items.filter(it => it.material_name?.trim()).length} item(s) · Total: <span className="font-bold text-teal-700">{fmt(totalValue)}</span>
        </p>
        <div className="flex gap-3">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-100 transition">
            Cancel
          </button>
          <button onClick={handleSave} disabled={mut.isPending}
            className="px-5 py-2 bg-teal-600 text-white rounded-lg text-sm font-semibold hover:bg-teal-700 transition disabled:opacity-50 flex items-center gap-2">
            {mut.isPending ? <RefreshCw size={14} className="animate-spin" /> : <Truck size={14} />}
            {isEdit ? 'Update Transfer' : 'Create Transfer'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   QUANTITY DIALOG — used for approve / issue / receive steps
═══════════════════════════════════════════════════════════════════════════ */
function QuantityDialog({ title, subtitle, items, qtyField, onConfirm, onClose, isPending }) {
  const [qtys, setQtys] = useState(
    Object.fromEntries(items.map(it => [it.id, it[qtyField] ?? it.requested_qty ?? 0]))
  );
  const confirm = () => {
    const quantities = items.map(it => ({ item_id: it.id, qty: parseFloat(qtys[it.id] || 0) }));
    onConfirm(quantities);
  };
  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between"
          style={{ background: `linear-gradient(135deg, #0f172a 0%, #1e293b 100%)` }}>
          <div>
            <p className="font-bold text-white text-sm">{title}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">{subtitle}</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center text-white">
            <X size={14} />
          </button>
        </div>
        <div className="p-5 space-y-2 max-h-80 overflow-y-auto">
          {items.map(it => (
            <div key={it.id} className="flex items-center justify-between gap-3 py-2 border-b border-slate-50 last:border-0">
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-800">{it.material_name}</p>
                <p className="text-xs text-slate-400">
                  Requested: {it.requested_qty} {it.unit}
                  {it.approved_qty != null && ` · Approved: ${it.approved_qty}`}
                  {it.issued_qty   != null && ` · Issued: ${it.issued_qty}`}
                </p>
              </div>
              <input type="number" min={0} step="0.001"
                value={qtys[it.id] ?? ''}
                onChange={e => setQtys(q => ({ ...q, [it.id]: e.target.value }))}
                className="w-28 h-9 border border-teal-200 rounded-lg px-3 text-sm text-right font-mono font-bold text-teal-700 bg-teal-50 outline-none focus:border-teal-500" />
              <span className="text-xs text-slate-500 w-8">{it.unit}</span>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-3 px-5 py-4 border-t bg-slate-50">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600">Cancel</button>
          <button onClick={confirm} disabled={isPending}
            className="px-5 py-2 bg-teal-600 text-white rounded-lg text-sm font-semibold hover:bg-teal-700 transition disabled:opacity-50">
            {isPending ? 'Saving…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   CANCEL DIALOG
═══════════════════════════════════════════════════════════════════════════ */
function CancelDialog({ mtrNumber, onConfirm, onClose, isPending }) {
  const [reason, setReason] = useState('');
  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-5 py-4 bg-red-600">
          <p className="font-bold text-white text-sm">Cancel Transfer — {mtrNumber}</p>
          <p className="text-[11px] text-red-200 mt-0.5">This action cannot be undone</p>
        </div>
        <div className="p-5 space-y-3">
          <label className="block text-xs font-bold text-slate-600 uppercase tracking-widest">Reason for cancellation *</label>
          <textarea rows={3} value={reason} onChange={e => setReason(e.target.value)}
            placeholder="Explain why this transfer is being cancelled…"
            className="w-full border border-slate-200 rounded-lg p-3 text-sm outline-none focus:border-red-400 resize-none" />
        </div>
        <div className="flex justify-end gap-3 px-5 py-4 border-t bg-slate-50">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600">Back</button>
          <button onClick={() => reason.trim() && onConfirm(reason)} disabled={!reason.trim() || isPending}
            className="px-5 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 transition disabled:opacity-50">
            {isPending ? 'Cancelling…' : 'Cancel Transfer'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   DETAIL VIEW MODAL
═══════════════════════════════════════════════════════════════════════════ */
function MTRDetail({ mtr, onClose, onEdit }) {
  const qc = useQueryClient();
  const [showApproveQty, setShowApproveQty] = useState(false);
  const [showIssueQty,   setShowIssueQty]   = useState(false);
  const [showReceiveQty, setShowReceiveQty] = useState(false);
  const [showCancel,     setShowCancel]     = useState(false);

  const { data: detail, isLoading } = useQuery({
    queryKey: ['mtr-detail', mtr.id],
    queryFn: () => mtrAPI.get(mtr.id).then(r => r.data?.data ?? r.data),
    staleTime: 0,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['mtr-list'] });
    qc.invalidateQueries({ queryKey: ['mtr-detail', mtr.id] });
    qc.invalidateQueries({ queryKey: ['mtr-stats'] });
  };

  const submitMut = useMutation({
    mutationFn: () => mtrAPI.submit(mtr.id),
    onSuccess: (r) => { toast.success(r.data.message || 'Submitted for approval'); invalidate(); },
    onError: e => toast.error(e?.response?.data?.error || 'Failed'),
  });

  const approveMut = useMutation({
    mutationFn: (quantities) => mtrAPI.approve(mtr.id, { approved_quantities: quantities }),
    onSuccess: (r) => { toast.success(r.data.message || 'Approved'); setShowApproveQty(false); invalidate(); },
    onError: e => toast.error(e?.response?.data?.error || 'Failed'),
  });

  const issueMut = useMutation({
    mutationFn: (quantities) => mtrAPI.issue(mtr.id, { issued_quantities: quantities }),
    onSuccess: (r) => { toast.success(r.data.message || 'Dispatched'); setShowIssueQty(false); invalidate(); },
    onError: e => toast.error(e?.response?.data?.error || 'Failed'),
  });

  const receiveMut = useMutation({
    mutationFn: ({ quantities, remarks }) => mtrAPI.receive(mtr.id, { received_quantities: quantities, receipt_remarks: remarks }),
    onSuccess: (r) => { toast.success(r.data.message || 'Receipt confirmed'); setShowReceiveQty(false); invalidate(); },
    onError: e => toast.error(e?.response?.data?.error || 'Failed'),
  });

  const cancelMut = useMutation({
    mutationFn: (reason) => mtrAPI.cancel(mtr.id, { reason }),
    onSuccess: () => { toast.success('Transfer cancelled'); setShowCancel(false); invalidate(); onClose(); },
    onError: e => toast.error(e?.response?.data?.error || 'Failed'),
  });

  const d = detail || mtr;
  const items = d.items || [];
  const totalValue = items.reduce((s, it) => s + parseFloat(it.amount||0), 0);
  const tt = TRANSFER_TYPES[d.transfer_type] || { label: d.transfer_type, color: 'bg-slate-100 text-slate-700' };

  const WORKFLOW = [
    { status: 'draft', label: 'Draft', done: true },
    { status: 'pending_approval', label: 'Pending Approval', done: ['pending_approval','approved','issued','in_transit','received'].includes(d.status) },
    { status: 'approved', label: 'Approved', done: ['approved','issued','in_transit','received'].includes(d.status) },
    { status: 'in_transit', label: 'In Transit', done: ['in_transit','received'].includes(d.status) },
    { status: 'received', label: 'Received', done: d.status === 'received' },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-6 py-4"
        style={{ background: `linear-gradient(135deg, ${Theme.navy} 0%, ${Theme.navyDark} 100%)` }}>
        <div>
          <h2 className="font-bold text-white text-base flex items-center gap-2">
            <Hash size={16} className="opacity-70" /> {d.mtr_number}
            <StatusBadge status={d.status} />
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.6)' }}>
            {dayjs(d.transfer_date).format('DD MMM YYYY')} · {tt.label}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {d.status === 'draft' && (
            <button onClick={() => onEdit(d)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-white rounded-lg text-xs font-semibold transition"
              style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)' }}>
              <Edit2 size={12} /> Edit
            </button>
          )}
          <button onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white"
            style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.20)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Workflow stepper */}
      {d.status !== 'cancelled' && (
        <div className="flex-shrink-0 bg-slate-50 border-b border-slate-200 px-6 py-3">
          <div className="flex items-center gap-2">
            {WORKFLOW.map((step, i) => (
              <React.Fragment key={step.status}>
                <div className={clsx('flex items-center gap-1.5 text-xs font-semibold',
                  step.done ? 'text-teal-700' : 'text-slate-400')}>
                  <div className={clsx('w-5 h-5 rounded-full flex items-center justify-center text-[10px]',
                    step.done ? 'bg-teal-500 text-white' : 'bg-slate-200 text-slate-500')}>
                    {step.done ? '✓' : i+1}
                  </div>
                  {step.label}
                </div>
                {i < WORKFLOW.length - 1 && <ChevronRight size={12} className="text-slate-300 flex-shrink-0" />}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {isLoading && <div className="text-center py-8 text-slate-400">Loading details…</div>}

        {/* Route card */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-4">
            <div className="flex-1 bg-white border border-slate-200 rounded-xl p-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                <MapPin size={10} className="text-rose-400" /> From
              </p>
              <p className="font-bold text-slate-800 text-sm">{d.from_project_name || '—'}</p>
              {d.from_location && <p className="text-xs text-slate-500 mt-0.5">{d.from_location}</p>}
            </div>
            <div className="flex flex-col items-center gap-1">
              <Truck size={20} className="text-teal-500" />
              <span className={clsx('px-2 py-0.5 rounded text-[10px] font-bold', tt.color)}>{tt.label}</span>
              {d.vehicle_number && <p className="text-[10px] text-slate-500">{d.vehicle_number}</p>}
            </div>
            <div className="flex-1 bg-teal-50 border border-teal-200 rounded-xl p-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                <MapPin size={10} className="text-teal-500" /> To
              </p>
              <p className="font-bold text-slate-800 text-sm">{d.to_project_name || '—'}</p>
              {d.to_location && <p className="text-xs text-slate-500 mt-0.5">{d.to_location}</p>}
            </div>
          </div>
          {d.purpose && (
            <p className="mt-3 text-sm text-slate-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <span className="font-semibold text-amber-700">Purpose: </span>{d.purpose}
            </p>
          )}
        </div>

        {/* Info grid */}
        <div className="grid grid-cols-4 gap-3 text-xs">
          {[
            ['Transfer Date', dayjs(d.transfer_date).format('DD MMM YYYY')],
            ['Driver', d.driver_name || '—'],
            ['Driver Mobile', d.driver_mobile || '—'],
            ['LR / Challan', d.lr_number || '—'],
            ['Created By', d.created_by_name || '—'],
            ['Approved By', d.approved_by_name || (d.approved_at ? '—' : 'Pending')],
            ['Issued By', d.issued_by_name || '—'],
            ['Received By', d.received_by_name || '—'],
          ].map(([l, v]) => (
            <div key={l} className="bg-white border border-slate-200 rounded-lg p-3">
              <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-widest">{l}</p>
              <p className="font-semibold text-slate-800 mt-0.5">{v}</p>
            </div>
          ))}
        </div>

        {/* Items table */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-700">Material Items ({items.length})</h3>
            <span className="text-sm font-bold text-teal-700">Total: {fmt(totalValue)}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100">
                  <th className="text-left px-4 py-2 text-slate-500 font-semibold">#</th>
                  <th className="text-left px-4 py-2 text-slate-500 font-semibold">Material</th>
                  <th className="text-left px-4 py-2 text-slate-500 font-semibold">Code</th>
                  <th className="text-left px-4 py-2 text-slate-500 font-semibold">Unit</th>
                  <th className="text-right px-4 py-2 text-slate-500 font-semibold">Req. Qty</th>
                  <th className="text-right px-4 py-2 text-slate-500 font-semibold">Approved</th>
                  <th className="text-right px-4 py-2 text-slate-500 font-semibold">Issued</th>
                  <th className="text-right px-4 py-2 text-slate-500 font-semibold">Received</th>
                  <th className="text-right px-4 py-2 text-slate-500 font-semibold">Rate</th>
                  <th className="text-right px-4 py-2 text-slate-500 font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {items.map((it, i) => (
                  <tr key={it.id || i} className="hover:bg-slate-50/50">
                    <td className="px-4 py-2.5 text-slate-400">{i+1}</td>
                    <td className="px-4 py-2.5 font-semibold text-slate-800">{it.material_name}</td>
                    <td className="px-4 py-2.5 text-slate-500 font-mono text-[11px]">{it.material_code || '—'}</td>
                    <td className="px-4 py-2.5 text-slate-600">{it.unit}</td>
                    <td className="px-4 py-2.5 text-right font-semibold">{it.requested_qty}</td>
                    <td className="px-4 py-2.5 text-right text-blue-700">{it.approved_qty ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right text-orange-700">{it.issued_qty ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right text-emerald-700">{it.received_qty ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right text-slate-600">{it.rate > 0 ? fmt(it.rate) : '—'}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-slate-800">{it.amount > 0 ? fmt(it.amount) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {d.remarks && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Remarks</p>
            <p className="text-sm text-slate-700">{d.remarks}</p>
          </div>
        )}
      </div>

      {/* Action footer */}
      <div className="flex-shrink-0 flex justify-between items-center px-6 py-4 border-t bg-slate-50/60">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">MTR #{d.mtr_number} · {dayjs(d.created_at).format('DD MMM YYYY HH:mm')}</span>
          {(d.status === 'draft' || d.status === 'pending_approval') && (
            <button onClick={() => setShowCancel(true)}
              className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded border border-transparent hover:border-red-200 hover:bg-red-50 transition ml-2">
              <X size={11} /> Cancel
            </button>
          )}
        </div>
        <div className="flex gap-2">
          {d.status === 'draft' && (
            <button onClick={() => submitMut.mutate()} disabled={submitMut.isPending}
              className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-semibold hover:bg-amber-600 transition disabled:opacity-50">
              {submitMut.isPending ? <RefreshCw size={13} className="animate-spin" /> : <Send size={13} />}
              Submit for Approval
            </button>
          )}
          {d.status === 'pending_approval' && (
            <button onClick={() => setShowApproveQty(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition">
              <CheckCircle2 size={13} /> Approve Transfer
            </button>
          )}
          {d.status === 'approved' && (
            <button onClick={() => setShowIssueQty(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-semibold hover:bg-orange-600 transition">
              <Truck size={13} /> Issue / Dispatch
            </button>
          )}
          {(d.status === 'in_transit' || d.status === 'issued') && (
            <button onClick={() => setShowReceiveQty(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition">
              <PackageCheck size={13} /> Confirm Receipt
            </button>
          )}
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-100 transition">
            Close
          </button>
        </div>
      </div>

      {/* Quantity dialogs */}
      {showApproveQty && items.length > 0 && (
        <QuantityDialog
          title="Approve Transfer — Enter Approved Quantities"
          subtitle="Confirm how much of each item is approved for transfer"
          items={items} qtyField="approved_qty"
          onConfirm={(qtys) => approveMut.mutate(qtys)}
          onClose={() => setShowApproveQty(false)}
          isPending={approveMut.isPending}
        />
      )}
      {showIssueQty && items.length > 0 && (
        <QuantityDialog
          title="Issue / Dispatch — Enter Issued Quantities"
          subtitle="Enter quantities physically loaded and dispatched"
          items={items} qtyField="issued_qty"
          onConfirm={(qtys) => issueMut.mutate(qtys)}
          onClose={() => setShowIssueQty(false)}
          isPending={issueMut.isPending}
        />
      )}
      {showReceiveQty && items.length > 0 && (
        <QuantityDialog
          title="Confirm Receipt — Enter Received Quantities"
          subtitle="Enter quantities physically received at destination"
          items={items} qtyField="received_qty"
          onConfirm={(qtys) => receiveMut.mutate({ quantities: qtys, remarks: '' })}
          onClose={() => setShowReceiveQty(false)}
          isPending={receiveMut.isPending}
        />
      )}
      {showCancel && (
        <CancelDialog
          mtrNumber={d.mtr_number}
          onConfirm={(reason) => cancelMut.mutate(reason)}
          onClose={() => setShowCancel(false)}
          isPending={cancelMut.isPending}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════════════════════════════════ */
export default function MaterialTransferPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm]     = useState(false);
  const [editMTR, setEditMTR]       = useState(null);
  const [viewMTR, setViewMTR]       = useState(null);
  const [search, setSearch]         = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterProject, setFilterProject] = useState('');

  const { data: projects = [] } = useQuery({
    queryKey: ['projects-simple'],
    queryFn: () => projectAPI.list().then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    staleTime: 60000,
  });

  const { data: stats } = useQuery({
    queryKey: ['mtr-stats'],
    queryFn: () => mtrAPI.stats().then(r => r.data?.data ?? r.data ?? {}),
    staleTime: 0,
  });

  const { data: transfers = [], isLoading, refetch } = useQuery({
    queryKey: ['mtr-list', filterStatus, filterProject, search],
    queryFn: () => mtrAPI.list({
      ...(filterStatus && { status: filterStatus }),
      ...(filterProject && { from_project_id: filterProject }),
      ...(search && { search }),
    }).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const openEdit = (mtr) => { setViewMTR(null); setEditMTR(mtr); };
  const openView = (mtr) => { setEditMTR(null); setViewMTR(mtr); };

  const kpis = [
    { label: 'Total Transfers',  value: stats?.total || 0,            sub: 'All time',         color: 'blue',    icon: Truck },
    { label: 'Pending Approval', value: stats?.pending_approval || 0, sub: 'Awaiting sign-off',color: 'amber',   icon: Clock },
    { label: 'In Transit',       value: stats?.in_transit || 0,       sub: 'Approved / Issued',color: 'orange',  icon: Send },
    { label: 'Received',         value: stats?.received || 0,         sub: 'Completed',        color: 'emerald', icon: PackageCheck },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <PageHeader
        title="Material Transfer"
        subtitle="Track and manage material movements between sites, stores and locations"
        actions={
          <button onClick={() => { setEditMTR(null); setShowForm(true); }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition"
            style={{ background: `linear-gradient(135deg, ${Theme.navy}, ${Theme.navyDark})` }}>
            <Plus size={15} /> New Transfer
          </button>
        }
      />

      <div className="p-6 space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-4 gap-4">
          {kpis.map(k => (
            <ThemeKpiCard key={k.label} label={k.label} value={k.value} sub={k.sub}
              icon={k.icon} color={k.color} />
          ))}
        </div>

        {/* Filters + List */}
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          {/* Filter bar */}
          <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-100 bg-slate-50/50">
            <div className="relative flex-1 max-w-xs">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-300"
                placeholder="Search MTR, vehicle, purpose…" />
            </div>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300 bg-white">
              <option value="">All Statuses</option>
              {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select value={filterProject} onChange={e => setFilterProject(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300 bg-white">
              <option value="">All Projects</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.project_code} — {p.name}</option>)}
            </select>
            <button onClick={() => refetch()} className="p-2 border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-100 transition">
              <RefreshCw size={14} />
            </button>
          </div>

          {/* Table */}
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-slate-400">
              <RefreshCw size={20} className="animate-spin mr-2" /> Loading transfers…
            </div>
          ) : transfers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <Truck size={40} className="mb-3 opacity-30" />
              <p className="font-semibold">No material transfers found</p>
              <p className="text-sm mt-1">Create a new transfer to get started</p>
              <button onClick={() => setShowForm(true)}
                className="mt-4 flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-semibold hover:bg-teal-700 transition">
                <Plus size={14} /> New Transfer
              </button>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">MTR No.</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Date</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Type</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">From</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide"></th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">To</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Items</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Value</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {transfers.map(t => {
                  const tt = TRANSFER_TYPES[t.transfer_type] || { label: t.transfer_type, color: 'bg-slate-100 text-slate-700' };
                  return (
                    <tr key={t.id} className="hover:bg-slate-50/70 transition-colors cursor-pointer"
                      onClick={() => openView(t)}>
                      <td className="px-5 py-3.5">
                        <span className="font-bold text-teal-700 font-mono">{t.mtr_number}</span>
                      </td>
                      <td className="px-4 py-3.5 text-slate-600 text-xs whitespace-nowrap">
                        {dayjs(t.transfer_date).format('DD MMM YYYY')}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={clsx('px-2 py-0.5 rounded-full text-xs font-semibold', tt.color)}>{tt.label}</span>
                      </td>
                      <td className="px-4 py-3.5">
                        <p className="font-semibold text-slate-800 text-xs">{t.from_project_name || '—'}</p>
                        {t.from_location && <p className="text-[10px] text-slate-400 mt-0.5">{t.from_location}</p>}
                      </td>
                      <td className="px-2 py-3.5">
                        <ArrowRight size={14} className="text-slate-300" />
                      </td>
                      <td className="px-4 py-3.5">
                        <p className="font-semibold text-slate-800 text-xs">{t.to_project_name || '—'}</p>
                        {t.to_location && <p className="text-[10px] text-slate-400 mt-0.5">{t.to_location}</p>}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full text-xs font-semibold">
                          {t.item_count}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right font-semibold text-slate-800">
                        {t.total_amount > 0 ? fmt(t.total_amount) : '—'}
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusBadge status={t.status} />
                      </td>
                      <td className="px-4 py-3.5">
                        <button onClick={e => { e.stopPropagation(); openView(t); }}
                          className="text-slate-300 hover:text-teal-600 transition">
                          <Eye size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modals */}
      {(showForm || editMTR) && (
        <MTRForm
          mtr={editMTR}
          projects={projects}
          onClose={() => { setShowForm(false); setEditMTR(null); }}
        />
      )}
      {viewMTR && (
        <MTRDetail
          mtr={viewMTR}
          onClose={() => setViewMTR(null)}
          onEdit={openEdit}
        />
      )}
    </div>
  );
}
