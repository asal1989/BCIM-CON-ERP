// src/pages/stores/StoreLedgerPage.jsx
import React, { useState, useRef } from 'react';
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
import toast from 'react-hot-toast';

const GST_RATE = 0.18;
const STORE_UNITS = [
  'Nos', 'Bags', 'Kgs', 'MT', 'Ton', 'Cum', 'Sqm', 'Rmt', 'Ltr', 'Box',
  'Packet', 'Roll', 'Set', 'Pair', 'Pairs', 'Coils', 'LS',
];
const DEFAULT_CATEGORIES = ['Masonry Works'];

/* ── helpers ─────────────────────────────────────────────────── */
const inr = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qty = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
const fmt2 = (n) => Number(n || 0).toFixed(2);

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
    <div className={clsx('rounded-xl border p-4 shadow-sm transition hover:shadow-md', t.wrap)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">{label}</p>
          <p className={clsx('mt-2 text-2xl font-black tracking-tight', t.value)}>{value}</p>
          {sub && <p className={clsx('mt-1 text-xs font-semibold', t.sub)}>{sub}</p>}
        </div>
        <div className={clsx('flex h-9 w-9 items-center justify-center rounded-lg shadow-sm', t.icon)}>
          <Icon size={17} />
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
  const headers = ['Category', 'MATERIAL DESCRIPTION', 'Unit', 'OPENING STOCK', 'CLOSING STOCK', 'RATE'];
  const samples = [
    ['Cement', 'OPC 53 Grade Cement', 'Bags', '500', '320', '380'],
    ['Steel', '8mm dia TMT Bar Fe500', 'MT', '12.5', '8.2', '58000'],
    ['Steel', '12mm dia TMT Bar Fe500', 'MT', '8.0', '5.5', '58500'],
    ['Aggregate', '20mm Crushed Stone', 'CUM', '50', '30', '1200'],
    ['Sand', 'M-Sand / River Sand', 'CUM', '40', '22', '900'],
    ['Electrical', 'Binding Wire Coil', 'Coils', '25', '18', '950'],
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
              Columns used: Category · Material Description · Unit · Opening Stock · Closing Stock · Rate
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
                      <th className="px-3 py-2 text-left font-bold">MATERIAL DESCRIPTION</th>
                      <th className="px-3 py-2 text-center font-bold">UNIT</th>
                      <th className="px-3 py-2 text-right font-bold">OPENING STOCK</th>
                      <th className="px-3 py-2 text-right font-bold">CLOSING STOCK</th>
                      <th className="px-3 py-2 text-right font-bold">RATE (₹)</th>
                      <th className="px-3 py-2 text-right font-medium bg-indigo-700">CLOSING VALUE</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {preview.map((row, i) => {
                      const closingVal = (row.closing_stock || 0) * (row.unit_rate || 0);
                      return (
                        <tr key={i} className={clsx('hover:bg-slate-50', i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40')}>
                          <td className="px-3 py-2 text-slate-900 font-medium font-mono">{i + 1}</td>
                          <td className="px-3 py-2 text-slate-600">{row.category || <span className="text-slate-300 italic">—</span>}</td>
                          <td className="px-3 py-2 font-medium text-slate-900 font-medium">{row.material_name}</td>
                          <td className="px-3 py-2 text-center font-medium text-slate-900 uppercase">{row.unit}</td>
                          <td className="px-3 py-2 text-right font-mono text-slate-900 font-bold">{row.opening_stock}</td>
                          <td className="px-3 py-2 text-right font-mono font-medium text-slate-900">{row.closing_stock}</td>
                          <td className="px-3 py-2 text-right font-mono text-slate-700">
                            {row.unit_rate > 0 ? `₹${inr(row.unit_rate)}` : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-medium text-indigo-700 bg-indigo-50/30">
                            {closingVal > 0 ? `₹${inr(closingVal)}` : '—'}
                          </td>
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
  const [tab, setTab]                     = useState('summary');
  const [selectedMaterial, setSelectedMaterial] = useState(null);
  const [search, setSearch]               = useState('');
  const [filterStatus, setFilterStatus]   = useState('all');
  const [projectFilter, setProjectFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [showImport, setShowImport]       = useState(false);
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
  const categories = [...new Set([...DEFAULT_CATEGORIES, ...inventoryData.map(s => s.category).filter(Boolean)])].sort();

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
    if (categoryFilter && s.category !== categoryFilter) return false;
    if (search && !s.material_name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // Summary totals for footer
  const totalOpeningValue  = filteredSummary.reduce((sum, s) => sum + (parseFloat(s.opening_stock || 0) * parseFloat(s.unit_rate || 0)), 0);
  const totalIssuedValue   = filteredSummary.reduce((sum, s) => {
    const issued = Math.max(0, parseFloat(s.opening_stock || 0) - parseFloat(s.closing_stock || 0));
    return sum + issued * parseFloat(s.unit_rate || 0);
  }, 0);
  const totalClosingValue  = filteredSummary.reduce((sum, s) => sum + (parseFloat(s.closing_stock || 0) * parseFloat(s.unit_rate || 0)), 0);
  const totalGST           = totalClosingValue * GST_RATE;
  const totalGrandTotal    = totalClosingValue + totalGST;

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
    const headers = ['SL NO','Category','Material Description','Unit','Opening Stock','Closing Stock','Rate (₹)','Total Issued Stock Value','Opening Stock Value','Closing Stock Value','GST @18%','Grand Total'];
    const rows = filteredSummary.map((s, idx) => {
      const rate       = parseFloat(s.unit_rate  || 0);
      const opening    = parseFloat(s.opening_stock || 0);
      const closing    = parseFloat(s.closing_stock || 0);
      const issued     = Math.max(0, opening - closing);
      const issuedVal  = (issued   * rate).toFixed(2);
      const openingVal = (opening  * rate).toFixed(2);
      const closingVal = (closing  * rate).toFixed(2);
      const gst        = (closing  * rate * GST_RATE).toFixed(2);
      const grand      = (closing  * rate * (1 + GST_RATE)).toFixed(2);
      return [idx + 1, s.category || '', s.material_name, s.unit, opening, closing, rate, issuedVal, openingVal, closingVal, gst, grand];
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
      columns: ['SL No', 'Category', 'Material Description', 'Unit', 'Opening Stock', 'Closing Stock', 'Rate', 'Issued Value', 'Opening Value', 'Closing Value', 'GST 18%', 'Grand Total'],
      rows: filteredSummary.map((s, idx) => {
        const rate = parseFloat(s.unit_rate || 0);
        const opening = parseFloat(s.opening_stock || 0);
        const closing = parseFloat(s.closing_stock || 0);
        const issued = Math.max(0, opening - closing);
        const issuedVal = issued * rate;
        const openingVal = opening * rate;
        const closingVal = closing * rate;
        const gst = closingVal * GST_RATE;
        const grand = closingVal + gst;
        return [
          idx + 1,
          s.category || '',
          s.material_name || '',
          s.unit || '',
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
      totals: ['Totals', '', '', '', '', '', '', inr(totalIssuedValue), inr(totalOpeningValue), inr(totalClosingValue), inr(totalGST), inr(totalGrandTotal)],
    };
  };

  const printActiveReport = () => {
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
          body { margin: 24px; font-family: Arial, sans-serif; color: #0f172a; }
          .head { display: flex; justify-content: space-between; gap: 16px; border-bottom: 3px solid #0f2d6b; padding-bottom: 12px; margin-bottom: 16px; }
          h1 { margin: 0; font-size: 20px; color: #0f2d6b; letter-spacing: .04em; text-transform: uppercase; }
          .sub { margin-top: 4px; font-size: 12px; color: #475569; font-weight: 700; }
          table { width: 100%; border-collapse: collapse; font-size: 9px; }
          th { background: #0f2d6b; color: #fff; text-align: left; padding: 7px 6px; border: 1px solid #94a3b8; }
          td { padding: 6px; border: 1px solid #cbd5e1; vertical-align: top; }
          td:nth-child(n+5), th:nth-child(n+5) { text-align: right; }
          .total-row td { background: #eaf1ff; font-weight: 800; color: #0f2d6b; }
          @page { size: A4 landscape; margin: 10mm; }
        </style>
      </head>
      <body>
        <div class="head">
          <div>
            <h1>${escapeHtml(report.title)}</h1>
            <div class="sub">BCIM Engineering Pvt Ltd</div>
          </div>
          <div class="sub">${dayjs().format('DD MMM YYYY, hh:mm A')}</div>
        </div>
        <table>
          <thead><tr>${headerCells}</tr></thead>
          <tbody>${bodyRows}${totalRow}</tbody>
        </table>
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
        }
        .store-ledger-scroll::-webkit-scrollbar { width: 5px; height: 5px; }
        .store-ledger-scroll::-webkit-scrollbar-track { background: transparent; }
        .store-ledger-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
        .store-ledger-scroll::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
        .store-ledger-table-shell {
          max-height: calc(100vh - 300px);
          min-height: 320px;
          overflow: auto;
        }
        @media (max-width: 1024px) {
          .store-ledger-table-shell { max-height: calc(100vh - 360px); }
        }
        /* Sticky table headers inside overflow containers */
        .store-ledger-table-shell table thead {
          position: sticky;
          top: 0;
          z-index: 2;
        }
      `}</style>

      <div className="p-6 md:p-8 max-w-full mx-auto">


      {/* ── Tabs — sticky below PageHeader ─────────────────────── */}
      <div
        className="sticky z-[15] -mx-6 px-6 md:-mx-8 md:px-8 pb-3"
        style={{ top: '104px', background: Theme.pageBg }}
      >
        <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Stores Control</p>
            <h2 className="mt-1 text-xl font-black tracking-tight text-slate-950">Material Stock Ledger</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">Stock balance, monthly movement and item-wise transactions in one register.</p>
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

      <div className="mb-6" />

      {/* ══════════════════════════════════════════════════════════
          TAB 1: STOCK REPORT (Excel-matching columns)
      ══════════════════════════════════════════════════════════ */}
      {tab === 'summary' && (
        <div className="space-y-4">

          {/* KPI cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
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
          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:flex-row md:items-center md:flex-wrap">
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
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
            >
              <option value="">All Categories</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
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

          {/* ── Stock Report Table (Excel columns) ─────────────── */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            {invLoading ? (
              <div className="flex items-center justify-center py-20 gap-3 text-slate-900 font-semibold">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">Loading inventory…</span>
              </div>
            ) : (
              <div className="store-ledger-scroll store-ledger-table-shell">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-800 text-white">
                      {/* Matches Excel columns exactly */}
                      <th className="px-3 py-3 text-center text-[11px] font-medium uppercase tracking-[0.10em] w-12">SL NO</th>
                      <th className="px-3 py-3 text-left   text-[11px] font-medium uppercase tracking-[0.10em]">CATEGORY</th>
                      <th className="px-3 py-3 text-left   text-[11px] font-medium uppercase tracking-[0.10em]">MATERIAL DESCRIPTION</th>
                      <th className="px-3 py-3 text-center text-[11px] font-medium uppercase tracking-[0.10em] w-16">UNIT</th>
                      <th className="px-3 py-3 text-right  text-[11px] font-medium uppercase tracking-[0.10em]">OPENING STOCK</th>
                      <th className="px-3 py-3 text-right  text-[11px] font-medium uppercase tracking-[0.10em]">CLOSING STOCK</th>
                      <th className="px-3 py-3 text-right  text-[11px] font-medium uppercase tracking-[0.10em]">RATE (₹)</th>
                      <th className="px-3 py-3 text-right  text-[11px] font-medium uppercase tracking-[0.10em] bg-rose-700">TOTAL ISSUED STOCK VALUE</th>
                      <th className="px-3 py-3 text-right  text-[11px] font-medium uppercase tracking-[0.10em] bg-slate-700">OPENING STOCK VALUE TOTAL</th>
                      <th className="px-3 py-3 text-right  text-[11px] font-medium uppercase tracking-[0.10em] bg-indigo-700">CLOSING STOCK VALUE TOTAL</th>
                      <th className="px-3 py-3 text-right  text-[11px] font-medium uppercase tracking-[0.10em] bg-amber-700">GST @18%</th>
                      <th className="px-3 py-3 text-right  text-[11px] font-medium uppercase tracking-[0.10em] bg-emerald-700">GRAND TOTAL</th>
                      <th className="px-3 py-3 text-center text-[11px] font-medium uppercase tracking-[0.10em] w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredSummary.map((s, idx) => {
                      const rate        = parseFloat(s.unit_rate || 0);
                      const opening     = parseFloat(s.opening_stock || 0);
                      const closing     = parseFloat(s.closing_stock || 0);
                      const issued      = Math.max(0, opening - closing);
                      const issuedVal   = issued   * rate;
                      const openingVal  = opening  * rate;
                      const closingVal  = closing  * rate;
                      const gst         = closingVal * GST_RATE;
                      const grandTotal  = closingVal + gst;
                      const badge       = stockStatus(s.closing_stock, s.min_stock, s.reorder_level);

                      return (
                        <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-3 py-3 text-center text-[13px] text-slate-900 font-medium font-mono">{idx + 1}</td>

                          {/* Category — inline editable */}
                          <td className="px-3 py-3 text-[13px] font-medium text-slate-900">
                            <EditableCell
                              value={s.category}
                              placeholder="Set category"
                              onSave={v => updateMutation.mutate({ id: s.id, data: { category: v } })}
                            />
                          </td>

                          <td className="px-3 py-3">
                            <div className="font-medium text-slate-900 text-[13px] tracking-tight">{s.material_name}</div>
                            <div className="text-[11px] text-slate-900 font-medium mt-0.5">{s.project_name}</div>
                          </td>

                          <td className="px-3 py-3 text-center text-[13px] font-medium text-slate-900 font-medium uppercase">
                            <UnitSelectCell
                              value={s.unit}
                              onSave={v => updateMutation.mutate({ id: s.id, data: { unit: v } })}
                            />
                          </td>

                          <td className="px-3 py-3 text-right font-mono text-[13px] text-slate-900 font-medium">{qty(opening)}</td>
                          <td className="px-3 py-3 text-right font-mono text-[13px] font-medium text-slate-900">
                            <div>{qty(closing)}</div>
                            <span className={clsx('text-[10px] font-medium px-1.5 py-0.5 rounded-full border mt-0.5 inline-block', badge.cls)}>
                              {badge.label}
                            </span>
                          </td>

                          {/* Rate — inline editable */}
                          <td className="px-3 py-3 text-right text-[13px] font-medium text-slate-900">
                            <EditableCell
                              value={rate > 0 ? rate.toFixed(2) : ''}
                              placeholder="Set rate"
                              prefix="₹"
                              numeric
                              onSave={v => updateMutation.mutate({ id: s.id, data: { unit_rate: parseFloat(v) } })}
                            />
                          </td>

                          {/* Calculated value columns */}
                          <td className="px-3 py-3 text-right font-mono text-[13px] font-medium text-rose-700 bg-rose-50/40 tracking-tight">
                            {issuedVal > 0 ? `₹${inr(issuedVal)}` : '—'}
                          </td>
                          <td className="px-3 py-3 text-right font-mono text-[13px] font-medium text-slate-900 bg-slate-50 tracking-tight">
                            {openingVal > 0 ? `₹${inr(openingVal)}` : '—'}
                          </td>
                          <td className="px-3 py-3 text-right font-mono text-[13px] font-medium text-indigo-800 bg-indigo-50/40 tracking-tight">
                            {closingVal > 0 ? `₹${inr(closingVal)}` : '—'}
                          </td>
                          <td className="px-3 py-3 text-right font-mono text-[13px] font-medium text-amber-800 bg-amber-50/40 tracking-tight">
                            {gst > 0 ? `₹${inr(gst)}` : '—'}
                          </td>
                          <td className="px-3 py-3 text-right font-mono text-[13px] font-medium text-emerald-800 bg-emerald-50/40 tracking-tight">
                            {grandTotal > 0 ? `₹${inr(grandTotal)}` : '—'}
                          </td>

                          <td className="px-3 py-3 text-center">
                            <button
                              onClick={() => { setSelectedMaterial(s); setTab('ledger'); }}
                              title="View ledger"
                              className="text-slate-300 hover:text-indigo-600 transition"
                            >
                              <ChevronRight size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}

                    {filteredSummary.length === 0 && (
                      <tr>
                        <td colSpan={13} className="py-16 text-center">
                          <Package className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                          <p className="text-sm text-slate-900 font-semibold">
                            {inventoryData.length === 0
                              ? 'No inventory records yet. Materials appear here after GRN approval.'
                              : 'No materials match your filter.'}
                          </p>
                        </td>
                      </tr>
                    )}
                  </tbody>

                  {/* ── Totals footer ─────────────────────────────── */}
                  {filteredSummary.length > 0 && (
                    <tfoot>
                      <tr className="bg-slate-800 text-white font-medium text-xs">
                        <td colSpan={7} className="px-3 py-3 text-right uppercase tracking-wide">TOTALS</td>
                        <td className="px-3 py-3 text-right font-mono bg-rose-900">₹{inr(totalIssuedValue)}</td>
                        <td className="px-3 py-3 text-right font-mono bg-slate-700">₹{inr(totalOpeningValue)}</td>
                        <td className="px-3 py-3 text-right font-mono bg-indigo-900">₹{inr(totalClosingValue)}</td>
                        <td className="px-3 py-3 text-right font-mono bg-amber-900">₹{inr(totalGST)}</td>
                        <td className="px-3 py-3 text-right font-mono bg-emerald-900">₹{inr(totalGrandTotal)}</td>
                        <td className="bg-slate-800" />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
            {!invLoading && (
              <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50 text-xs text-slate-900 font-medium flex items-center justify-between">
                <span>Showing {filteredSummary.length} of {inventoryData.length} materials</span>
                <span className="flex items-center gap-1 text-slate-900 font-semibold">
                  <Edit2 size={10} /> Click any CATEGORY or RATE cell to edit inline
                </span>
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
                          const txnQty    = parseFloat(txn.quantity);
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
