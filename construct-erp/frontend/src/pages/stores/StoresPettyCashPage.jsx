// src/pages/stores/StoresPettyCashPage.jsx
// Stores Petty Cash Tracker — site-level cash book mirroring the Excel register.
// 6 tabs: Dashboard · HO Receipts · Local Purchase · Salary Advances · Analytics · Budgets
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import dayjs from 'dayjs';
import toast from 'react-hot-toast';
import {
  Wallet, Plus, Search, Trash2, X, Package,
  ShoppingBag, Users, BarChart2, BookOpen, AlertTriangle,
  CheckCircle, Clock, TrendingUp, Printer, RefreshCw,
  Paperclip, Eye, Upload, Send, ThumbsUp, ThumbsDown,
} from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { PageHeader, Theme } from '../../theme';
import { storesPettyCashAPI, projectAPI, uploadAPI, subcontractorAPI } from '../../api/client';
import useAuthStore from '../../store/authStore';

// ── Helpers ──────────────────────────────────────────────────────────────────
const inr = (v) =>
  '₹ ' + Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const F  = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent bg-white';
const FS = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white';

const DEFAULT_BUDGETS = {
  // Original heads
  Fuel: 3000, Safety: 12000, Stationery: 5000, Pantry: 3000,
  Transport: 5000, Utilities: 5000,
  // Construction materials
  Cement: 20000, Aggregates: 15000, Steel: 25000, Bricks: 10000, Sand: 8000,
  // Site items
  Consumables: 10000, Electrical: 8000, Plumbing: 5000, Timber: 8000, Paint: 5000,
  // People & movement
  Labour: 20000, Conveyance: 5000, Transport_Charges: 5000,
  // Site running
  Repairs: 8000, Medical: 3000, Housekeeping: 3000,
  // General
  Materials: 15000, Miscellaneous: 5000,
};

const CATEGORIES = Object.keys(DEFAULT_BUDGETS);

const CATEGORY_STYLE = {
  Fuel:              { bg: 'bg-amber-100',   text: 'text-amber-800',   bar: '#F59E0B' },
  Safety:            { bg: 'bg-red-100',     text: 'text-red-800',     bar: '#EF4444' },
  Stationery:        { bg: 'bg-blue-100',    text: 'text-blue-800',    bar: '#3B82F6' },
  Pantry:            { bg: 'bg-green-100',   text: 'text-green-800',   bar: '#22C55E' },
  Transport:         { bg: 'bg-orange-100',  text: 'text-orange-800',  bar: '#F97316' },
  Transport_Charges: { bg: 'bg-orange-100',  text: 'text-orange-800',  bar: '#F97316' },
  Utilities:         { bg: 'bg-purple-100',  text: 'text-purple-800',  bar: '#A855F7' },
  Materials:         { bg: 'bg-slate-100',   text: 'text-slate-700',   bar: '#64748B' },
  Labour:            { bg: 'bg-teal-100',    text: 'text-teal-800',    bar: '#14B8A6' },
  Conveyance:        { bg: 'bg-cyan-100',    text: 'text-cyan-800',    bar: '#06B6D4' },
  Repairs:           { bg: 'bg-indigo-100',  text: 'text-indigo-800',  bar: '#6366F1' },
  Medical:           { bg: 'bg-rose-100',    text: 'text-rose-800',    bar: '#F43F5E' },
  Miscellaneous:     { bg: 'bg-gray-100',    text: 'text-gray-700',    bar: '#9CA3AF' },
  Cement:            { bg: 'bg-stone-100',   text: 'text-stone-800',   bar: '#78716C' },
  Aggregates:        { bg: 'bg-yellow-100',  text: 'text-yellow-800',  bar: '#EAB308' },
  Steel:             { bg: 'bg-zinc-100',    text: 'text-zinc-800',    bar: '#71717A' },
  Bricks:            { bg: 'bg-red-100',     text: 'text-red-900',     bar: '#B91C1C' },
  Sand:              { bg: 'bg-yellow-50',   text: 'text-yellow-900',  bar: '#CA8A04' },
  Consumables:       { bg: 'bg-lime-100',    text: 'text-lime-800',    bar: '#84CC16' },
  Electrical:        { bg: 'bg-sky-100',     text: 'text-sky-800',     bar: '#0EA5E9' },
  Plumbing:          { bg: 'bg-blue-50',     text: 'text-blue-900',    bar: '#1D4ED8' },
  Timber:            { bg: 'bg-orange-50',   text: 'text-orange-900',  bar: '#C2410C' },
  Paint:             { bg: 'bg-pink-100',    text: 'text-pink-800',    bar: '#EC4899' },
  Housekeeping:      { bg: 'bg-emerald-100', text: 'text-emerald-800', bar: '#10B981' },
};

function categoryOf(text = '') {
  const d = (text || '').toLowerCase();
  if (/petrol|fuel|diesel/.test(d))                                                        return 'Fuel';
  if (/medical|medicine|first.?aid|hospital|clinic|bandage|ointment/.test(d))             return 'Medical';
  if (/safety|glove|shoe|flag|helmet|badge|banner|ppe/.test(d))                           return 'Safety';
  if (/cement|opc|ppc|53 grade|43 grade/.test(d))                                         return 'Cement';
  if (/aggregate|jelly|gravel|grit|m.?sand|quarry/.test(d))                               return 'Aggregates';
  if (/sand|fine aggr/.test(d))                                                            return 'Sand';
  if (/steel|tmt|rebar|rod|bar bending|ms plate|angle/.test(d))                           return 'Steel';
  if (/brick|block|aac|fly.?ash/.test(d))                                                  return 'Bricks';
  if (/electrical|cable|wire|switch|mcb|conduit|fitting|bulb|led|lamp/.test(d))           return 'Electrical';
  if (/plumb|pipe|fitting|pvc|cpvc|upvc|valve|tap|sanitary/.test(d))                      return 'Plumbing';
  if (/timber|wood|plywood|shuttering|plank|batten/.test(d))                              return 'Timber';
  if (/paint|primer|putty|distemper|enamel|varnish|thinner/.test(d))                      return 'Paint';
  if (/consumable|tool|drill|bit|blade|abrasive|sandpaper|nails|screw/.test(d))           return 'Consumables';
  if (/stationery|stationary|file|paper|pen|whitener|stamp|calc|stapler|a4|xerox|print/.test(d)) return 'Stationery';
  if (/pantry|sweet|food|sugar|tea|poha|zeera|mixture|coconut|biscuit|snack/.test(d))    return 'Pantry';
  if (/housekeep|cleaning|broom|phenyl|soap|dustbin|mop/.test(d))                         return 'Housekeeping';
  if (/labour|labor|wage|mason|helper|coolie|mazdoor|hamali/.test(d))                     return 'Labour';
  if (/loading|unloading/.test(d))                                                         return 'Labour';
  if (/conveyance|travel|parking|toll/.test(d))                                            return 'Conveyance';
  if (/transport|freight|lorry|truck|vehicle|bus|ticket|auto|cab|uber|ola/.test(d))       return 'Transport_Charges';
  if (/repair|maintenance|servic|spare|puncture/.test(d))                                 return 'Repairs';
  if (/electric|power|utility|mobile|recharge|internet/.test(d))                          return 'Utilities';
  if (/misc|sundry|other/.test(d))                                                        return 'Miscellaneous';
  return 'Materials';
}

