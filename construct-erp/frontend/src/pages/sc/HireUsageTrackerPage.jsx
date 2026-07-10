// src/pages/sc/HireUsageTrackerPage.jsx — Hire / Rental Usage Tracker
// For equipment-hire Work Orders (cranes, forklifts, etc.) billed per usage
// category (Upto 3 Hours / After 3 Hours / For 1 Day...) across many invoices,
// recording both vendor-Invoiced and site-Certified hours before raising the
// actual bill — mirrors the manual tracking sheet used for this billing type.
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { hireLogAPI, scAPI } from '../../api/client';
import useAuthStore from '../../store/authStore';
import { PageHeader, Theme } from '../../theme';
import { Plus, X, Receipt, Trash2, CheckCircle2, Clock, Truck, Settings, Pencil, Paperclip, Upload, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import dayjs from 'dayjs';

const fmt = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const num = (v) => parseFloat(v || 0);
const inp = 'w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 transition';

// Detect if a group has the standard 3-tier crane structure (Shift / Hourly / Day)
function detectTiers(categories) {
  const shiftCat = categories.find(c => /shift/i.test(c.unit));
  const hrCat    = categories.find(c => /^hour/i.test(c.unit));
  const dayCat   = categories.find(c => /^day/i.test(c.unit));
  return shiftCat && hrCat && dayCat ? { shiftCat, hrCat, dayCat } : null;
}

// Apply tiered crane formula: ≤3 hrs→1 shift; >3&<8→1 shift+(hrs-3) hourly; ≥8→1 day
function computeTieredQty(totalHrs) {
  if (totalHrs <= 0) return { shift: 0, hr: 0, day: 0 };
  if (totalHrs >= 8) {
    const days = Math.floor(totalHrs / 8);
    const rem  = +(totalHrs % 8).toFixed(2);
    let shift = 0, hr = 0;
    if (rem > 0 && rem <= 3) shift = 1;
    else if (rem > 3) { shift = 1; hr = +(rem - 3).toFixed(2); }
    return { shift, hr, day: days };
  }
  if (totalHrs > 3) return { shift: 1, hr: +(totalHrs - 3).toFixed(2), day: 0 };
  return { shift: 1, hr: 0, day: 0 };
}

// ─── Entry Files Modal ──────────────────────────────────────────────────────
function EntryFilesModal({ wo, entry, onClose }) {
  const qc = useQueryClient();
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const { data: filesData, isLoading } = useQuery({
    queryKey: ['hire-log-files', entry.id],
    queryFn: () => hireLogAPI.listFiles(wo.id, entry.id).then(r => r.data?.data || []),
    staleTime: 30_000,
  });
  const files = filesData || [];

  const deleteMut = useMutation({
    mutationFn: (fid) => hireLogAPI.deleteFile(wo.id, entry.id, fid),
    onSuccess: () => { toast.success('Removed'); qc.invalidateQueries({ queryKey: ['hire-log-files', entry.id] }); },
    onError: () => toast.error('Failed to delete'),
  });

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    setUploading(true);
    try {
      await hireLogAPI.uploadFile(wo.id, entry.id, fd);
      toast.success('Log sheet uploaded');
      qc.invalidateQueries({ queryKey: ['hire-log-files', entry.id] });
    } catch {
      toast.error('Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const fileIcon = (type) => {
    if (!type) return '📄';
    if (type.includes('pdf')) return '📕';
    if (type.includes('image')) return '🖼️';
    return '📄';
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100"
          style={{ background: `linear-gradient(135deg, ${Theme.navy} 0%, #0f2a45 100%)` }}>
          <div>
            <h2 className="font-bold text-white text-sm flex items-center gap-2">
              <Paperclip className="w-4 h-4 text-white/70" /> Log Sheet Attachments
            </h2>
            <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.65)' }}>
              {entry.bill_no || 'Entry'} · {wo.wo_number}
            </p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-white" style={{ background: 'rgba(255,255,255,0.12)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-6 text-sm text-slate-400 text-center">Loading…</div>
          ) : files.length === 0 ? (
            <div className="p-8 text-center">
              <Paperclip className="w-8 h-8 text-slate-200 mx-auto mb-2" />
              <p className="text-sm text-slate-400">No log sheets attached yet</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {files.map(f => (
                <div key={f.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50/60 transition group">
                  <span className="text-lg flex-shrink-0">{fileIcon(f.file_type)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{f.file_name}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {f.file_size ? `${(f.file_size / 1024).toFixed(0)} KB` : ''}
                      {f.onedrive_web_url && <span className="ml-2 text-sky-500 font-medium">• OneDrive</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {f.onedrive_web_url ? (
                      <a href={f.onedrive_web_url} target="_blank" rel="noopener noreferrer"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-sky-600 hover:bg-sky-50 transition">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    ) : (
                      <a href={hireLogAPI.serveFile(wo.id, entry.id, f.id)} target="_blank" rel="noopener noreferrer"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                    <button onClick={() => {
                      if (!window.confirm(`Remove "${f.file_name}"?`)) return;
                      deleteMut.mutate(f.id);
                    }} className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition opacity-0 group-hover:opacity-100">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-slate-100 flex items-center justify-between">
          <div className="text-xs text-slate-400">{files.length} file{files.length !== 1 ? 's' : ''}</div>
          <div className="flex items-center gap-2">
            <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={handleFileChange} />
            <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold text-white transition disabled:opacity-60"
              style={{ background: Theme.navy }}>
              <Upload className="w-3.5 h-3.5" />
              {uploading ? 'Uploading…' : 'Upload Log Sheet'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Add/Edit Entry Modal ───────────────────────────────────────────────────
function EntryModal({ wo, equipmentGroups, onClose, entry, prefillHours }) {
  const isEdit = !!entry;
  const qc = useQueryClient();
  const [billNo, setBillNo]   = useState(entry?.bill_no || '');
  const [month, setMonth]     = useState(entry?.bill_month || '');
  const [date, setDate]       = useState(entry?.bill_date ? dayjs(entry.bill_date).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'));
  const [hours, setHours]     = useState(() => {
    if (prefillHours) return prefillHours;
    if (!entry) return {};
    const init = {};
    entry.lines.forEach(l => { init[l.wo_item_id] = { invoice: l.invoice_hours || '', certified: l.certified_hours || '' }; });
    return init;
  }); // wo_item_id -> { invoice, certified }
  const [groupHrs, setGroupHrs] = useState({}); // group name -> { invoice: '', certified: '' }

  const setHour = (itemId, field, value) =>
    setHours(prev => ({ ...prev, [itemId]: { ...prev[itemId], [field]: value } }));

  // When user enters total hours for a tiered group, auto-distribute into categories
  const applyTiered = (g, field, valStr) => {
    setGroupHrs(prev => ({ ...prev, [g.equipment_group]: { ...prev[g.equipment_group], [field]: valStr } }));
    const tiers = detectTiers(g.categories);
    if (!tiers) return;
    const { shiftCat, hrCat, dayCat } = tiers;
    const totalHrs = parseFloat(valStr) || 0;
    const qty = computeTieredQty(totalHrs);
    setHours(prev => ({
      ...prev,
      [shiftCat.id]: { ...prev[shiftCat.id], [field]: qty.shift || '' },
      [hrCat.id]:    { ...prev[hrCat.id],    [field]: qty.hr    || '' },
      [dayCat.id]:   { ...prev[dayCat.id],   [field]: qty.day   || '' },
    }));
  };

  // Compute preview billing amount for a tiered group
  const groupBillingPreview = (g) => {
    return g.categories.reduce((s, c) => {
      const qty = num(hours[c.id]?.certified);
      return qty > 0 ? s + qty * num(c.rate) : s;
    }, 0);
  };

  const saveMut = useMutation({
    mutationFn: () => {
      const payload = {
        bill_no: billNo, bill_month: month, bill_date: date,
        lines: Object.entries(hours).map(([wo_item_id, h]) => ({
          wo_item_id, invoice_hours: num(h.invoice), certified_hours: num(h.certified),
        })).filter(l => l.invoice_hours > 0 || l.certified_hours > 0),
      };
      return isEdit ? hireLogAPI.updateEntry(wo.id, entry.id, payload) : hireLogAPI.addEntry(wo.id, payload);
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Entry updated' : 'Entry added');
      qc.invalidateQueries({ queryKey: ['hire-log', wo.id] });
      onClose();
    },
    onError: e => toast.error(e?.response?.data?.error || `Failed to ${isEdit ? 'update' : 'add'} entry`),
  });

  const handleSave = () => {
    if (!date) return toast.error('Bill date is required');
    const hasAny = Object.values(hours).some(h => num(h?.invoice) > 0 || num(h?.certified) > 0);
    if (!hasAny) return toast.error('Enter at least one value');
    saveMut.mutate();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[88vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100"
          style={{ background: `linear-gradient(135deg, ${Theme.navy} 0%, ${Theme.navyDark} 100%)` }}>
          <div>
            <h2 className="font-bold text-white text-sm">{isEdit ? 'Edit Bill Entry' : 'Add Bill Entry'}</h2>
            <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.65)' }}>{wo.wo_number} · {wo.sc_name}</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-white" style={{ background: 'rgba(255,255,255,0.12)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Bill No.</label>
              <input className={inp} value={billNo} onChange={e => setBillNo(e.target.value)} placeholder="0761/1" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Month</label>
              <input className={inp} value={month} onChange={e => setMonth(e.target.value)} placeholder="Oct-25" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Date *</label>
              <input type="date" className={inp} value={date} onChange={e => setDate(e.target.value)} />
            </div>
          </div>

          {equipmentGroups.map(g => {
            const tiers = detectTiers(g.categories);
            const preview = groupBillingPreview(g);
            return (
              <div key={g.equipment_group}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold text-indigo-700">{g.equipment_group}</p>
                  {preview > 0 && (
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                      Bill: {fmt(preview)}
                    </span>
                  )}
                </div>

                {/* Tiered auto-compute row for crane/hydra equipment */}
                {tiers && (
                  <div className="mb-3 p-3 bg-indigo-50 border border-indigo-100 rounded-lg">
                    <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest mb-2">
                      Tiered Rate — Enter Total Deployed Hours (auto-splits Shift / Hourly / Day)
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[9px] text-slate-500 mb-1">Invoice Total Hours</label>
                        <input type="number" step="0.5" min="0" className={inp}
                          value={groupHrs[g.equipment_group]?.invoice || ''}
                          onChange={e => applyTiered(g, 'invoice', e.target.value)}
                          placeholder="e.g. 5.5" />
                      </div>
                      <div>
                        <label className="block text-[9px] text-slate-500 mb-1">Certified Total Hours</label>
                        <input type="number" step="0.5" min="0" className={inp}
                          value={groupHrs[g.equipment_group]?.certified || ''}
                          onChange={e => applyTiered(g, 'certified', e.target.value)}
                          placeholder="e.g. 5.5" />
                      </div>
                    </div>
                    <p className="text-[9px] text-indigo-400 mt-1.5">
                      ≤3 hrs → 1 Shift (₹{num(tiers.shiftCat.rate).toLocaleString('en-IN')}) &nbsp;·&nbsp;
                      &gt;3 hrs → Shift + extra hrs×₹{num(tiers.hrCat.rate).toLocaleString('en-IN')} &nbsp;·&nbsp;
                      ≥8 hrs → 1 Day (₹{num(tiers.dayCat.rate).toLocaleString('en-IN')})
                    </p>
                  </div>
                )}

                {/* Per-category breakdown (editable override) */}
                <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${g.categories.length}, 1fr)` }}>
                  {g.categories.map(c => (
                    <div key={c.id} className="border border-slate-200 rounded-lg p-2">
                      <p className="text-[10px] font-semibold text-slate-600 mb-1 leading-tight">{c.usage_category}</p>
                      <p className="text-[9px] text-indigo-500 font-bold mb-1.5">₹{num(c.rate).toLocaleString('en-IN')} / {c.unit}</p>
                      <label className="block text-[9px] text-slate-400">Invoice ({c.unit})</label>
                      <input type="number" step="0.01" className={clsx(inp, 'mb-1')}
                        value={hours[c.id]?.invoice || ''} onChange={e => setHour(c.id, 'invoice', e.target.value)} />
                      <label className="block text-[9px] text-slate-400">Certified ({c.unit})</label>
                      <input type="number" step="0.01" className={inp}
                        value={hours[c.id]?.certified || ''} onChange={e => setHour(c.id, 'certified', e.target.value)} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex justify-end gap-3 px-5 py-4 border-t bg-slate-50/60">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600">Cancel</button>
          <button onClick={handleSave} disabled={saveMut.isPending}
            className="px-5 py-2 text-white text-sm font-bold rounded-lg disabled:opacity-50"
            style={{ background: `linear-gradient(135deg, ${Theme.navyLight} 0%, ${Theme.navyDark} 100%)` }}>
            {saveMut.isPending ? 'Saving…' : 'Save Entry'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Equipment Group Table ──────────────────────────────────────────────────
function GroupTable({ wo, group, entries, totals, onRaiseBill, raisingId, onEdit, onDelete, onFilesClick }) {
  const cats = group.categories;
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
      <div className="px-4 py-2.5 flex items-center gap-2" style={{ background: `linear-gradient(90deg, ${Theme.navy} 0%, ${Theme.navyDark} 100%)` }}>
        <Truck className="w-3.5 h-3.5 text-white/80" />
        <span className="text-xs font-bold text-white">{wo.sc_name} — ({group.equipment_group})</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50">
              <th rowSpan={2} className="px-2 py-2 text-left font-bold text-slate-500 border-r border-slate-200">S.No</th>
              <th rowSpan={2} className="px-2 py-2 text-left font-bold text-slate-500 border-r border-slate-200">Bill No.</th>
              <th rowSpan={2} className="px-2 py-2 text-left font-bold text-slate-500 border-r border-slate-200">Month</th>
              <th rowSpan={2} className="px-2 py-2 text-left font-bold text-slate-500 border-r border-slate-200">Date</th>
              <th colSpan={cats.length} className="px-2 py-1.5 text-center font-bold text-slate-500 border-r border-b border-slate-200 bg-blue-50/60">Invoiced Qty (per unit)</th>
              <th colSpan={cats.length} className="px-2 py-1.5 text-center font-bold text-slate-500 border-b border-slate-200 bg-emerald-50/60">Certified Qty (per unit)</th>
              <th rowSpan={2} className="px-2 py-2 text-center font-bold text-slate-500">Action</th>
            </tr>
            <tr className="bg-slate-50">
              {cats.map(c => <th key={`inv-${c.id}`} className="px-2 py-1.5 text-right font-medium text-slate-400 border-r border-slate-100 whitespace-nowrap bg-blue-50/30">{c.usage_category} <span className="text-slate-300">({c.unit})</span></th>)}
              {cats.map(c => <th key={`cert-${c.id}`} className="px-2 py-1.5 text-right font-medium text-slate-400 border-r border-slate-100 whitespace-nowrap bg-emerald-50/30">{c.usage_category} <span className="text-slate-300">({c.unit})</span></th>)}
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => {
              const lineByItem = new Map(e.lines.map(l => [l.wo_item_id, l]));
              return (
                <tr key={e.id} className={clsx('border-t border-slate-100', i % 2 === 0 ? 'bg-white' : 'bg-slate-50/30')}>
                  <td className="px-2 py-2 text-slate-400 border-r border-slate-50">{i + 1}</td>
                  <td className="px-2 py-2 font-mono text-indigo-700 border-r border-slate-50">{e.bill_no || '—'}</td>
                  <td className="px-2 py-2 border-r border-slate-50">{e.bill_month || '—'}</td>
                  <td className="px-2 py-2 border-r border-slate-50 whitespace-nowrap">{e.bill_date ? dayjs(e.bill_date).format('DD-MMM-YY') : '—'}</td>
                  {cats.map(c => (
                    <td key={`inv-${c.id}`} className="px-2 py-2 text-right border-r border-slate-50">
                      {num(lineByItem.get(c.id)?.invoice_hours) > 0 ? num(lineByItem.get(c.id)?.invoice_hours).toFixed(2) : '-'}
                    </td>
                  ))}
                  {cats.map(c => (
                    <td key={`cert-${c.id}`} className="px-2 py-2 text-right border-r border-slate-50 font-semibold text-emerald-700">
                      {num(lineByItem.get(c.id)?.certified_hours) > 0 ? num(lineByItem.get(c.id)?.certified_hours).toFixed(2) : '-'}
                    </td>
                  ))}
                  <td className="px-2 py-2 text-center">
                    {e.status === 'billed' ? (
                      <div className="flex items-center justify-center gap-1">
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                          <CheckCircle2 className="w-3 h-3" /> {e.sc_bill_number || 'Billed'}
                        </span>
                        <button onClick={() => onFilesClick(e)} title="Attach log sheets"
                          className="p-1.5 text-slate-400 hover:text-sky-600 hover:bg-sky-50 rounded-lg">
                          <Paperclip className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => onRaiseBill(e)} disabled={raisingId === e.id}
                          className="inline-flex items-center gap-1 text-[10px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 px-2 py-1 rounded-lg">
                          <Receipt className="w-3 h-3" /> {raisingId === e.id ? '…' : 'Raise Bill'}
                        </button>
                        <button onClick={() => onEdit(e)} title="Edit entry"
                          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg">
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button onClick={() => onFilesClick(e)} title="Attach log sheets"
                          className="p-1.5 text-slate-400 hover:text-sky-600 hover:bg-sky-50 rounded-lg">
                          <Paperclip className="w-3 h-3" />
                        </button>
                        <button onClick={() => onDelete(e)} title="Delete entry"
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {entries.length === 0 && (
              <tr><td colSpan={4 + cats.length * 2 + 1} className="px-4 py-6 text-center text-slate-400">No bill entries yet for this equipment.</td></tr>
            )}
            {/* Totals row */}
            <tr className="border-t-2 border-slate-300 bg-slate-50 font-bold">
              <td colSpan={4} className="px-2 py-2 text-right text-slate-600 uppercase text-[10px] tracking-wider border-r border-slate-200">Total Qty</td>
              {cats.map(c => (
                <td key={`tinv-${c.id}`} className="px-2 py-2 text-right text-slate-500 border-r border-slate-100">
                  {num(totals[c.id]?.invoice_hours).toFixed(2)}
                </td>
              ))}
              {cats.map(c => (
                <td key={`tcert-${c.id}`} className="px-2 py-2 text-right text-emerald-700 border-r border-slate-100">
                  {num(totals[c.id]?.certified_hours).toFixed(2)}
                </td>
              ))}
              <td />
            </tr>
            {/* Billing amount totals row */}
            <tr className="border-t border-slate-200 bg-indigo-50/40">
              <td colSpan={4} className="px-2 py-2 text-right text-indigo-700 uppercase text-[10px] font-bold tracking-wider border-r border-slate-200">Certified Bill (cert×rate)</td>
              {cats.map(c => <td key={`binv-${c.id}`} className="border-r border-slate-100" />)}
              {cats.map(c => {
                const certQty = num(totals[c.id]?.certified_hours);
                const certAmt = certQty * num(c.rate);
                return (
                  <td key={`bcert-${c.id}`} className="px-2 py-2 text-right text-indigo-700 font-bold text-[10px] border-r border-slate-100">
                    {certQty > 0 ? fmt(certAmt) : '—'}
                  </td>
                );
              })}
              <td />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Daily Log Section ───────────────────────────────────────────────────────
function DailyLogSection({ wo, equipmentGroups, onCreateBill }) {
  const qc = useQueryClient();
  const allCats = equipmentGroups.flatMap(g => g.categories);

  const [showAddRow, setShowAddRow] = useState(false);
  const [newDate,    setNewDate]    = useState(dayjs().format('YYYY-MM-DD'));
  const [newItemId,  setNewItemId]  = useState('');
  const [newQty,     setNewQty]     = useState('');
  const [newNotes,   setNewNotes]   = useState('');

  const { data: raw = [] } = useQuery({
    queryKey: ['hire-daily-log', wo.id],
    queryFn: () => hireLogAPI.listDailyLog(wo.id).then(r => r.data?.data || []),
    staleTime: 0,
  });

  const addMut = useMutation({
    mutationFn: (d) => hireLogAPI.addDailyEntry(wo.id, d),
    onSuccess: () => {
      toast.success('Day recorded');
      qc.invalidateQueries({ queryKey: ['hire-daily-log', wo.id] });
      setShowAddRow(false);
      setNewQty(''); setNewNotes('');
    },
    onError: e => toast.error(e?.response?.data?.error || 'Failed'),
  });

  const delMut = useMutation({
    mutationFn: (id) => hireLogAPI.deleteDailyEntry(wo.id, id),
    onSuccess: () => { toast.success('Deleted'); qc.invalidateQueries({ queryKey: ['hire-daily-log', wo.id] }); },
    onError: () => toast.error('Failed to delete'),
  });

  const handleAdd = () => {
    if (!newDate || !newItemId || !newQty) return toast.error('Date, equipment and qty are required');
    addMut.mutate({ work_date: newDate, wo_item_id: newItemId, qty: parseFloat(newQty), notes: newNotes });
  };

  // Totals per item_id
  const totalsPerItem = {};
  raw.forEach(r => {
    totalsPerItem[r.wo_item_id] = (totalsPerItem[r.wo_item_id] || 0) + parseFloat(r.qty || 0);
  });

  const handleCreateBill = () => {
    const pf = {};
    Object.entries(totalsPerItem).forEach(([itemId, total]) => {
      pf[itemId] = { invoice: String(total), certified: String(total) };
    });
    onCreateBill(pf);
  };

  // Group by date
  const grouped = {};
  raw.forEach(r => {
    const d = (r.work_date || '').split('T')[0];
    if (!grouped[d]) grouped[d] = [];
    grouped[d].push(r);
  });
  const dates = Object.keys(grouped).sort();
  const totalDays = dates.length;

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
        <div className="flex items-center gap-2">
          <span className="font-bold text-sm text-slate-700">Daily Usage Log</span>
          {raw.length > 0 && (
            <span className="text-xs bg-indigo-100 text-indigo-700 font-bold px-2 py-0.5 rounded-full">
              {raw.length} records · {totalDays} day{totalDays !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          {Object.keys(totalsPerItem).length > 0 && (
            <button onClick={handleCreateBill}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition">
              <Receipt className="w-3.5 h-3.5" /> Create Bill from Log
            </button>
          )}
          <button onClick={() => setShowAddRow(v => !v)}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold border border-slate-200 bg-white text-slate-700 rounded-lg hover:bg-slate-50 transition">
            <Plus className="w-3.5 h-3.5" /> Add Day
          </button>
        </div>
      </div>

      {/* Add Row form */}
      {showAddRow && (
        <div className="px-4 py-3 bg-indigo-50/60 border-b border-indigo-100 flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Date *</label>
            <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)}
              className={inp} style={{ minWidth: 130 }} />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Equipment / Category *</label>
            <select value={newItemId} onChange={e => setNewItemId(e.target.value)}
              className={inp} style={{ minWidth: 220 }}>
              <option value="">— select —</option>
              {equipmentGroups.map(g => (
                <optgroup key={g.equipment_group} label={g.equipment_group}>
                  {g.categories.map(c => (
                    <option key={c.id} value={c.id}>{c.usage_category} ({c.unit})</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Hours *</label>
            <input type="number" step="0.5" min="0" value={newQty} onChange={e => setNewQty(e.target.value)}
              className={inp} style={{ width: 80 }} placeholder="e.g. 5.5" />
          </div>
          <div className="flex-1" style={{ minWidth: 140 }}>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Notes</label>
            <input type="text" value={newNotes} onChange={e => setNewNotes(e.target.value)}
              className={inp} placeholder="e.g. Debris removal" />
          </div>
          <div className="flex gap-2 pb-0.5">
            <button onClick={handleAdd} disabled={addMut.isPending}
              className="px-3 py-1.5 text-xs font-bold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition">
              {addMut.isPending ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => setShowAddRow(false)}
              className="px-3 py-1.5 text-xs font-bold border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Log table */}
      {raw.length === 0 ? (
        <div className="p-8 text-center text-slate-400 text-sm">
          No daily records yet — click <b>Add Day</b> to record usage date by date like a log sheet.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-white">
                  <th className="text-left px-3 py-2 font-semibold text-slate-400 uppercase tracking-wider w-32">Date</th>
                  <th className="text-left px-3 py-2 font-semibold text-slate-400 uppercase tracking-wider">Equipment Group</th>
                  <th className="text-left px-3 py-2 font-semibold text-slate-400 uppercase tracking-wider">Category</th>
                  <th className="text-right px-3 py-2 font-semibold text-slate-400 uppercase tracking-wider w-24">Hours</th>
                  <th className="text-left px-3 py-2 font-semibold text-slate-400 uppercase tracking-wider">Notes</th>
                  <th className="w-8 px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {dates.map(d => (
                  grouped[d].map((r, i) => (
                    <tr key={r.id} className={clsx('border-b border-slate-50', i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40')}>
                      {i === 0 && (
                        <td rowSpan={grouped[d].length}
                          className="px-3 py-2 font-bold text-slate-800 border-r border-slate-100 align-top whitespace-nowrap">
                          {dayjs(d).format('DD MMM YYYY')}
                          <div className="text-[10px] font-normal text-slate-400">{dayjs(d).format('dddd')}</div>
                        </td>
                      )}
                      <td className="px-3 py-2 text-slate-700 font-medium">{r.equipment_group}</td>
                      <td className="px-3 py-2 text-slate-500">{r.usage_category}</td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-indigo-700">
                        {num(r.qty).toFixed(2)} <span className="text-slate-400 font-normal">{r.item_unit}</span>
                      </td>
                      <td className="px-3 py-2 text-slate-400 italic">{r.notes || '—'}</td>
                      <td className="px-2 py-2 text-center">
                        <button
                          onClick={() => { if (window.confirm('Delete this record?')) delMut.mutate(r.id); }}
                          className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  ))
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 bg-slate-50">
                  <td colSpan={3} className="px-3 py-2 text-right text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                    Totals ({totalDays} days)
                  </td>
                  <td colSpan={3} className="px-3 py-2">
                    <div className="flex flex-wrap gap-4">
                      {allCats.filter(c => totalsPerItem[c.id]).map(c => (
                        <span key={c.id} className="text-xs font-bold text-indigo-700">
                          {c.equipment_group} — {c.usage_category}:&nbsp;
                          {num(totalsPerItem[c.id]).toFixed(2)} {c.unit}
                          {c.rate ? <span className="text-emerald-700"> → {fmt(num(totalsPerItem[c.id]) * num(c.rate))}</span> : ''}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Setup WO Modal — tag items with equipment_group + usage_category ──────────
const UNIT_OPTIONS = ['Shift', 'Hours', 'Day'];

function SetupWOModal({ onClose, onDone }) {
  const qc = useQueryClient();
  const [selectedWoId, setSelectedWoId] = useState('');
  const [tags, setTags] = useState({}); // itemId -> { equipment_group, usage_category, category_order }
  const [saving, setSaving] = useState(false);

  const { data: allWOs = [], isLoading: wosLoading } = useQuery({
    queryKey: ['sc-wos-for-setup'],
    queryFn: () => scAPI.listWO().then(r => r.data?.data || r.data || []),
  });

  const { data: woDetail, isLoading: detailLoading } = useQuery({
    queryKey: ['sc-wo-detail-setup', selectedWoId],
    queryFn: () => scAPI.getWO(selectedWoId).then(r => r.data?.data || r.data),
    enabled: !!selectedWoId,
  });

  const items = woDetail?.items || [];

  useEffect(() => {
    if (!items.length) return;
    const init = {};
    items.forEach(it => {
      init[it.id] = {
        equipment_group: it.equipment_group || '',
        usage_category:  it.usage_category  || '',
        category_order:  it.category_order  != null ? it.category_order : 0,
      };
    });
    setTags(init);
  }, [woDetail]);

  const setTag = (id, field, val) =>
    setTags(prev => ({ ...prev, [id]: { ...prev[id], [field]: val } }));

  const handleSave = async () => {
    if (!selectedWoId) return;
    setSaving(true);
    try {
      const toSave = items.filter(it => tags[it.id]?.equipment_group && tags[it.id]?.usage_category);
      await Promise.all(toSave.map(it =>
        hireLogAPI.categorizeItem(selectedWoId, it.id, tags[it.id])
      ));
      qc.invalidateQueries({ queryKey: ['hire-log-wos'] });
      onDone(selectedWoId);
      onClose();
    } catch (e) {
      alert(e?.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[88vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100"
          style={{ background: `linear-gradient(135deg, ${Theme.navy} 0%, ${Theme.navyDark} 100%)` }}>
          <div>
            <h2 className="font-bold text-white text-sm">Setup WO for Hire Tracker</h2>
            <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.65)' }}>Tag each WO line with an equipment group + usage category</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-white" style={{ background: 'rgba(255,255,255,0.12)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* WO selector */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Select Work Order</label>
            <select className={inp} value={selectedWoId} onChange={e => setSelectedWoId(e.target.value)}>
              <option value="">— Select a work order —</option>
              {allWOs.map(w => (
                <option key={w.id} value={w.id}>{w.wo_number} · {w.sc_name || w.subject}</option>
              ))}
            </select>
          </div>

          {detailLoading && <p className="text-xs text-slate-400 animate-pulse">Loading items…</p>}

          {items.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                Tag items — Equipment Group + Usage Category (leave blank to skip)
              </p>
              <div className="space-y-2">
                {items.map((it, idx) => (
                  <div key={it.id} className="border border-slate-200 rounded-xl p-3 bg-slate-50/50">
                    <p className="text-xs font-semibold text-slate-700 mb-2">
                      <span className="text-slate-400 mr-1.5">#{idx + 1}</span>
                      {it.description}
                      <span className="ml-2 text-[10px] text-indigo-500">{it.unit} · ₹{Number(it.rate || 0).toLocaleString('en-IN')}</span>
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[9px] text-slate-400 mb-0.5">Equipment Group</label>
                        <input className={inp} placeholder="e.g. Hydra Crane (12 Ton)"
                          value={tags[it.id]?.equipment_group || ''}
                          onChange={e => setTag(it.id, 'equipment_group', e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-[9px] text-slate-400 mb-0.5">Usage Category</label>
                        <input className={inp} placeholder="e.g. Min 3 Hrs Shift"
                          value={tags[it.id]?.usage_category || ''}
                          onChange={e => setTag(it.id, 'usage_category', e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-[9px] text-slate-400 mb-0.5">Sort Order</label>
                        <input type="number" className={inp} min="0"
                          value={tags[it.id]?.category_order ?? 0}
                          onChange={e => setTag(it.id, 'category_order', Number(e.target.value))} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-slate-400 mt-2">
                Tip: Use the same Equipment Group name for all rates of the same machine (e.g. all 3 Hydra Crane lines → "Hydra Crane (12 Ton)"). Sort order: Shift=1, Hours=2, Day=3.
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 px-5 py-4 border-t bg-slate-50/60">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600">Cancel</button>
          <button onClick={handleSave} disabled={saving || !selectedWoId || !items.length}
            className="px-5 py-2 text-white text-sm font-bold rounded-lg disabled:opacity-50"
            style={{ background: `linear-gradient(135deg, ${Theme.navyLight} 0%, ${Theme.navyDark} 100%)` }}>
            {saving ? 'Saving…' : 'Save & Use This WO'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function HireUsageTrackerPage() {
  const qc = useQueryClient();
  const { selectedProjectId } = useAuthStore();
  const [woId, setWoId] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [filesEntry, setFilesEntry] = useState(null);
  const [showSetup, setShowSetup] = useState(false);
  const [raisingId,       setRaisingId]      = useState(null);
  const [raisingCombined, setRaisingCombined] = useState(false);
  const [prefillHours,    setPrefillHours]    = useState(null); // from DailyLogSection → EntryModal

  // Reset selected WO when project changes
  useEffect(() => { setWoId(''); }, [selectedProjectId]);

  const { data: wos = [] } = useQuery({
    queryKey: ['hire-log-wos', selectedProjectId],
    queryFn: () => hireLogAPI.listWOs(selectedProjectId).then(r => r.data?.data || []),
  });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['hire-log', woId],
    queryFn: () => hireLogAPI.get(woId).then(r => r.data?.data),
    enabled: !!woId,
    staleTime: 0,
  });

  const wo = data?.wo;
  const equipmentGroups = data?.equipmentGroups || [];
  const entries = data?.entries || [];
  const totals = data?.totals || {};

  const raiseBill = async (filteredEntry) => {
    // GroupTable passes a filtered entry (only lines for that group).
    // Look up the FULL entry so all equipment groups are included in the bill.
    const entry = entries.find(e => e.id === filteredEntry.id) || filteredEntry;
    setRaisingId(entry.id);
    try {
      const allCats = equipmentGroups.flatMap(g => g.categories);
      const items = entry.lines
        .filter(l => num(l.certified_hours) > 0)
        .map(l => {
          const item = allCats.find(c => c.id === l.wo_item_id);
          return {
            wo_item_id: l.wo_item_id,
            description: item ? `${item.equipment_group} — ${item.usage_category}` : 'Hire item',
            unit: item?.unit, wo_qty: item?.qty, prev_qty: item?.billed_qty,
            curr_qty: num(l.certified_hours), balance_qty: Math.max(0, num(item?.balance_qty) - num(l.certified_hours)),
            rate: num(item?.rate),
          };
        });
      if (!items.length) { toast.error('No certified hours to bill on this entry'); return; }
      const grossAmount = items.reduce((s, it) => s + it.curr_qty * it.rate, 0);

      const res = await scAPI.createBill({
        wo_id: woId, bill_type: 'ra',
        bill_date: entry.bill_date || dayjs().format('YYYY-MM-DD'),
        description: `Hire bill ${entry.bill_no || ''} (${entry.bill_month || ''})`,
        gross_amount: grossAmount, gst_pct: num(wo?.gst_pct ?? 18), tds_pct: num(wo?.tds_pct), retention_pct: num(wo?.retention_pct),
        items,
      });
      const newBill = res.data?.data;
      await hireLogAPI.markBilled(woId, entry.id, newBill.id);
      toast.success(`Bill ${newBill.bill_number} created — ${fmt(newBill.net_payable)}`);
      qc.invalidateQueries({ queryKey: ['hire-log', woId] });
      qc.invalidateQueries({ queryKey: ['sc-bills'] });
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Failed to raise bill');
    } finally {
      setRaisingId(null);
    }
  };

  // Combine ALL unbilled entries for the WO into one bill
  const raiseCombinedBill = async () => {
    const unbilled = entries.filter(e => e.status !== 'billed');
    if (!unbilled.length) { toast.error('All entries are already billed'); return; }

    setRaisingCombined(true);
    try {
      const allCats = equipmentGroups.flatMap(g => g.categories);
      // Aggregate certified hours per wo_item_id across all unbilled entries
      const qtyMap = {};
      for (const e of unbilled) {
        for (const l of e.lines) {
          const hrs = num(l.certified_hours);
          if (hrs <= 0) continue;
          if (!qtyMap[l.wo_item_id]) qtyMap[l.wo_item_id] = 0;
          qtyMap[l.wo_item_id] += hrs;
        }
      }
      const items = Object.entries(qtyMap).map(([wo_item_id, curr_qty]) => {
        const item = allCats.find(c => c.id === wo_item_id);
        return {
          wo_item_id,
          description: item ? `${item.equipment_group} — ${item.usage_category}` : 'Hire item',
          unit: item?.unit, wo_qty: item?.qty, prev_qty: item?.billed_qty,
          curr_qty, balance_qty: Math.max(0, num(item?.balance_qty) - curr_qty),
          rate: num(item?.rate),
        };
      });
      if (!items.length) { toast.error('No certified hours found in unbilled entries'); return; }

      const grossAmount = items.reduce((s, it) => s + it.curr_qty * num(it.rate), 0);
      const billDate = unbilled[unbilled.length - 1]?.bill_date || dayjs().format('YYYY-MM-DD');
      const months = [...new Set(unbilled.map(e => e.bill_month).filter(Boolean))].join(', ');

      const res = await scAPI.createBill({
        wo_id: woId, bill_type: 'ra',
        bill_date: billDate,
        description: `Hire bill — Combined (${months || unbilled.length + ' entries'})`,
        gross_amount: grossAmount,
        gst_pct: num(wo?.gst_pct ?? 18),
        tds_pct: num(wo?.tds_pct),
        retention_pct: num(wo?.retention_pct),
        items,
      });
      const newBill = res.data?.data;

      // Mark all unbilled entries as billed against this one bill
      await Promise.all(unbilled.map(e => hireLogAPI.markBilled(woId, e.id, newBill.id)));

      toast.success(`Combined bill ${newBill.bill_number} created — ${fmt(newBill.net_payable)} (${unbilled.length} entries merged)`);
      qc.invalidateQueries({ queryKey: ['hire-log', woId] });
      qc.invalidateQueries({ queryKey: ['sc-bills'] });
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Failed to raise combined bill');
    } finally {
      setRaisingCombined(false);
    }
  };

  const deleteEntry = async (entry) => {
    if (!window.confirm('Delete this entry?')) return;
    try {
      await hireLogAPI.deleteEntry(woId, entry.id);
      toast.success('Entry deleted');
      qc.invalidateQueries({ queryKey: ['hire-log', woId] });
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Failed to delete entry');
    }
  };

  return (
    <div style={{ background: Theme.pageBg, minHeight: '100vh' }}>
      <PageHeader
        title="Hire / Rental Usage Tracker"
        subtitle="Track Invoiced vs Certified hours per usage category, then raise the bill"
        breadcrumbs={[{ label: 'Subcontractors' }, { label: 'Hire Usage Tracker' }]}
        actions={
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setShowSetup(true)}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg transition shadow-sm"
              style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)' }}>
              <Settings className="w-3.5 h-3.5" /> Setup WO
            </button>
            {wo && entries.some(e => e.status !== 'billed') && (
              <button
                onClick={raiseCombinedBill}
                disabled={raisingCombined}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg transition shadow-sm disabled:opacity-60"
                style={{ background: '#10b981', color: '#fff' }}>
                <Receipt className="w-3.5 h-3.5" />
                {raisingCombined ? 'Creating…' : `Raise Combined Bill (${entries.filter(e => e.status !== 'billed').length} entries)`}
              </button>
            )}
            {wo && (
              <button onClick={() => setShowAdd(true)}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg transition shadow-sm"
                style={{ background: '#fff', color: Theme.navyDark }}>
                <Plus className="w-3.5 h-3.5" /> Add Bill Entry
              </button>
            )}
          </div>
        }
      />

      <div className="p-5 md:p-6 max-w-[1400px] mx-auto space-y-5">
        <div className="bg-white border border-slate-200 rounded-xl px-5 py-4 shadow-sm">
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Work Order</label>
          <select value={woId} onChange={e => setWoId(e.target.value)}
            className="w-full max-w-xl border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-300">
            <option value="">— Select a hire/rental work order —</option>
            {wos.map(w => (
              <option key={w.id} value={w.id}>{w.wo_number} · {w.sc_name} · {w.project_name}</option>
            ))}
          </select>
          {wos.length === 0 && (
            <div className="mt-2 flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <p className="text-xs text-amber-700 flex-1">
                No work orders set up yet. Click <b>Setup WO</b> (top right) to tag a WO's items with equipment groups and usage categories.
              </p>
              <button onClick={() => setShowSetup(true)}
                className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg bg-amber-600 text-white hover:bg-amber-700">
                <Settings className="w-3 h-3" /> Setup WO
              </button>
            </div>
          )}
        </div>

        {!woId ? null : isLoading ? (
          <div className="space-y-3">{[1, 2].map(n => <div key={n} className="h-40 bg-slate-100 rounded-xl animate-pulse" />)}</div>
        ) : equipmentGroups.length === 0 ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-sm text-amber-700">
            This work order has no categorized items yet.
          </div>
        ) : (
          <>
            {/* Daily log sheet — enter day-by-day records */}
            <DailyLogSection
              wo={wo}
              equipmentGroups={equipmentGroups}
              onCreateBill={(pf) => { setPrefillHours(pf); setShowAdd(true); }}
            />

            {/* Bill entries grouped by equipment */}
            {equipmentGroups.map(g => (
              <GroupTable
                key={g.equipment_group}
                wo={wo}
                group={g}
                entries={entries.map(e => ({ ...e, lines: e.lines.filter(l => g.categories.some(c => c.id === l.wo_item_id)) }))}
                totals={totals}
                onRaiseBill={raiseBill}
                raisingId={raisingId}
                onEdit={setEditingEntry}
                onDelete={deleteEntry}
                onFilesClick={setFilesEntry}
              />
            ))}
          </>
        )}
      </div>

      {editingEntry && wo && (
        <EntryModal wo={wo} equipmentGroups={equipmentGroups} entry={editingEntry} onClose={() => setEditingEntry(null)} />
      )}

      {filesEntry && wo && (
        <EntryFilesModal wo={wo} entry={filesEntry} onClose={() => setFilesEntry(null)} />
      )}

      {showAdd && wo && (
        <EntryModal
          wo={wo}
          equipmentGroups={equipmentGroups}
          prefillHours={prefillHours || undefined}
          onClose={() => { setShowAdd(false); setPrefillHours(null); }}
        />
      )}
      {showSetup && (
        <SetupWOModal
          onClose={() => setShowSetup(false)}
          onDone={(id) => { setWoId(id); }}
        />
      )}
    </div>
  );
}
