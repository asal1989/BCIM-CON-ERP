// src/pages/stores/StoreLedgerPage.jsx
import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BookOpen, TrendingUp, TrendingDown, Search, Filter,
  AlertTriangle, Package, Loader2, Edit2, Check, X,
  IndianRupee, ChevronRight, Upload, FileSpreadsheet,
  CheckCircle2, AlertCircle, ArrowRight, BarChart2,
  Calendar, RefreshCw, Download, Printer, FileText
} from 'lucide-react';
import { clsx } from 'clsx';
import dayjs from 'dayjs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { inventoryAPI, projectAPI } from '../../api/client';
import { PageHeader, Theme } from '../../theme';
import useAuthStore from '../../store/authStore';
import toast from 'react-hot-toast';
import { CONSTRUCTION_UNITS as STORE_UNITS } from '../../constants/units';

const GST_RATE = 0.18;
const DEFAULT_CATEGORIES = ['Masonry Works'];

/* ── helpers ─────────────────────────────────────────────────── */
const inr = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qty = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
const fmt2 = (n) => Number(n || 0).toFixed(2);
// Round stock quantities to 3 decimal places to match the qty() display precision.
// Prevents floating-point residuals (e.g. 0.0004 bags) from showing "0" qty but a non-zero value.
const rq3 = (n) => Math.round(parseFloat(n || 0) * 1000) / 1000;