const STATUS_STYLE = {
  Pending:     { bg: 'bg-amber-100',  text: 'text-amber-700',  label: 'Pending'      },
  ph_approved: { bg: 'bg-blue-100',   text: 'text-blue-700',   label: 'PH Approved'  },
  Approved:    { bg: 'bg-green-100',  text: 'text-green-700',  label: 'Approved'     },
  Rejected:    { bg: 'bg-red-100',    text: 'text-red-700',    label: 'Rejected'     },
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

  const recRows  = receipts.map(r => `<tr><td>${dayjs(r.receipt_date).format('DD-MM-YYYY')}</td><td>${r.voucher_no || '–'}</td><td>${r.received_by || '–'}</td><td style="text-align:right">${fmt(r.amount)}</td></tr>`).join('');
  const lpRows   = approved.map(r => `<tr><td>${dayjs(r.entry_date).format('DD-MM-YYYY')}</td><td>${r.supplier}</td><td>${(r.items || []).map(i => i.material_name).join(', ') || '–'}</td><td>${r.invoice_no || '–'}</td><td style="text-align:right">${fmt(r.amount)}</td></tr>`).join('');
  const advRows  = advances.map(r => `<tr><td>${dayjs(r.advance_date).format('DD-MM-YYYY')}</td><td>${r.payee_name}</td><td>${r.description || '–'}</td><td style="text-align:right">${fmt(r.amount)}</td></tr>`).join('');

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

// ── File opener — OneDrive links open directly; legacy /uploads/ links use auth fetch ──
async function openAttachment(url) {
  if (!url) return;
  // OneDrive sharing links and other absolute HTTPS URLs open directly
  if (url.startsWith('https://') || url.startsWith('http://')) {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  // Legacy local /uploads/ path — needs Bearer token via fetch
  try {
    const token = sessionStorage.getItem('accessToken');
    const resp = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    const ct = resp.headers.get('content-type') || '';
    if (!resp.ok || ct.includes('text/html')) {
      alert('File not found on the server.\n\nThis attachment was stored locally and may have been lost after a server restart. Please re-upload it.');
      return;
    }
    const blob = new Blob([await resp.arrayBuffer()], { type: ct || 'application/octet-stream' });
    const blobUrl = URL.createObjectURL(blob);
    window.open(blobUrl, '_blank');
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
  } catch {
    alert('Could not open attachment.');
  }
}

// ── Entry Form (Local Purchase) ───────────────────────────────────────────────
const EMPTY_ITEM  = { material_name: '', unit: "NO'S", quantity: '' };
const EMPTY_ENTRY = { project_id: '', entry_date: dayjs().format('YYYY-MM-DD'), supplier: '', invoice_no: '', basic_amount: '', gst_pct: '0', gst_amount: '', amount: '', remarks: '', bill_file_url: '', bill_file_name: '', voucher_file_url: '', voucher_file_name: '' };
const GST_RATES = [0, 5, 12, 18, 28];

function SectionLabel({ icon: Icon, color, label }) {
  return (
    <div className={clsx('flex items-center gap-2 px-3 py-2 rounded-lg mb-3', color)}>
      <Icon className="w-3.5 h-3.5 flex-shrink-0" />
      <span className="text-xs font-semibold uppercase tracking-wider">{label}</span>
    </div>
  );
}

function FileSlot({ label, fileUrl, fileName, uploading, onUpload, onView, onRemove, isUploading }) {
  return (
    <div>
      <Lbl>{label}</Lbl>
      {fileUrl ? (
        <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
            <Paperclip className="w-4 h-4 text-emerald-600" />
          </div>
          <span className="text-sm text-emerald-700 font-medium flex-1 truncate">{fileName || 'File attached'}</span>
          <button type="button" onClick={onView}
            className="flex items-center gap-1 text-xs text-emerald-700 font-semibold hover:text-emerald-900 bg-emerald-100 hover:bg-emerald-200 px-2.5 py-1 rounded-lg transition-colors">
            <Eye className="w-3 h-3" /> View
          </button>
          <button type="button" onClick={onRemove}
            className="w-7 h-7 rounded-lg hover:bg-red-100 flex items-center justify-center text-slate-400 hover:text-red-500 transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <label className={clsx('group flex items-center gap-3 px-4 py-3 border-2 border-dashed rounded-xl cursor-pointer transition-all',
          isUploading ? 'opacity-50 pointer-events-none border-slate-200' : 'border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50')}>
          <div className="w-8 h-8 rounded-lg bg-slate-100 group-hover:bg-indigo-100 flex items-center justify-center flex-shrink-0 transition-colors">
            <Upload className="w-4 h-4 text-slate-400 group-hover:text-indigo-500" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-600">{isUploading ? 'Uploading…' : `Attach ${label}`}</p>
            <p className="text-xs text-slate-400">PDF, image — max 10 MB</p>
          </div>
          <input type="file" accept="image/*,.pdf" className="hidden" onChange={onUpload} disabled={isUploading} />
        </label>
      )}
    </div>
  );
}

