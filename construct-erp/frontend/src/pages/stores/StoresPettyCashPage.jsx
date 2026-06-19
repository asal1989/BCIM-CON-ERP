// src/pages/stores/StoresPettyCashPage.jsx
// Stores Petty Cash Tracker — site-level cash book mirroring the Excel register.
// 6 tabs: Dashboard · HO Receipts · Local Purchase · Salary Advances · Analytics · Budgets
import React, { useState, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import dayjs from 'dayjs';
import toast from 'react-hot-toast';
import {
  Wallet, Plus, Search, Trash2, X, Package,
  ShoppingBag, Users, BarChart2, BookOpen, AlertTriangle,
  CheckCircle, Clock, TrendingUp, Printer, RefreshCw,
  Paperclip, Eye, Upload, Send,
} from 'lucide-react';
import { storesPettyCashAPI, projectAPI, uploadAPI } from '../../api/client';

// ── Helpers ──────────────────────────────────────────────────────────────────
const inr = (v) =>
  '₹ ' + Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const F  = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent bg-white';
const FS = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white';

const DEFAULT_BUDGETS = {
  Fuel: 3000, Safety: 12000, Stationery: 5000, Pantry: 3000,
  Transport: 5000, Utilities: 5000, Materials: 15000,
};

const CATEGORIES = Object.keys(DEFAULT_BUDGETS);

const CATEGORY_STYLE = {
  Fuel:       { bg: 'bg-amber-100',  text: 'text-amber-800',  bar: '#F59E0B' },
  Safety:     { bg: 'bg-red-100',    text: 'text-red-800',    bar: '#EF4444' },
  Stationery: { bg: 'bg-blue-100',   text: 'text-blue-800',   bar: '#3B82F6' },
  Pantry:     { bg: 'bg-green-100',  text: 'text-green-800',  bar: '#22C55E' },
  Transport:  { bg: 'bg-orange-100', text: 'text-orange-800', bar: '#F97316' },
  Utilities:  { bg: 'bg-purple-100', text: 'text-purple-800', bar: '#A855F7' },
  Materials:  { bg: 'bg-slate-100',  text: 'text-slate-700',  bar: '#64748B' },
};

function categoryOf(text = '') {
  const d = (text || '').toLowerCase();
  if (/petrol|fuel|diesel/.test(d))                                           return 'Fuel';
  if (/safety|glove|shoe|medical|flag|helmet|badge|banner|ppe/.test(d))      return 'Safety';
  if (/stationery|stationary|file|paper|pen|whitener|stamp|calc|stapler|a4|xerox|print/.test(d)) return 'Stationery';
  if (/pantry|sweet|food|sugar|tea|poha|zeera|mixture|coconut|biscuit|snack/.test(d)) return 'Pantry';
  if (/transport|bus|ticket|charges|auto|cab|uber|ola/.test(d))              return 'Transport';
  if (/electric|bill|power|utility|mobile|recharge|internet/.test(d))        return 'Utilities';
  return 'Materials';
}

const STATUS_STYLE = {
  Pending:  { bg: 'bg-amber-100',  text: 'text-amber-700',  label: 'Pending'  },
  Approved: { bg: 'bg-green-100',  text: 'text-green-700',  label: 'Approved' },
  Rejected: { bg: 'bg-red-100',    text: 'text-red-700',    label: 'Rejected' },
};

function Badge({ label, className = '' }) {
  const s = STATUS_STYLE[label] || { bg: 'bg-slate-100', text: 'text-slate-600' };
  return (
    <span className={clsx('inline-block text-xs font-semibold px-2 py-0.5 rounded-full', s.bg, s.text, className)}>
      {label}
    </span>
  );
}

function CatBadge({ cat }) {
  const s = CATEGORY_STYLE[cat] || CATEGORY_STYLE.Materials;
  return (
    <span className={clsx('inline-block text-xs font-medium px-2 py-0.5 rounded-full', s.bg, s.text)}>
      {cat}
    </span>
  );
}

function Lbl({ children, req }) {
  return (
    <label className="block text-xs font-medium text-slate-600 mb-1">
      {children}{req && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  );
}

// ── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, accent = 'border-indigo-400', valueClass = 'text-slate-800' }) {
  return (
    <div className={clsx('bg-white rounded-xl border border-slate-200 p-4 border-l-4', accent)}>
      <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">{label}</p>
      <p className={clsx('text-xl font-bold', valueClass)}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Mini Bar Chart ────────────────────────────────────────────────────────────
function BarChart({ data }) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="flex items-end gap-2 h-28">
      {data.map(({ label, value, color }, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <span className="text-[10px] text-slate-500 font-semibold">{Number(value).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
          <div className="w-full rounded-t" style={{ background: color, height: `${Math.max((value / max) * 88, 4)}px`, transition: 'height .4s ease' }} />
          <span className="text-[9px] text-slate-400 text-center leading-tight">{label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Print helper ─────────────────────────────────────────────────────────────
function printStatement({ entries, advances, receipts, projectName }) {
  const approved = entries.filter(e => e.status === 'Approved');
  const fmt = (v) => '₹' + Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
  const totalRec  = receipts.reduce((s, r) => s + Number(r.amount), 0);
  const totalLP   = approved.reduce((s, r) => s + Number(r.amount), 0);
  const totalAdv  = advances.reduce((s, r) => s + Number(r.amount), 0);
  const balance   = totalRec - totalLP - totalAdv;

  const recRows  = receipts.map(r => `<tr><td>${dayjs(r.receipt_date).format('DD/MM/YYYY')}</td><td>${r.voucher_no || '–'}</td><td>${r.received_by || '–'}</td><td style="text-align:right">${fmt(r.amount)}</td></tr>`).join('');
  const lpRows   = approved.map(r => `<tr><td>${dayjs(r.entry_date).format('DD/MM/YYYY')}</td><td>${r.supplier}</td><td>${(r.items || []).map(i => i.material_name).join(', ') || '–'}</td><td>${r.invoice_no || '–'}</td><td style="text-align:right">${fmt(r.amount)}</td></tr>`).join('');
  const advRows  = advances.map(r => `<tr><td>${dayjs(r.advance_date).format('DD/MM/YYYY')}</td><td>${r.payee_name}</td><td>${r.description || '–'}</td><td style="text-align:right">${fmt(r.amount)}</td></tr>`).join('');

  const html = `<html><head><title>Petty Cash Statement</title>
  <style>body{font-family:Arial,sans-serif;font-size:12px;color:#1C2533;margin:32px}
  h1{font-size:18px;color:#1F3864;border-bottom:2px solid #1F3864;padding-bottom:8px}
  h2{font-size:13px;color:#2E75B6;margin:20px 0 6px}
  table{width:100%;border-collapse:collapse;margin-bottom:16px}
  th{background:#1F3864;color:#fff;padding:7px 10px;text-align:left;font-size:11px}
  td{padding:6px 10px;border-bottom:1px solid #EEF0F3}
  .total{font-weight:700;text-align:right}
  .sig{margin-top:48px;display:flex;gap:80px}
  .sig div{border-top:1px solid #333;padding-top:6px;font-size:11px;color:#4B5563;width:180px}
  </style></head><body>
  <h1>Stores Petty Cash Statement${projectName ? ' — ' + projectName : ''}</h1>
  <h2>A. Cash Received from HO</h2>
  <table><tr><th>Date</th><th>Voucher No</th><th>Received By</th><th>Amount</th></tr>
  ${recRows}<tr><td colspan="3" class="total">TOTAL RECEIVED</td><td class="total">${fmt(totalRec)}</td></tr></table>
  <h2>B. Local Purchases</h2>
  <table><tr><th>Date</th><th>Supplier</th><th>Materials</th><th>Invoice</th><th>Amount</th></tr>
  ${lpRows}<tr><td colspan="4" class="total">TOTAL LOCAL PURCHASE</td><td class="total">${fmt(totalLP)}</td></tr></table>
  <h2>C. Salary Advances</h2>
  <table><tr><th>Date</th><th>Name</th><th>Description</th><th>Amount</th></tr>
  ${advRows}<tr><td colspan="3" class="total">TOTAL ADVANCES</td><td class="total">${fmt(totalAdv)}</td></tr></table>
  <h2>D. Summary</h2>
  <table><tr><th>Item</th><th>Amount</th></tr>
  <tr><td>Total Received from HO</td><td>${fmt(totalRec)}</td></tr>
  <tr><td>Total Spent (Purchases + Advances)</td><td>${fmt(totalLP + totalAdv)}</td></tr>
  <tr><td><b>Cash in Hand (Closing Balance)</b></td><td><b>${fmt(balance)}</b></td></tr></table>
  <div class="sig"><div>Site Incharge</div><div>Project Manager</div><div>Accounts</div></div>
  </body></html>`;
  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
  w.print();
}

// ── Entry Form (Local Purchase) ───────────────────────────────────────────────
const EMPTY_ITEM  = { material_name: '', unit: "NO'S", quantity: '' };
const EMPTY_ENTRY = { project_id: '', entry_date: dayjs().format('YYYY-MM-DD'), supplier: '', invoice_no: '', amount: '', remarks: '', bill_file_url: '', bill_file_name: '' };

function EntryForm({ initial, projects, defaultProjectId, budgets, catSpend, onClose }) {
  const qc = useQueryClient();
  const isEdit = !!initial?.id;

  const [form, setForm] = useState(
    isEdit
      ? { project_id: initial.project_id || '', entry_date: initial.entry_date?.slice(0, 10) || dayjs().format('YYYY-MM-DD'),
          supplier: initial.supplier || '', invoice_no: initial.invoice_no || '', amount: initial.amount || '',
          remarks: initial.remarks || '', bill_file_url: initial.bill_file_url || '', bill_file_name: initial.bill_file_name || '' }
      : { ...EMPTY_ENTRY, project_id: defaultProjectId || '' }
  );
  const [items, setItems] = useState(
    isEdit && initial.items?.length
      ? initial.items.map(it => ({ material_name: it.material_name, unit: it.unit, quantity: it.quantity }))
      : [{ ...EMPTY_ITEM }]
  );
  const [uploading, setUploading] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const updateItem  = (idx, key, val) => setItems(prev => { const n = [...prev]; n[idx] = { ...n[idx], [key]: val }; return n; });
  const addItem     = () => setItems(p => [...p, { ...EMPTY_ITEM }]);
  const removeItem  = (idx) => setItems(p => p.filter((_, i) => i !== idx));

  // Derive category from first material name for budget warning
  const detectedCat = categoryOf(items[0]?.material_name || form.supplier || '');
  const catCap   = budgets?.[detectedCat] ?? 0;
  const catSpent = catSpend?.[detectedCat] ?? 0;
  const newTotal = catSpent + (parseFloat(form.amount) || 0);
  const budgetPct = catCap > 0 ? (newTotal / catCap) * 100 : 0;
  const budgetWarning = catCap > 0 && budgetPct >= 80;
  const budgetOver    = catCap > 0 && newTotal > catCap;

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const res = await uploadAPI.uploadSingle(file);
      set('bill_file_url',  res.data.url);
      set('bill_file_name', file.name);
      toast.success('Bill attached');
    } catch {
      toast.error('Upload failed — try again');
    } finally {
      setUploading(false);
    }
  };

  const saveMut = useMutation({
    mutationFn: (payload) => isEdit
      ? storesPettyCashAPI.updateEntry(initial.id, payload).then(r => r.data)
      : storesPettyCashAPI.createEntry(payload).then(r => r.data),
    onSuccess: () => {
      toast.success(isEdit ? 'Entry updated' : 'Entry added — awaiting approval');
      qc.invalidateQueries({ queryKey: ['spc-entries'] });
      qc.invalidateQueries({ queryKey: ['spc-summary'] });
      onClose();
    },
    onError: e => toast.error(e?.response?.data?.error || 'Save failed'),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.supplier.trim()) return toast.error('Supplier is required');
    if (!form.entry_date) return toast.error('Date is required');
    if (!items.some(it => it.material_name?.trim())) return toast.error('Add at least one material line');
    saveMut.mutate({ ...form, amount: parseFloat(form.amount) || 0, items: items.filter(it => it.material_name?.trim()), status: 'Pending' });
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4 overflow-auto">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[96vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center">
              <ShoppingBag className="w-4 h-4 text-indigo-600" />
            </div>
            <div>
              <p className="font-semibold text-slate-900">{isEdit ? `Edit Entry — Sl No ${initial.sl_no}` : 'New Local Purchase Entry'}</p>
              <p className="text-xs text-slate-500 mt-0.5">Record a local purchase paid from petty cash</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800"><X className="w-4 h-4" /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><Lbl req>Date</Lbl><input type="date" className={F} value={form.entry_date} onChange={e => set('entry_date', e.target.value)} required /></div>
            <div><Lbl>Project</Lbl>
              <select className={FS} value={form.project_id} onChange={e => set('project_id', e.target.value)}>
                <option value="">— Not linked —</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div><Lbl req>Supplier</Lbl><input className={F} placeholder="e.g. Ponam Hardware" value={form.supplier} onChange={e => set('supplier', e.target.value)} required /></div>
            <div><Lbl>Invoice No.</Lbl><input className={F} placeholder="49045" value={form.invoice_no} onChange={e => set('invoice_no', e.target.value)} /></div>
            <div className="col-span-2">
              <Lbl req>Amount (₹)</Lbl>
              <input type="number" step="0.01" className={F} placeholder="0.00" value={form.amount} onChange={e => set('amount', e.target.value)} required />
              {/* Budget warning */}
              {budgetWarning && (
                <div className={clsx('flex items-center gap-2 mt-1.5 text-xs font-medium px-3 py-1.5 rounded-lg',
                  budgetOver ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-amber-50 text-amber-700 border border-amber-200')}>
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                  {budgetOver
                    ? `Over ${detectedCat} budget! Cap: ${inr(catCap)} · Running total: ${inr(newTotal)} (${inr(newTotal - catCap)} over)`
                    : `Near ${detectedCat} budget limit: ${inr(newTotal)} of ${inr(catCap)} (${budgetPct.toFixed(0)}% used)`}
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
              <Package className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Materials Purchased</span>
              <button type="button" onClick={addItem} className="ml-auto text-xs font-medium text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" /> Add Line
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    {['#', 'Material Description', 'Unit', 'Qty', ''].map(h => (
                      <th key={h} className="px-3 py-2 text-left font-medium text-slate-400 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {items.map((it, idx) => (
                    <tr key={idx}>
                      <td className="px-3 py-2 text-slate-400 w-8">{idx + 1}</td>
                      <td className="px-2 py-1.5 min-w-[180px]">
                        <input className={F} placeholder="Material name" value={it.material_name} onChange={e => updateItem(idx, 'material_name', e.target.value)} />
                      </td>
                      <td className="px-2 py-1.5 w-24">
                        <input className={F} placeholder="NO'S" value={it.unit} onChange={e => updateItem(idx, 'unit', e.target.value)} />
                      </td>
                      <td className="px-2 py-1.5 w-24">
                        <input type="number" step="any" className={F} placeholder="0" value={it.quantity} onChange={e => updateItem(idx, 'quantity', e.target.value)} />
                      </td>
                      <td className="px-2 py-1.5 w-8">
                        {items.length > 1 && (
                          <button type="button" onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div><Lbl>Remarks</Lbl>
            <textarea className={clsx(F, 'resize-none')} rows={2} placeholder="Any additional notes…" value={form.remarks} onChange={e => set('remarks', e.target.value)} />
          </div>

          {/* ── Bill / Voucher Upload ── */}
          <div>
            <Lbl>Attach Bill / Voucher</Lbl>
            {form.bill_file_url ? (
              <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg px-4 py-2.5">
                <Paperclip className="w-4 h-4 text-green-600 flex-shrink-0" />
                <span className="text-sm text-green-700 font-medium flex-1 truncate">{form.bill_file_name || 'Bill attached'}</span>
                <a href={form.bill_file_url} target="_blank" rel="noreferrer"
                  className="flex items-center gap-1 text-xs text-green-700 font-semibold hover:text-green-900 flex-shrink-0">
                  <Eye className="w-3.5 h-3.5" /> View
                </a>
                <button type="button" onClick={() => { set('bill_file_url', ''); set('bill_file_name', ''); }}
                  className="text-red-400 hover:text-red-600 flex-shrink-0"><X className="w-3.5 h-3.5" /></button>
              </div>
            ) : (
              <label className={clsx('flex items-center gap-3 px-4 py-2.5 border-2 border-dashed border-slate-200 rounded-lg cursor-pointer hover:border-indigo-300 hover:bg-indigo-50 transition-colors', uploading && 'opacity-50 pointer-events-none')}>
                <Upload className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <span className="text-sm text-slate-500">{uploading ? 'Uploading…' : 'Click to attach bill photo or PDF (max 10 MB)'}</span>
                <input type="file" accept="image/*,.pdf" className="hidden" onChange={handleFileChange} disabled={uploading} />
              </label>
            )}
          </div>
        </form>

        <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-white">
          <button type="button" onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
          <button onClick={handleSubmit} disabled={saveMut.isPending || uploading} className="px-6 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50">
            {saveMut.isPending ? 'Saving…' : isEdit ? 'Update Entry' : 'Save Entry'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Advance Form ──────────────────────────────────────────────────────────────
const EMPTY_ADVANCE = { project_id: '', advance_date: dayjs().format('YYYY-MM-DD'), payee_name: '', description: 'SALARY ADVANCE', amount: '', remarks: '' };

function AdvanceForm({ initial, projects, defaultProjectId, onClose }) {
  const qc = useQueryClient();
  const isEdit = !!initial?.id;

  const [form, setForm] = useState(
    isEdit
      ? { project_id: initial.project_id || '', advance_date: initial.advance_date?.slice(0, 10) || dayjs().format('YYYY-MM-DD'),
          payee_name: initial.payee_name || '', description: initial.description || 'SALARY ADVANCE', amount: initial.amount || '', remarks: initial.remarks || '' }
      : { ...EMPTY_ADVANCE, project_id: defaultProjectId || '' }
  );
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const saveMut = useMutation({
    mutationFn: (payload) => isEdit
      ? storesPettyCashAPI.updateAdvance(initial.id, payload).then(r => r.data)
      : storesPettyCashAPI.createAdvance(payload).then(r => r.data),
    onSuccess: () => {
      toast.success(isEdit ? 'Advance updated' : 'Advance recorded');
      qc.invalidateQueries({ queryKey: ['spc-advances'] });
      qc.invalidateQueries({ queryKey: ['spc-summary'] });
      onClose();
    },
    onError: e => toast.error(e?.response?.data?.error || 'Save failed'),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.payee_name.trim()) return toast.error('Name is required');
    if (!form.advance_date) return toast.error('Date is required');
    saveMut.mutate({ ...form, amount: parseFloat(form.amount) || 0 });
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4 overflow-auto">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl flex flex-col max-h-[96vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center">
              <Users className="w-4 h-4 text-amber-600" />
            </div>
            <div>
              <p className="font-semibold text-slate-900">{isEdit ? 'Edit Advance' : 'New Salary Advance'}</p>
              <p className="text-xs text-slate-500 mt-0.5">Cash paid to contractor / employee</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Lbl req>Date</Lbl><input type="date" className={F} value={form.advance_date} onChange={e => set('advance_date', e.target.value)} required /></div>
            <div><Lbl>Project</Lbl>
              <select className={FS} value={form.project_id} onChange={e => set('project_id', e.target.value)}>
                <option value="">— Not linked —</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>
          <div><Lbl req>Contractor / Employee Name</Lbl><input className={F} placeholder="e.g. Mukesh 3250008" value={form.payee_name} onChange={e => set('payee_name', e.target.value)} required /></div>
          <div><Lbl>Description</Lbl><input className={F} placeholder="SALARY ADVANCE" value={form.description} onChange={e => set('description', e.target.value)} /></div>
          <div><Lbl req>Amount Paid (₹)</Lbl><input type="number" step="0.01" className={F} placeholder="0.00" value={form.amount} onChange={e => set('amount', e.target.value)} required /></div>
          <div><Lbl>Remarks</Lbl><textarea className={clsx(F, 'resize-none')} rows={2} value={form.remarks} onChange={e => set('remarks', e.target.value)} /></div>
        </form>
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-white">
          <button type="button" onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
          <button onClick={handleSubmit} disabled={saveMut.isPending} className="px-6 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50">
            {saveMut.isPending ? 'Saving…' : isEdit ? 'Update' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Receipt Form (HO Cash) ────────────────────────────────────────────────────
const EMPTY_RECEIPT = { project_id: '', receipt_date: dayjs().format('YYYY-MM-DD'), amount: '', received_by: '', voucher_no: '', remarks: '' };

function ReceiptForm({ initial, projects, defaultProjectId, onClose }) {
  const qc = useQueryClient();
  const isEdit = !!initial?.id;

  const [form, setForm] = useState(
    isEdit
      ? { project_id: initial.project_id || '', receipt_date: initial.receipt_date?.slice(0, 10) || dayjs().format('YYYY-MM-DD'),
          amount: initial.amount || '', received_by: initial.received_by || '', voucher_no: initial.voucher_no || '', remarks: initial.remarks || '' }
      : { ...EMPTY_RECEIPT, project_id: defaultProjectId || '' }
  );
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const saveMut = useMutation({
    mutationFn: (payload) => isEdit
      ? storesPettyCashAPI.updateReceipt(initial.id, payload).then(r => r.data)
      : storesPettyCashAPI.createReceipt(payload).then(r => r.data),
    onSuccess: () => {
      toast.success(isEdit ? 'Receipt updated' : 'Receipt recorded');
      qc.invalidateQueries({ queryKey: ['spc-receipts'] });
      qc.invalidateQueries({ queryKey: ['spc-summary'] });
      onClose();
    },
    onError: e => toast.error(e?.response?.data?.error || 'Save failed'),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.receipt_date) return toast.error('Date is required');
    if (!parseFloat(form.amount)) return toast.error('Amount is required');
    saveMut.mutate({ ...form, amount: parseFloat(form.amount) || 0 });
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4 overflow-auto">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl flex flex-col max-h-[96vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-green-50 border border-green-100 flex items-center justify-center">
              <Wallet className="w-4 h-4 text-green-600" />
            </div>
            <div>
              <p className="font-semibold text-slate-900">{isEdit ? 'Edit HO Receipt' : 'Record Cash from HO'}</p>
              <p className="text-xs text-slate-500 mt-0.5">Cash received from Head Office / management</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Lbl req>Date Received</Lbl><input type="date" className={F} value={form.receipt_date} onChange={e => set('receipt_date', e.target.value)} required /></div>
            <div><Lbl>Project</Lbl>
              <select className={FS} value={form.project_id} onChange={e => set('project_id', e.target.value)}>
                <option value="">— Not linked —</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>
          <div><Lbl req>Amount Received (₹)</Lbl><input type="number" step="0.01" className={F} placeholder="0.00" value={form.amount} onChange={e => set('amount', e.target.value)} required /></div>
          <div><Lbl>Received By</Lbl><input className={F} placeholder="Site Incharge" value={form.received_by} onChange={e => set('received_by', e.target.value)} /></div>
          <div><Lbl>HO Voucher / Ref No</Lbl><input className={F} placeholder="HO-PC-MAR-01" value={form.voucher_no} onChange={e => set('voucher_no', e.target.value)} /></div>
          <div><Lbl>Remarks</Lbl><textarea className={clsx(F, 'resize-none')} rows={2} value={form.remarks} onChange={e => set('remarks', e.target.value)} /></div>
        </form>
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-white">
          <button type="button" onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
          <button onClick={handleSubmit} disabled={saveMut.isPending} className="px-6 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50">
            {saveMut.isPending ? 'Saving…' : isEdit ? 'Update' : 'Save Receipt'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
export default function StoresPettyCashPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState('dashboard');
  const [projectId, setProjectId] = useState('');
  const [filters, setFilters] = useState({ search: '', from: '', to: '' });
  const [showEntryForm,   setShowEntryForm]   = useState(false);
  const [editEntry,       setEditEntry]       = useState(null);
  const [showAdvForm,     setShowAdvForm]     = useState(false);
  const [editAdv,         setEditAdv]         = useState(null);
  const [showReceiptForm, setShowReceiptForm] = useState(false);
  const [editReceipt,     setEditReceipt]     = useState(null);
  const [showRepl,        setShowRepl]        = useState(false);
  const [editBudgets,     setEditBudgets]     = useState(false);
  const [localBudgets,    setLocalBudgets]    = useState(null);
  const [statusFilter,    setStatusFilter]    = useState('All');
  const [catFilter,       setCatFilter]       = useState('All');
  const setFilter = (k, v) => setFilters(f => ({ ...f, [k]: v }));

  const { data: projects = [] } = useQuery({
    queryKey: ['projects-list'],
    queryFn: () => projectAPI.list({ limit: 500 }).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    staleTime: 60000,
  });

  const selectedProject = projects.find(p => p.id === projectId);

  const baseParams = useMemo(() => ({
    project_id: projectId || undefined,
    search: filters.search || undefined,
    from: filters.from || undefined,
    to: filters.to || undefined,
  }), [projectId, filters]);

  const { data: entriesResp,  isLoading: loadingEntries  } = useQuery({
    queryKey: ['spc-entries', baseParams],
    queryFn: () => storesPettyCashAPI.listEntries({ ...baseParams, limit: 1000 }).then(r => r.data),
  });
  const { data: advancesResp, isLoading: loadingAdvances } = useQuery({
    queryKey: ['spc-advances', baseParams],
    queryFn: () => storesPettyCashAPI.listAdvances({ ...baseParams, limit: 1000 }).then(r => r.data),
  });
  const { data: receiptsResp, isLoading: loadingReceipts } = useQuery({
    queryKey: ['spc-receipts', baseParams],
    queryFn: () => storesPettyCashAPI.listReceipts({ project_id: projectId || undefined, limit: 500 }).then(r => r.data),
  });
  const { data: summaryResp } = useQuery({
    queryKey: ['spc-summary', projectId],
    queryFn: () => storesPettyCashAPI.summary({ project_id: projectId || undefined }).then(r => r.data),
  });
  const { data: budgetsResp } = useQuery({
    queryKey: ['spc-budgets', projectId],
    queryFn: () => storesPettyCashAPI.getBudgets({ project_id: projectId || undefined }).then(r => r.data),
  });

  const entries  = entriesResp?.data  ?? [];
  const advances = advancesResp?.data ?? [];
  const receipts = receiptsResp?.data ?? [];
  const summary  = summaryResp?.data  ?? {};
  const budgets  = useMemo(() => ({ ...DEFAULT_BUDGETS, ...(budgetsResp?.data ?? {}) }), [budgetsResp]);

  // ── Mutations ──────────────────────────────────────────────────────────────
  const deleteEntryMut = useMutation({
    mutationFn: (id) => storesPettyCashAPI.deleteEntry(id),
    onSuccess: () => { toast.success('Entry deleted'); qc.invalidateQueries({ queryKey: ['spc-entries'] }); qc.invalidateQueries({ queryKey: ['spc-summary'] }); },
    onError: e => toast.error(e?.response?.data?.error || 'Delete failed'),
  });
  const deleteAdvMut = useMutation({
    mutationFn: (id) => storesPettyCashAPI.deleteAdvance(id),
    onSuccess: () => { toast.success('Advance deleted'); qc.invalidateQueries({ queryKey: ['spc-advances'] }); qc.invalidateQueries({ queryKey: ['spc-summary'] }); },
    onError: e => toast.error(e?.response?.data?.error || 'Delete failed'),
  });
  const deleteReceiptMut = useMutation({
    mutationFn: (id) => storesPettyCashAPI.deleteReceipt(id),
    onSuccess: () => { toast.success('Receipt deleted'); qc.invalidateQueries({ queryKey: ['spc-receipts'] }); qc.invalidateQueries({ queryKey: ['spc-summary'] }); },
    onError: e => toast.error(e?.response?.data?.error || 'Delete failed'),
  });
  const patchStatusMut = useMutation({
    mutationFn: ({ id, status }) => storesPettyCashAPI.patchStatus(id, status),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['spc-entries'] }); qc.invalidateQueries({ queryKey: ['spc-summary'] }); },
    onError: e => toast.error(e?.response?.data?.error || 'Status update failed'),
  });
  const saveBudgetsMut = useMutation({
    mutationFn: (data) => storesPettyCashAPI.updateBudgets(data),
    onSuccess: () => { toast.success('Budgets saved'); qc.invalidateQueries({ queryKey: ['spc-budgets'] }); setEditBudgets(false); },
    onError: e => toast.error(e?.response?.data?.error || 'Save failed'),
  });

  // ── Derived calculations ───────────────────────────────────────────────────
  const approvedEntries = useMemo(() => entries.filter(e => e.status === 'Approved'), [entries]);
  const pendingCount    = useMemo(() => entries.filter(e => e.status === 'Pending').length, [entries]);

  const totalReceived = summary.receipt_total  ?? 0;
  const totalLP       = summary.local_purchase_total ?? 0;
  const totalAdv      = summary.advance_total  ?? 0;
  const totalSpent    = totalLP + totalAdv;
  const cashInHand    = totalReceived - totalSpent;

  // Running balance on filtered entries (chronological)
  const entriesWithBal = useMemo(() => {
    let bal = totalReceived;
    return [...entries]
      .sort((a, b) => a.entry_date < b.entry_date ? -1 : a.entry_date > b.entry_date ? 1 : a.sl_no - b.sl_no)
      .map(r => { if (r.status === 'Approved') bal -= Number(r.amount); return { ...r, runBalance: bal }; });
  }, [entries, totalReceived]);

  // Filtered entries for Local Purchase tab
  const filteredEntries = useMemo(() => {
    return entriesWithBal.filter(r => {
      const s = statusFilter === 'All' || r.status === statusFilter;
      const cat = categoryOf((r.items?.[0]?.material_name || r.supplier || ''));
      const c = catFilter === 'All' || cat === catFilter;
      return s && c;
    });
  }, [entriesWithBal, statusFilter, catFilter]);

  // Duplicate invoice detection
  const dupInvoices = useMemo(() => {
    const map = {};
    entries.forEach(e => { if (e.invoice_no && e.invoice_no !== '–') { map[e.invoice_no] = map[e.invoice_no] || []; map[e.invoice_no].push(e.id); } });
    return Object.fromEntries(Object.entries(map).filter(([, ids]) => ids.length > 1));
  }, [entries]);

  // Category spend (approved only)
  const catSpend = useMemo(() => {
    const result = {};
    CATEGORIES.forEach(cat => { result[cat] = 0; });
    approvedEntries.forEach(e => {
      const cat = categoryOf((e.items?.[0]?.material_name || e.supplier || ''));
      result[cat] = (result[cat] || 0) + Number(e.amount);
    });
    return result;
  }, [approvedEntries]);

  // Top suppliers
  const topSuppliers = useMemo(() => {
    const map = {};
    entries.forEach(e => { map[e.supplier] = map[e.supplier] || { count: 0, total: 0 }; map[e.supplier].count++; map[e.supplier].total += Number(e.amount); });
    return Object.entries(map).sort((a, b) => b[1].total - a[1].total).slice(0, 7);
  }, [entries]);

  // ── Tab helpers ────────────────────────────────────────────────────────────
  const TABS = [
    { id: 'dashboard',   label: 'Dashboard',       Icon: BarChart2   },
    { id: 'receipts',    label: 'HO Receipts',      Icon: Wallet      },
    { id: 'local',       label: 'Local Purchase',   Icon: ShoppingBag },
    { id: 'advances',    label: 'Salary Advances',  Icon: Users       },
    { id: 'analytics',   label: 'Analytics',        Icon: TrendingUp  },
    { id: 'budgets',     label: 'Budgets',          Icon: BookOpen    },
  ];

  const balanceColor = cashInHand < 0 ? 'text-red-600' : cashInHand < 5000 ? 'text-amber-600' : 'text-green-700';

  return (
    <div className="min-h-screen bg-[#f4f6f9]">

      {/* ── Header bar ── */}
      <div className="bg-slate-800 px-6 py-0 flex items-center justify-between h-14 gap-4">
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
            <Wallet className="w-4 h-4 text-white" />
          </div>
          <span className="text-white font-semibold text-sm">Stores Petty Cash</span>
          <span className="text-slate-400 text-xs hidden sm:block">· Site Cash Book</span>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          {pendingCount > 0 && (
            <button onClick={() => { setTab('local'); setStatusFilter('Pending'); }}
              className="flex items-center gap-1.5 bg-amber-500/20 border border-amber-400/30 text-amber-300 text-xs font-semibold px-3 py-1.5 rounded-full">
              <Clock className="w-3 h-3" /> {pendingCount} Pending
            </button>
          )}
          <div className={clsx('flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border',
            cashInHand < 0 ? 'bg-red-500/20 border-red-400/30 text-red-300' :
            cashInHand < 5000 ? 'bg-amber-500/20 border-amber-400/30 text-amber-300' :
            'bg-green-500/20 border-green-400/30 text-green-300')}>
            {cashInHand < 0 ? <AlertTriangle className="w-3 h-3" /> : <CheckCircle className="w-3 h-3" />}
            {inr(Math.abs(cashInHand))} {cashInHand < 0 ? 'OVERDRAWN' : 'in Hand'}
          </div>
        </div>
      </div>

      {/* ── Project selector + Tab bar ── */}
      <div className="bg-white border-b border-slate-200 px-6">
        <div className="flex items-center gap-4 pt-3 flex-wrap">
          <select className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 w-56 mb-2"
            value={projectId} onChange={e => setProjectId(e.target.value)}>
            <option value="">All Projects</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button onClick={() => printStatement({ entries: approvedEntries, advances, receipts, projectName: selectedProject?.name })}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-2">
            <Printer className="w-3.5 h-3.5" /> Print Statement
          </button>
        </div>
        <div className="flex gap-0 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={clsx('flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
                tab === t.id ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800')}>
              <t.Icon className="w-3.5 h-3.5" /> {t.label}
              {t.id === 'local' && pendingCount > 0 && (
                <span className="ml-1 text-[10px] bg-amber-500 text-white rounded-full px-1.5 py-0.5 font-bold leading-none">{pendingCount}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="px-6 py-6 max-w-7xl mx-auto">

        {/* ══ DASHBOARD ══ */}
        {tab === 'dashboard' && (
          <div className="space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-xl font-bold text-slate-800">Summary Overview</h2>
                <p className="text-sm text-slate-500 mt-0.5">All petty cash activity{selectedProject ? ` · ${selectedProject.name}` : ''}</p>
              </div>
              <button onClick={() => setShowRepl(true)}
                className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white text-sm font-medium rounded-lg hover:bg-orange-700 shadow-sm">
                <RefreshCw className="w-4 h-4" /> Request Replenishment
              </button>
            </div>

            {/* Alerts */}
            {(cashInHand < 5000 || Object.keys(dupInvoices).length > 0) && (
              <div className="space-y-2">
                {cashInHand < 0 && (
                  <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                    <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                    <span className="text-sm font-medium text-red-700">Cash overdrawn! Request replenishment from HO immediately.</span>
                  </div>
                )}
                {cashInHand >= 0 && cashInHand < 5000 && (
                  <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                    <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                    <span className="text-sm font-medium text-amber-700">Cash in hand is low (below ₹5,000). Consider requesting replenishment.</span>
                  </div>
                )}
                {Object.entries(dupInvoices).map(([inv, ids]) => (
                  <div key={inv} className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                    <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                    <span className="text-sm font-medium text-red-700">Duplicate invoice <b>{inv}</b> appears {ids.length} times — verify entries</span>
                  </div>
                ))}
              </div>
            )}

            {/* KPI cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KpiCard label="Total Received from HO" value={inr(totalReceived)} sub={`${summary.receipt_count || 0} transfers`} accent="border-green-400" valueClass="text-green-700" />
              <KpiCard label="Total Spent (Approved)" value={inr(totalSpent)} sub={`Purchases ${inr(totalLP)} · Advances ${inr(totalAdv)}`} accent="border-red-400" valueClass="text-red-700" />
              <KpiCard label="Cash in Hand" value={inr(Math.abs(cashInHand))} sub={cashInHand < 0 ? 'OVERDRAWN' : cashInHand < 5000 ? 'Low — request top-up' : 'Sufficient'} accent={cashInHand < 0 ? 'border-red-500' : cashInHand < 5000 ? 'border-amber-400' : 'border-green-400'} valueClass={balanceColor} />
              <KpiCard label="Pending Approval" value={pendingCount} sub="entries awaiting review" accent="border-amber-400" valueClass="text-amber-700" />
            </div>

            {/* Reconciliation */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="bg-slate-800 px-6 py-4">
                <p className="text-white font-bold text-sm">Cash Reconciliation Statement</p>
                <p className="text-slate-400 text-xs mt-0.5">Imprest Petty Cash — Site Cash Book</p>
              </div>
              <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="bg-slate-700 px-4 py-2.5 text-white text-sm font-semibold">Position</div>
                  <div className="p-4 space-y-2">
                    {[
                      ['Total Received from HO', inr(totalReceived), 'text-green-700 font-bold'],
                      ['Total Local Purchases (Approved)', inr(totalLP), 'text-red-600'],
                      ['Total Salary Advances', inr(totalAdv), 'text-red-600'],
                      ['Total Spent', inr(totalSpent), 'text-red-700 font-bold'],
                    ].map(([l, v, vc]) => (
                      <div key={l} className="flex justify-between py-1.5 border-b border-slate-50">
                        <span className="text-sm text-slate-500">{l}</span>
                        <span className={clsx('text-sm', vc)}>{v}</span>
                      </div>
                    ))}
                    <div className="flex justify-between py-2 mt-1">
                      <span className="text-sm font-bold text-slate-700">Cash in Hand (Closing)</span>
                      <span className={clsx('text-sm font-bold', balanceColor)}>{inr(cashInHand)}</span>
                    </div>
                    <div className="mt-2">
                      <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${Math.min(totalReceived > 0 ? (totalSpent / totalReceived) * 100 : 0, 100)}%`, background: cashInHand < 0 ? '#EF4444' : cashInHand < 5000 ? '#F59E0B' : '#22C55E' }} />
                      </div>
                      <p className="text-xs text-slate-400 mt-1">{totalReceived > 0 ? ((totalSpent / totalReceived) * 100).toFixed(1) : '0'}% utilisation</p>
                    </div>
                  </div>
                </div>

                {/* Category spend */}
                <div>
                  <p className="text-sm font-semibold text-slate-700 mb-3">Spending by Category</p>
                  {CATEGORIES.map(cat => {
                    const s = CATEGORY_STYLE[cat] || CATEGORY_STYLE.Materials;
                    const spent = catSpend[cat] || 0;
                    const cap = budgets[cat] || DEFAULT_BUDGETS[cat] || 0;
                    const pct = cap > 0 ? Math.min((spent / cap) * 100, 100) : 0;
                    return (
                      <div key={cat} className="flex items-center gap-3 mb-2">
                        <CatBadge cat={cat} />
                        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: s.bar }} />
                        </div>
                        <span className="text-xs font-semibold text-slate-600 w-24 text-right">{inr(spent)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Top suppliers */}
            {topSuppliers.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-100">
                  <p className="text-sm font-semibold text-slate-700">Top Suppliers</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        {['Supplier', 'Transactions', 'Total'].map(h => (
                          <th key={h} className="px-4 py-2.5 text-left text-[11px] font-medium text-slate-400 uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {topSuppliers.map(([sup, { count, total }], i) => (
                        <tr key={sup} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                          <td className="px-4 py-2.5 font-medium text-slate-800">
                            {sup}{count >= 4 && <span className="ml-2 text-[10px] text-amber-600 font-semibold">⚠ high freq</span>}
                          </td>
                          <td className="px-4 py-2.5 text-slate-500 text-center">{count}</td>
                          <td className="px-4 py-2.5 font-semibold text-slate-800 text-right">{inr(total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ HO RECEIPTS ══ */}
        {tab === 'receipts' && (
          <div>
            <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
              <div>
                <h2 className="text-xl font-bold text-slate-800">Cash Received from HO</h2>
                <p className="text-sm text-slate-500 mt-0.5">All amounts released by Head Office / management</p>
              </div>
              <button onClick={() => { setEditReceipt(null); setShowReceiptForm(true); }}
                className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700">
                <Plus className="w-4 h-4" /> Record Receipt
              </button>
            </div>

            <div className="flex gap-3 mb-5 flex-wrap">
              <KpiCard label="Total Received" value={inr(totalReceived)} sub={`${summary.receipt_count || 0} transfers`} accent="border-green-400" valueClass="text-green-700" />
              <KpiCard label="Total Spent" value={inr(totalSpent)} accent="border-red-400" valueClass="text-red-700" />
              <KpiCard label="Cash in Hand" value={inr(cashInHand)} accent={cashInHand < 0 ? 'border-red-500' : 'border-indigo-400'} valueClass={balanceColor} />
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              {loadingReceipts ? (
                <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-green-400 border-t-transparent rounded-full animate-spin" /></div>
              ) : receipts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
                  <Wallet className="w-10 h-10 opacity-20" />
                  <p className="text-sm font-medium">No receipts recorded yet</p>
                  <button onClick={() => { setEditReceipt(null); setShowReceiptForm(true); }} className="text-sm text-green-600 hover:underline flex items-center gap-1">
                    <Plus className="w-3.5 h-3.5" /> Record first receipt
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        {['#', 'Date', 'Amount (₹)', 'Received By', 'Voucher No', 'Remarks', ''].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-slate-500 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {receipts.map((row, i) => (
                        <tr key={row.id} className="hover:bg-slate-50 transition-colors cursor-pointer"
                          onClick={() => { setEditReceipt(row); setShowReceiptForm(true); }}>
                          <td className="px-4 py-3 text-slate-400 text-xs">{i + 1}</td>
                          <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{dayjs(row.receipt_date).format('DD MMM YYYY')}</td>
                          <td className="px-4 py-3 font-mono font-bold text-green-700 text-right whitespace-nowrap">{inr(row.amount)}</td>
                          <td className="px-4 py-3 text-slate-600">{row.received_by || '—'}</td>
                          <td className="px-4 py-3 text-slate-500 text-xs font-mono">{row.voucher_no || '—'}</td>
                          <td className="px-4 py-3 text-slate-400 text-xs">{row.remarks || '—'}</td>
                          <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                            <button onClick={() => { if (window.confirm('Delete this receipt?')) deleteReceiptMut.mutate(row.id); }}
                              className="text-red-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-green-50 border-t-2 border-green-200">
                        <td colSpan={2} className="px-4 py-3 text-right text-xs font-bold text-green-800 uppercase">Total Received</td>
                        <td className="px-4 py-3 font-mono font-bold text-green-700 text-right">{inr(totalReceived)}</td>
                        <td colSpan={4} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══ LOCAL PURCHASE ══ */}
        {tab === 'local' && (
          <div>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <div>
                <h2 className="text-xl font-bold text-slate-800">Local Purchase Log</h2>
                <p className="text-sm text-slate-500 mt-0.5">{filteredEntries.length} entries · Total: <span className="font-semibold text-slate-700">{inr(filteredEntries.reduce((s, r) => s + Number(r.amount), 0))}</span></p>
              </div>
              <div className="flex gap-2 flex-wrap items-center">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input className="pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-white w-48 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    placeholder="Search supplier / material…" value={filters.search} onChange={e => setFilter('search', e.target.value)} />
                </div>
                <select className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                  {['All', 'Pending', 'Approved', 'Rejected'].map(s => <option key={s}>{s}</option>)}
                </select>
                <select className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  value={catFilter} onChange={e => setCatFilter(e.target.value)}>
                  {['All', ...CATEGORIES].map(c => <option key={c}>{c}</option>)}
                </select>
                <input type="date" className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  value={filters.from} onChange={e => setFilter('from', e.target.value)} title="From date" />
                <input type="date" className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  value={filters.to} onChange={e => setFilter('to', e.target.value)} title="To date" />
                <button onClick={() => { setEditEntry(null); setShowEntryForm(true); }}
                  className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700">
                  <Plus className="w-4 h-4" /> New Entry
                </button>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              {loadingEntries ? (
                <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" /></div>
              ) : filteredEntries.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
                  <ShoppingBag className="w-10 h-10 opacity-20" />
                  <p className="text-sm font-medium">No entries found</p>
                  <button onClick={() => { setEditEntry(null); setShowEntryForm(true); }} className="text-sm text-indigo-600 hover:underline flex items-center gap-1">
                    <Plus className="w-3.5 h-3.5" /> Add first entry
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        {['Sl No', 'Date', 'Supplier', 'Materials', 'Invoice', 'Amount (₹)', 'Category', 'Status', 'Bill', 'Running Bal', 'Actions'].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-slate-500 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {filteredEntries.map((row, i) => {
                        const mat = row.items || [];
                        const matSummary = mat.length ? (mat.length === 1 ? mat[0].material_name : `${mat[0].material_name} +${mat.length - 1}`) : '—';
                        const cat = categoryOf(mat[0]?.material_name || row.supplier || '');
                        const isDup = dupInvoices[row.invoice_no];
                        const lowBal = row.runBalance < 5000 && row.runBalance >= 0;
                        const negBal = row.runBalance < 0;
                        return (
                          <tr key={row.id} className={clsx('hover:bg-slate-50 transition-colors', i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50')}>
                            <td className="px-4 py-3 font-mono text-xs font-semibold text-indigo-700">{row.sl_no}</td>
                            <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{dayjs(row.entry_date).format('DD MMM YY')}</td>
                            <td className="px-4 py-3 font-medium text-slate-800 max-w-[140px] truncate">{row.supplier}</td>
                            <td className="px-4 py-3 text-slate-500 text-xs max-w-[200px] truncate" title={mat.map(i => i.material_name).join(', ')}>{matSummary}</td>
                            <td className="px-4 py-3 text-slate-500 text-xs font-mono">
                              {isDup && <span title="Duplicate invoice" className="mr-1 text-red-500">⚠</span>}
                              {row.invoice_no || '—'}
                            </td>
                            <td className="px-4 py-3 font-mono font-semibold text-slate-800 text-right whitespace-nowrap">
                              {row.status === 'Rejected' ? <span className="text-slate-400 line-through">{inr(row.amount)}</span> : inr(row.amount)}
                            </td>
                            <td className="px-4 py-3"><CatBadge cat={cat} /></td>
                            <td className="px-4 py-3"><Badge label={row.status} /></td>
                            <td className="px-4 py-3 text-center">
                              {row.bill_file_url
                                ? <a href={row.bill_file_url} target="_blank" rel="noreferrer" title={row.bill_file_name || 'View Bill'}
                                    className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800" onClick={e => e.stopPropagation()}>
                                    <Paperclip className="w-3.5 h-3.5" />
                                  </a>
                                : <span className="text-slate-300 text-xs">—</span>}
                            </td>
                            <td className={clsx('px-4 py-3 font-mono text-xs font-bold text-right whitespace-nowrap', negBal ? 'text-red-600' : lowBal ? 'text-amber-600' : 'text-green-700')}>
                              {inr(row.runBalance)}{lowBal && !negBal && ' ⚠'}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1">
                                {row.status !== 'Approved' && (
                                  <button onClick={() => patchStatusMut.mutate({ id: row.id, status: 'Approved' })} title="Approve"
                                    className="text-[10px] font-bold text-green-700 bg-green-100 hover:bg-green-200 rounded px-1.5 py-0.5">✓</button>
                                )}
                                {row.status !== 'Rejected' && (
                                  <button onClick={() => patchStatusMut.mutate({ id: row.id, status: 'Rejected' })} title="Reject"
                                    className="text-[10px] font-bold text-red-700 bg-red-100 hover:bg-red-200 rounded px-1.5 py-0.5">✗</button>
                                )}
                                <button onClick={() => { setEditEntry(row); setShowEntryForm(true); }}
                                  className="text-[10px] font-bold text-indigo-700 bg-indigo-100 hover:bg-indigo-200 rounded px-1.5 py-0.5">Edit</button>
                                <button onClick={() => { if (window.confirm('Delete this entry?')) deleteEntryMut.mutate(row.id); }}
                                  className="text-red-400 hover:text-red-600 ml-1"><Trash2 className="w-3 h-3" /></button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-100 border-t-2 border-slate-200">
                        <td colSpan={5} className="px-4 py-3 text-right text-xs font-bold text-slate-600 uppercase">Total ({filteredEntries.length} entries)</td>
                        <td className="px-4 py-3 font-mono font-bold text-indigo-700 text-right">{inr(filteredEntries.filter(r => r.status !== 'Rejected').reduce((s, r) => s + Number(r.amount), 0))}</td>
                        <td colSpan={3} />
                        <td className={clsx('px-4 py-3 font-mono font-bold text-right', balanceColor)}>{inr(cashInHand)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-2">Click ✓ / ✗ to approve or reject. Running balance is based on total HO receipts minus approved entries.</p>
          </div>
        )}

        {/* ══ SALARY ADVANCES ══ */}
        {tab === 'advances' && (
          <div>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <div>
                <h2 className="text-xl font-bold text-slate-800">Salary Advances</h2>
                <p className="text-sm text-slate-500 mt-0.5">{advances.length} entries · Total: <span className="font-semibold text-slate-700">{inr(totalAdv)}</span></p>
              </div>
              <div className="flex gap-2 items-center">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input className="pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-white w-48 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    placeholder="Search name / description…" value={filters.search} onChange={e => setFilter('search', e.target.value)} />
                </div>
                <button onClick={() => { setEditAdv(null); setShowAdvForm(true); }}
                  className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700">
                  <Plus className="w-4 h-4" /> New Advance
                </button>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              {loadingAdvances ? (
                <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" /></div>
              ) : advances.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
                  <Users className="w-10 h-10 opacity-20" />
                  <p className="text-sm font-medium">No advances recorded yet</p>
                  <button onClick={() => { setEditAdv(null); setShowAdvForm(true); }} className="text-sm text-amber-600 hover:underline flex items-center gap-1">
                    <Plus className="w-3.5 h-3.5" /> Add first entry
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        {['Date', 'Contractor / Employee', 'Description', 'Remarks', 'Amount (₹)', ''].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-slate-500 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {advances.map((row, i) => (
                        <tr key={row.id} className={clsx('hover:bg-slate-50 transition-colors cursor-pointer', i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50')}
                          onClick={() => { setEditAdv(row); setShowAdvForm(true); }}>
                          <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{dayjs(row.advance_date).format('DD MMM YY')}</td>
                          <td className="px-4 py-3 font-medium text-slate-800">{row.payee_name}</td>
                          <td className="px-4 py-3 text-slate-500 text-xs">{row.description}</td>
                          <td className="px-4 py-3 text-slate-400 text-xs">{row.remarks || '—'}</td>
                          <td className="px-4 py-3 font-mono font-semibold text-amber-700 text-right whitespace-nowrap">{inr(row.amount)}</td>
                          <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                            <button onClick={() => { if (window.confirm('Delete this advance?')) deleteAdvMut.mutate(row.id); }}
                              className="text-red-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-amber-50 border-t-2 border-amber-200">
                        <td colSpan={4} className="px-4 py-3 text-right text-xs font-bold text-amber-800 uppercase">Total ({advances.length} entries)</td>
                        <td className="px-4 py-3 font-mono font-bold text-amber-700 text-right">{inr(totalAdv)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══ ANALYTICS ══ */}
        {tab === 'analytics' && (
          <div className="space-y-5">
            <div>
              <h2 className="text-xl font-bold text-slate-800">Analytics & Trends</h2>
              <p className="text-sm text-slate-500 mt-0.5">Spend patterns, category breakdown, supplier insights</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Category bar chart */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                <p className="text-sm font-semibold text-slate-700 mb-4">Spending by Category (Approved)</p>
                <BarChart data={CATEGORIES.map(cat => ({ label: cat, value: catSpend[cat] || 0, color: (CATEGORY_STYLE[cat] || CATEGORY_STYLE.Materials).bar }))} />
              </div>

              {/* Category table */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-100">
                  <p className="text-sm font-semibold text-slate-700">Category-wise Breakdown</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        {['Category', 'Entries', 'Amount', '% of Total'].map(h => (
                          <th key={h} className="px-4 py-2.5 text-left text-[11px] font-medium text-slate-400 uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {CATEGORIES.map((cat, i) => {
                        const spent = catSpend[cat] || 0;
                        const count = approvedEntries.filter(e => categoryOf(e.items?.[0]?.material_name || e.supplier || '') === cat).length;
                        const pct = totalLP > 0 ? (spent / totalLP * 100).toFixed(1) : '0.0';
                        return (
                          <tr key={cat} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                            <td className="px-4 py-2.5"><CatBadge cat={cat} /></td>
                            <td className="px-4 py-2.5 text-slate-500 text-center">{count}</td>
                            <td className="px-4 py-2.5 font-semibold text-slate-800">{inr(spent)}</td>
                            <td className="px-4 py-2.5 text-slate-500">{pct}%</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Supplier frequency */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <p className="text-sm font-semibold text-slate-700 mb-4">Supplier Frequency — Audit Flags</p>
              {topSuppliers.filter(([, { count }]) => count >= 4).length === 0
                ? <p className="text-sm text-slate-400">No suppliers with unusually high transaction frequency.</p>
                : topSuppliers.filter(([, { count }]) => count >= 4).map(([sup, { count, total }]) => (
                  <div key={sup} className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-xl mb-2">
                    <div>
                      <span className="text-sm font-semibold text-amber-800">{sup}</span>
                      <span className="text-xs text-slate-500 ml-2">appears {count} times · Total {inr(total)}</span>
                    </div>
                    <span className="text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">Review</span>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* ══ BUDGETS ══ */}
        {tab === 'budgets' && (
          <div className="space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-xl font-bold text-slate-800">Category Budget Control</h2>
                <p className="text-sm text-slate-500 mt-0.5">Monthly caps per category vs actual spend (approved entries only)</p>
              </div>
              <div className="flex gap-2">
                {editBudgets ? (
                  <>
                    <button onClick={() => { setEditBudgets(false); setLocalBudgets(null); }}
                      className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
                    <button onClick={() => saveBudgetsMut.mutate({ project_id: projectId || undefined, budgets: localBudgets || budgets })}
                      disabled={saveBudgetsMut.isPending}
                      className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                      {saveBudgetsMut.isPending ? 'Saving…' : 'Save Budgets'}
                    </button>
                  </>
                ) : (
                  <button onClick={() => { setEditBudgets(true); setLocalBudgets({ ...budgets }); }}
                    className="flex items-center gap-1.5 px-4 py-2 bg-slate-700 text-white text-sm font-medium rounded-lg hover:bg-slate-800">
                    <RefreshCw className="w-3.5 h-3.5" /> Edit Budgets
                  </button>
                )}
              </div>
            </div>

            {editBudgets && localBudgets && (
              <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-5">
                <p className="text-sm font-semibold text-indigo-800 mb-4">Set Monthly Budget Caps (₹)</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {CATEGORIES.map(cat => (
                    <div key={cat}>
                      <label className="block text-xs font-medium text-slate-600 mb-1">{cat}</label>
                      <input type="number" step="100" className={F} value={localBudgets[cat] ?? 0}
                        onChange={e => setLocalBudgets(b => ({ ...b, [cat]: parseFloat(e.target.value) || 0 }))} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-3">
              {CATEGORIES.map(cat => {
                const s = CATEGORY_STYLE[cat] || CATEGORY_STYLE.Materials;
                const spent = catSpend[cat] || 0;
                const cap = (editBudgets && localBudgets ? localBudgets[cat] : budgets[cat]) || DEFAULT_BUDGETS[cat] || 0;
                const pct = cap > 0 ? (spent / cap) * 100 : 0;
                const over = spent > cap;
                return (
                  <div key={cat} className={clsx('bg-white rounded-xl border shadow-sm p-5', over ? 'border-red-300' : pct > 80 ? 'border-amber-300' : 'border-slate-200')}>
                    <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <CatBadge cat={cat} />
                        {over && <span className="text-xs font-semibold text-red-700 bg-red-100 px-2 py-0.5 rounded-full">OVER BUDGET</span>}
                        {!over && pct > 80 && <span className="text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">Near Limit</span>}
                        {!over && pct <= 80 && cap > 0 && <span className="text-xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">On Track</span>}
                      </div>
                      <div className="text-right">
                        <span className={clsx('text-base font-bold', over ? 'text-red-700' : 'text-slate-800')}>{inr(spent)}</span>
                        <span className="text-sm text-slate-400"> / {inr(cap)}</span>
                      </div>
                    </div>
                    <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(pct, 100)}%`, background: over ? '#EF4444' : pct > 80 ? '#F59E0B' : s.bar }} />
                    </div>
                    <div className="flex justify-between mt-1.5">
                      <span className="text-xs text-slate-400">{pct.toFixed(1)}% utilised</span>
                      <span className={clsx('text-xs', over ? 'text-red-600 font-medium' : 'text-slate-400')}>
                        {over ? `${inr(spent - cap)} over budget` : cap > 0 ? `${inr(cap - spent)} remaining` : 'No cap set'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>

      {/* ── Modals ── */}
      {showEntryForm && (
        <EntryForm
          initial={editEntry}
          projects={projects}
          defaultProjectId={projectId}
          budgets={budgets}
          catSpend={catSpend}
          onClose={() => { setShowEntryForm(false); setEditEntry(null); }}
        />
      )}
      {showAdvForm && (
        <AdvanceForm
          initial={editAdv}
          projects={projects}
          defaultProjectId={projectId}
          onClose={() => { setShowAdvForm(false); setEditAdv(null); }}
        />
      )}
      {showReceiptForm && (
        <ReceiptForm
          initial={editReceipt}
          projects={projects}
          defaultProjectId={projectId}
          onClose={() => { setShowReceiptForm(false); setEditReceipt(null); }}
        />
      )}

      {/* ── Replenishment Request Modal ── */}
      {showRepl && (
        <ReplenishmentModal
          totalReceived={totalReceived}
          totalSpent={totalSpent}
          cashInHand={cashInHand}
          projectName={selectedProject?.name}
          entries={approvedEntries}
          advances={advances}
          receipts={receipts}
          onClose={() => setShowRepl(false)}
        />
      )}
    </div>
  );
}

// ── Replenishment Request Modal ───────────────────────────────────────────────
function ReplenishmentModal({ totalReceived, totalSpent, cashInHand, projectName, entries, advances, receipts, onClose }) {
  const recommended = Math.max(totalSpent - totalReceived, 0) + 20000;

  const printRequest = () => {
    const fmt = (v) => '₹' + Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
    const today = dayjs().format('DD MMMM YYYY');
    const entriesRows = entries.map(e =>
      `<tr><td>${dayjs(e.entry_date).format('DD/MM/YY')}</td><td>${e.supplier}</td><td>${(e.items || []).map(i => i.material_name).join(', ') || '–'}</td><td style="text-align:right">${fmt(e.amount)}</td></tr>`
    ).join('');
    const advRows = advances.map(a =>
      `<tr><td>${dayjs(a.advance_date).format('DD/MM/YY')}</td><td>${a.payee_name}</td><td>${a.description || '–'}</td><td style="text-align:right">${fmt(a.amount)}</td></tr>`
    ).join('');

    const html = `<html><head><title>Petty Cash Replenishment Request</title>
    <style>
      body { font-family: Arial, sans-serif; font-size: 12px; color: #1C2533; margin: 40px; }
      h1 { font-size: 20px; color: #1F3864; border-bottom: 2px solid #1F3864; padding-bottom: 8px; }
      h2 { font-size: 14px; color: #2E75B6; margin: 20px 0 6px; }
      .meta { display: flex; gap: 40px; margin: 16px 0; }
      .meta div { font-size: 12px; }
      .meta label { font-weight: bold; color: #4B5563; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
      th { background: #1F3864; color: #fff; padding: 7px 10px; text-align: left; font-size: 11px; }
      td { padding: 6px 10px; border-bottom: 1px solid #EEF0F3; }
      .summary-box { background: #EBF3FB; border: 1px solid #BDD7EE; border-radius: 6px; padding: 16px 20px; margin: 20px 0; }
      .summary-box table { margin: 0; }
      .summary-box td { border: none; padding: 5px 8px; }
      .highlight { font-size: 16px; font-weight: bold; color: #C55A11; }
      .sig { margin-top: 48px; display: flex; gap: 80px; }
      .sig div { border-top: 1px solid #333; padding-top: 6px; font-size: 11px; color: #4B5563; width: 180px; }
    </style></head><body>
    <h1>Petty Cash Replenishment Request</h1>
    <div class="meta">
      <div><label>Date:</label> ${today}</div>
      <div><label>Site / Project:</label> ${projectName || 'All Sites'}</div>
      <div><label>Prepared by:</label> Site Incharge / Store Keeper</div>
    </div>

    <div class="summary-box">
      <h2 style="margin-top:0">Financial Position Summary</h2>
      <table>
        <tr><td>Total Cash Received from HO</td><td style="text-align:right;font-weight:bold;color:#1E7145">${fmt(totalReceived)}</td></tr>
        <tr><td>Total Purchases (Approved)</td><td style="text-align:right;color:#C00000">${fmt(entries.reduce((s,e) => s+Number(e.amount),0))}</td></tr>
        <tr><td>Total Salary Advances</td><td style="text-align:right;color:#C00000">${fmt(advances.reduce((s,a) => s+Number(a.amount),0))}</td></tr>
        <tr><td>Total Spent</td><td style="text-align:right;font-weight:bold;color:#C00000">${fmt(totalSpent)}</td></tr>
        <tr><td><b>Current Cash in Hand</b></td><td style="text-align:right;font-weight:bold;color:${cashInHand < 0 ? '#C00000' : '#1E7145'}">${fmt(cashInHand)}</td></tr>
      </table>
      <div style="margin-top:12px;padding-top:12px;border-top:1px solid #BDD7EE">
        <span>Replenishment Requested: </span>
        <span class="highlight">${fmt(recommended)}</span>
        <span style="font-size:11px;color:#4B5563;margin-left:8px">(includes ₹20,000 buffer for upcoming expenses)</span>
      </div>
    </div>

    <h2>A. Local Purchases Breakdown</h2>
    <table><tr><th>Date</th><th>Supplier</th><th>Items</th><th>Amount</th></tr>
    ${entriesRows}
    <tr><td colspan="3" style="text-align:right;font-weight:bold">TOTAL</td><td style="text-align:right;font-weight:bold">${fmt(entries.reduce((s,e)=>s+Number(e.amount),0))}</td></tr>
    </table>

    <h2>B. Salary Advances</h2>
    <table><tr><th>Date</th><th>Name</th><th>Description</th><th>Amount</th></tr>
    ${advRows}
    <tr><td colspan="3" style="text-align:right;font-weight:bold">TOTAL</td><td style="text-align:right;font-weight:bold">${fmt(advances.reduce((s,a)=>s+Number(a.amount),0))}</td></tr>
    </table>

    <div class="sig">
      <div>Store Keeper / Prepared by</div>
      <div>Site Incharge</div>
      <div>Project Manager</div>
      <div>Accounts (HO)</div>
    </div>
    </body></html>`;
    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
    w.print();
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-orange-50 border border-orange-100 flex items-center justify-center">
              <RefreshCw className="w-4 h-4 text-orange-600" />
            </div>
            <div>
              <p className="font-semibold text-slate-900">Replenishment Request to HO</p>
              <p className="text-xs text-slate-500 mt-0.5">Generate a formal request for cash top-up</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-6 space-y-4">
          {/* Summary */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-2">
            {[
              ['Period', 'Current'],
              ['Total Received from HO', inr(totalReceived)],
              ['Total Spent', inr(totalSpent)],
              ['Cash in Hand', inr(cashInHand)],
            ].map(([l, v]) => (
              <div key={l} className="flex justify-between">
                <span className="text-sm text-slate-600">{l}</span>
                <span className="text-sm font-semibold text-slate-800">{v}</span>
              </div>
            ))}
          </div>

          {/* Recommended amount */}
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-slate-700">Recommended Top-up Amount</span>
              <span className="text-xl font-bold text-orange-700">{inr(recommended)}</span>
            </div>
            <p className="text-xs text-slate-500 mt-1.5">
              = Amount spent beyond what was received ({inr(Math.max(totalSpent - totalReceived, 0))}) + ₹20,000 buffer for upcoming expenses
            </p>
          </div>

          <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-xs text-green-700">
            Clicking <b>Print Request</b> opens a printable formal replenishment request with full spend breakdown, ready to submit to HO for approval.
          </div>
        </div>

        <div className="flex items-center gap-3 px-6 py-4 border-t border-slate-100">
          <button onClick={printRequest}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-orange-600 text-white text-sm font-medium rounded-lg hover:bg-orange-700">
            <Printer className="w-4 h-4" /> Print / Download Request
          </button>
          <button onClick={onClose} className="px-4 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
        </div>
      </div>
    </div>
  );
}
