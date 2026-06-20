// src/pages/stores/CreditNotePage.jsx
import React, { useState, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import dayjs from 'dayjs';
import toast from 'react-hot-toast';
import {
  AlertCircle, ArrowDownLeft, Building2, Calendar, Check, ChevronRight,
  FileText, Hammer, Package, Plus, Search, Trash2, X,
} from 'lucide-react';
import { creditNoteAPI, projectAPI, vendorAPI, poAPI, ignAPI, tqsBillsAPI } from '../../api/client';

// ── constants ─────────────────────────────────────────────────────────────────
const CN_TYPES = [
  { value: 'short_delivery',    label: 'Short Delivery' },
  { value: 'price_adjustment',  label: 'Price Adjustment' },
  { value: 'overcharge',        label: 'Overcharge / Excess Billing' },
  { value: 'damaged',           label: 'Damaged Goods' },
  { value: 'quality_rejection', label: 'Quality Rejection' },
  { value: 'other',             label: 'Other' },
];

const STATUS_CFG = {
  pending:   { cls: 'bg-amber-50  text-amber-700  border-amber-200',   label: 'Pending' },
  applied:   { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'Applied' },
  refunded:  { cls: 'bg-blue-50   text-blue-700   border-blue-200',    label: 'Refunded' },
  cancelled: { cls: 'bg-red-50    text-red-500    border-red-200',     label: 'Cancelled' },
};

const inr = (v) => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const EMPTY_ITEM = { material_name: '', unit: 'Nos', quantity: '', rate: '', amount: '' };
const EMPTY_FORM = {
  cn_date: dayjs().format('YYYY-MM-DD'),
  vendor_id: '', vendor_name: '',
  project_id: '',
  bill_id: '', bill_sl: '',
  po_id: '', po_number: '',
  grn_id: '', grn_number: '',
  invoice_number: '', invoice_date: '',
  cn_type: 'other',
  reason: '',
  tax_mode: 'intrastate',
  basic_amount: '',
  cgst_pct: '', cgst_amt: '',
  sgst_pct: '', sgst_amt: '',
  igst_pct: '', igst_amt: '',
  remarks: '',
};

// ── helper ────────────────────────────────────────────────────────────────────
function Lbl({ children, req }) {
  return (
    <label className="block text-xs font-medium text-slate-600 mb-1">
      {children}{req && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  );
}
const F = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent bg-white';
const FS = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white';

// ── Status badge ───────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] || STATUS_CFG.pending;
  return <span className={clsx('px-2 py-0.5 rounded-full text-[11px] font-medium border', cfg.cls)}>{cfg.label}</span>;
}

// ─────────────────────────────────────────────────────────────────────────────
// FORM MODAL
// ─────────────────────────────────────────────────────────────────────────────
function CNForm({ initial, onClose, onSaved }) {
  const qc = useQueryClient();
  const isEdit = !!initial?.id;

  const [form, setForm] = useState(
    isEdit
      ? {
          cn_date:        initial.cn_date?.slice(0, 10) || dayjs().format('YYYY-MM-DD'),
          vendor_id:      initial.vendor_id || '',
          vendor_name:    initial.vendor_name || '',
          project_id:     initial.project_id || '',
          bill_id:        initial.bill_id || '',
          bill_sl:        '',
          po_id:          initial.po_id || '',
          po_number:      initial.po_number || '',
          grn_id:         initial.grn_id || '',
          grn_number:     initial.grn_number || '',
          invoice_number: initial.invoice_number || '',
          invoice_date:   initial.invoice_date?.slice(0, 10) || '',
          cn_type:        initial.cn_type || 'other',
          reason:         initial.reason || '',
          tax_mode:       initial.tax_mode || 'intrastate',
          basic_amount:   initial.basic_amount || '',
          cgst_pct:       initial.cgst_pct || '',
          cgst_amt:       initial.cgst_amt || '',
          sgst_pct:       initial.sgst_pct || '',
          sgst_amt:       initial.sgst_amt || '',
          igst_pct:       initial.igst_pct || '',
          igst_amt:       initial.igst_amt || '',
          remarks:        initial.remarks || '',
        }
      : { ...EMPTY_FORM }
  );
  const [items, setItems] = useState(
    isEdit && initial.items?.length ? initial.items : [{ ...EMPTY_ITEM }]
  );

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Vendor list
  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors-list'],
    queryFn: () => vendorAPI.list({ limit: 500 }).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    staleTime: 60000,
  });
  // Project list
  const { data: projects = [] } = useQuery({
    queryKey: ['projects-list'],
    queryFn: () => projectAPI.list({ limit: 500 }).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    staleTime: 60000,
  });
  // PO list for selected vendor+project
  const { data: poList = [] } = useQuery({
    queryKey: ['po-for-cn', form.vendor_id, form.project_id],
    queryFn: () => poAPI.list({ vendor_id: form.vendor_id, project_id: form.project_id || undefined, limit: 200 })
      .then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    enabled: !!form.vendor_id,
    staleTime: 30000,
  });
  // IGN list for selected project (replaces GRN lookup)
  const { data: grnList = [] } = useQuery({
    queryKey: ['ign-for-cn', form.vendor_id, form.project_id],
    queryFn: () => ignAPI.list({ vendor_id: form.vendor_id, project_id: form.project_id || undefined })
      .then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    enabled: !!form.vendor_id || !!form.project_id,
    staleTime: 30000,
  });

  // Bill Tracker bills for selected vendor
  const [billSearch, setBillSearch] = useState('');
  const { data: billList = [] } = useQuery({
    queryKey: ['bills-for-cn', form.vendor_id, form.project_id],
    queryFn: () => tqsBillsAPI.list({ vendor_id: form.vendor_id, project_id: form.project_id || undefined, limit: 300 })
      .then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    enabled: !!form.vendor_id,
    staleTime: 30000,
  });
  const filteredBills = useMemo(() => {
    const q = billSearch.toLowerCase();
    return billList.filter(b =>
      !q ||
      (b.inv_number || '').toLowerCase().includes(q) ||
      (b.sl_number  || '').toLowerCase().includes(q) ||
      (b.vendor_name|| '').toLowerCase().includes(q)
    ).slice(0, 40);
  }, [billList, billSearch]);

  const applyBill = (bill) => {
    set('bill_id',       bill.id);
    set('bill_sl',       bill.sl_number || '');
    set('invoice_number',bill.inv_number || '');
    set('invoice_date',  bill.inv_date ? bill.inv_date.slice(0, 10) : '');
    set('basic_amount',  bill.total_amount ? String(parseFloat(bill.total_amount).toFixed(2)) : form.basic_amount);
    if (!form.vendor_id && bill.vendor_id) {
      set('vendor_id',   bill.vendor_id);
      set('vendor_name', bill.vendor_name || '');
    }
    setBillSearch('');
  };

  // ── item helpers ────────────────────────────────────────────────────────────
  const updateItem = (idx, key, val) =>
    setItems(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [key]: val };
      if (key === 'quantity' || key === 'rate') {
        const q = parseFloat(key === 'quantity' ? val : next[idx].quantity) || 0;
        const r2 = parseFloat(key === 'rate' ? val : next[idx].rate) || 0;
        next[idx].amount = (q * r2).toFixed(2);
      }
      return next;
    });
  const addItem = () => setItems(p => [...p, { ...EMPTY_ITEM }]);
  const removeItem = (idx) => setItems(p => p.filter((_, i) => i !== idx));

  // ── GST auto-calc ──────────────────────────────────────────────────────────
  const basicAmt = parseFloat(form.basic_amount) || 0;
  const isIntra  = form.tax_mode === 'intrastate';

  const calcGST = (pct, base) => ((parseFloat(pct) || 0) * base / 100).toFixed(2);

  const handleGstPct = (field, val) => {
    set(field, val);
    const pct = parseFloat(val) || 0;
    const half = pct / 2;
    if (field === 'cgst_pct' || field === 'sgst_pct') {
      // intrastate: both halves equal
      set('cgst_pct', half.toString());
      set('sgst_pct', half.toString());
      set('cgst_amt', (half * basicAmt / 100).toFixed(2));
      set('sgst_amt', (half * basicAmt / 100).toFixed(2));
      set('igst_pct', '');
      set('igst_amt', '');
    } else {
      set('igst_pct', val);
      set('igst_amt', (pct * basicAmt / 100).toFixed(2));
      set('cgst_pct', '');
      set('cgst_amt', '');
      set('sgst_pct', '');
      set('sgst_amt', '');
    }
  };

  const totalGST = (parseFloat(form.cgst_amt) || 0) + (parseFloat(form.sgst_amt) || 0) + (parseFloat(form.igst_amt) || 0);
  const grandTotal = basicAmt + totalGST;

  // ── Submit ─────────────────────────────────────────────────────────────────
  const saveMut = useMutation({
    mutationFn: (payload) => isEdit
      ? creditNoteAPI.update(initial.id, payload).then(r => r.data)
      : creditNoteAPI.create(payload).then(r => r.data),
    onSuccess: () => {
      toast.success(isEdit ? 'Credit note updated' : 'Credit note created');
      qc.invalidateQueries({ queryKey: ['credit-notes'] });
      onSaved?.();
      onClose();
    },
    onError: e => toast.error(e?.response?.data?.error || 'Save failed'),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.vendor_name.trim()) return toast.error('Vendor name is required');
    if (!form.cn_date) return toast.error('Credit note date is required');
    saveMut.mutate({
      ...form,
      basic_amount: parseFloat(form.basic_amount) || 0,
      cgst_pct: parseFloat(form.cgst_pct) || 0,
      cgst_amt: parseFloat(form.cgst_amt) || 0,
      sgst_pct: parseFloat(form.sgst_pct) || 0,
      sgst_amt: parseFloat(form.sgst_amt) || 0,
      igst_pct: parseFloat(form.igst_pct) || 0,
      igst_amt: parseFloat(form.igst_amt) || 0,
      items: items.filter(it => it.material_name?.trim()),
    });
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4 overflow-auto">
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl flex flex-col max-h-[96vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-violet-50 border border-violet-100 flex items-center justify-center">
              <ArrowDownLeft className="w-4 h-4 text-violet-600" />
            </div>
            <div>
              <p className="font-semibold text-slate-900">{isEdit ? `Edit Credit Note — ${initial.cn_number}` : 'New Credit Note'}</p>
              <p className="text-xs text-slate-500 mt-0.5">Record a vendor credit note against an invoice</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* ── Section 1: Header ── */}
          <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
              <span className="w-1.5 h-4 rounded-full bg-indigo-500 inline-block" />
              Credit Note Details
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <Lbl req>CN Date</Lbl>
                <input type="date" className={F} value={form.cn_date} onChange={e => set('cn_date', e.target.value)} required />
              </div>
              <div>
                <Lbl req>Credit Note Type</Lbl>
                <select className={FS} value={form.cn_type} onChange={e => set('cn_type', e.target.value)}>
                  {CN_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <Lbl>Tax Mode</Lbl>
                <select className={FS} value={form.tax_mode} onChange={e => {
                  set('tax_mode', e.target.value);
                  set('cgst_pct',''); set('cgst_amt','');
                  set('sgst_pct',''); set('sgst_amt','');
                  set('igst_pct',''); set('igst_amt','');
                }}>
                  <option value="intrastate">Intrastate (CGST + SGST)</option>
                  <option value="interstate">Interstate (IGST)</option>
                </select>
              </div>
            </div>

            {/* Vendor */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Lbl req>Vendor</Lbl>
                <select className={FS} value={form.vendor_id}
                  onChange={e => {
                    const v = vendors.find(x => x.id === e.target.value);
                    set('vendor_id', e.target.value);
                    set('vendor_name', v?.name || '');
                    set('po_id', ''); set('po_number', '');
                    set('grn_id', ''); set('grn_number', '');
                  }}>
                  <option value="">— Select vendor —</option>
                  {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
                {!form.vendor_id && (
                  <input className={clsx(F, 'mt-1.5')} placeholder="Or type vendor name manually"
                    value={form.vendor_name} onChange={e => set('vendor_name', e.target.value)} />
                )}
              </div>
              <div>
                <Lbl>Project</Lbl>
                <select className={FS} value={form.project_id} onChange={e => set('project_id', e.target.value)}>
                  <option value="">— All / Not linked —</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* ── Section 2: Invoice & Reference links ── */}
          <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
              <span className="w-1.5 h-4 rounded-full bg-sky-500 inline-block" />
              Original Invoice / Reference
            </p>

            {/* Bill Tracker picker */}
            <div>
              <Lbl>Link Bill Tracker Invoice</Lbl>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  className={clsx(F, 'pl-8')}
                  placeholder={form.vendor_id ? 'Search by invoice no. or bill ref…' : 'Select a vendor first to search bills'}
                  disabled={!form.vendor_id}
                  value={billSearch}
                  onChange={e => setBillSearch(e.target.value)}
                />
              </div>
              {/* Dropdown results */}
              {billSearch && filteredBills.length > 0 && (
                <div className="mt-1 border border-slate-200 rounded-lg bg-white shadow-lg max-h-52 overflow-y-auto z-10 relative">
                  {filteredBills.map(b => (
                    <button key={b.id} type="button"
                      onClick={() => applyBill(b)}
                      className="w-full text-left px-4 py-2.5 hover:bg-indigo-50 border-b border-slate-50 last:border-0 transition-colors">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <span className="text-xs font-semibold text-slate-800">{b.inv_number || '—'}</span>
                          <span className="ml-2 text-[10px] text-slate-400 font-mono">{b.sl_number}</span>
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-slate-500 flex-shrink-0">
                          {b.inv_date && <span>{dayjs(b.inv_date).format('DD MMM YYYY')}</span>}
                          <span className="font-semibold text-emerald-700">
                            ₹{Number(b.total_amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                          </span>
                        </div>
                      </div>
                    </button>
                  ))}
                  {filteredBills.length === 0 && (
                    <p className="px-4 py-3 text-xs text-slate-400">No bills found</p>
                  )}
                </div>
              )}
              {billSearch && filteredBills.length === 0 && billList.length > 0 && (
                <p className="mt-1 text-[11px] text-slate-400 pl-1">No matching bills for "{billSearch}"</p>
              )}
              {/* Linked bill chip */}
              {form.bill_id && (
                <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-lg">
                  <FileText className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
                  <span className="text-xs font-medium text-indigo-700">
                    Linked: {form.bill_sl} — {form.invoice_number}
                    {form.invoice_date && ` · ${dayjs(form.invoice_date).format('DD MMM YYYY')}`}
                  </span>
                  <button type="button" onClick={() => { set('bill_id',''); set('bill_sl',''); }}
                    className="ml-auto text-indigo-400 hover:text-indigo-700">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <Lbl>Invoice Number</Lbl>
                <input className={F} placeholder="INV-001" value={form.invoice_number} onChange={e => set('invoice_number', e.target.value)} />
              </div>
              <div>
                <Lbl>Invoice Date</Lbl>
                <input type="date" className={F} value={form.invoice_date} onChange={e => set('invoice_date', e.target.value)} />
              </div>
              <div>
                <Lbl>Linked PO</Lbl>
                <select className={FS} value={form.po_id}
                  onChange={e => {
                    const po = poList.find(x => x.id === e.target.value);
                    set('po_id', e.target.value);
                    set('po_number', po?.po_number || '');
                  }}>
                  <option value="">— None —</option>
                  {poList.map(p => <option key={p.id} value={p.id}>{p.po_number}</option>)}
                </select>
              </div>
              <div>
                <Lbl>Linked IGN</Lbl>
                <select className={FS} value={form.grn_id}
                  onChange={e => {
                    const g = grnList.find(x => x.id === e.target.value);
                    set('grn_id', e.target.value);
                    set('grn_number', g?.ign_number || g?.serial_no_formatted || '');
                  }}>
                  <option value="">— None —</option>
                  {grnList.map(g => <option key={g.id} value={g.id}>{g.ign_number || g.serial_no_formatted}</option>)}
                </select>
              </div>
            </div>
            <div>
              <Lbl req>Reason for Credit Note</Lbl>
              <textarea className={clsx(F, 'resize-none')} rows={2} placeholder="Describe why the vendor issued this credit note…"
                value={form.reason} onChange={e => set('reason', e.target.value)} required />
            </div>
          </div>

          {/* ── Section 3: Line Items ── */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
              <Package className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Line Items (Materials)</span>
              <button type="button" onClick={addItem}
                className="ml-auto text-xs font-medium text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" /> Add Item
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    {['#', 'Material / Description', 'Unit', 'Qty', 'Rate (₹)', 'Amount (₹)', ''].map(h => (
                      <th key={h} className="px-3 py-2 text-left font-medium text-slate-400 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {items.map((it, idx) => (
                    <tr key={idx}>
                      <td className="px-3 py-2 text-slate-400 w-8">{idx + 1}</td>
                      <td className="px-2 py-1.5 min-w-[200px]">
                        <input className={F} placeholder="Material name" value={it.material_name}
                          onChange={e => updateItem(idx, 'material_name', e.target.value)} />
                      </td>
                      <td className="px-2 py-1.5 w-20">
                        <input className={F} placeholder="Nos" value={it.unit}
                          onChange={e => updateItem(idx, 'unit', e.target.value)} />
                      </td>
                      <td className="px-2 py-1.5 w-24">
                        <input type="number" step="any" className={F} placeholder="0"
                          value={it.quantity} onChange={e => updateItem(idx, 'quantity', e.target.value)} />
                      </td>
                      <td className="px-2 py-1.5 w-28">
                        <input type="number" step="0.01" className={F} placeholder="0.00"
                          value={it.rate} onChange={e => updateItem(idx, 'rate', e.target.value)} />
                      </td>
                      <td className="px-2 py-1.5 w-28">
                        <input type="number" step="0.01" className={clsx(F, 'bg-slate-50')} placeholder="0.00"
                          value={it.amount} onChange={e => updateItem(idx, 'amount', e.target.value)} />
                      </td>
                      <td className="px-2 py-1.5 w-8">
                        {items.length > 1 && (
                          <button type="button" onClick={() => removeItem(idx)}
                            className="text-red-400 hover:text-red-600">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Section 4: Financials ── */}
          <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
              <span className="w-1.5 h-4 rounded-full bg-emerald-500 inline-block" />
              Credit Amount &amp; GST
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <Lbl req>Basic / Taxable Amount (₹)</Lbl>
                <input type="number" step="0.01" className={F} placeholder="0.00"
                  value={form.basic_amount}
                  onChange={e => {
                    set('basic_amount', e.target.value);
                    const base = parseFloat(e.target.value) || 0;
                    if (form.tax_mode === 'intrastate' && form.cgst_pct) {
                      const h = parseFloat(form.cgst_pct) || 0;
                      set('cgst_amt', (h * base / 100).toFixed(2));
                      set('sgst_amt', (h * base / 100).toFixed(2));
                    } else if (form.igst_pct) {
                      set('igst_amt', ((parseFloat(form.igst_pct) || 0) * base / 100).toFixed(2));
                    }
                  }} />
              </div>

              {form.tax_mode === 'intrastate' ? (
                <>
                  <div>
                    <Lbl>CGST %</Lbl>
                    <input type="number" step="0.01" className={F} placeholder="9"
                      value={form.cgst_pct}
                      onChange={e => {
                        const pct = parseFloat(e.target.value) || 0;
                        set('cgst_pct', e.target.value);
                        set('sgst_pct', e.target.value);
                        set('cgst_amt', (pct * basicAmt / 100).toFixed(2));
                        set('sgst_amt', (pct * basicAmt / 100).toFixed(2));
                      }} />
                  </div>
                  <div>
                    <Lbl>CGST Amount (₹)</Lbl>
                    <input type="number" step="0.01" className={F} value={form.cgst_amt}
                      onChange={e => { set('cgst_amt', e.target.value); set('sgst_amt', e.target.value); }} />
                  </div>
                  <div>
                    <Lbl>SGST Amount (₹)</Lbl>
                    <input type="number" step="0.01" className={clsx(F, 'bg-slate-50')} value={form.sgst_amt} readOnly />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <Lbl>IGST %</Lbl>
                    <input type="number" step="0.01" className={F} placeholder="18"
                      value={form.igst_pct}
                      onChange={e => {
                        const pct = parseFloat(e.target.value) || 0;
                        set('igst_pct', e.target.value);
                        set('igst_amt', (pct * basicAmt / 100).toFixed(2));
                      }} />
                  </div>
                  <div>
                    <Lbl>IGST Amount (₹)</Lbl>
                    <input type="number" step="0.01" className={F} value={form.igst_amt}
                      onChange={e => set('igst_amt', e.target.value)} />
                  </div>
                  <div />
                </>
              )}
            </div>

            {/* Grand Total pill */}
            <div className="flex items-center justify-end gap-4 pt-2 border-t border-slate-200">
              {totalGST > 0 && (
                <div className="text-right">
                  <p className="text-[10px] text-slate-400 uppercase">Total GST</p>
                  <p className="text-sm font-semibold text-slate-700">₹ {inr(totalGST)}</p>
                </div>
              )}
              <div className="bg-indigo-600 text-white rounded-xl px-5 py-2.5 text-right">
                <p className="text-[10px] uppercase tracking-wider text-indigo-200">Total Credit Value</p>
                <p className="text-lg font-bold">₹ {inr(grandTotal)}</p>
              </div>
            </div>
          </div>

          {/* ── Section 5: Remarks ── */}
          <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
            <Lbl>Remarks / Notes</Lbl>
            <textarea className={clsx(F, 'resize-none')} rows={2}
              placeholder="Any additional notes…"
              value={form.remarks} onChange={e => set('remarks', e.target.value)} />
          </div>
        </form>

        {/* Footer */}
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-white">
          <button type="button" onClick={onClose}
            className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saveMut.isPending}
            className="px-6 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50">
            {saveMut.isPending ? 'Saving…' : isEdit ? 'Update Credit Note' : 'Create Credit Note'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DETAIL VIEW
// ─────────────────────────────────────────────────────────────────────────────
function CNDetail({ cn, onClose, onEdit }) {
  const qc = useQueryClient();

  const statusMut = useMutation({
    mutationFn: (status) => creditNoteAPI.updateStatus(cn.id, status),
    onSuccess: () => {
      toast.success('Status updated');
      qc.invalidateQueries({ queryKey: ['credit-notes'] });
      qc.invalidateQueries({ queryKey: ['credit-note', cn.id] });
      onClose();
    },
    onError: e => toast.error(e?.response?.data?.error || 'Update failed'),
  });

  const deleteMut = useMutation({
    mutationFn: () => creditNoteAPI.remove(cn.id),
    onSuccess: () => {
      toast.success('Credit note deleted');
      qc.invalidateQueries({ queryKey: ['credit-notes'] });
      onClose();
    },
    onError: e => toast.error(e?.response?.data?.error || 'Delete failed'),
  });

  const typeLabel = CN_TYPES.find(t => t.value === cn.cn_type)?.label || cn.cn_type;

  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4 overflow-auto">
      <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl flex flex-col max-h-[96vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-violet-50 border border-violet-100 flex items-center justify-center">
              <ArrowDownLeft className="w-4 h-4 text-violet-600" />
            </div>
            <div>
              <p className="font-semibold text-slate-900">{cn.cn_number}</p>
              <p className="text-xs text-slate-500">{cn.vendor_name} · {dayjs(cn.cn_date).format('DD MMM YYYY')}</p>
            </div>
            <StatusBadge status={cn.status} />
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Info grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              ['CN Number',       cn.cn_number],
              ['CN Date',         dayjs(cn.cn_date).format('DD MMM YYYY')],
              ['CN Type',         typeLabel],
              ['Vendor',          cn.vendor_name],
              ['Project',         cn.project_name || '—'],
              ['Invoice Number',  cn.invoice_number || '—'],
              ['Invoice Date',    cn.invoice_date ? dayjs(cn.invoice_date).format('DD MMM YYYY') : '—'],
              ['Linked PO',       cn.po_number || '—'],
              ['Linked GRN',      cn.grn_number || '—'],
              ['Tax Mode',        cn.tax_mode === 'intrastate' ? 'Intrastate' : 'Interstate'],
              ['Status',          <StatusBadge key="s" status={cn.status} />],
              ['Created By',      cn.created_by_name || '—'],
            ].map(([label, value]) => (
              <div key={label} className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                <p className="text-xs text-slate-400 font-medium mb-0.5">{label}</p>
                <p className="text-sm font-medium text-slate-800">{value}</p>
              </div>
            ))}
          </div>

          {/* Reason */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p className="text-xs font-medium text-amber-700 mb-1">Reason for Credit Note</p>
            <p className="text-sm text-amber-900">{cn.reason || '—'}</p>
          </div>

          {/* Line items */}
          {cn.items?.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
                <Package className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Line Items</span>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    {['#', 'Material', 'Unit', 'Qty', 'Rate (₹)', 'Amount (₹)'].map(h => (
                      <th key={h} className="px-3 py-2 text-left font-medium text-slate-400 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {cn.items.map((it, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-3 py-2.5 text-slate-400">{i + 1}</td>
                      <td className="px-3 py-2.5 font-medium text-slate-800">{it.material_name}</td>
                      <td className="px-3 py-2.5 text-slate-500">{it.unit}</td>
                      <td className="px-3 py-2.5 font-mono text-right">{Number(it.quantity).toLocaleString('en-IN', { maximumFractionDigits: 3 })}</td>
                      <td className="px-3 py-2.5 font-mono text-right">{inr(it.rate)}</td>
                      <td className="px-3 py-2.5 font-mono text-right font-semibold">{inr(it.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Financial summary */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Basic Amount',  value: inr(cn.basic_amount), color: 'text-slate-800' },
              { label: cn.tax_mode === 'intrastate' ? 'CGST + SGST' : 'IGST',
                value: cn.tax_mode === 'intrastate'
                  ? `${inr(cn.cgst_amt)} + ${inr(cn.sgst_amt)}`
                  : inr(cn.igst_amt),
                color: 'text-slate-600' },
              { label: 'Total GST',     value: inr(cn.gst_amount),   color: 'text-slate-600' },
              { label: 'Total Credit',  value: `₹ ${inr(cn.total_amount)}`, color: 'text-indigo-700 text-base font-bold' },
            ].map((k, i) => (
              <div key={i} className="text-center">
                <p className="text-[10px] text-slate-400 mb-0.5">{k.label}</p>
                <p className={clsx('text-sm font-semibold', k.color)}>{k.value}</p>
              </div>
            ))}
          </div>

          {cn.remarks && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <p className="text-xs font-medium text-slate-400 mb-1">Remarks</p>
              <p className="text-sm text-slate-700">{cn.remarks}</p>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-white flex-wrap gap-2">
          <div className="flex items-center gap-2">
            {cn.status === 'pending' && (
              <>
                <button onClick={() => statusMut.mutate('applied')} disabled={statusMut.isPending}
                  className="px-3 py-1.5 bg-emerald-600 text-white text-xs font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50">
                  Mark Applied
                </button>
                <button onClick={() => statusMut.mutate('refunded')} disabled={statusMut.isPending}
                  className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  Mark Refunded
                </button>
                <button onClick={() => { if (window.confirm('Cancel this credit note?')) statusMut.mutate('cancelled'); }}
                  disabled={statusMut.isPending}
                  className="px-3 py-1.5 border border-red-200 text-red-600 text-xs font-medium rounded-lg hover:bg-red-50 disabled:opacity-50">
                  Cancel
                </button>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {cn.status === 'pending' && (
              <>
                <button onClick={() => onEdit(cn)}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
                  Edit
                </button>
                <button onClick={() => { if (window.confirm('Delete this credit note?')) deleteMut.mutate(); }}
                  disabled={deleteMut.isPending}
                  className="px-4 py-2 border border-red-200 text-red-600 text-sm rounded-lg hover:bg-red-50 disabled:opacity-50">
                  Delete
                </button>
              </>
            )}
            <button onClick={onClose}
              className="px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────
export default function CreditNotePage() {
  const [showForm, setShowForm]   = useState(false);
  const [editRecord, setEditRecord] = useState(null);
  const [viewRecord, setViewRecord] = useState(null);

  const [filters, setFilters] = useState({
    search: '', status: '', cn_type: '', from: '', to: '',
  });
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 25;

  const qc = useQueryClient();

  const params = useMemo(() => ({
    ...filters,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  }), [filters, page]);

  const { data, isLoading } = useQuery({
    queryKey: ['credit-notes', params],
    queryFn: () => creditNoteAPI.list(params).then(r => r.data),
    keepPreviousData: true,
  });

  const rows  = data?.data  ?? [];
  const total = data?.total ?? 0;

  const setFilter = (k, v) => { setFilters(f => ({ ...f, [k]: v })); setPage(0); };

  const openNew  = ()    => { setEditRecord(null);  setShowForm(true); };
  const openEdit = (rec) => { setEditRecord(rec);   setShowForm(true); setViewRecord(null); };
  const openView = (rec) => { setViewRecord(rec); };

  // Summary stats
  const totalAmt     = rows.reduce((s, r) => s + Number(r.total_amount || 0), 0);
  const pendingAmt   = rows.filter(r => r.status === 'pending')  .reduce((s, r) => s + Number(r.total_amount || 0), 0);
  const appliedAmt   = rows.filter(r => r.status === 'applied')  .reduce((s, r) => s + Number(r.total_amount || 0), 0);
  const refundedAmt  = rows.filter(r => r.status === 'refunded') .reduce((s, r) => s + Number(r.total_amount || 0), 0);

  return (
    <div className="min-h-screen bg-[#f4f6f9]">
      {/* ── Top bar ── */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-violet-50 border border-violet-100 flex items-center justify-center">
              <ArrowDownLeft className="w-4 h-4 text-violet-600" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-900">Credit Notes</h1>
              <p className="text-xs text-slate-500">Vendor credit notes against invoices / GRNs</p>
            </div>
          </div>
          <button onClick={openNew}
            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700">
            <Plus className="w-4 h-4" /> New Credit Note
          </button>
        </div>
      </div>

      {/* ── Summary pills ── */}
      <div className="px-6 pt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total (filtered)',  value: inr(totalAmt),   color: 'text-slate-800',    bg: 'bg-white' },
          { label: 'Pending',           value: inr(pendingAmt), color: 'text-amber-700',    bg: 'bg-amber-50' },
          { label: 'Applied',           value: inr(appliedAmt), color: 'text-emerald-700',  bg: 'bg-emerald-50' },
          { label: 'Refunded',          value: inr(refundedAmt), color: 'text-blue-700',    bg: 'bg-blue-50' },
        ].map((k, i) => (
          <div key={i} className={clsx('border border-slate-200 rounded-xl p-4', k.bg)}>
            <p className="text-xs text-slate-500 font-medium mb-1">{k.label}</p>
            <p className={clsx('text-lg font-bold', k.color)}>₹ {k.value}</p>
          </div>
        ))}
      </div>

      {/* ── Filters ── */}
      <div className="px-6 pt-4 pb-2 flex flex-wrap gap-2 items-center">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input className="pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-white w-52 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            placeholder="Search CN / vendor / invoice…"
            value={filters.search} onChange={e => setFilter('search', e.target.value)} />
        </div>
        <select className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
          value={filters.status} onChange={e => setFilter('status', e.target.value)}>
          <option value="">All Statuses</option>
          {Object.entries(STATUS_CFG).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
        </select>
        <select className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
          value={filters.cn_type} onChange={e => setFilter('cn_type', e.target.value)}>
          <option value="">All Types</option>
          {CN_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <input type="date" className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
          value={filters.from} onChange={e => setFilter('from', e.target.value)} title="From date" />
        <input type="date" className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
          value={filters.to} onChange={e => setFilter('to', e.target.value)} title="To date" />
        {(filters.search || filters.status || filters.cn_type || filters.from || filters.to) && (
          <button onClick={() => { setFilters({ search:'', status:'', cn_type:'', from:'', to:'' }); setPage(0); }}
            className="px-3 py-2 text-sm text-slate-500 hover:text-slate-800">
            Clear filters
          </button>
        )}
        <span className="ml-auto text-xs text-slate-400">{total} record{total !== 1 ? 's' : ''}</span>
      </div>

      {/* ── Table ── */}
      <div className="px-6 pb-10">
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          {isLoading ? (
            <div className="flex justify-center py-16">
              <div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
              <ArrowDownLeft className="w-10 h-10 opacity-20" />
              <p className="text-sm font-medium">No credit notes found</p>
              <button onClick={openNew}
                className="text-sm text-indigo-600 hover:underline flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" /> Create first credit note
              </button>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      {['CN Number', 'CN Date', 'Vendor', 'Project', 'Invoice Ref', 'Type', 'Total (₹)', 'Status', ''].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-slate-500 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {rows.map(row => {
                      const typeLabel = CN_TYPES.find(t => t.value === row.cn_type)?.label || row.cn_type;
                      return (
                        <tr key={row.id} className="hover:bg-slate-50 transition-colors cursor-pointer"
                          onClick={() => openView(row)}>
                          <td className="px-4 py-3">
                            <span className="font-mono text-xs font-semibold text-indigo-700">{row.cn_number}</span>
                          </td>
                          <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                            {dayjs(row.cn_date).format('DD MMM YYYY')}
                          </td>
                          <td className="px-4 py-3 font-medium text-slate-800">{row.vendor_name}</td>
                          <td className="px-4 py-3 text-slate-500 text-xs">{row.project_name || '—'}</td>
                          <td className="px-4 py-3 text-slate-500 text-xs font-mono">{row.invoice_number || '—'}</td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200">{typeLabel}</span>
                          </td>
                          <td className="px-4 py-3 font-mono font-semibold text-slate-800 text-right whitespace-nowrap">
                            ₹ {inr(row.total_amount)}
                          </td>
                          <td className="px-4 py-3"><StatusBadge status={row.status} /></td>
                          <td className="px-4 py-3">
                            <ChevronRight className="w-4 h-4 text-slate-300" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {total > PAGE_SIZE && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50">
                  <span className="text-xs text-slate-500">
                    Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
                  </span>
                  <div className="flex gap-2">
                    <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
                      className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-white">← Prev</button>
                    <button disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage(p => p + 1)}
                      className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-white">Next →</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Modals */}
      {showForm && (
        <CNForm
          initial={editRecord}
          onClose={() => { setShowForm(false); setEditRecord(null); }}
          onSaved={() => qc.invalidateQueries({ queryKey: ['credit-notes'] })}
        />
      )}
      {viewRecord && !showForm && (
        <CNDetail
          cn={viewRecord}
          onClose={() => setViewRecord(null)}
          onEdit={(rec) => { openEdit(rec); }}
        />
      )}
    </div>
  );
}