function EntryForm({ initial, projects, defaultProjectId, budgets, catSpend, existingInvoices, onClose }) {
  const qc = useQueryClient();
  const isEdit = !!initial?.id;

  const [form, setForm] = useState(
    isEdit
      ? { project_id: initial.project_id || '', entry_date: initial.entry_date?.slice(0, 10) || dayjs().format('YYYY-MM-DD'),
          supplier: initial.supplier || '', invoice_no: initial.invoice_no || '',
          basic_amount: initial.basic_amount || '', gst_pct: initial.gst_pct ?? '0',
          gst_amount: initial.gst_amount || '', amount: initial.amount || '',
          remarks: initial.remarks || '', bill_file_url: initial.bill_file_url || '', bill_file_name: initial.bill_file_name || '',
          voucher_file_url: initial.voucher_file_url || '', voucher_file_name: initial.voucher_file_name || '' }
      : { ...EMPTY_ENTRY, project_id: defaultProjectId || '' }
  );
  const [items, setItems] = useState(
    isEdit && initial.items?.length
      ? initial.items.map(it => ({ material_name: it.material_name, unit: it.unit, quantity: it.quantity }))
      : [{ ...EMPTY_ITEM }]
  );
  const [uploading, setUploading] = useState(null);

  const dupWarn = useMemo(() => {
    const inv = form.invoice_no?.trim();
    if (!inv || inv === '–') return null;
    const ex = existingInvoices?.[inv];
    if (!ex) return null;
    if (isEdit && ex.id === initial?.id) return null;
    return ex;
  }, [form.invoice_no, existingInvoices, isEdit, initial?.id]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const updateItem  = (idx, key, val) => setItems(prev => { const n = [...prev]; n[idx] = { ...n[idx], [key]: val }; return n; });
  const addItem     = () => setItems(p => [...p, { ...EMPTY_ITEM }]);
  const removeItem  = (idx) => setItems(p => p.filter((_, i) => i !== idx));

  const detectedCat = categoryOf(items[0]?.material_name || form.supplier || '');
  const catCap   = budgets?.[detectedCat] ?? 0;
  const catSpent = catSpend?.[detectedCat] ?? 0;
  const newTotal = catSpent + (parseFloat(form.amount) || 0);
  const budgetPct = catCap > 0 ? (newTotal / catCap) * 100 : 0;
  const budgetWarning = catCap > 0 && budgetPct >= 80;
  const budgetOver    = catCap > 0 && newTotal > catCap;

  const handleFileChange = (kind) => async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(kind);
    try {
      const res = await uploadAPI.uploadSingle(file);
      set(`${kind}_file_url`,  res.data.url);
      set(`${kind}_file_name`, file.name);
      toast.success(`${kind === 'bill' ? 'Bill' : 'Voucher'} attached`);
    } catch {
      toast.error('Upload failed — try again');
    } finally {
      setUploading(null);
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
    onError: (err, variables) => {
      if (err?.response?.status === 409 && err?.response?.data?.errorCode === 'DUPLICATE_INVOICE') {
        const ex = err.response.data.existing;
        const msg = `Invoice "${variables.invoice_no || ''}" already recorded in entry #${ex.sl_no} (${ex.supplier}, ${dayjs(ex.entry_date).format('DD-MM-YYYY')}).\n\nSave anyway?`;
        if (window.confirm(msg)) saveMut.mutate({ ...variables, force: true });
      } else {
        toast.error(err?.response?.data?.error || 'Save failed');
      }
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.supplier.trim()) return toast.error('Supplier is required');
    if (!form.entry_date) return toast.error('Date is required');
    if (!items.some(it => it.material_name?.trim())) return toast.error('Add at least one material line');
    saveMut.mutate({ ...form, amount: parseFloat(form.amount) || 0, items: items.filter(it => it.material_name?.trim()), status: 'Pending' });
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-auto">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[96vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0 bg-gradient-to-r from-indigo-50 to-white rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shadow-sm">
              <ShoppingBag className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-bold text-slate-900 text-base">{isEdit ? `Edit Entry — Sl No ${initial.sl_no}` : 'New Local Purchase Entry'}</p>
              <p className="text-xs text-slate-500 mt-0.5">Record a local purchase paid from petty cash</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"><X className="w-4 h-4" /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          {/* Section: Basic Info */}
          <div className="px-6 pt-5 pb-4 border-b border-slate-100">
            <SectionLabel icon={BookOpen} color="bg-indigo-50 text-indigo-700" label="Purchase Details" />
            <div className="grid grid-cols-2 gap-3">
              <div><Lbl req>Date</Lbl><input type="date" className={F} value={form.entry_date} onChange={e => set('entry_date', e.target.value)} required /></div>
              <div><Lbl>Project</Lbl>
                <select className={FS} value={form.project_id} onChange={e => set('project_id', e.target.value)}>
                  <option value="">— Not linked —</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div><Lbl req>Supplier Name</Lbl><input className={F} placeholder="e.g. Ponam Hardware" value={form.supplier} onChange={e => set('supplier', e.target.value)} required /></div>
              <div>
                <Lbl>Invoice No.</Lbl>
                <input className={F} placeholder="e.g. 49045" value={form.invoice_no} onChange={e => set('invoice_no', e.target.value)} />
                {dupWarn && (
                  <div className="flex items-center gap-2 mt-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                    Already in entry #{dupWarn.sl_no} — {dupWarn.supplier} · {dayjs(dupWarn.entry_date).format('DD-MM-YYYY')}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Section: Amount */}
          <div className="px-6 py-4 border-b border-slate-100">
            <SectionLabel icon={Wallet} color="bg-green-50 text-green-700" label="Amount & GST" />
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Lbl req>Basic Amount (₹)</Lbl>
                <input type="number" step="0.01" className={F} placeholder="0.00"
                  value={form.basic_amount}
                  onChange={e => {
                    const basic = parseFloat(e.target.value) || 0;
                    const gstAmt = +(basic * (parseFloat(form.gst_pct) || 0) / 100).toFixed(2);
                    const total  = +(basic + gstAmt).toFixed(2);
                    setForm(f => ({ ...f, basic_amount: e.target.value, gst_amount: gstAmt || '', amount: total || '' }));
                  }} />
              </div>
              <div>
                <Lbl>GST %</Lbl>
                <select className={FS}
                  value={form.gst_pct}
                  onChange={e => {
                    const pct   = parseFloat(e.target.value) || 0;
                    const basic = parseFloat(form.basic_amount) || 0;
                    const gstAmt = +(basic * pct / 100).toFixed(2);
                    const total  = +(basic + gstAmt).toFixed(2);
                    setForm(f => ({ ...f, gst_pct: e.target.value, gst_amount: gstAmt || '', amount: total || '' }));
                  }}>
                  {GST_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
                </select>
              </div>
              <div>
                <Lbl>GST Amount (₹)</Lbl>
                <input type="number" step="0.01" className={clsx(F, 'bg-slate-50 text-slate-500')} placeholder="0.00" value={form.gst_amount} readOnly tabIndex={-1} />
              </div>
            </div>
            {/* Total — prominent */}
            <div className={clsx('mt-3 rounded-xl px-4 py-3 flex items-center justify-between',
              budgetOver ? 'bg-red-50 border border-red-200' : budgetWarning ? 'bg-amber-50 border border-amber-200' : 'bg-indigo-50 border border-indigo-200')}>
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Amount</p>
                <p className={clsx('text-2xl font-bold mt-0.5', budgetOver ? 'text-red-700' : 'text-indigo-700')}>
                  {form.amount ? inr(form.amount) : '₹ 0.00'}
                </p>
              </div>
              {budgetWarning && (
                <div className="flex items-center gap-2 text-xs font-medium max-w-[200px] text-right">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 text-amber-500" />
                  <span className={budgetOver ? 'text-red-700' : 'text-amber-700'}>
                    {budgetOver
                      ? `${inr(newTotal - catCap)} over ${detectedCat} budget`
                      : `${budgetPct.toFixed(0)}% of ${detectedCat} budget used`}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Section: Materials */}
          <div className="px-6 py-4 border-b border-slate-100">
            <div className="flex items-center justify-between mb-3">
              <SectionLabel icon={Package} color="bg-slate-100 text-slate-600" label="Materials Purchased" />
              <button type="button" onClick={addItem} className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg transition-colors -mt-3">
                <Plus className="w-3 h-3" /> Add Line
              </button>
            </div>
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    {['#', 'Material Description', 'Unit', 'Qty', ''].map(h => (
                      <th key={h} className="px-3 py-2 text-left font-semibold text-slate-400 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {items.map((it, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="px-3 py-2 text-slate-400 w-7 font-mono">{idx + 1}</td>
                      <td className="px-2 py-1.5 min-w-[180px]">
                        <input className={F} placeholder="Material name" value={it.material_name} onChange={e => updateItem(idx, 'material_name', e.target.value)} />
                      </td>
                      <td className="px-2 py-1.5 w-24">
                        <input className={F} placeholder="NO'S" value={it.unit} onChange={e => updateItem(idx, 'unit', e.target.value)} />
                      </td>
                      <td className="px-2 py-1.5 w-24">
                        <input type="number" step="any" className={F} placeholder="0" value={it.quantity} onChange={e => updateItem(idx, 'quantity', e.target.value)} />
                      </td>
                      <td className="px-2 py-1.5 w-8 text-center">
                        {items.length > 1 && (
                          <button type="button" onClick={() => removeItem(idx)} className="text-slate-300 hover:text-red-500 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section: Remarks + Attachments */}
          <div className="px-6 py-4 space-y-4">
            <SectionLabel icon={Paperclip} color="bg-purple-50 text-purple-700" label="Remarks & Attachments" />
            <div><Lbl>Remarks</Lbl>
              <textarea className={clsx(F, 'resize-none')} rows={2} placeholder="Any additional notes…" value={form.remarks} onChange={e => set('remarks', e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FileSlot label="Petty Cash Voucher" fileUrl={form.voucher_file_url} fileName={form.voucher_file_name}
                isUploading={uploading === 'voucher'}
                onUpload={handleFileChange('voucher')}
                onView={() => openAttachment(form.voucher_file_url)}
                onRemove={() => { set('voucher_file_url', ''); set('voucher_file_name', ''); }} />
              <FileSlot label="Bill / Invoice" fileUrl={form.bill_file_url} fileName={form.bill_file_name}
                isUploading={uploading === 'bill'}
                onUpload={handleFileChange('bill')}
                onView={() => openAttachment(form.bill_file_url)}
                onRemove={() => { set('bill_file_url', ''); set('bill_file_name', ''); }} />
            </div>
          </div>
        </form>

        <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
          <button type="button" onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-white transition-colors">Cancel</button>
          <button onClick={handleSubmit} disabled={saveMut.isPending || !!uploading}
            className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 shadow-sm transition-colors">
            {saveMut.isPending ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            {saveMut.isPending ? 'Saving…' : isEdit ? 'Update Entry' : 'Save Entry'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Advance Form ──────────────────────────────────────────────────────────────
const EMPTY_ADVANCE = { project_id: '', advance_date: dayjs().format('YYYY-MM-DD'), payee_name: '', description: 'SALARY ADVANCE', amount: '', payment_mode: 'cash', reference_number: '', remarks: '' };

function AdvanceForm({ initial, projects, defaultProjectId, onClose }) {
  const qc = useQueryClient();
  const isEdit = !!initial?.id;

  const [form, setForm] = useState(
    isEdit
      ? { project_id: initial.project_id || '', advance_date: initial.advance_date?.slice(0, 10) || dayjs().format('YYYY-MM-DD'),
          payee_name: initial.payee_name || '', description: initial.description || 'SALARY ADVANCE', amount: initial.amount || '',
          payment_mode: initial.payment_mode || 'cash', reference_number: initial.reference_number || '', remarks: initial.remarks || '' }
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
    <div className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-auto">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl flex flex-col max-h-[96vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0 bg-gradient-to-r from-amber-50 to-white rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center shadow-sm">
              <Users className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-bold text-slate-900 text-base">{isEdit ? 'Edit Salary Advance' : 'New Salary Advance'}</p>
              <p className="text-xs text-slate-500 mt-0.5">Cash paid to contractor or employee</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"><X className="w-4 h-4" /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><Lbl req>Date</Lbl><input type="date" className={F} value={form.advance_date} onChange={e => set('advance_date', e.target.value)} required /></div>
            <div><Lbl>Project</Lbl>
              <select className={FS} value={form.project_id} onChange={e => set('project_id', e.target.value)}>
                <option value="">— Not linked —</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>
          <div><Lbl req>Contractor / Employee Name</Lbl>
            <input className={F} placeholder="e.g. Mukesh 3250008" value={form.payee_name} onChange={e => set('payee_name', e.target.value)} required />
          </div>
          <div><Lbl>Description</Lbl>
            <input className={F} placeholder="SALARY ADVANCE" value={form.description} onChange={e => set('description', e.target.value)} />
          </div>
          {/* Amount — prominent */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <Lbl req>Amount Paid (₹)</Lbl>
            <input type="number" step="0.01" className="w-full border border-amber-200 bg-white rounded-xl px-4 py-3 text-xl font-bold text-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-400 placeholder:text-amber-200"
              placeholder="0.00" value={form.amount} onChange={e => set('amount', e.target.value)} required />
          </div>

          <div>
            <Lbl>Payment Mode</Lbl>
            <div className="grid grid-cols-4 gap-2">
              {['cash', 'upi', 'bank_transfer', 'cheque'].map(mode => (
                <button key={mode} type="button" onClick={() => set('payment_mode', mode)}
                  className={clsx('flex flex-col items-center gap-1 p-2.5 rounded-xl border text-xs font-semibold transition-colors',
                    form.payment_mode === mode ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50')}>
                  <span className="text-base">{PAYMENT_MODE_ICON[mode]}</span>
                  <span className="capitalize">{mode.replace('_', ' ')}</span>
                </button>
              ))}
            </div>
          </div>

          {form.payment_mode !== 'cash' && (
            <div><Lbl>Reference No. / UPI ID / Cheque No.</Lbl>
              <input className={F} placeholder="Ref / ID / Cheque no." value={form.reference_number} onChange={e => set('reference_number', e.target.value)} />
            </div>
          )}

          <div><Lbl>Remarks</Lbl>
            <textarea className={clsx(F, 'resize-none')} rows={2} placeholder="Notes…" value={form.remarks} onChange={e => set('remarks', e.target.value)} />
          </div>
        </form>

        <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
          <button type="button" onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-white transition-colors">Cancel</button>
          <button onClick={handleSubmit} disabled={saveMut.isPending}
            className="flex items-center gap-2 px-6 py-2 bg-amber-500 text-white text-sm font-semibold rounded-xl hover:bg-amber-600 disabled:opacity-50 shadow-sm transition-colors">
            {saveMut.isPending ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            {saveMut.isPending ? 'Saving…' : isEdit ? 'Update Advance' : 'Record Advance'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── SC Advance Form ───────────────────────────────────────────────────────────
const EMPTY_SC_ADV = { project_id: '', advance_date: dayjs().format('YYYY-MM-DD'), vendor_id: '', vendor_name: '', wo_number: '', amount: '', payment_mode: 'cash', reference_number: '', remarks: '' };

const PAYMENT_MODE_ICON = { cash: '💵', upi: '📱', bank_transfer: '🏦', cheque: '📄' };

function ScAdvanceForm({ projects, defaultProjectId, onClose }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ ...EMPTY_SC_ADV, project_id: defaultProjectId || '' });
  const [woSearch, setWoSearch] = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Load all WOs for the selected project
  const { data: woData, isLoading: loadingWOs } = useQuery({
    queryKey: ['sc-advance-wos', form.project_id],
    queryFn: () => subcontractorAPI.listWorkOrders({ project_id: form.project_id || undefined, limit: 500 }).then(r => r.data?.data ?? r.data ?? []),
    staleTime: 60000,
  });
  const allWOs = Array.isArray(woData) ? woData : (woData?.data ?? []);
  const filteredWOs = woSearch
    ? allWOs.filter(w => w.wo_number?.toLowerCase().includes(woSearch.toLowerCase()) || w.subject?.toLowerCase().includes(woSearch.toLowerCase()) || w.vendor_name?.toLowerCase().includes(woSearch.toLowerCase()))
    : allWOs;

  // Legacy vendor search fallback (still available if WO list is empty)
  const [vendorSearch, setVendorSearch] = useState('');
  const { data: vendorData } = useQuery({
    queryKey: ['spc-sc-vendors', vendorSearch],
    queryFn: () => storesPettyCashAPI.scVendorLookup({ search: vendorSearch || undefined }).then(r => r.data),
    enabled: vendorSearch.length > 0 && allWOs.length === 0,
  });
  const vendors = vendorData?.data || [];

  const saveMut = useMutation({
    mutationFn: (payload) => storesPettyCashAPI.createScAdvance(payload).then(r => r.data),
    onSuccess: () => {
      toast.success('SC Advance recorded');
      qc.invalidateQueries({ queryKey: ['spc-sc-advances'] });
      qc.invalidateQueries({ queryKey: ['spc-summary'] });
      onClose();
    },
    onError: e => toast.error(e?.response?.data?.error || 'Save failed'),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.vendor_name.trim()) return toast.error('Sub-contractor name is required');
    if (!form.advance_date)       return toast.error('Date is required');
    if (!parseFloat(form.amount)) return toast.error('Amount is required');
    saveMut.mutate({ ...form, amount: parseFloat(form.amount) || 0 });
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-auto">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl flex flex-col max-h-[96vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0 bg-gradient-to-r from-orange-50 to-white rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-500 flex items-center justify-center shadow-sm">
              <Send className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-bold text-slate-900 text-base">New SC Advance</p>
              <p className="text-xs text-slate-500 mt-0.5">Petty cash paid to sub-contractor</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"><X className="w-4 h-4" /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><Lbl req>Date</Lbl><input type="date" className={F} value={form.advance_date} onChange={e => set('advance_date', e.target.value)} required /></div>
            <div><Lbl>Project</Lbl>
              <select className={FS} value={form.project_id} onChange={e => set('project_id', e.target.value)}>
                <option value="">— Not linked —</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>

          {/* Work Order dropdown */}
          <div>
            <Lbl req>Work Order</Lbl>
            {loadingWOs ? (
              <div className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-400">
                <div className="w-3.5 h-3.5 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" /> Loading work orders…
              </div>
            ) : allWOs.length > 0 ? (
              <div>
                <div className="relative mb-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input className={clsx(F, 'pl-8')} placeholder="Search by WO No, subject or vendor…"
                    value={woSearch} onChange={e => setWoSearch(e.target.value)} />
                </div>
                <div className="border border-slate-200 rounded-xl max-h-48 overflow-y-auto">
                  {filteredWOs.length === 0 ? (
                    <p className="text-center text-slate-400 text-xs py-6">No work orders match</p>
                  ) : filteredWOs.map(w => (
                    <button key={w.id} type="button"
                      onClick={() => { set('wo_number', w.wo_number); set('vendor_id', w.vendor_id); set('vendor_name', w.vendor_name || ''); }}
                      className={clsx('w-full text-left px-4 py-2.5 border-b border-slate-50 last:border-0 transition-colors flex items-start justify-between gap-3',
                        form.wo_number === w.wo_number ? 'bg-orange-50' : 'hover:bg-orange-50/50')}>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800">{w.wo_number}</p>
                        <p className="text-xs text-slate-500 truncate">{w.subject || '—'}</p>
                        <p className="text-xs text-orange-600 font-medium">{w.vendor_name || '—'}</p>
                      </div>
                      {form.wo_number === w.wo_number && <CheckCircle className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5" />}
                    </button>
                  ))}
                </div>
                {form.wo_number && (
                  <div className="mt-2 flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
                    <CheckCircle className="w-3.5 h-3.5 text-orange-500 flex-shrink-0" />
                    <span className="text-xs font-semibold text-orange-700">Selected: {form.wo_number}</span>
                    {form.vendor_name && <span className="text-xs text-orange-500">· {form.vendor_name}</span>}
                    <button type="button" onClick={() => { set('wo_number', ''); set('vendor_id', ''); set('vendor_name', ''); }} className="ml-auto text-slate-400 hover:text-red-500"><X className="w-3 h-3" /></button>
                  </div>
                )}
              </div>
            ) : (
              /* Fallback: manual entry if no WOs exist */
              <div className="space-y-3">
                <div className="relative">
                  <input className={F} placeholder="Type sub-contractor name…"
                    value={vendorSearch || form.vendor_name}
                    onChange={e => { setVendorSearch(e.target.value); set('vendor_id', ''); set('vendor_name', e.target.value); }} />
                  {vendors.length > 0 && vendorSearch && (
                    <div className="absolute left-0 right-0 mt-1 border border-slate-200 rounded-xl bg-white shadow-lg max-h-40 overflow-y-auto z-20">
                      {vendors.map(v => (
                        <button key={v.id} type="button"
                          className="w-full text-left px-3 py-2 text-sm hover:bg-orange-50 text-slate-700 border-b border-slate-50 last:border-0"
                          onClick={() => { set('vendor_id', v.id); set('vendor_name', v.name); setVendorSearch(''); }}>
                          {v.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div><Lbl>Work Order No.</Lbl><input className={F} placeholder="e.g. WOLANLH10004" value={form.wo_number} onChange={e => set('wo_number', e.target.value)} /></div>
              </div>
            )}
          </div>

          {/* Amount — prominent */}
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
            <Lbl req>Amount Paid (₹)</Lbl>
            <input type="number" step="0.01" className="w-full border border-orange-200 bg-white rounded-xl px-4 py-3 text-xl font-bold text-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-400 placeholder:text-orange-200"
              placeholder="0.00" value={form.amount} onChange={e => set('amount', e.target.value)} required />
          </div>

          {/* Payment mode */}
          <div>
            <Lbl>Payment Mode</Lbl>
            <div className="grid grid-cols-4 gap-2">
              {['cash', 'upi', 'bank_transfer', 'cheque'].map(mode => (
                <button key={mode} type="button"
                  onClick={() => set('payment_mode', mode)}
                  className={clsx('flex flex-col items-center gap-1 p-2.5 rounded-xl border text-xs font-semibold transition-colors',
                    form.payment_mode === mode
                      ? 'border-orange-400 bg-orange-50 text-orange-700'
                      : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50')}>
                  <span className="text-base">{PAYMENT_MODE_ICON[mode]}</span>
                  <span className="capitalize">{mode.replace('_', ' ')}</span>
                </button>
              ))}
            </div>
          </div>

          {form.payment_mode !== 'cash' && (
            <div><Lbl>Reference No. / UPI ID / Cheque No.</Lbl>
              <input className={F} placeholder="Ref / ID / Cheque no." value={form.reference_number} onChange={e => set('reference_number', e.target.value)} />
            </div>
          )}

          <div><Lbl>Remarks</Lbl>
            <textarea className={clsx(F, 'resize-none')} rows={2} placeholder="Notes…" value={form.remarks} onChange={e => set('remarks', e.target.value)} />
          </div>
        </form>

        <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
          <button type="button" onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-white transition-colors">Cancel</button>
          <button onClick={handleSubmit} disabled={saveMut.isPending}
            className="flex items-center gap-2 px-6 py-2 bg-orange-500 text-white text-sm font-semibold rounded-xl hover:bg-orange-600 disabled:opacity-50 shadow-sm transition-colors">
            {saveMut.isPending ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            {saveMut.isPending ? 'Saving…' : 'Record SC Advance'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Receipt Form (HO Cash) ────────────────────────────────────────────────────
const EMPTY_RECEIPT = { project_id: '', receipt_date: dayjs().format('YYYY-MM-DD'), amount: '', received_by: '', voucher_no: '', payment_mode: 'cash', reference_number: '', remarks: '' };

function ReceiptForm({ initial, projects, defaultProjectId, onClose }) {
  const qc = useQueryClient();
  const isEdit = !!initial?.id;

  const [form, setForm] = useState(
    isEdit
      ? { project_id: initial.project_id || '', receipt_date: initial.receipt_date?.slice(0, 10) || dayjs().format('YYYY-MM-DD'),
          amount: initial.amount || '', received_by: initial.received_by || '', voucher_no: initial.voucher_no || '',
          payment_mode: initial.payment_mode || 'cash', reference_number: initial.reference_number || '', remarks: initial.remarks || '' }
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
    <div className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-auto">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl flex flex-col max-h-[96vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0 bg-gradient-to-r from-green-50 to-white rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-600 flex items-center justify-center shadow-sm">
              <Wallet className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-bold text-slate-900 text-base">{isEdit ? 'Edit HO Receipt' : 'Record Cash from HO'}</p>
              <p className="text-xs text-slate-500 mt-0.5">Cash received from Head Office</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"><X className="w-4 h-4" /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Amount — top and most prominent */}
          <div className="bg-green-50 border border-green-200 rounded-xl p-4">
            <Lbl req>Amount Received (₹)</Lbl>
            <input type="number" step="0.01"
              className="w-full border border-green-200 bg-white rounded-xl px-4 py-3 text-2xl font-bold text-green-700 focus:outline-none focus:ring-2 focus:ring-green-400 placeholder:text-green-200"
              placeholder="0.00" value={form.amount} onChange={e => set('amount', e.target.value)} required autoFocus />
            <p className="text-xs text-green-600 mt-2 font-medium">This amount will be added to the petty cash balance</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><Lbl req>Date Received</Lbl><input type="date" className={F} value={form.receipt_date} onChange={e => set('receipt_date', e.target.value)} required /></div>
            <div><Lbl>Project</Lbl>
              <select className={FS} value={form.project_id} onChange={e => set('project_id', e.target.value)}>
                <option value="">— Not linked —</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>

          <div><Lbl>Received By</Lbl>
            <input className={F} placeholder="e.g. Site Incharge" value={form.received_by} onChange={e => set('received_by', e.target.value)} />
          </div>

          <div><Lbl>HO Voucher / Ref No.</Lbl>
            <input className={F} placeholder="e.g. HO-PC-MAR-01" value={form.voucher_no} onChange={e => set('voucher_no', e.target.value)} />
          </div>

          <div>
            <Lbl>Payment Mode</Lbl>
            <div className="grid grid-cols-4 gap-2">
              {['cash', 'upi', 'bank_transfer', 'cheque'].map(mode => (
                <button key={mode} type="button" onClick={() => set('payment_mode', mode)}
                  className={clsx('flex flex-col items-center gap-1 p-2.5 rounded-xl border text-xs font-semibold transition-colors',
                    form.payment_mode === mode ? 'border-green-400 bg-green-50 text-green-700' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50')}>
                  <span className="text-base">{PAYMENT_MODE_ICON[mode]}</span>
                  <span className="capitalize">{mode.replace('_', ' ')}</span>
                </button>
              ))}
            </div>
          </div>

          {form.payment_mode !== 'cash' && (
            <div><Lbl>Reference No. / UPI ID / Cheque No.</Lbl>
              <input className={F} placeholder="Ref / ID / Cheque no." value={form.reference_number} onChange={e => set('reference_number', e.target.value)} />
            </div>
          )}

          <div><Lbl>Remarks</Lbl>
            <textarea className={clsx(F, 'resize-none')} rows={2} placeholder="Notes…" value={form.remarks} onChange={e => set('remarks', e.target.value)} />
          </div>
        </form>

        <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
          <button type="button" onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-white transition-colors">Cancel</button>
          <button onClick={handleSubmit} disabled={saveMut.isPending}
            className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white text-sm font-semibold rounded-xl hover:bg-green-700 disabled:opacity-50 shadow-sm transition-colors">
            {saveMut.isPending ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            {saveMut.isPending ? 'Saving…' : isEdit ? 'Update Receipt' : 'Record Receipt'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Approval Modal ────────────────────────────────────────────────────────────
function ApprovalModal({ entry, mode, onConfirm, onClose }) {
  const [remarks, setRemarks] = useState('');
  const isApprove = mode === 'approve';
  return (
    <div className="fixed inset-0 z-[80] bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className={clsx('w-9 h-9 rounded-lg flex items-center justify-center', isApprove ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200')}>
              {isApprove ? <ThumbsUp className="w-4 h-4 text-green-600" /> : <ThumbsDown className="w-4 h-4 text-red-600" />}
            </div>
            <div>
              <p className="font-semibold text-slate-900">{isApprove ? 'Approve Entry' : 'Reject Entry'}</p>
              <p className="text-xs text-slate-500 mt-0.5">{entry.supplier} · {inr(entry.amount)}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-3">
          {isApprove ? (
            <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700">
              Approving this entry confirms the expense is valid and deducts <strong>{inr(entry.amount)}</strong> from the petty cash balance.
            </div>
          ) : (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
              Rejecting this entry will exclude it from the petty cash balance. The entry remains visible for audit.
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">{isApprove ? 'Approval Remarks (optional)' : 'Reason for Rejection *'}</label>
            <textarea
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
              rows={3}
              placeholder={isApprove ? 'Any notes for the project head record…' : 'State the reason for rejection…'}
              value={remarks}
              onChange={e => setRemarks(e.target.value)}
            />
          </div>
        </div>
        <div className="flex gap-2 px-6 pb-5 justify-end">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
          <button
            onClick={() => {
              if (!isApprove && !remarks.trim()) return toast.error('Please state a reason for rejection');
              onConfirm(remarks);
            }}
            className={clsx('px-5 py-2 text-white text-sm font-medium rounded-lg', isApprove ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700')}
          >
            {isApprove ? 'Approve' : 'Reject'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
export default function StoresPettyCashPage() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const isAdmin = ['super_admin', 'admin'].includes(user?.role);
  const location = useLocation();
  const highlightId = location.state?.viewId || null;
  const highlightRef = useRef(null);
  const [tab, setTab] = useState(highlightId ? 'local' : 'dashboard');
  const [projectId, setProjectId] = useState('');
  const [filters, setFilters] = useState({ search: '', from: '', to: '' });
  const [showEntryForm,   setShowEntryForm]   = useState(false);
  const [editEntry,       setEditEntry]       = useState(null);
  const [showAdvForm,     setShowAdvForm]     = useState(false);
  const [editAdv,         setEditAdv]         = useState(null);
  const [showScAdvForm,   setShowScAdvForm]   = useState(false);
  const [showReceiptForm, setShowReceiptForm] = useState(false);
  const [approvalModal,   setApprovalModal]   = useState(null); // { entry, mode: 'approve'|'reject' }
  const [editReceipt,     setEditReceipt]     = useState(null);
  const [showRepl,        setShowRepl]        = useState(false);
  const [editBudgets,     setEditBudgets]     = useState(false);
  const [localBudgets,    setLocalBudgets]    = useState(null);
  const [statusFilter,    setStatusFilter]    = useState(highlightId ? 'All' : 'All');
  const [catFilter,       setCatFilter]       = useState('All');
  const setFilter = (k, v) => setFilters(f => ({ ...f, [k]: v }));

  useEffect(() => {
    if (highlightId && highlightRef.current) {
      setTimeout(() => highlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
    }
  }, [highlightId, highlightRef.current]);

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
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const { data: advancesResp, isLoading: loadingAdvances } = useQuery({
    queryKey: ['spc-advances', baseParams],
    queryFn: () => storesPettyCashAPI.listAdvances({ ...baseParams, limit: 1000 }).then(r => r.data),
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const { data: receiptsResp, isLoading: loadingReceipts } = useQuery({
    queryKey: ['spc-receipts', baseParams],
    queryFn: () => storesPettyCashAPI.listReceipts({ project_id: projectId || undefined, limit: 500 }).then(r => r.data),
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const { data: summaryResp } = useQuery({
    queryKey: ['spc-summary', projectId],
    queryFn: () => storesPettyCashAPI.summary({ project_id: projectId || undefined }).then(r => r.data),
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const { data: budgetsResp } = useQuery({
    queryKey: ['spc-budgets', projectId],
    queryFn: () => storesPettyCashAPI.getBudgets({ project_id: projectId || undefined }).then(r => r.data),
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const { data: scAdvancesResp, isLoading: loadingScAdv } = useQuery({
    queryKey: ['spc-sc-advances', projectId],
    queryFn: () => storesPettyCashAPI.listScAdvances({ project_id: projectId || undefined }).then(r => r.data),
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const entries    = entriesResp?.data    ?? [];
  const advances   = advancesResp?.data   ?? [];
  const receipts   = receiptsResp?.data   ?? [];
  const scAdvances = scAdvancesResp?.data ?? [];
  const summary    = summaryResp?.data    ?? {};
  const budgets    = useMemo(() => ({ ...DEFAULT_BUDGETS, ...(budgetsResp?.data ?? {}) }), [budgetsResp]);

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
  const deleteScAdvMut = useMutation({
    mutationFn: (id) => storesPettyCashAPI.deleteScAdvance(id),
    onSuccess: () => { toast.success('SC Advance deleted'); qc.invalidateQueries({ queryKey: ['spc-sc-advances'] }); qc.invalidateQueries({ queryKey: ['spc-summary'] }); },
    onError: e => toast.error(e?.response?.data?.error || 'Delete failed'),
  });
  const deleteReceiptMut = useMutation({
    mutationFn: (id) => storesPettyCashAPI.deleteReceipt(id),
    onSuccess: () => { toast.success('Receipt deleted'); qc.invalidateQueries({ queryKey: ['spc-receipts'] }); qc.invalidateQueries({ queryKey: ['spc-summary'] }); },
    onError: e => toast.error(e?.response?.data?.error || 'Delete failed'),
  });
  const patchStatusMut = useMutation({
    mutationFn: ({ id, status, remarks, rejected_reason }) => storesPettyCashAPI.patchStatus(id, status, remarks, rejected_reason),
    onSuccess: (_, vars) => {
      toast.success(vars.status === 'Approved' ? 'Entry approved ✓' : 'Entry rejected');
      setApprovalModal(null);
      qc.refetchQueries({ queryKey: ['spc-entries'] });
      qc.refetchQueries({ queryKey: ['spc-summary'] });
      qc.invalidateQueries({ queryKey: ['spc-budgets'] });
      qc.invalidateQueries({ queryKey: ['analytics-executive'] });
      qc.invalidateQueries({ queryKey: ['my-approvals'] });
      qc.invalidateQueries({ queryKey: ['spc-entries-accounts'] });
    },
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
      .map(r => { if (r.status !== 'Rejected') bal -= Number(r.amount); return { ...r, runBalance: bal }; });
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

  // Invoice number → first entry record (for real-time duplicate warning in form)
  const existingInvoices = useMemo(() => {
    const map = {};
    entries.forEach(e => {
      if (e.invoice_no && e.invoice_no !== '–') {
        const inv = e.invoice_no.trim();
        if (!map[inv]) map[inv] = { id: e.id, sl_no: e.sl_no, supplier: e.supplier, entry_date: e.entry_date, amount: e.amount };
      }
    });
    return map;
  }, [entries]);

  // Top suppliers
  const topSuppliers = useMemo(() => {
    const map = {};
    entries.forEach(e => { map[e.supplier] = map[e.supplier] || { count: 0, total: 0 }; map[e.supplier].count++; map[e.supplier].total += Number(e.amount); });
    return Object.entries(map).sort((a, b) => b[1].total - a[1].total).slice(0, 7);
  }, [entries]);

  // ── Tab helpers ────────────────────────────────────────────────────────────
  const TABS = [
    { id: 'dashboard',    label: 'Dashboard',       Icon: BarChart2   },
    { id: 'receipts',     label: 'HO Receipts',     Icon: Wallet      },
    { id: 'local',        label: 'Local Purchase',  Icon: ShoppingBag },
    { id: 'advances',     label: 'Salary Advances', Icon: Users       },
    { id: 'sc-advances',  label: 'SC Advances',     Icon: Send        },
    { id: 'analytics',    label: 'Analytics',       Icon: TrendingUp  },
    { id: 'budgets',      label: 'Budgets',         Icon: BookOpen    },
  ];

  const balanceColor = cashInHand < 0 ? 'text-red-600' : cashInHand < 5000 ? 'text-amber-600' : 'text-green-700';

  return (
    <div style={{ background: Theme.pageBg, minHeight: '100vh' }}>

      <PageHeader
        title="Stores Petty Cash"
        subtitle={`Site cash book${selectedProject ? ' · ' + selectedProject.name : ''}`}
        breadcrumbs={[{ label: 'Stores' }, { label: 'Petty Cash Tracker' }]}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            {pendingCount > 0 && (
              <button onClick={() => { setTab('local'); setStatusFilter('Pending'); }}
                className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg"
                style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', color: '#FCD34D' }}>
                <Clock className="w-3 h-3" /> {pendingCount} Pending
              </button>
            )}
            <div className={clsx('flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg',
              cashInHand < 0 ? 'bg-red-500/20 text-red-300' :
              cashInHand < 5000 ? 'bg-amber-500/20 text-amber-300' : 'bg-green-500/20 text-green-300')}
              style={{ border: '1px solid rgba(255,255,255,0.15)' }}>
              {cashInHand < 0 ? <AlertTriangle className="w-3 h-3" /> : <CheckCircle className="w-3 h-3" />}
              {inr(Math.abs(cashInHand))} {cashInHand < 0 ? 'OVERDRAWN' : 'in Hand'}
            </div>
            <button onClick={() => printStatement({ entries: approvedEntries, advances, receipts, projectName: selectedProject?.name })}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg"
              style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff' }}>
              <Printer className="w-3.5 h-3.5" /> Print
            </button>
            {isAdmin && (
              <button
                onClick={async () => {
                  if (!window.confirm(
                    projectId
                      ? `Remove ALL attachments from every petty cash voucher in this project?\n\nThis cannot be undone.`
                      : `Remove ALL attachments from EVERY petty cash voucher across all projects?\n\nThis cannot be undone.`
                  )) return;
                  try {
                    const r = await storesPettyCashAPI.clearAttachments(projectId || undefined);
                    toast.success(`Attachments cleared from ${r.data?.rows_updated ?? 0} voucher(s)`);
                    qc.invalidateQueries({ queryKey: ['spc-entries'] });
                  } catch (e) {
                    toast.error(e?.response?.data?.error || 'Failed to clear attachments');
                  }
                }}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg"
                style={{ background: 'rgba(239,68,68,0.25)', border: '1px solid rgba(239,68,68,0.5)', color: '#fca5a5' }}
                title="Remove all file attachments from vouchers (admin only)"
              >
                <Trash2 className="w-3.5 h-3.5" /> Clear Attachments
              </button>
            )}
          </div>
        }
      />

      {/* ── Project selector + Tab bar ── */}
      <div className="bg-white border-b border-slate-200 px-6">
        <div className="flex items-center gap-3 pt-3 pb-0 flex-wrap">
          <select className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 w-56"
            value={projectId} onChange={e => setProjectId(e.target.value)}>
            <option value="">All Projects</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="flex gap-0 overflow-x-auto mt-1">
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
          <div className="space-y-4">
            {/* Summary banner */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 border-l-4 border-l-green-500">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Received</p>
                <p className="text-2xl font-bold text-green-700 mt-1">{inr(totalReceived)}</p>
                <p className="text-xs text-slate-400 mt-0.5">{summary.receipt_count || 0} transfers from HO</p>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 border-l-4 border-l-red-400">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Spent</p>
                <p className="text-2xl font-bold text-red-600 mt-1">{inr(totalSpent)}</p>
                <p className="text-xs text-slate-400 mt-0.5">Purchases + Advances</p>
              </div>
              <div className={clsx('bg-white rounded-xl border border-slate-200 shadow-sm p-4 border-l-4', cashInHand < 0 ? 'border-l-red-500' : cashInHand < 5000 ? 'border-l-amber-400' : 'border-l-indigo-400')}>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Cash in Hand</p>
                <p className={clsx('text-2xl font-bold mt-1', balanceColor)}>{inr(Math.abs(cashInHand))}</p>
                <p className="text-xs text-slate-400 mt-0.5">{cashInHand < 0 ? 'OVERDRAWN' : 'Available balance'}</p>
              </div>
            </div>

            {/* Toolbar */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm font-semibold text-slate-700">{receipts.length} receipt{receipts.length !== 1 ? 's' : ''} recorded</p>
              <button onClick={() => { setEditReceipt(null); setShowReceiptForm(true); }}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 shadow-sm">
                <Plus className="w-3.5 h-3.5" /> Record Receipt
              </button>
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              {loadingReceipts ? (
                <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-green-400 border-t-transparent rounded-full animate-spin" /></div>
              ) : receipts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
                  <Wallet className="w-12 h-12 opacity-20" />
                  <p className="text-sm font-medium">No receipts recorded yet</p>
                  <button onClick={() => { setEditReceipt(null); setShowReceiptForm(true); }} className="text-sm text-green-600 hover:underline flex items-center gap-1">
                    <Plus className="w-3.5 h-3.5" /> Record first receipt
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gradient-to-r from-slate-50 to-white border-b border-slate-200">
                        {['#', 'Date', 'Amount Received', 'Received By', 'Voucher / Ref', 'Remarks', ''].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {receipts.map((row, i) => (
                        <tr key={row.id} className={clsx('transition-colors cursor-pointer group', i % 2 === 0 ? 'bg-white hover:bg-green-50/40' : 'bg-slate-50/40 hover:bg-green-50/40')}
                          onClick={() => { setEditReceipt(row); setShowReceiptForm(true); }}>
                          <td className="px-4 py-3 text-slate-400 text-xs font-mono w-10">{i + 1}</td>
                          <td className="px-4 py-3 text-slate-600 whitespace-nowrap text-sm">{dayjs(row.receipt_date).format('DD-MM-YYYY')}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-1.5 h-6 rounded-full bg-green-400 flex-shrink-0" />
                              <span className="font-mono font-bold text-green-700 text-base">{inr(row.amount)}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-slate-700 font-medium">{row.received_by || <span className="text-slate-300">—</span>}</td>
                          <td className="px-4 py-3 text-slate-500 text-xs font-mono">{row.voucher_no || <span className="text-slate-300">—</span>}</td>
                          <td className="px-4 py-3 text-slate-400 text-xs max-w-[180px] truncate">{row.remarks || '—'}</td>
                          <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                            <button onClick={() => { if (window.confirm('Delete this receipt?')) deleteReceiptMut.mutate(row.id); }}
                              className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-md opacity-0 group-hover:opacity-100 transition-all">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-green-50 border-t-2 border-green-200">
                        <td colSpan={2} className="px-4 py-3 text-right text-xs font-bold text-green-700 uppercase tracking-wider">Total Received ({receipts.length})</td>
                        <td className="px-4 py-3 font-mono font-bold text-green-700 text-lg">{inr(totalReceived)}</td>
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
          <div className="space-y-4">
            {/* ── Toolbar ── */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:bg-white"
                  placeholder="Search supplier or material…" value={filters.search} onChange={e => setFilter('search', e.target.value)} />
              </div>
              <select className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                {['All', 'Pending', 'ph_approved', 'Approved', 'Rejected'].map(s => <option key={s} value={s}>{s === 'ph_approved' ? 'PH Approved' : s}</option>)}
              </select>
              <select className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                value={catFilter} onChange={e => setCatFilter(e.target.value)}>
                <option value="All">All Categories</option>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <span>From</span>
                <input type="date" className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  value={filters.from} onChange={e => setFilter('from', e.target.value)} />
                <span>To</span>
                <input type="date" className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  value={filters.to} onChange={e => setFilter('to', e.target.value)} />
              </div>
              <div className="ml-auto flex items-center gap-2">
                <span className="text-xs text-slate-400 whitespace-nowrap">{filteredEntries.length} entries · <span className="font-semibold text-slate-600">{inr(filteredEntries.filter(r=>r.status!=='Rejected').reduce((s,r)=>s+Number(r.amount),0))}</span></span>
                <button onClick={() => { setEditEntry(null); setShowEntryForm(true); }}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 shadow-sm whitespace-nowrap">
                  <Plus className="w-3.5 h-3.5" /> New Entry
                </button>
              </div>
            </div>

            {/* ── Table ── */}
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
                      <tr className="bg-gradient-to-r from-slate-50 to-white border-b border-slate-200">
                        {['#', 'Date', 'Supplier & Materials', 'Invoice', 'Amount', 'Category', 'Status', 'Docs', 'Balance', 'Actions'].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredEntries.map((row, i) => {
                        const mat = row.items || [];
                        const matSummary = mat.length ? (mat.length === 1 ? mat[0].material_name : `${mat[0].material_name} +${mat.length - 1}`) : null;
                        const cat = categoryOf(mat[0]?.material_name || row.supplier || '');
                        const isDup = dupInvoices[row.invoice_no];
                        const lowBal = row.runBalance < 5000 && row.runBalance >= 0;
                        const negBal = row.runBalance < 0;
                        const isHighlight = row.id === highlightId;
                        return (
                          <tr key={row.id}
                            ref={isHighlight ? highlightRef : null}
                            className={clsx('transition-colors group',
                              isHighlight ? 'bg-indigo-50 ring-2 ring-inset ring-indigo-400' :
                              i % 2 === 0 ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/40 hover:bg-slate-50'
                            )}>
                            {/* # */}
                            <td className="px-4 py-3 font-mono text-xs font-bold text-indigo-600 w-10">{row.sl_no}</td>
                            {/* Date */}
                            <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">{dayjs(row.entry_date).format('DD-MM-YYYY')}</td>
                            {/* Supplier + Materials */}
                            <td className="px-4 py-3 max-w-[220px]">
                              <p className="font-semibold text-slate-800 truncate text-sm">{row.supplier}</p>
                              {matSummary && <p className="text-xs text-slate-400 truncate mt-0.5" title={mat.map(m=>m.material_name).join(', ')}>{matSummary}</p>}
                            </td>
                            {/* Invoice */}
                            <td className="px-4 py-3 text-xs font-mono text-slate-500">
                              {isDup && <span title="Duplicate invoice" className="inline-block mr-1 text-red-500 font-bold">⚠</span>}
                              {row.invoice_no || <span className="text-slate-300">—</span>}
                            </td>
                            {/* Amount */}
                            <td className="px-4 py-3 text-right whitespace-nowrap">
                              {row.status === 'Rejected'
                                ? <span className="font-mono text-xs text-slate-400 line-through">{inr(row.amount)}</span>
                                : <span className="font-mono font-bold text-slate-800">{inr(row.amount)}</span>}
                            </td>
                            {/* Category */}
                            <td className="px-4 py-3"><CatBadge cat={cat} /></td>
                            {/* Status */}
                            <td className="px-4 py-3">
                              <Badge label={row.status} />
                              {row.status === 'ph_approved' && row.ph_approved_by_name && (
                                <p className="text-[10px] text-blue-500 mt-1 whitespace-nowrap">by {row.ph_approved_by_name}</p>
                              )}
                              {row.status === 'Approved' && row.approved_by_name && (
                                <p className="text-[10px] text-green-600 mt-1 whitespace-nowrap">by {row.approved_by_name}</p>
                              )}
                              {row.status === 'Rejected' && row.rejected_reason && (
                                <p className="text-[10px] text-red-500 mt-1 truncate max-w-[100px]" title={row.rejected_reason}>{row.rejected_reason}</p>
                              )}
                            </td>
                            {/* Docs */}
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                {row.voucher_file_url
                                  ? <button onClick={() => openAttachment(row.voucher_file_url)} title="View Voucher"
                                      className="flex items-center gap-1 text-[10px] font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 rounded px-1.5 py-0.5">
                                      <Paperclip className="w-2.5 h-2.5" /> V
                                    </button>
                                  : <span className="text-slate-200 text-xs">—</span>}
                                {row.bill_file_url
                                  ? <button onClick={() => openAttachment(row.bill_file_url)} title="View Bill"
                                      className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded px-1.5 py-0.5">
                                      <Paperclip className="w-2.5 h-2.5" /> B
                                    </button>
                                  : null}
                              </div>
                            </td>
                            {/* Balance */}
                            <td className={clsx('px-4 py-3 font-mono text-xs font-bold text-right whitespace-nowrap', negBal ? 'text-red-600' : lowBal ? 'text-amber-600' : 'text-slate-500')}>
                              {inr(row.runBalance)}{lowBal && !negBal && <span className="ml-1 text-amber-500">⚠</span>}
                            </td>
                            {/* Actions */}
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1.5 opacity-70 group-hover:opacity-100 transition-opacity">
                                {['Pending', 'ph_approved'].includes(row.status) && (
                                  <button onClick={() => setApprovalModal({ entry: row, mode: 'approve' })}
                                    className="p-1 rounded-md bg-green-50 text-green-600 hover:bg-green-100" title="Approve">
                                    <ThumbsUp className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                {!['Approved', 'Rejected'].includes(row.status) && (
                                  <button onClick={() => setApprovalModal({ entry: row, mode: 'reject' })}
                                    className="p-1 rounded-md bg-red-50 text-red-500 hover:bg-red-100" title="Reject">
                                    <ThumbsDown className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                {row.status !== 'Approved' && (
                                  <button onClick={() => { setEditEntry(row); setShowEntryForm(true); }}
                                    className="p-1 rounded-md bg-indigo-50 text-indigo-600 hover:bg-indigo-100" title="Edit">
                                    <Eye className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                <button onClick={() => { if (window.confirm('Delete this entry?')) deleteEntryMut.mutate(row.id); }}
                                  className="p-1 rounded-md text-slate-300 hover:bg-red-50 hover:text-red-500" title="Delete">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-50 border-t-2 border-slate-200">
                        <td colSpan={4} className="px-4 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">{filteredEntries.length} entries</td>
                        <td className="px-4 py-3 font-mono font-bold text-indigo-700 text-right">{inr(filteredEntries.filter(r => r.status !== 'Rejected').reduce((s, r) => s + Number(r.amount), 0))}</td>
                        <td colSpan={3} />
                        <td className={clsx('px-4 py-3 font-mono font-bold text-right text-sm', balanceColor)}>{inr(cashInHand)} in hand</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══ SALARY ADVANCES ══ */}
        {tab === 'advances' && (
          <div className="space-y-4">
            {/* Summary KPIs */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 border-l-4 border-l-amber-400">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Advances</p>
                <p className="text-2xl font-bold text-amber-700 mt-1">{inr(totalAdv)}</p>
                <p className="text-xs text-slate-400 mt-0.5">{advances.length} payments</p>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 border-l-4 border-l-slate-300">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Avg per Advance</p>
                <p className="text-2xl font-bold text-slate-700 mt-1">{advances.length ? inr(totalAdv / advances.length) : '₹ 0'}</p>
                <p className="text-xs text-slate-400 mt-0.5">Average payment</p>
              </div>
              <div className={clsx('bg-white rounded-xl border border-slate-200 shadow-sm p-4 border-l-4', cashInHand < 0 ? 'border-l-red-500' : 'border-l-indigo-400')}>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Cash in Hand</p>
                <p className={clsx('text-2xl font-bold mt-1', balanceColor)}>{inr(cashInHand)}</p>
                <p className="text-xs text-slate-400 mt-0.5">After all deductions</p>
              </div>
            </div>

            {/* Toolbar */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:bg-white"
                  placeholder="Search contractor or employee…" value={filters.search} onChange={e => setFilter('search', e.target.value)} />
              </div>
              <div className="ml-auto">
                <button onClick={() => { setEditAdv(null); setShowAdvForm(true); }}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-amber-500 text-white text-sm font-semibold rounded-lg hover:bg-amber-600 shadow-sm whitespace-nowrap">
                  <Plus className="w-3.5 h-3.5" /> New Advance
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              {loadingAdvances ? (
                <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" /></div>
              ) : advances.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
                  <Users className="w-12 h-12 opacity-20" />
                  <p className="text-sm font-medium">No advances recorded yet</p>
                  <button onClick={() => { setEditAdv(null); setShowAdvForm(true); }} className="text-sm text-amber-600 hover:underline flex items-center gap-1">
                    <Plus className="w-3.5 h-3.5" /> Add first entry
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gradient-to-r from-slate-50 to-white border-b border-slate-200">
                        {['Date', 'Contractor / Employee', 'Description', 'Remarks', 'Amount', ''].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {advances
                        .filter(r => !filters.search || r.payee_name?.toLowerCase().includes(filters.search.toLowerCase()) || r.description?.toLowerCase().includes(filters.search.toLowerCase()))
                        .map((row, i) => (
                        <tr key={row.id} className={clsx('transition-colors cursor-pointer group', i % 2 === 0 ? 'bg-white hover:bg-amber-50/30' : 'bg-slate-50/40 hover:bg-amber-50/30')}
                          onClick={() => { setEditAdv(row); setShowAdvForm(true); }}>
                          <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">{dayjs(row.advance_date).format('DD-MM-YYYY')}</td>
                          <td className="px-4 py-3">
                            <p className="font-semibold text-slate-800">{row.payee_name}</p>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs bg-amber-50 text-amber-700 font-medium px-2 py-0.5 rounded-full">{row.description || 'Salary Advance'}</span>
                          </td>
                          <td className="px-4 py-3 text-slate-400 text-xs max-w-[160px] truncate">{row.remarks || '—'}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-1.5 h-6 rounded-full bg-amber-400 flex-shrink-0" />
                              <span className="font-mono font-bold text-amber-700 text-base">{inr(row.amount)}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                            <button onClick={() => { if (window.confirm('Delete this advance?')) deleteAdvMut.mutate(row.id); }}
                              className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-md opacity-0 group-hover:opacity-100 transition-all">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-amber-50 border-t-2 border-amber-200">
                        <td colSpan={4} className="px-4 py-3 text-right text-xs font-bold text-amber-700 uppercase tracking-wider">Total ({advances.length} entries)</td>
                        <td className="px-4 py-3 font-mono font-bold text-amber-700 text-lg">{inr(totalAdv)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══ SC ADVANCES ══ */}
        {tab === 'sc-advances' && (() => {
          const scTotal = scAdvances.reduce((s, r) => s + Number(r.amount), 0);
          return (
          <div className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 border-l-4 border-l-orange-400">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total SC Advances</p>
                <p className="text-2xl font-bold text-orange-600 mt-1">{inr(scTotal)}</p>
                <p className="text-xs text-slate-400 mt-0.5">{scAdvances.length} payments to sub-contractors</p>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 border-l-4 border-l-slate-300">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Unique Sub-Contractors</p>
                <p className="text-2xl font-bold text-slate-700 mt-1">{new Set(scAdvances.map(r => r.vendor_name)).size}</p>
                <p className="text-xs text-slate-400 mt-0.5">Distinct vendors</p>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 border-l-4 border-l-indigo-300">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Avg per Payment</p>
                <p className="text-2xl font-bold text-slate-700 mt-1">{scAdvances.length ? inr(scTotal / scAdvances.length) : '₹ 0'}</p>
                <p className="text-xs text-slate-400 mt-0.5">Average advance amount</p>
              </div>
            </div>

            {/* Toolbar */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-lg px-3 py-1.5">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                <span>Recorded separately from salary advances — linked to sub-contractor billing</span>
              </div>
              <button onClick={() => setShowScAdvForm(true)}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-orange-500 text-white text-sm font-semibold rounded-lg hover:bg-orange-600 shadow-sm whitespace-nowrap ml-auto">
                <Plus className="w-3.5 h-3.5" /> New SC Advance
              </button>
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              {loadingScAdv ? (
                <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" /></div>
              ) : scAdvances.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
                  <Send className="w-12 h-12 opacity-20" />
                  <p className="text-sm font-medium">No SC advances recorded yet</p>
                  <button onClick={() => setShowScAdvForm(true)} className="text-sm text-orange-600 hover:underline flex items-center gap-1">
                    <Plus className="w-3.5 h-3.5" /> Add first entry
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gradient-to-r from-slate-50 to-white border-b border-slate-200">
                        {['Date', 'Sub-Contractor & WO', 'Project', 'Amount', 'Payment', 'Remarks', ''].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {scAdvances.map((row, i) => (
                        <tr key={row.id} className={clsx('transition-colors group', i % 2 === 0 ? 'bg-white hover:bg-orange-50/30' : 'bg-slate-50/40 hover:bg-orange-50/30')}>
                          <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">{dayjs(row.advance_date).format('DD-MM-YYYY')}</td>
                          {/* Merged: Sub-Contractor + WO */}
                          <td className="px-4 py-3 max-w-[200px]">
                            <p className="font-semibold text-slate-800 truncate">{row.vendor_name}</p>
                            {row.wo_number && <p className="text-[10px] text-slate-400 font-mono mt-0.5">{row.wo_number}</p>}
                          </td>
                          <td className="px-4 py-3 text-slate-400 text-xs">{row.project_name || '—'}</td>
                          {/* Amount with accent */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-1.5 h-6 rounded-full bg-orange-400 flex-shrink-0" />
                              <span className="font-mono font-bold text-orange-600 text-base">{inr(row.amount)}</span>
                            </div>
                          </td>
                          {/* Merged: Mode + Ref */}
                          <td className="px-4 py-3">
                            <p className="text-xs font-semibold text-slate-600 capitalize">{PAYMENT_MODE_ICON[row.payment_mode] || '💵'} {(row.payment_mode || 'cash').replace('_', ' ')}</p>
                            {row.reference_number && <p className="text-[10px] text-slate-400 font-mono mt-0.5 truncate">{row.reference_number}</p>}
                          </td>
                          <td className="px-4 py-3 text-slate-400 text-xs max-w-[140px] truncate">{row.remarks || '—'}</td>
                          <td className="px-4 py-3">
                            <button onClick={() => { if (window.confirm('Delete this SC advance?')) deleteScAdvMut.mutate(row.id); }}
                              className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-md opacity-0 group-hover:opacity-100 transition-all">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-orange-50 border-t-2 border-orange-200">
                        <td colSpan={3} className="px-4 py-3 text-right text-xs font-bold text-orange-700 uppercase tracking-wider">Total ({scAdvances.length} entries)</td>
                        <td className="px-4 py-3 font-mono font-bold text-orange-600 text-lg">{inr(scTotal)}</td>
                        <td colSpan={3} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </div>
          );
        })()}

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
          existingInvoices={existingInvoices}
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
      {showScAdvForm && (
        <ScAdvanceForm
          projects={projects}
          defaultProjectId={projectId}
          onClose={() => setShowScAdvForm(false)}
        />
      )}
      {approvalModal && (
        <ApprovalModal
          entry={approvalModal.entry}
          mode={approvalModal.mode}
          onClose={() => setApprovalModal(null)}
          onConfirm={(remarks) => {
            const isApprove = approvalModal.mode === 'approve';
            patchStatusMut.mutate({
              id: approvalModal.entry.id,
              status: isApprove ? 'Approved' : 'Rejected',
              remarks: isApprove ? remarks : undefined,
              rejected_reason: !isApprove ? remarks : undefined,
            });
          }}
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
    const today = dayjs().format('DD-MM-YYYY');
    const entriesRows = entries.map(e =>
      `<tr><td>${dayjs(e.entry_date).format('DD-MM-YYYY')}</td><td>${e.supplier}</td><td>${(e.items || []).map(i => i.material_name).join(', ') || '–'}</td><td style="text-align:right">${fmt(e.amount)}</td></tr>`
    ).join('');
    const advRows = advances.map(a =>
      `<tr><td>${dayjs(a.advance_date).format('DD-MM-YYYY')}</td><td>${a.payee_name}</td><td>${a.description || '–'}</td><td style="text-align:right">${fmt(a.amount)}</td></tr>`
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