/* ── Mini bar (for Monthly Movement) ────────────────────────── */
function MiniBar({ value, max, color = 'bg-indigo-400' }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
      <div className={clsx('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

const TYPE_CONFIG = {
  grn:          { label: 'Receipt',      icon: TrendingUp,   color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-100', sign: '+' },
  issue:        { label: 'Issue',        icon: TrendingDown, color: 'text-rose-600',    bg: 'bg-rose-50 border-rose-100',       sign: '−' },
  transfer_in:  { label: 'Transfer In',  icon: TrendingUp,   color: 'text-indigo-600',  bg: 'bg-indigo-50 border-indigo-100',   sign: '+' },
  transfer_out: { label: 'Transfer Out', icon: TrendingDown, color: 'text-fuchsia-600', bg: 'bg-fuchsia-50 border-fuchsia-100', sign: '−' },
  adjustment:   { label: 'Adjustment',   icon: TrendingDown, color: 'text-amber-600',   bg: 'bg-amber-50 border-amber-100',     sign: '±' },
};

function stockStatus(closing, minStock, reorder) {
  const c = parseFloat(closing) || 0;
  const m = parseFloat(minStock) || 0;
  const r = parseFloat(reorder) || 0;
  if (c <= 0)            return { label: 'Out of Stock', cls: 'bg-red-50 text-red-600 border-red-100' };
  if (m > 0 && c <= m)   return { label: 'Critical Low', cls: 'bg-red-50 text-red-600 border-red-100' };
  if (r > 0 && c <= r)   return { label: 'Reorder',      cls: 'bg-amber-50 text-amber-600 border-amber-100' };
  return                          { label: 'Adequate',    cls: 'bg-emerald-50 text-emerald-600 border-emerald-100' };
}

/* ── Inline edit cell ─────────────────────────────────────────── */
const TONE = {
  navy:   { wrap: 'border-slate-200 bg-white',       icon: 'bg-slate-900 text-white', value: 'text-slate-950', sub: 'text-slate-500' },
  blue:   { wrap: 'border-blue-100 bg-blue-50/70',   icon: 'bg-blue-600 text-white',  value: 'text-blue-950',  sub: 'text-blue-700' },
  teal:   { wrap: 'border-teal-100 bg-teal-50/70',   icon: 'bg-teal-600 text-white',  value: 'text-teal-950',  sub: 'text-teal-700' },
  amber:  { wrap: 'border-amber-100 bg-amber-50/80', icon: 'bg-amber-500 text-white', value: 'text-amber-950', sub: 'text-amber-700' },
  danger: { wrap: 'border-rose-100 bg-rose-50/80',   icon: 'bg-rose-600 text-white',  value: 'text-rose-950',  sub: 'text-rose-700' },
};

function MetricCard({ icon: Icon, label, value, sub, tone = 'navy' }) {
  const t = TONE[tone] || TONE.navy;
  return (
    <div className={clsx('rounded-lg border px-3 py-2 shadow-sm transition hover:shadow-md', t.wrap)}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</p>
          <p className={clsx('text-lg font-black leading-tight tracking-tight', t.value)}>{value}</p>
        </div>
        <div className={clsx('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg shadow-sm', t.icon)}>
          <Icon size={15} />
        </div>
      </div>
    </div>
  );
}

function SegmentTabs({ value, onChange, tabs }) {
  return (
    <div className="w-full overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
      <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm min-w-max">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={clsx(
              'flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-bold transition whitespace-nowrap',
              value === key ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-700 hover:bg-slate-100 hover:text-slate-950'
            )}
          >
            {Icon && <Icon size={15} />}
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function EditableCell({ value, onSave, prefix, numeric, placeholder }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value ?? '');

  const commit = () => {
    setEditing(false);
    if (val !== (value ?? '')) onSave(val);
  };

  if (editing) return (
    <div className="flex items-center gap-1">
      {prefix && <span className="text-slate-900 font-medium text-xs">{prefix}</span>}
      <input
        autoFocus
        type={numeric ? 'number' : 'text'}
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
        className="w-24 border border-blue-400 rounded px-1.5 py-0.5 text-xs focus:outline-none"
      />
      <button onClick={commit} className="text-emerald-600 hover:text-emerald-700"><Check size={12} /></button>
      <button onClick={() => setEditing(false)} className="text-slate-900 font-medium hover:text-slate-600"><X size={12} /></button>
    </div>
  );

  return (
    <button
      onClick={() => { setVal(value ?? ''); setEditing(true); }}
      className="flex items-center gap-1 group text-left"
    >
      <span className={clsx('text-[13px]', value ? 'text-slate-900 font-medium tracking-tight' : 'text-slate-900 font-medium italic')}>
        {value ? `${prefix || ''}${value}` : (placeholder || '—')}
      </span>
      <Edit2 size={10} className="text-slate-300 group-hover:text-blue-400 transition opacity-0 group-hover:opacity-100" />
    </button>
  );
}

function UnitSelectCell({ value, onSave }) {
  return (
    <select
      value={value || ''}
      onChange={(e) => onSave(e.target.value)}
      className="h-8 min-w-[86px] rounded-lg border border-slate-200 bg-slate-50 px-2 text-center text-xs font-black uppercase text-slate-950 outline-none transition focus:border-slate-900 focus:bg-white"
    >
      <option value="">Unit</option>
      {STORE_UNITS.map(unit => <option key={unit} value={unit}>{unit}</option>)}
    </select>
  );
}

/* ── Import Modal ────────────────────────────────────────────── */
function downloadImportTemplate() {
  const headers = ['Category', 'Major Head', 'MATERIAL DESCRIPTION', 'Unit', 'DC/IDC', 'OPENING STOCK', 'CLOSING STOCK', 'RATE', 'Remarks'];
  const samples = [
    ['Cement', 'MATERIAL', 'OPC 53 Grade Cement', 'Bags', 'DC', '500', '320', '380', ''],
    ['Steel', 'MATERIAL', '8mm dia TMT Bar Fe500', 'MT', 'DC', '12.5', '8.2', '58000', ''],
    ['Steel', 'MATERIAL', '12mm dia TMT Bar Fe500', 'MT', 'DC', '8.0', '5.5', '58500', ''],
    ['Aggregate', 'MATERIAL', '20mm Crushed Stone', 'CUM', 'DC', '50', '30', '1200', ''],
    ['Sand', 'MATERIAL', 'M-Sand / River Sand', 'CUM', 'DC', '40', '22', '900', ''],
    ['Electrical', 'MATERIAL', 'Binding Wire Coil', 'Coils', 'IDC', '25', '18', '950', ''],
  ];
  const csv = [headers, ...samples].map(row => row.map(c => `"${c}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a'); a.href = url; a.download = 'Store_Ledger_Template.csv'; a.click();
  URL.revokeObjectURL(url);
}

function ImportModal({ projects, onClose, onDone }) {
  const fileRef    = useRef();
  const [step, setStep]           = useState(1); // 1=upload, 2=preview, 3=result
  const [file, setFile]           = useState(null);
  const [projectId, setProjectId] = useState('');
  const [siteLocation, setSite]   = useState('main');
  const [overwrite, setOverwrite] = useState(true);
  const [preview, setPreview]     = useState([]);
  const [result, setResult]       = useState(null);
  const [loading, setLoading]     = useState(false);

  const handleFile = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setFile(f);
    setLoading(true);
    try {
      const res = await inventoryAPI.importPreview(f);
      setPreview(res.data?.data || []);
      setStep(2);
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to parse file');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!projectId) { toast.error('Please select a project'); return; }
    setLoading(true);
    try {
      const res = await inventoryAPI.importData(file, projectId, siteLocation, overwrite);
      setResult(res.data);
      setStep(3);
      onDone();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Import failed');
    } finally {
      setLoading(false);
    }
  };

  const inr = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="bg-slate-900 px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-lg font-medium text-white flex items-center gap-2">
              <FileSpreadsheet size={18} className="text-emerald-400" />
              Import Stock from Excel
            </h2>
            <p className="text-xs text-slate-900 font-medium mt-0.5">
              Columns used: Category · Major Head · Material Description · Unit · DC/IDC · Opening Stock · Closing Stock · Rate · Remarks
            </p>
          </div>
          <button onClick={onClose} className="text-slate-900 font-medium hover:text-white transition">
            <X size={20} />
          </button>
        </div>

        {/* Step indicator */}
        <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2 flex-shrink-0">
          {[['1', 'Upload File'], ['2', 'Preview'], ['3', 'Done']].map(([n, label], i) => (
            <React.Fragment key={n}>
              <div className={clsx('flex items-center gap-1.5 text-xs font-semibold',
                step >= parseInt(n) ? 'text-indigo-700' : 'text-slate-900 font-semibold'
              )}>
                <div className={clsx('w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-medium',
                  step > parseInt(n)  ? 'bg-emerald-500 text-white' :
                  step === parseInt(n) ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-900 font-bold'
                )}>
                  {step > parseInt(n) ? <Check size={10} /> : n}
                </div>
                {label}
              </div>
              {i < 2 && <ArrowRight size={12} className="text-slate-300 mx-1" />}
            </React.Fragment>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">

          {/* ── STEP 1: Upload ─────────────────────────────────── */}
          {step === 1 && (
            <div className="p-8 space-y-6">
              {/* Drop zone */}
              <div
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-slate-300 hover:border-indigo-400 rounded-2xl p-12 text-center cursor-pointer transition-colors group"
              >
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} className="hidden" />
                {loading ? (
                  <div className="space-y-3">
                    <Loader2 size={36} className="mx-auto text-indigo-500 animate-spin" />
                    <p className="text-slate-900 font-medium font-bold">Parsing file…</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <Upload size={36} className="mx-auto text-slate-300 group-hover:text-indigo-400 transition-colors" />
                    <div>
                      <p className="font-medium text-slate-700">Click to upload your Excel file</p>
                      <p className="text-sm text-slate-900 font-medium mt-1">Supports .xlsx · .xls · .csv</p>
                    </div>
                    <div className="inline-block bg-indigo-50 text-indigo-700 text-xs font-medium px-3 py-1.5 rounded-lg border border-indigo-100">
                      Your file: STOCK RPRTT WITHAMOUNY.xlsx ✓ will work directly
                    </div>
                  </div>
                )}
              </div>

              {/* Template download + Required columns info */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-amber-800 uppercase tracking-wide">Required Columns</p>
                  <button
                    onClick={downloadImportTemplate}
                    className="flex items-center gap-1.5 bg-white border border-amber-300 text-amber-700 hover:bg-amber-100 text-xs font-medium px-3 py-1.5 rounded-lg transition"
                  >
                    <Download size={12} /> Download Template (.csv)
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {['Category', 'MATERIAL DESCRIPTION', 'Unit', 'OPENING STOCK', 'CLOSING STOCK', 'RATE'].map(c => (
                    <div key={c} className="bg-white border border-amber-100 rounded-lg px-2 py-1 text-xs font-mono text-amber-700">{c}</div>
                  ))}
                </div>
                <p className="text-[11px] text-amber-600">Value columns (TOTAL ISSUED, GST, GRAND TOTAL) are auto-calculated — not imported.</p>
              </div>
            </div>
          )}

          {/* ── STEP 2: Preview + Options ───────────────────────── */}
          {step === 2 && (
            <div className="flex flex-col h-full">
              {/* Options bar */}
              <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-end gap-4">
                <div>
                  <label className="text-xs font-medium text-slate-900 block mb-1">Project <span className="text-red-500">*</span></label>
                  <select
                    value={projectId}
                    onChange={e => setProjectId(e.target.value)}
                    className="h-9 border border-slate-200 rounded-lg px-3 text-sm text-slate-900 focus:outline-none focus:border-indigo-400 bg-white min-w-[200px]"
                  >
                    <option value="">Select project…</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-900 block mb-1">Site Location</label>
                  <input
                    value={siteLocation}
                    onChange={e => setSite(e.target.value)}
                    placeholder="main"
                    className="h-9 border border-slate-200 rounded-lg px-3 text-sm text-slate-900 focus:outline-none focus:border-indigo-400 bg-white w-32"
                  />
                </div>
                <label className="flex items-center gap-2 cursor-pointer pb-1">
                  <input type="checkbox" checked={overwrite} onChange={e => setOverwrite(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-400" />
                  <span className="text-sm font-medium text-slate-700">Overwrite existing records</span>
                </label>
                <div className="ml-auto flex-shrink-0">
                  <div className="text-xs text-slate-900 font-medium font-bold">{preview.length} rows ready to import</div>
                </div>
              </div>

              {/* Preview table */}
              <div className="overflow-auto flex-1 p-4">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-800 text-white">
                      <th className="px-3 py-2 text-left font-medium w-8">#</th>
                      <th className="px-3 py-2 text-left font-bold">CATEGORY</th>
                      <th className="px-3 py-2 text-left font-bold">MAJOR HEAD</th>
                      <th className="px-3 py-2 text-left font-bold">MATERIAL DESCRIPTION</th>
                      <th className="px-3 py-2 text-center font-bold">UNIT</th>
                      <th className="px-3 py-2 text-center font-bold">DC/IDC</th>
                      <th className="px-3 py-2 text-right font-bold">OPENING STOCK</th>
                      <th className="px-3 py-2 text-right font-bold">CLOSING STOCK</th>
                      <th className="px-3 py-2 text-right font-bold">RATE (₹)</th>
                      <th className="px-3 py-2 text-right font-medium bg-indigo-700">CLOSING VALUE</th>
                      <th className="px-3 py-2 text-left font-bold">REMARKS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {preview.map((row, i) => {
                      const closingVal = (row.closing_stock || 0) * (row.unit_rate || 0);
                      return (
                        <tr key={i} className={clsx('hover:bg-slate-50', i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40')}>
                          <td className="px-3 py-2 text-slate-900 font-medium font-mono">{i + 1}</td>
                          <td className="px-3 py-2 text-slate-600">{row.category || <span className="text-slate-300 italic">—</span>}</td>
                          <td className="px-3 py-2 text-slate-600">{row.major_head || <span className="text-slate-300 italic">—</span>}</td>
                          <td className="px-3 py-2 font-medium text-slate-900 font-medium">{row.material_name}</td>
                          <td className="px-3 py-2 text-center font-medium text-slate-900 uppercase">{row.unit}</td>
                          <td className="px-3 py-2 text-center font-medium text-slate-900 uppercase">{row.dc_idc || <span className="text-slate-300">—</span>}</td>
                          <td className="px-3 py-2 text-right font-mono text-slate-900 font-bold">{row.opening_stock}</td>
                          <td className="px-3 py-2 text-right font-mono font-medium text-slate-900">{row.closing_stock}</td>
                          <td className="px-3 py-2 text-right font-mono text-slate-700">
                            {row.unit_rate > 0 ? `₹${inr(row.unit_rate)}` : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-medium text-indigo-700 bg-indigo-50/30">
                            {closingVal > 0 ? `₹${inr(closingVal)}` : '—'}
                          </td>
                          <td className="px-3 py-2 text-slate-600">{row.remarks || <span className="text-slate-300 italic">—</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── STEP 3: Result ─────────────────────────────────── */}
          {step === 3 && result && (
            <div className="p-8 text-center space-y-6">
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
                <CheckCircle2 size={32} className="text-emerald-600" />
              </div>
              <div>
                <h3 className="text-xl font-medium text-slate-900">Import Complete!</h3>
                <p className="text-slate-900 font-medium text-sm mt-1">Stock data has been imported into the inventory system.</p>
              </div>
              <div className="grid grid-cols-3 gap-4 max-w-sm mx-auto">
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                  <div className="text-3xl font-medium text-emerald-700">{result.inserted}</div>
                  <div className="text-xs text-emerald-600 mt-1 font-semibold">New Items</div>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <div className="text-3xl font-medium text-blue-700">{result.updated}</div>
                  <div className="text-xs text-blue-600 mt-1 font-semibold">Updated</div>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <div className="text-3xl font-medium text-slate-900 font-bold">{result.skipped}</div>
                  <div className="text-xs text-slate-900 font-medium mt-1 font-semibold">Skipped</div>
                </div>
              </div>
              {result.skippedItems?.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-left max-w-lg mx-auto">
                  <div className="flex items-center gap-2 text-amber-700 font-medium text-sm mb-2">
                    <AlertCircle size={14} /> {result.skippedItems.length} items skipped (already existed — overwrite was off)
                  </div>
                  <div className="space-y-0.5 max-h-32 overflow-y-auto">
                    {result.skippedItems.map((name, i) => (
                      <div key={i} className="text-xs text-amber-700 font-mono bg-amber-100 px-2 py-0.5 rounded">{name}</div>
                    ))}
                  </div>
                  <p className="text-xs text-amber-600 mt-2 font-bold">💡 Re-import with "Overwrite existing records" ✓ checked to update these.</p>
                </div>
              )}
              {result.errors?.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-left max-w-md mx-auto">
                  <div className="flex items-center gap-2 text-red-700 font-medium text-sm mb-2">
                    <AlertCircle size={14} /> {result.errors.length} errors
                  </div>
                  {result.errors.slice(0, 5).map((e, i) => (
                    <div key={i} className="text-xs text-red-600">{e.material}: {e.error}</div>
                  ))}
                </div>
              )}
              <button onClick={onClose} className="bg-slate-900 text-white font-medium px-8 py-2.5 rounded-xl hover:bg-slate-800 transition">
                Close
              </button>
            </div>
          )}
        </div>

        {/* Footer actions */}
        {step === 2 && (
          <div className="px-6 py-4 border-t border-slate-200 bg-white flex items-center justify-between flex-shrink-0">
            <button onClick={() => { setStep(1); setPreview([]); setFile(null); }}
              className="text-sm text-slate-900 font-medium hover:text-slate-900 font-medium transition flex items-center gap-1">
              ← Back
            </button>
            <button
              onClick={handleImport}
              disabled={!projectId || loading}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium px-6 py-2.5 rounded-xl text-sm transition shadow-sm"
            >
              {loading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
              {loading ? 'Importing…' : `Import ${preview.length} Records`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Main Page ───────────────────────────────────────────────── */
export default function StoreLedgerPage() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const [tab, setTab]                     = useState('summary');
  const [selectedMaterial, setSelectedMaterial] = useState(null);
  const [search, setSearch]               = useState('');
  const [filterStatus, setFilterStatus]   = useState('all');
  const [projectFilter, setProjectFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [majorHeadFilter, setMajorHeadFilter] = useState('');
  const [groupByMajorHead, setGroupByMajorHead] = useState(false);
  const [showImport, setShowImport]       = useState(false);
  const [showValues, setShowValues]       = useState(false);
  const [sortField, setSortField]         = useState('material_name');
  const [sortDir, setSortDir]             = useState('asc');
  const [page, setPage]                   = useState(1);
  const PAGE_SIZE = 50;
  // Monthly Movement tab state
  const [month, setMonth]                 = useState(dayjs().format('YYYY-MM'));
  const [movTab, setMovTab]               = useState('register'); // register | valuation | slow

  const { data: projectsData = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectAPI.list().then(r => r.data?.data ?? r.data ?? []).catch(() => []),
  });

  const { data: inventoryData = [], isLoading: invLoading } = useQuery({
    queryKey: ['inventory', projectFilter],
    queryFn: () => inventoryAPI.list(projectFilter ? { project_id: projectFilter } : {}).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
  });

  const { data: ledgerData, isLoading: ledgerLoading } = useQuery({
    queryKey: ['inventory-ledger', selectedMaterial?.id],
    queryFn: () => inventoryAPI.ledger(selectedMaterial.id).then(r => r.data),
    enabled: !!selectedMaterial?.id,
  });

  const { data: movData = [], isLoading: movLoading, refetch: movRefetch } = useQuery({
    queryKey: ['inventory-monthly', month, projectFilter],
    queryFn: () => inventoryAPI.monthlyReport({ month, project_id: projectFilter || undefined }).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    enabled: tab === 'movement',
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => inventoryAPI.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory'] });
      toast.success('Updated');
    },
    onError: () => toast.error('Update failed'),
  });

  // ── Derived ─────────────────────────────────────────────────
  const categories  = [...new Set([...DEFAULT_CATEGORIES, ...inventoryData.map(s => s.category).filter(Boolean)])].sort();
  const majorHeads  = [...new Set(inventoryData.map(s => s.major_head).filter(Boolean))].sort();

  const outCount = inventoryData.filter(s => parseFloat(s.closing_stock) <= 0).length;
  const lowCount = inventoryData.filter(s => {
    const c = parseFloat(s.closing_stock) || 0;
    const r = parseFloat(s.reorder_level) || 0;
    return c > 0 && r > 0 && c <= r;
  }).length;

  const filteredSummary = inventoryData.filter(s => {
    const c = parseFloat(s.closing_stock) || 0;
    const m = parseFloat(s.min_stock) || 0;
    const r = parseFloat(s.reorder_level) || 0;
    const status = c <= 0 ? 'out_of_stock' : (m > 0 && c <= m) ? 'critical_low' : (r > 0 && c <= r) ? 'reorder' : 'ok';
    if (filterStatus !== 'all' && status !== filterStatus) return false;
    if (categoryFilter  && s.category   !== categoryFilter)  return false;
    if (majorHeadFilter && s.major_head !== majorHeadFilter) return false;
    if (search && !s.material_name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // Sorting
  const toggleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir(field === 'closing_stock' || field === 'grand_total' ? 'desc' : 'asc'); }
    setPage(1);
  };
  const sortIndicator = (field) => sortField === field ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ' ↕';

  const sortedSummary = [...filteredSummary].sort((a, b) => {
    let va, vb;
    switch (sortField) {
      case 'closing_stock': va = rq3(a.closing_stock); vb = rq3(b.closing_stock); break;
      case 'opening_stock': va = rq3(a.opening_stock); vb = rq3(b.opening_stock); break;
      case 'unit_rate':     va = parseFloat(a.unit_rate || 0); vb = parseFloat(b.unit_rate || 0); break;
      case 'grand_total':
        va = rq3(a.closing_stock) * parseFloat(a.unit_rate || 0) * (1 + GST_RATE);
        vb = rq3(b.closing_stock) * parseFloat(b.unit_rate || 0) * (1 + GST_RATE);
        break;
      case 'category': va = (a.category || '').toLowerCase(); vb = (b.category || '').toLowerCase(); break;
      case 'status': {
        const ord = { out_of_stock: 0, critical_low: 1, reorder: 2, ok: 3 };
        const st = (s) => { const c = rq3(s.closing_stock), m = parseFloat(s.min_stock||0), r = parseFloat(s.reorder_level||0); return c<=0?'out_of_stock':(m>0&&c<=m)?'critical_low':(r>0&&c<=r)?'reorder':'ok'; };
        va = ord[st(a)]; vb = ord[st(b)]; break;
      }
      default: va = (a.material_name || '').toLowerCase(); vb = (b.material_name || '').toLowerCase();
    }
    if (va < vb) return sortDir === 'asc' ? -1 : 1;
    if (va > vb) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  // Summary totals for footer
  const totalOpeningValue  = filteredSummary.reduce((sum, s) => sum + (rq3(s.opening_stock) * parseFloat(s.unit_rate || 0)), 0);
  const totalIssuedValue   = filteredSummary.reduce((sum, s) => {
    const issued = Math.max(0, rq3(s.opening_stock) - rq3(s.closing_stock));
    return sum + issued * parseFloat(s.unit_rate || 0);
  }, 0);
  const totalClosingValue  = filteredSummary.reduce((sum, s) => sum + (rq3(s.closing_stock) * parseFloat(s.unit_rate || 0)), 0);
  const totalGST           = totalClosingValue * GST_RATE;
  const totalGrandTotal    = totalClosingValue + totalGST;

  // Pagination for the Stock Report table
  const totalPages   = Math.max(1, Math.ceil(sortedSummary.length / PAGE_SIZE));
  const currentPage  = Math.min(page, totalPages);
  const pagedSummary = sortedSummary.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [search, filterStatus, categoryFilter, majorHeadFilter, projectFilter, inventoryData.length]);

  const transactions = ledgerData?.transactions || [];
  const ledgerInventory = ledgerData?.inventory || selectedMaterial;

  // Monthly movement derived
  const movFiltered = movData.filter(r =>
    (!search || r.material_name?.toLowerCase().includes(search.toLowerCase()))
  );
  const movSlowMoving = movData.filter(r => parseFloat(r.issued_qty || 0) === 0 && parseFloat(r.opening_stock || 0) > 0);
  const movOutOfStock = movData.filter(r => parseFloat(r.closing_stock || 0) <= 0);
  const movTotalValue = movData.reduce((s, r) => s + parseFloat(r.stock_value || 0), 0);
  const movMaxQty     = Math.max(...movData.map(r => Math.max(parseFloat(r.received_qty || 0), parseFloat(r.issued_qty || 0))), 1);

  const downloadTemplate = () => {
    const headers = ['Category', 'MATERIAL DESCRIPTION', 'Unit', 'OPENING STOCK', 'CLOSING STOCK', 'RATE'];
    const samples = [
      ['Cement', 'OPC 53 Grade Cement', 'Bags', '500', '320', '380'],
      ['Steel', '8mm dia TMT Bar Fe500', 'MT', '12.5', '8.2', '58000'],
      ['Steel', '12mm dia TMT Bar Fe500', 'MT', '8.0', '5.5', '58500'],
      ['Aggregate', '20mm Crushed Stone', 'CUM', '50', '30', '1200'],
      ['Sand', 'M-Sand / River Sand', 'CUM', '40', '22', '900'],
      ['Paint', 'Exterior Emulsion Paint', 'Ltr', '200', '120', '180'],
      ['Plumbing', 'PVC Pipe 4 inch', 'RMT', '300', '180', '85'],
      ['Electrical', 'FRLS Wire 2.5 sq mm', 'RMT', '1000', '650', '22'],
      ['Electrical', 'Binding Wire Coil', 'Coils', '25', '18', '950'],
    ];
    const csv = [headers, ...samples].map(row => row.map(c => `"${c}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = 'Store_Ledger_Template.csv'; a.click();
    URL.revokeObjectURL(url);
    toast.success('Template downloaded');
  };

  const exportLedgerCSV = () => {
    const headers = ['SL NO','Major Head','Category','Material Description','Unit','DC/IDC','Opening Stock','Closing Stock','Rate (₹)','Total Issued Stock Value','Opening Stock Value','Closing Stock Value','GST @18%','Grand Total'];
    const rows = filteredSummary.map((s, idx) => {
      const rate       = parseFloat(s.unit_rate  || 0);
      const opening    = rq3(s.opening_stock);
      const closing    = rq3(s.closing_stock);
      const issued     = Math.max(0, opening - closing);
      const issuedVal  = (issued   * rate).toFixed(2);
      const openingVal = (opening  * rate).toFixed(2);
      const closingVal = (closing  * rate).toFixed(2);
      const gst        = (closing  * rate * GST_RATE).toFixed(2);
      const grand      = (closing  * rate * (1 + GST_RATE)).toFixed(2);
      return [idx + 1, s.major_head || '', s.category || '', s.material_name, s.unit, s.dc_idc || '', opening, closing, rate, issuedVal, openingVal, closingVal, gst, grand];
    });
    const csv = [headers, ...rows].map(row => row.map(c => `"${c}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `Store_Ledger_${dayjs().format('YYYY-MM-DD')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Store ledger exported');
  };

  const exportMovCSV = () => {
    const headers = ['Material','Unit','Opening','Received','Total','Issued','Closing','Rate','Value'];
    const rows = movFiltered.map(r => [
      r.material_name, r.unit,
      fmt2(r.opening_stock), fmt2(r.received_qty), fmt2(r.total_qty),
      fmt2(r.issued_qty), fmt2(r.closing_stock), fmt2(r.rate), fmt2(r.stock_value),
    ]);
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `Movement_${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Movement report exported');
  };

  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  const getReportDefinition = () => {
    if (tab === 'movement') {
      return {
        title: `Monthly Store Movement - ${dayjs(month).format('MMMM YYYY')}`,
        columns: ['SL No', 'Material', 'Unit', 'Opening', 'Received', 'Total', 'Issued', 'Closing', 'Rate', 'Value'],
        rows: movFiltered.map((r, idx) => [
          idx + 1,
          r.material_name || '',
          r.unit || '',
          fmt2(r.opening_stock),
          fmt2(r.received_qty),
          fmt2(r.total_qty),
          fmt2(r.issued_qty),
          fmt2(r.closing_stock),
          inr(r.rate),
          inr(r.stock_value),
        ]),
      };
    }

    if (tab === 'ledger' && selectedMaterial) {
      const rate = parseFloat(ledgerInventory?.unit_rate || selectedMaterial.unit_rate || 0);
      return {
        title: `Material Ledger - ${selectedMaterial.material_name}`,
        columns: ['Date', 'Type', 'Reference', 'Receipt', 'Issue', 'Value', 'Narration', 'By'],
        rows: transactions.map((txn) => {
          const cfg = TYPE_CONFIG[txn.transaction_type] || TYPE_CONFIG.issue;
          const isReceipt = txn.transaction_type === 'grn' || txn.transaction_type === 'transfer_in';
          const isIssue = txn.transaction_type === 'issue' || txn.transaction_type === 'transfer_out';
          const txnQty = parseFloat(txn.quantity || 0);
          return [
            txn.transacted_at ? dayjs(txn.transacted_at).format('DD MMM YYYY') : '-',
            cfg.label,
            txn.reference_number || '-',
            isReceipt ? fmt2(txnQty) : '-',
            isIssue ? fmt2(txnQty) : txn.transaction_type === 'adjustment' ? fmt2(txnQty) : '-',
            rate > 0 ? inr(txnQty * rate) : '-',
            txn.remarks || '-',
            txn.transacted_by_name || '-',
          ];
        }),
      };
    }

    return {
      title: 'Store Ledger - Inventory Register',
      columns: ['SL No', 'Major Head', 'Category', 'Material Description', 'Unit', 'DC/IDC', 'Opening Stock', 'Closing Stock', 'Rate', 'Issued Value', 'Opening Value', 'Closing Value', 'GST 18%', 'Grand Total'],
      rows: filteredSummary.map((s, idx) => {
        const rate = parseFloat(s.unit_rate || 0);
        const opening = rq3(s.opening_stock);
        const closing = rq3(s.closing_stock);
        const issued = Math.max(0, opening - closing);
        const issuedVal = issued * rate;
        const openingVal = opening * rate;
        const closingVal = closing * rate;
        const gst = closingVal * GST_RATE;
        const grand = closingVal + gst;
        return [
          idx + 1,
          s.major_head || '',
          s.category || '',
          s.material_name || '',
          s.unit || '',
          s.dc_idc || '',
          qty(opening),
          qty(closing),
          inr(rate),
          inr(issuedVal),
          inr(openingVal),
          inr(closingVal),
          inr(gst),
          inr(grand),
        ];
      }),
      totals: ['Totals', '', '', '', '', '', '', '', '', inr(totalIssuedValue), inr(totalOpeningValue), inr(totalClosingValue), inr(totalGST), inr(totalGrandTotal)],
    };
  };

  const printActiveReport = async () => {
    const report = getReportDefinition();
    if (!report.rows.length) {
      toast.error('No data available to print');
      return;
    }
    const win = window.open('', '_blank', 'width=1200,height=800');
    if (!win) {
      window.print();
      return;
    }

    // Resolve project name — prefer projectsData, fall back to inventory rows
    const projectName = projectFilter
      ? (projectsData.find(p => String(p.id) === String(projectFilter))?.name
          || inventoryData.find(r => r.project_id === projectFilter)?.project_name
          || projectFilter)
      : 'All Projects';
    const storesPersonName = user?.name || '—';

    // Pre-fetch logo as base64 so the blank window can render it without timing issues
    let logoSrc = '';
    try {
      const res = await fetch(`${window.location.origin}/bcim-logo.png`);
      const blob = await res.blob();
      logoSrc = await new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    } catch (_) { /* logo just won't render */ }

    const headerCells = report.columns.map(h => `<th>${escapeHtml(h)}</th>`).join('');
    const bodyRows = report.rows.map(row => `<tr>${row.map(c => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`).join('');
    const totalRow = report.totals ? `<tr class="total-row">${report.totals.map(c => `<td>${escapeHtml(c)}</td>`).join('')}</tr>` : '';

    win.document.write(`
      <!doctype html>
      <html>
      <head>
        <title>${escapeHtml(report.title)}</title>
        <style>
          * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          body { margin: 0; font-family: Arial, sans-serif; color: #0f172a; }

          /* ── Document header ── */
          .doc-header {
            display: table; width: 100%; border-collapse: collapse;
            border: 2px solid #0f2d6b; margin-bottom: 0;
          }
          .doc-header td { border: 1px solid #0f2d6b; padding: 6px 10px; vertical-align: middle; }
          .logo-cell { width: 90px; text-align: center; }
          .logo-cell img { height: 48px; width: auto; object-fit: contain; }
          .title-cell { text-align: center; }
          .doc-title { font-size: 14px; font-weight: 900; color: #0f2d6b; letter-spacing: .06em; text-transform: uppercase; text-decoration: underline; }
          .doc-sub { font-size: 9px; color: #475569; margin-top: 3px; }
          .meta-cell { width: 30%; font-size: 9px; }
          .meta-row { display: flex; gap: 4px; margin-bottom: 3px; }
          .meta-label { font-weight: 700; color: #475569; width: 90px; flex-shrink: 0; }
          .meta-value { font-weight: 600; color: #0f172a; }

          /* ── Info strip ── */
          .info-strip {
            display: table; width: 100%; border-collapse: collapse;
            border: 2px solid #0f2d6b; border-top: none; margin-bottom: 12px;
          }
          .info-strip td { border: 1px solid #0f2d6b; padding: 4px 8px; font-size: 9px; }
          .info-lbl { font-weight: 700; color: #475569; }
          .info-val { font-weight: 600; }

          /* ── Data table ── */
          table.data { width: 100%; border-collapse: collapse; font-size: 9px; }
          table.data th { background: #0f2d6b; color: #fff; text-align: left; padding: 6px; border: 1px solid #94a3b8; font-size: 8.5px; text-transform: uppercase; letter-spacing: .04em; }
          table.data td { padding: 5px 6px; border: 1px solid #cbd5e1; vertical-align: top; }
          table.data td:nth-child(n+5), table.data th:nth-child(n+5) { text-align: right; }
          table.data tr:nth-child(even) td { background: #f8fafc; }
          .total-row td { background: #eaf1ff !important; font-weight: 800; color: #0f2d6b; border-top: 2px solid #0f2d6b; }

          /* ── Footer ── */
          .doc-footer { margin-top: 10px; display: flex; justify-content: space-between; font-size: 8px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 6px; }

          @page { size: A4 landscape; margin: 10mm; }
        </style>
      </head>
      <body>

        <!-- Header table -->
        <table class="doc-header">
          <tr>
            <td class="logo-cell" rowspan="1">
              ${logoSrc ? `<img src="${logoSrc}" alt="BCIM" style="height:48px;width:auto;object-fit:contain;" />` : '<span style="font-size:9px;font-weight:900;color:#0f2d6b;">BCIM</span>'}
            </td>
            <td class="title-cell">
              <div class="doc-title">${escapeHtml(report.title)}</div>
              <div class="doc-sub">BCIM Engineering Private Limited &mdash; Stores &amp; Inventory Control</div>
            </td>
            <td class="meta-cell">
              <div class="meta-row"><span class="meta-label">Project :</span><span class="meta-value">${escapeHtml(projectName)}</span></div>
              <div class="meta-row"><span class="meta-label">Prepared by :</span><span class="meta-value">${escapeHtml(storesPersonName)}</span></div>
              <div class="meta-row"><span class="meta-label">Print Date :</span><span class="meta-value">${dayjs().format('DD MMM YYYY, hh:mm A')}</span></div>
            </td>
          </tr>
        </table>

        <!-- Data table -->
        <table class="data">
          <thead><tr>${headerCells}</tr></thead>
          <tbody>${bodyRows}${totalRow}</tbody>
        </table>

        <!-- Footer -->
        <div class="doc-footer">
          <span>BCIM Construct-ERP v3.0 &bull; Store Ledger &bull; ${escapeHtml(storesPersonName)}</span>
          <span>Confidential &mdash; For internal use only &bull; Printed: ${dayjs().format('DD/MM/YYYY HH:mm')}</span>
        </div>

      </body>
      </html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 300);
  };

  const exportActivePDF = () => {
    const report = getReportDefinition();
    if (!report.rows.length) {
      toast.error('No data available for PDF');
      return;
    }
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    doc.setFontSize(14);
    doc.setTextColor(15, 45, 107);
    doc.text(report.title, 40, 34);
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text(`BCIM Engineering Pvt Ltd | Generated ${dayjs().format('DD MMM YYYY, hh:mm A')}`, 40, 50);
    autoTable(doc, {
      startY: 66,
      head: [report.columns],
      body: report.totals ? [...report.rows, report.totals] : report.rows,
      styles: { fontSize: 7, cellPadding: 3, overflow: 'linebreak' },
      headStyles: { fillColor: [15, 45, 107], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      didParseCell: (data) => {
        if (report.totals && data.row.index === report.rows.length) {
          data.cell.styles.fillColor = [234, 241, 255];
          data.cell.styles.textColor = [15, 45, 107];
          data.cell.styles.fontStyle = 'bold';
        }
      },
      margin: { left: 24, right: 24 },
    });
    doc.save(`${report.title.replace(/[^a-z0-9]+/gi, '_')}_${dayjs().format('YYYY-MM-DD')}.pdf`);
    toast.success('PDF downloaded');
  };

  return (
    <div style={{ background: Theme.pageBg, minHeight: '100vh' }}>

      <PageHeader
        title="Store Ledger"
        subtitle="Inventory register · Monthly movement · Material ledger"
        breadcrumbs={[{ label: 'Stores' }, { label: 'Ledger' }]}
        actions={
          <>
            {(outCount > 0 || lowCount > 0) && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold"
                style={{ background: 'rgba(250,204,21,0.15)', color: '#fde047', border: '1px solid rgba(250,204,21,0.30)' }}>
                <AlertTriangle className="w-4 h-4" />
                {outCount > 0 && `${outCount} out`}
                {outCount > 0 && lowCount > 0 && ' · '}
                {lowCount > 0 && `${lowCount} low`}
              </div>
            )}
            <button onClick={downloadTemplate}
              className="flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg"
              style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.20)', color: '#fff' }}>
              <Download size={14} /> Template
            </button>
            <button onClick={printActiveReport}
              className="flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg"
              style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.20)', color: '#fff' }}>
              <Printer size={14} /> Print
            </button>
            <button onClick={exportActivePDF}
              className="flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg"
              style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.20)', color: '#fff' }}>
              <FileText size={14} /> PDF
            </button>
            <button onClick={() => setShowImport(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg shadow-sm"
              style={{ background: '#fff', color: Theme.navyDark, border: '1px solid rgba(255,255,255,0.4)' }}>
              <Upload size={14} /> Import
            </button>
          </>
        }
      />

      <style>{`
        .store-ledger-scroll {
          overscroll-behavior-x: contain;
          scroll-behavior: smooth;
          scrollbar-width: thin;
          scrollbar-color: #6366f1 #e2e8f0;
        }
        .store-ledger-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
        .store-ledger-scroll::-webkit-scrollbar-track { background: #e2e8f0; border-radius: 10px; }
        .store-ledger-scroll::-webkit-scrollbar-thumb { background: #6366f1; border-radius: 10px; border: 2px solid #e2e8f0; }
        .store-ledger-scroll::-webkit-scrollbar-thumb:hover { background: #4f46e5; }
        .store-ledger-scroll::-webkit-scrollbar-corner { background: #e2e8f0; }
        /* Size the grid to fill exactly the space left after the page chrome,
           so KPI cards, filters, table, footer and pagination all fit in one
           screen and ONLY the table body scrolls — no page-level scrolling. */
        .store-ledger-table-shell {
          max-height: calc(100vh - 400px);
          min-height: 200px;
          overflow: auto;
        }
        @media (max-width: 1024px) {
          .store-ledger-table-shell { max-height: calc(100vh - 430px); min-height: 180px; }
        }
        @media (min-height: 900px) {
          .store-ledger-table-shell { max-height: calc(100vh - 380px); }
        }
        /* Sticky table headers inside overflow containers */
        .store-ledger-table-shell table thead {
          position: sticky;
          top: 0;
          z-index: 2;
        }
        /* Compact rows so more items are visible per screen */
        .store-ledger-table-shell table td { padding-top: 0.45rem; padding-bottom: 0.45rem; }
        .store-ledger-table-shell table th { padding-top: 0.5rem; padding-bottom: 0.5rem; }
      `}</style>

      <div className="px-4 py-3 md:px-6 md:py-4 max-w-full mx-auto">


      {/* ── Tabs — sticky below PageHeader ─────────────────────── */}
      <div
        className="sticky z-[15] -mx-6 px-6 md:-mx-8 md:px-8 pb-2"
        style={{ top: '104px', background: Theme.pageBg }}
      >
        <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-baseline gap-2">
            <h2 className="text-base font-black tracking-tight text-slate-950">Material Stock Ledger</h2>
            <span className="hidden text-xs font-semibold text-slate-400 lg:inline">· Stock balance, movement & item-wise register</span>
          </div>
          <SegmentTabs
            value={tab}
            onChange={setTab}
            tabs={[
              { key: 'summary',  label: 'Inventory Register', icon: Package },
              { key: 'movement', label: 'Monthly Movement',   icon: BarChart2 },
              { key: 'ledger',   label: 'Material Ledger',    icon: BookOpen },
            ]}
          />
        </div>
      </div>

      <div className="mb-3" />

      {/* ══════════════════════════════════════════════════════════
          TAB 1: STOCK REPORT (Excel-matching columns)
      ══════════════════════════════════════════════════════════ */}
      {tab === 'summary' && (
        <div className="space-y-3">

          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
            <MetricCard icon={Package} label="Total Materials" value={inventoryData.length} sub={`${filteredSummary.length} shown`} tone="navy" />
            <MetricCard icon={AlertTriangle} label="Out of Stock" value={outCount} sub="Needs attention" tone="danger" />
            <MetricCard icon={AlertCircle} label="Below Reorder" value={lowCount} sub="Purchase planning" tone="amber" />
            <MetricCard icon={IndianRupee} label="Closing Value" value={`₹${inr(totalClosingValue)}`} sub="Stock on hand" tone="blue" />
            <MetricCard icon={CheckCircle2} label="Grand Total" value={`₹${inr(totalGrandTotal)}`} sub="Including GST" tone="teal" />
          </div>
          <div className="hidden">
            <div className="bg-red-50 border border-red-100 rounded-xl p-4 shadow-sm">
              <div className="text-2xl font-medium text-red-600">{outCount}</div>
              <div className="text-xs text-red-500 mt-1">Out of Stock</div>
            </div>
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 shadow-sm">
              <div className="text-2xl font-medium text-amber-600">{lowCount}</div>
              <div className="text-xs text-amber-500 mt-1">Below Reorder</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <div className="text-2xl font-medium text-slate-900 font-medium">{inventoryData.length}</div>
              <div className="text-xs text-slate-900 font-medium mt-1">Total Materials</div>
            </div>
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 shadow-sm">
              <div className="text-lg font-medium text-indigo-700 font-mono">₹{inr(totalClosingValue)}</div>
              <div className="text-xs text-indigo-500 mt-1">Closing Stock Value</div>
            </div>
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 shadow-sm">
              <div className="text-lg font-medium text-emerald-700 font-mono">₹{inr(totalGrandTotal)}</div>
              <div className="text-xs text-emerald-500 mt-1">Grand Total (incl. GST)</div>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm md:flex-row md:items-center md:flex-wrap">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-900 font-semibold" />
              <input
                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-4 text-sm font-bold text-slate-950 outline-none transition-all placeholder:text-slate-400 focus:border-slate-900 focus:bg-white"
                placeholder="Search material…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <select
              className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-800 outline-none focus:border-slate-900 focus:bg-white"
              value={projectFilter}
              onChange={e => setProjectFilter(e.target.value)}
            >
              <option value="">All Projects</option>
              {projectsData.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select
              className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-800 outline-none focus:border-slate-900 focus:bg-white"
              value={majorHeadFilter}
              onChange={e => setMajorHeadFilter(e.target.value)}
            >
              <option value="">All Major Heads</option>
              {majorHeads.map(h => <option key={h} value={h}>{h}</option>)}
            </select>
            <select
              className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-800 outline-none focus:border-slate-900 focus:bg-white"
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
            >
              <option value="">All Categories</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <button
              onClick={() => setGroupByMajorHead(g => !g)}
              className={clsx(
                'h-10 shrink-0 rounded-xl border px-4 text-sm font-bold transition',
                groupByMajorHead
                  ? 'border-indigo-400 bg-indigo-600 text-white'
                  : 'border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100'
              )}
              title="Group rows by Major Head"
            >
              Group by Head
            </button>
            <button
              onClick={() => setShowValues(v => !v)}
              className={clsx(
                'h-10 shrink-0 rounded-xl border px-4 text-sm font-bold transition',
                showValues
                  ? 'border-emerald-400 bg-emerald-600 text-white'
                  : 'border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100'
              )}
              title="Toggle financial value columns"
            >
              {showValues ? 'Hide Values' : 'Show Values'}
            </button>
            <div className="flex items-center gap-1 h-10 border border-slate-200 rounded-xl bg-slate-50 px-3 shrink-0">
              <span className="text-xs font-bold text-slate-500 whitespace-nowrap">Sort:</span>
              <select
                value={sortField}
                onChange={e => { setSortField(e.target.value); setPage(1); setSortDir(e.target.value === 'closing_stock' || e.target.value === 'grand_total' ? 'desc' : 'asc'); }}
                className="h-8 bg-transparent text-sm font-bold text-slate-800 outline-none border-none"
              >
                <option value="material_name">Name</option>
                <option value="closing_stock">Closing Stock</option>
                <option value="opening_stock">Opening Stock</option>
                <option value="unit_rate">Rate</option>
                <option value="grand_total">Grand Total</option>
                <option value="category">Category</option>
                <option value="status">Status</option>
              </select>
              <button
                onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
                className="w-6 h-6 flex items-center justify-center rounded text-slate-600 hover:bg-slate-200 transition font-bold text-sm"
                title={sortDir === 'asc' ? 'Ascending — click for descending' : 'Descending — click for ascending'}
              >
                {sortDir === 'asc' ? '↑' : '↓'}
              </button>
            </div>
            <div className="relative shrink-0">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-900 font-semibold" />
              <select
                className="h-10 rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-4 text-sm font-bold text-slate-800 outline-none appearance-none focus:border-slate-900 focus:bg-white"
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
              >
                <option value="all">All Status</option>
                <option value="ok">Adequate</option>
                <option value="reorder">Reorder Needed</option>
                <option value="critical_low">Critical Low</option>
                <option value="out_of_stock">Out of Stock</option>
              </select>
            </div>
            <button
              onClick={exportLedgerCSV}
              className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-slate-900 bg-slate-900 px-4 text-sm font-bold text-white transition hover:bg-slate-700"
            >
              <Download size={14} /> Export CSV
            </button>
            <button
              onClick={printActiveReport}
              className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-4 text-sm font-bold text-blue-800 transition hover:bg-blue-100"
            >
              <Printer size={14} /> Print
            </button>
            <button
              onClick={exportActivePDF}
              className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-sm font-bold text-emerald-800 transition hover:bg-emerald-100"
            >
              <FileText size={14} /> PDF
            </button>
          </div>

          {/* ── Inventory Register — card-row layout (no horizontal scroll) ── */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            {invLoading ? (
              <div className="flex items-center justify-center py-20 gap-3 text-slate-500">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">Loading inventory…</span>
              </div>
            ) : (
              <>
                {/* Column header — clickable for sort */}
                <div className="bg-slate-800 text-white px-4 py-2.5 flex items-center gap-3 text-[11px] font-bold uppercase tracking-wider select-none">
                  <span className="w-7 shrink-0 text-center">#</span>
                  <button onClick={() => toggleSort('material_name')} className={clsx('flex-1 min-w-0 text-left hover:text-slate-200 transition', sortField==='material_name'&&'text-blue-300')}>
                    Material / Category{sortIndicator('material_name')}
                  </button>
                  <span className="w-20 shrink-0 text-center">Unit</span>
                  <span className="w-14 shrink-0 text-center">DC/IDC</span>
                  <button onClick={() => toggleSort('opening_stock')} className={clsx('w-24 shrink-0 text-right hover:text-slate-200 transition', sortField==='opening_stock'&&'text-blue-300')}>
                    Opening{sortIndicator('opening_stock')}
                  </button>
                  <button onClick={() => toggleSort('closing_stock')} className={clsx('w-40 shrink-0 text-right hover:text-slate-200 transition', sortField==='closing_stock'&&'text-blue-300')}>
                    Closing{sortIndicator('closing_stock')}
                  </button>
                  <button onClick={() => toggleSort('unit_rate')} className={clsx('w-28 shrink-0 text-right hover:text-slate-200 transition', sortField==='unit_rate'&&'text-blue-300')}>
                    Rate (₹){sortIndicator('unit_rate')}
                  </button>
                  <button onClick={() => toggleSort('grand_total')} className={clsx('w-32 shrink-0 text-right hover:text-slate-200 transition', sortField==='grand_total'&&'text-blue-300')}>
                    Grand Total{sortIndicator('grand_total')}
                  </button>
                  <span className="w-6 shrink-0" />
                </div>

                {/* Rows */}
                <div className="divide-y divide-slate-100" style={{ maxHeight: 'calc(100vh - 420px)', overflowY: 'auto' }}>
                  {groupByMajorHead ? (() => {
                    const groups = {};
                    filteredSummary.forEach(s => {
                      const head = s.major_head || '(No Major Head)';
                      if (!groups[head]) groups[head] = {};
                      const cat = s.category || '(Uncategorized)';
                      if (!groups[head][cat]) groups[head][cat] = [];
                      groups[head][cat].push(s);
                    });
                    let globalIdx = 0;
                    return Object.entries(groups).map(([head, cats]) => {
                      const headTotal = Object.values(cats).flat().reduce((sum, s) => {
                        const r = parseFloat(s.unit_rate || 0);
                        return sum + rq3(s.closing_stock) * r * (1 + GST_RATE);
                      }, 0);
                      return (
                        <React.Fragment key={head}>
                          <div className="bg-slate-700 text-white px-4 py-2 text-xs font-bold uppercase tracking-widest flex items-center justify-between">
                            <span>{head}</span>
                            <span className="text-[10px] font-medium opacity-75">Grand Total: ₹{inr(headTotal)}</span>
                          </div>
                          {Object.entries(cats).map(([cat, catItems]) => (
                            <React.Fragment key={cat}>
                              <div className="bg-slate-100 px-5 py-1.5 text-[11px] font-bold text-slate-600 uppercase tracking-wider">{cat}</div>
                              {catItems.map((s) => {
                                globalIdx++;
                                const rate       = parseFloat(s.unit_rate || 0);
                                const opening    = rq3(s.opening_stock);
                                const closing    = rq3(s.closing_stock);
                                const closingVal = closing * rate;
                                const grandTotal = closingVal * (1 + GST_RATE);
                                const badge      = stockStatus(closing, s.min_stock, s.reorder_level);
                                const borderCls  = closing <= 0 ? 'border-l-red-500' : (parseFloat(s.min_stock) > 0 && closing <= parseFloat(s.min_stock)) ? 'border-l-red-400' : (parseFloat(s.reorder_level) > 0 && closing <= parseFloat(s.reorder_level)) ? 'border-l-amber-400' : 'border-l-emerald-400';
                                return (
                                  <div key={s.id} className={clsx('flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors border-l-4', borderCls)}>
                                    <span className="w-7 shrink-0 text-center text-xs text-slate-400 font-mono">{globalIdx}</span>
                                    <div className="flex-1 min-w-0">
                                      <div className="font-semibold text-slate-900 text-sm truncate">{s.material_name}</div>
                                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                        {cat !== '(Uncategorized)' && <span className="text-[11px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{cat}</span>}
                                        {s.project_name && <span className="text-[11px] text-slate-400 italic">{s.project_name}</span>}
                                      </div>
                                    </div>
                                    <div className="w-20 shrink-0 flex justify-center"><UnitSelectCell value={s.unit} onSave={v => updateMutation.mutate({ id: s.id, data: { unit: v } })} /></div>
                                    <div className="w-14 shrink-0 text-center text-xs font-medium text-slate-600">{s.dc_idc || '—'}</div>
                                    <div className="w-24 shrink-0 text-right font-mono text-sm text-slate-500">{qty(opening)}</div>
                                    <div className="w-40 shrink-0 text-right">
                                      <div className="text-xl font-black font-mono text-slate-900 leading-tight">{qty(closing)}</div>
                                      <span className={clsx('text-[10px] font-semibold px-1.5 py-0.5 rounded-full border', badge.cls)}>{badge.label}</span>
                                    </div>
                                    <div className="w-28 shrink-0 text-right text-sm font-medium text-slate-700">{rate > 0 ? `₹${inr(rate)}` : '—'}</div>
                                    <div className="w-32 shrink-0 text-right">
                                      <div className="text-sm font-bold font-mono text-emerald-700">{grandTotal > 0 ? `₹${inr(grandTotal)}` : '—'}</div>
                                      {showValues && closingVal > 0 && <div className="text-[10px] text-indigo-500 mt-0.5">Closing ₹{inr(closingVal)}</div>}
                                    </div>
                                    <div className="w-6 shrink-0 flex justify-center">
                                      <button onClick={() => { setSelectedMaterial(s); setTab('ledger'); }} title="View ledger" className="text-slate-300 hover:text-indigo-600 transition"><ChevronRight size={14} /></button>
                                    </div>
                                  </div>
                                );
                              })}
                            </React.Fragment>
                          ))}
                        </React.Fragment>
                      );
                    });
                  })() : pagedSummary.map((s, idx) => {
                    const rate       = parseFloat(s.unit_rate || 0);
                    const opening    = rq3(s.opening_stock);
                    const closing    = rq3(s.closing_stock);
                    const issued     = Math.max(0, opening - closing);
                    const closingVal = closing * rate;
                    const grandTotal = closingVal * (1 + GST_RATE);
                    const badge      = stockStatus(closing, s.min_stock, s.reorder_level);
                    const borderCls  = closing <= 0 ? 'border-l-red-500' : (parseFloat(s.min_stock) > 0 && closing <= parseFloat(s.min_stock)) ? 'border-l-red-400' : (parseFloat(s.reorder_level) > 0 && closing <= parseFloat(s.reorder_level)) ? 'border-l-amber-400' : 'border-l-emerald-400';

                    return (
                      <div key={s.id} className={clsx('flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors border-l-4', borderCls)}>

                        {/* SL */}
                        <span className="w-7 shrink-0 text-center text-xs text-slate-400 font-mono">{(currentPage - 1) * PAGE_SIZE + idx + 1}</span>

                        {/* Material name + editable category/head tags */}
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-slate-900 text-sm leading-snug truncate">{s.material_name}</div>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <EditableCell value={s.category} placeholder="+ category" onSave={v => updateMutation.mutate({ id: s.id, data: { category: v } })} />
                            {s.major_head && <span className="text-[11px] text-slate-400">· {s.major_head}</span>}
                            {s.project_name && <span className="text-[11px] text-slate-400 italic">· {s.project_name}</span>}
                          </div>
                          {showValues && (
                            <div className="flex items-center gap-3 mt-1.5 text-[11px] font-mono text-slate-500">
                              <span className="text-rose-600">Issued ₹{issued * rate > 0 ? inr(issued * rate) : '—'}</span>
                              <span className="text-slate-400">·</span>
                              <span className="text-indigo-600">Closing ₹{closingVal > 0 ? inr(closingVal) : '—'}</span>
                              <span className="text-slate-400">·</span>
                              <span className="text-amber-600">GST ₹{closingVal > 0 ? inr(closingVal * GST_RATE) : '—'}</span>
                            </div>
                          )}
                        </div>

                        {/* Unit */}
                        <div className="w-20 shrink-0 flex justify-center">
                          <UnitSelectCell value={s.unit} onSave={v => updateMutation.mutate({ id: s.id, data: { unit: v } })} />
                        </div>

                        {/* DC/IDC */}
                        <div className="w-14 shrink-0">
                          <select
                            value={s.dc_idc || ''}
                            onChange={e => updateMutation.mutate({ id: s.id, data: { dc_idc: e.target.value } })}
                            className="h-7 w-full rounded border border-slate-200 bg-slate-50 px-1 text-center text-xs font-bold uppercase text-slate-800 outline-none transition focus:border-slate-900 focus:bg-white"
                          >
                            <option value="">—</option>
                            <option value="DC">DC</option>
                            <option value="IDC">IDC</option>
                          </select>
                        </div>

                        {/* Opening */}
                        <div className="w-24 shrink-0 text-right">
                          <div className="text-[10px] text-slate-400 mb-0.5">Opening</div>
                          <EditableCell value={opening > 0 ? opening : ''} placeholder="0" numeric onSave={v => updateMutation.mutate({ id: s.id, data: { opening_stock: parseFloat(v) || 0 } })} />
                        </div>

                        {/* Closing — BIG number, most important */}
                        <div className="w-40 shrink-0 text-right">
                          <div className="text-[10px] text-slate-400 mb-0.5">Closing Stock</div>
                          <div className="flex items-baseline justify-end gap-1.5">
                            <EditableCell value={closing > 0 ? closing : ''} placeholder="0" numeric onSave={v => updateMutation.mutate({ id: s.id, data: { closing_stock: parseFloat(v) || 0 } })} />
                          </div>
                          <span className={clsx('text-[10px] font-semibold px-1.5 py-0.5 rounded-full border mt-0.5 inline-block', badge.cls)}>{badge.label}</span>
                        </div>

                        {/* Rate */}
                        <div className="w-28 shrink-0 text-right">
                          <div className="text-[10px] text-slate-400 mb-0.5">Rate</div>
                          <EditableCell value={rate > 0 ? rate.toFixed(2) : ''} placeholder="Set rate" prefix="₹" numeric onSave={v => updateMutation.mutate({ id: s.id, data: { unit_rate: parseFloat(v) } })} />
                        </div>

                        {/* Grand Total */}
                        <div className="w-32 shrink-0 text-right">
                          <div className="text-[10px] text-slate-400 mb-0.5">Grand Total</div>
                          <div className="text-sm font-bold font-mono text-emerald-700">{grandTotal > 0 ? `₹${inr(grandTotal)}` : '—'}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            <EditableCell value={s.remarks} placeholder="Add remark" onSave={v => updateMutation.mutate({ id: s.id, data: { remarks: v } })} />
                          </div>
                        </div>

                        {/* Ledger link */}
                        <div className="w-6 shrink-0 flex justify-center">
                          <button onClick={() => { setSelectedMaterial(s); setTab('ledger'); }} title="View ledger" className="text-slate-300 hover:text-indigo-600 transition">
                            <ChevronRight size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {filteredSummary.length === 0 && (
                    <div className="py-16 text-center">
                      <Package className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                      <p className="text-sm text-slate-500">
                        {inventoryData.length === 0
                          ? 'No inventory records yet. Materials appear here after IGN approval.'
                          : 'No materials match your filter.'}
                      </p>
                    </div>
                  )}
                </div>

                {/* Totals bar */}
                {filteredSummary.length > 0 && (
                  <div className="bg-slate-800 text-white px-4 py-2.5 flex items-center gap-3 text-xs font-semibold">
                    <span className="flex-1">TOTALS — {filteredSummary.length} items</span>
                    <span className="w-32 text-right font-mono text-indigo-300">Closing ₹{inr(totalClosingValue)}</span>
                    <span className="w-32 text-right font-mono text-amber-300">GST ₹{inr(totalGST)}</span>
                    <span className="w-32 text-right font-mono text-emerald-300">Grand ₹{inr(totalGrandTotal)}</span>
                    <span className="w-6 shrink-0" />
                  </div>
                )}
              </>
            )}
            {!invLoading && (
              <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50 text-xs text-slate-500 flex items-center justify-between flex-wrap gap-2">
                <span>
                  Showing {filteredSummary.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filteredSummary.length)} of {filteredSummary.length} materials
                  {filteredSummary.length !== inventoryData.length && ` (filtered from ${inventoryData.length})`}
                </span>
                <span className="flex items-center gap-1 text-slate-400">
                  <Edit2 size={10} /> Click category or rate to edit inline
                </span>
              </div>
            )}
            {!invLoading && totalPages > 1 && (
              <div className="px-4 py-2.5 border-t border-slate-100 bg-white flex items-center justify-center gap-1 flex-wrap">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium border border-slate-200 text-slate-900 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition"
                >
                  Prev
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 2)
                  .map((p, i, arr) => (
                    <React.Fragment key={p}>
                      {i > 0 && arr[i - 1] !== p - 1 && (
                        <span className="px-1 text-xs text-slate-400">…</span>
                      )}
                      <button
                        onClick={() => setPage(p)}
                        className={clsx(
                          'px-3 py-1 rounded-lg text-xs font-medium border transition',
                          p === currentPage
                            ? 'bg-indigo-600 border-indigo-600 text-white'
                            : 'border-slate-200 text-slate-900 hover:bg-slate-50'
                        )}
                      >
                        {p}
                      </button>
                    </React.Fragment>
                  ))}
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium border border-slate-200 text-slate-900 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          TAB 2: MONTHLY MOVEMENT
      ══════════════════════════════════════════════════════════ */}
      {tab === 'movement' && (
        <div className="space-y-4">

          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <BarChart2 className="w-4 h-4 text-slate-900 font-medium mb-2" />
              <div className="text-2xl font-medium text-slate-900">{movData.length}</div>
              <div className="text-xs text-slate-900 font-medium mt-0.5">Total Materials</div>
            </div>
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 shadow-sm">
              <TrendingUp className="w-4 h-4 text-emerald-500 mb-2" />
              <div className="text-2xl font-medium text-emerald-700">
                {movData.reduce((s, r) => s + parseFloat(r.received_qty || 0), 0).toFixed(0)}
              </div>
              <div className="text-xs text-emerald-500 mt-0.5">Units Received</div>
            </div>
            <div className="bg-rose-50 border border-rose-100 rounded-xl p-4 shadow-sm">
              <TrendingDown className="w-4 h-4 text-rose-500 mb-2" />
              <div className="text-2xl font-medium text-rose-700">
                {movData.reduce((s, r) => s + parseFloat(r.issued_qty || 0), 0).toFixed(0)}
              </div>
              <div className="text-xs text-rose-500 mt-0.5">Units Issued</div>
            </div>
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 shadow-sm">
              <IndianRupee className="w-4 h-4 text-indigo-500 mb-2" />
              <div className="text-lg font-medium text-indigo-700 font-mono">₹{inr(movTotalValue)}</div>
              <div className="text-xs text-indigo-500 mt-0.5">Closing Stock Value</div>
            </div>
          </div>

          {/* Alerts */}
          {(movOutOfStock.length > 0 || movSlowMoving.length > 0) && (
            <div className="flex flex-wrap gap-3">
              {movOutOfStock.length > 0 && (
                <div className="flex items-center gap-2 px-4 py-2.5 bg-red-50 border border-red-200 rounded-xl text-sm font-medium text-red-700">
                  <AlertTriangle className="w-4 h-4" /> {movOutOfStock.length} out of stock
                </div>
              )}
              {movSlowMoving.length > 0 && (
                <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-sm font-medium text-amber-700">
                  <AlertTriangle className="w-4 h-4" /> {movSlowMoving.length} slow-moving (no issue this month)
                </div>
              )}
            </div>
          )}

          {/* Toolbar */}
          <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-wrap items-center gap-3 shadow-sm">
            {/* Sub-tabs */}
            <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
              {[['register','Monthly Register'],['valuation','Valuation'],[`slow`,`Slow Moving (${movSlowMoving.length})`]].map(([k,l]) => (
                <button key={k} onClick={() => setMovTab(k)}
                  className={clsx('px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                    movTab === k ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-900 font-medium hover:text-slate-700'
                  )}>{l}</button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-slate-900 font-semibold" />
              <input type="month" value={month} onChange={e => setMonth(e.target.value)}
                className="h-9 bg-slate-50 border border-slate-200 rounded-lg px-3 text-sm outline-none focus:border-indigo-400" />
            </div>
            <select value={projectFilter} onChange={e => setProjectFilter(e.target.value)}
              className="h-9 bg-slate-50 border border-slate-200 rounded-lg px-3 text-sm outline-none focus:border-indigo-400">
              <option value="">All Projects</option>
              {projectsData.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <div className="relative flex-1 min-w-40">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-900 font-semibold" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search material…"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-4 py-2 text-sm outline-none focus:border-indigo-400" />
            </div>
            <button onClick={() => movRefetch()} className="w-9 h-9 flex items-center justify-center border border-slate-200 rounded-lg text-slate-900 font-medium hover:text-slate-900 transition bg-white">
              <RefreshCw size={14} />
            </button>
            <button onClick={exportMovCSV} className="flex items-center gap-1.5 h-9 px-3 border border-slate-200 rounded-lg text-sm text-slate-900 hover:border-slate-300 transition bg-white">
              <Download size={14} /> CSV
            </button>
            <button onClick={printActiveReport} className="flex items-center gap-1.5 h-9 px-3 border border-blue-200 rounded-lg text-sm font-bold text-blue-800 hover:bg-blue-50 transition bg-white">
              <Printer size={14} /> Print
            </button>
            <button onClick={exportActivePDF} className="flex items-center gap-1.5 h-9 px-3 border border-emerald-200 rounded-lg text-sm font-bold text-emerald-800 hover:bg-emerald-50 transition bg-white">
              <FileText size={14} /> PDF
            </button>
          </div>

          {/* Monthly Register table */}
          {movTab === 'register' && (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="store-ledger-scroll store-ledger-table-shell">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-800 text-white">
                      {['#','Material','Unit','Opening','Received','+Total','Issued','Closing','Receive vs Issue'].map((h, i) => (
                        <th key={h} className={clsx('px-3 py-3 text-[11px] font-medium uppercase tracking-[0.10em] whitespace-nowrap',
                          i >= 3 ? 'text-right' : 'text-left',
                          i === 5 && 'bg-emerald-700', i === 7 && 'bg-indigo-700'
                        )}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {movLoading ? [...Array(6)].map((_, i) => (
                      <tr key={i}><td colSpan={9} className="px-3 py-3"><div className="h-4 bg-slate-100 animate-pulse rounded" /></td></tr>
                    )) : movFiltered.map((row, idx) => {
                      const closing  = parseFloat(row.closing_stock || 0);
                      const received = parseFloat(row.received_qty  || 0);
                      const issued   = parseFloat(row.issued_qty    || 0);
                      const opening  = parseFloat(row.opening_stock || 0);
                      const total    = parseFloat(row.total_qty     || 0);
                      const reorder  = parseFloat(row.reorder_level || 0);
                      const isOut    = closing <= 0;
                      const isLow    = !isOut && reorder > 0 && closing <= reorder;
                      return (
                        <tr key={row.id || idx} className={clsx('hover:bg-slate-50 transition-colors',
                          isOut && 'bg-red-50/40', isLow && !isOut && 'bg-amber-50/40'
                        )}>
                          <td className="px-3 py-2.5 text-xs text-slate-900 font-medium font-mono">{idx + 1}</td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-medium text-slate-900 font-medium">{row.material_name}</span>
                              {isOut && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-600 border border-red-100 font-bold">Out</span>}
                              {!isOut && issued === 0 && opening > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 border border-amber-100 font-bold">Slow</span>}
                            </div>
                            {row.category && <div className="text-[10px] text-slate-900 font-medium mt-0.5">{row.category}</div>}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <span className="text-xs font-medium uppercase text-slate-900 font-medium bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded">{row.unit}</span>
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-xs text-slate-900 font-bold">{fmt2(opening)}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-xs font-medium text-emerald-600">{received > 0 ? `+${fmt2(received)}` : '—'}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-xs font-medium text-slate-900 bg-emerald-50/20">{fmt2(total)}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-xs font-medium text-rose-600">{issued > 0 ? `−${fmt2(issued)}` : '—'}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-xs font-medium bg-indigo-50/20">
                            <span className={isOut ? 'text-red-600' : isLow ? 'text-amber-600' : 'text-slate-900'}>{fmt2(closing)}</span>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-emerald-600 w-10 text-right font-mono">{received.toFixed(1)}</span>
                                <MiniBar value={received} max={movMaxQty} color="bg-emerald-400" />
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-rose-500 w-10 text-right font-mono">{issued.toFixed(1)}</span>
                                <MiniBar value={issued} max={movMaxQty} color="bg-rose-400" />
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {!movLoading && movFiltered.length === 0 && (
                      <tr><td colSpan={9} className="py-16 text-center">
                        <Package className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                        <p className="text-sm text-slate-900 font-semibold">No data for {dayjs(month).format('MMMM YYYY')}</p>
                      </td></tr>
                    )}
                  </tbody>
                  {!movLoading && movFiltered.length > 0 && (
                    <tfoot>
                      <tr className="bg-slate-800 text-white text-xs font-bold">
                        <td colSpan={3} className="px-3 py-2.5 uppercase tracking-wide">Totals ({movFiltered.length} items)</td>
                        <td className="px-3 py-2.5 text-right font-mono">{movFiltered.reduce((s,r) => s + parseFloat(r.opening_stock||0), 0).toFixed(2)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-emerald-300">+{movFiltered.reduce((s,r) => s + parseFloat(r.received_qty||0), 0).toFixed(2)}</td>
                        <td className="px-3 py-2.5 text-right font-mono bg-emerald-800">{movFiltered.reduce((s,r) => s + parseFloat(r.total_qty||0), 0).toFixed(2)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-rose-300">−{movFiltered.reduce((s,r) => s + parseFloat(r.issued_qty||0), 0).toFixed(2)}</td>
                        <td className="px-3 py-2.5 text-right font-mono bg-indigo-800">{movFiltered.reduce((s,r) => s + parseFloat(r.closing_stock||0), 0).toFixed(2)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )}

          {/* Valuation table */}
          {movTab === 'valuation' && (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="store-ledger-scroll store-ledger-table-shell">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-800 text-white">
                      {['#','Material Description','Unit','Closing Stock','Rate (₹)','Stock Value (₹)'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-[0.10em] whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {movLoading ? [...Array(5)].map((_, i) => (
                      <tr key={i}><td colSpan={6} className="px-4 py-3"><div className="h-4 bg-slate-100 animate-pulse rounded" /></td></tr>
                    )) : movFiltered
                        .filter(r => parseFloat(r.closing_stock || 0) > 0 && parseFloat(r.rate || 0) > 0)
                        .sort((a, b) => parseFloat(b.stock_value || 0) - parseFloat(a.stock_value || 0))
                        .map((row, idx) => {
                          const val = parseFloat(row.closing_stock || 0) * parseFloat(row.rate || 0);
                          const pct = movTotalValue > 0 ? val / movTotalValue * 100 : 0;
                          return (
                            <tr key={row.id || idx} className="hover:bg-slate-50">
                              <td className="px-4 py-2.5 text-xs text-slate-900 font-medium font-mono">{idx + 1}</td>
                              <td className="px-4 py-2.5">
                                <div className="text-xs font-medium text-slate-900 font-medium">{row.material_name}</div>
                                {row.category && <div className="text-[10px] text-slate-900 font-semibold">{row.category}</div>}
                              </td>
                              <td className="px-4 py-2.5">
                                <span className="text-xs font-medium uppercase text-slate-900 font-medium bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded">{row.unit}</span>
                              </td>
                              <td className="px-4 py-2.5 text-xs font-mono font-medium text-slate-700">{fmt2(row.closing_stock)}</td>
                              <td className="px-4 py-2.5 text-xs font-mono text-slate-600">₹{inr(row.rate)}</td>
                              <td className="px-4 py-2.5">
                                <div className="flex items-center gap-3">
                                  <span className="text-xs font-medium font-mono text-indigo-600">₹{inr(val.toFixed(2))}</span>
                                  <MiniBar value={val} max={movTotalValue} color="bg-indigo-400" />
                                  <span className="text-[10px] text-slate-900 font-semibold">{pct.toFixed(1)}%</span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-indigo-50 border-t-2 border-indigo-200">
                      <td colSpan={5} className="px-4 py-3 text-xs font-medium text-indigo-700 uppercase text-right">Total Stock Value</td>
                      <td className="px-4 py-3 text-sm font-medium font-mono text-indigo-700">₹{inr(movTotalValue.toFixed(2))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Slow moving */}
          {movTab === 'slow' && (
            <div className="space-y-4">
              {movSlowMoving.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                  <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-800">
                    <span className="font-bold">{movSlowMoving.length} items</span> had stock but zero issuance in {dayjs(month).format('MMMM YYYY')}. Consider reviewing procurement or redistributing.
                  </p>
                </div>
              )}
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-800 text-white">
                      {['Material','Category','Unit','Opening Stock','Closing Stock','Last Issued'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-[0.10em]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {movSlowMoving.filter(r => !search || r.material_name?.toLowerCase().includes(search.toLowerCase()))
                      .map((row, idx) => (
                        <tr key={row.id || idx} className="hover:bg-amber-50/30">
                          <td className="px-4 py-2.5 text-xs font-medium text-slate-900 font-medium">{row.material_name}</td>
                          <td className="px-4 py-2.5 text-xs text-slate-900 font-bold">{row.category || '—'}</td>
                          <td className="px-4 py-2.5"><span className="text-xs font-medium uppercase text-slate-900 font-medium bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded">{row.unit}</span></td>
                          <td className="px-4 py-2.5 text-xs font-mono text-slate-600">{fmt2(row.opening_stock)}</td>
                          <td className="px-4 py-2.5 text-xs font-medium font-mono text-amber-600">{fmt2(row.closing_stock)}</td>
                          <td className="px-4 py-2.5 text-xs text-slate-900 font-semibold">{row.last_issued_at ? dayjs(row.last_issued_at).format('DD MMM YYYY') : 'Never issued'}</td>
                        </tr>
                      ))}
                    {movSlowMoving.length === 0 && (
                      <tr><td colSpan={6} className="py-12 text-center">
                        <CheckCircle2 className="w-8 h-8 text-emerald-300 mx-auto mb-3" />
                        <p className="text-sm text-slate-900 font-semibold">All stocked items had at least one issue this month</p>
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          TAB 3: MATERIAL LEDGER (transaction history)
      ══════════════════════════════════════════════════════════ */}
      {tab === 'ledger' && (
        <div className="space-y-5">
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <label className="text-xs font-medium text-slate-900 font-medium block mb-2">Select Material</label>
            <select
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-400 transition-all"
              value={selectedMaterial?.id ?? ''}
              onChange={e => setSelectedMaterial(inventoryData.find(m => m.id === e.target.value) || null)}
            >
              <option value="">Choose a material for ledger view…</option>
              {inventoryData.map(m => (
                <option key={m.id} value={m.id}>{m.material_name} — {m.project_name} ({m.unit})</option>
              ))}
            </select>
          </div>

          {selectedMaterial ? (
            <div className="space-y-5">
              {/* Ledger header */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-medium text-slate-900">{selectedMaterial.material_name}</h2>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="px-2.5 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-900 border border-slate-200">{selectedMaterial.unit}</span>
                    <span className="px-2.5 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-600 border border-indigo-100">{selectedMaterial.project_name}</span>
                    {selectedMaterial.category && (
                      <span className="px-2.5 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700 border border-amber-100">{selectedMaterial.category}</span>
                    )}
                    {selectedMaterial.site_location && (
                      <span className="px-2.5 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-900 font-medium border border-slate-200">{selectedMaterial.site_location}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={printActiveReport} className="flex h-9 items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 text-xs font-bold text-blue-800 hover:bg-blue-100">
                    <Printer size={14} /> Print
                  </button>
                  <button onClick={exportActivePDF} className="flex h-9 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-bold text-emerald-800 hover:bg-emerald-100">
                    <FileText size={14} /> PDF
                  </button>
                </div>
                <div className="flex items-center gap-6 bg-slate-50 border border-slate-100 px-6 py-4 rounded-xl">
                  <div className="text-center">
                    <div className="text-xs text-slate-900 font-medium mb-1">Opening Stock</div>
                    <div className="text-xl font-medium font-mono text-slate-900 font-bold">{qty(selectedMaterial.opening_stock)}</div>
                    {parseFloat(selectedMaterial.unit_rate) > 0 && (
                      <div className="text-xs text-slate-900 font-medium mt-0.5 font-mono">
                        ₹{inr(parseFloat(selectedMaterial.opening_stock || 0) * parseFloat(selectedMaterial.unit_rate || 0))}
                      </div>
                    )}
                  </div>
                  <div className="w-px bg-slate-200 h-10" />
                  <div className="text-center">
                    <div className="text-xs text-slate-900 font-medium mb-1">Current Balance</div>
                    <div className="text-xl font-medium font-mono text-slate-900">{qty(selectedMaterial.closing_stock)}</div>
                    {parseFloat(selectedMaterial.unit_rate) > 0 && (
                      <div className="text-xs text-indigo-600 mt-0.5 font-mono font-bold">
                        ₹{inr(parseFloat(selectedMaterial.closing_stock || 0) * parseFloat(selectedMaterial.unit_rate || 0))}
                      </div>
                    )}
                  </div>
                  {parseFloat(selectedMaterial.unit_rate) > 0 && (
                    <>
                      <div className="w-px bg-slate-200 h-10" />
                      <div className="text-center">
                        <div className="text-xs text-slate-900 font-medium mb-1">Unit Rate</div>
                        <div className="text-lg font-medium font-mono text-slate-700">₹{Number(selectedMaterial.unit_rate).toFixed(2)}</div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Transactions table */}
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                {ledgerLoading ? (
                  <div className="flex items-center justify-center py-16 gap-3 text-slate-900 font-semibold">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span className="text-sm">Loading transactions…</span>
                  </div>
                ) : (
                  <div className="store-ledger-scroll store-ledger-table-shell">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                          {['Date', 'Type', 'Reference', 'Receipt (+)', 'Issue (−)', 'Value (₹)', 'Narration', 'By'].map(h => (
                            <th key={h} className={clsx(
                              'px-4 py-3 text-xs font-medium text-slate-900 font-medium uppercase tracking-wider',
                              ['Receipt (+)', 'Issue (−)', 'Value (₹)'].includes(h) ? 'text-right' : 'text-left'
                            )}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {/* Opening row */}
                        <tr className="bg-slate-50/50">
                          <td className="px-4 py-3 text-slate-900 font-medium text-xs">—</td>
                          <td className="px-4 py-3">
                            <span className="px-2.5 py-1 rounded-full text-xs font-medium border bg-slate-100 text-slate-900 font-medium border-slate-200">Opening</span>
                          </td>
                          <td className="px-4 py-3 text-slate-900 font-medium text-xs font-mono">—</td>
                          <td className="px-4 py-3 text-right text-slate-900 font-medium text-xs">—</td>
                          <td className="px-4 py-3 text-right text-slate-900 font-medium text-xs">—</td>
                          <td className="px-4 py-3 text-right text-xs font-mono text-slate-900 font-bold">
                            {parseFloat(ledgerInventory?.unit_rate) > 0
                              ? `₹${inr(parseFloat(ledgerInventory?.opening_stock || 0) * parseFloat(ledgerInventory?.unit_rate || 0))}`
                              : '—'}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-900 font-semibold" colSpan={2}>
                            Opening balance: {qty(selectedMaterial.opening_stock)} {selectedMaterial.unit}
                          </td>
                        </tr>

                        {transactions.map((txn, i) => {
                          const cfg = TYPE_CONFIG[txn.transaction_type] || TYPE_CONFIG.issue;
                          const isReceipt = txn.transaction_type === 'grn' || txn.transaction_type === 'transfer_in';
                          const isIssue   = txn.transaction_type === 'issue' || txn.transaction_type === 'transfer_out';
                          const txnQty    = parseFloat(txn.quantity || 0);
                          const rate      = parseFloat(ledgerInventory?.unit_rate || 0);
                          const txnValue  = txnQty * rate;
                          return (
                            <tr key={i} className="hover:bg-slate-50 transition-colors">
                              <td className="px-4 py-3 text-xs text-slate-900 whitespace-nowrap">
                                {dayjs(txn.transacted_at).format('DD MMM YYYY')}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <span className={clsx('px-2.5 py-1 rounded-full text-xs font-medium border', cfg.bg, cfg.color)}>
                                  {cfg.label}
                                </span>
                              </td>
                              <td className="px-4 py-3 font-mono text-xs text-slate-900 font-bold">{txn.reference_number || '—'}</td>
                              <td className="px-4 py-3 font-mono text-sm font-medium text-emerald-600 text-right">
                                {isReceipt ? `+${txnQty.toFixed(3)}` : '—'}
                              </td>
                              <td className="px-4 py-3 font-mono text-sm font-medium text-rose-500 text-right">
                                {isIssue ? `−${txnQty.toFixed(3)}`
                                  : txn.transaction_type === 'adjustment' ? `±${txnQty.toFixed(3)}` : '—'}
                              </td>
                              <td className="px-4 py-3 font-mono text-xs text-slate-900 text-right">
                                {rate > 0 ? `₹${inr(txnValue)}` : '—'}
                              </td>
                              <td className="px-4 py-3 text-xs text-slate-900 font-medium max-w-xs truncate">{txn.remarks || '—'}</td>
                              <td className="px-4 py-3 text-xs text-slate-900 font-semibold">{txn.transacted_by_name || '—'}</td>
                            </tr>
                          );
                        })}

                        {transactions.length === 0 && (
                          <tr>
                            <td colSpan={8} className="py-12 text-center">
                              <Package className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                              <p className="text-sm text-slate-900 font-semibold">No transactions recorded yet for this material.</p>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl p-16 text-center shadow-sm">
              <BookOpen className="w-10 h-10 text-slate-300 mx-auto mb-4" />
              <p className="text-sm font-medium text-slate-900 font-semibold">Select a material above to view its ledger</p>
            </div>
          )}
        </div>
      )}

      {/* Import Modal */}
      {showImport && (
        <ImportModal
          projects={projectsData}
          onClose={() => setShowImport(false)}
          onDone={() => qc.invalidateQueries({ queryKey: ['inventory'] })}
        />
      )}
      </div>
    </div>
  );
}
