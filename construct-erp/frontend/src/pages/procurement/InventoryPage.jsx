// src/pages/procurement/InventoryPage.jsx
import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import {
  Package, AlertTriangle, X, ArrowUpDown, Clock,
  Search, Filter, Upload, FileSpreadsheet, Edit2,
  Check, ChevronDown, ChevronRight, CheckCircle2,
  AlertCircle, RefreshCw, Loader2, ArrowRight,
  TrendingDown, IndianRupee, Layers
} from 'lucide-react';
import api, { inventoryAPI, projectAPI } from '../../api/client';
import { PageHeader, KpiCard as ThemeKpiCard, Theme } from '../../theme';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import dayjs from 'dayjs';

const GST_RATE  = 0.18;
const inr = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qty = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 3 });

/* ── Stock status ─────────────────────────────────────────────── */
function stockStatus(item) {
  const stock   = parseFloat(item.closing_stock)  || 0;
  const min     = parseFloat(item.minimum_level)  || 0;
  const reorder = parseFloat(item.reorder_level)  || 0;
  if (stock <= 0)       return { label: 'Out of Stock', cls: 'bg-red-100 text-red-700 border-red-200',      bar: 'bg-red-500' };
  if (min > 0 && stock <= min) return { label: 'Critical Low', cls: 'bg-red-100 text-red-700 border-red-200',  bar: 'bg-red-500' };
  if (reorder > 0 && stock <= reorder) return { label: 'Reorder Now', cls: 'bg-amber-100 text-amber-700 border-amber-200', bar: 'bg-amber-500' };
  return { label: 'Adequate', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200', bar: 'bg-emerald-500' };
}

/* ── Inline editable cell ─────────────────────────────────────── */
function EditCell({ value, onSave, prefix, numeric, placeholder }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal]         = useState(value ?? '');
  const commit = () => { setEditing(false); if (val !== (value ?? '')) onSave(val); };
  if (editing) return (
    <div className="flex items-center gap-1">
      {prefix && <span className="text-slate-900 font-medium text-xs">{prefix}</span>}
      <input autoFocus type={numeric ? 'number' : 'text'} value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
        className="w-24 border border-blue-400 rounded px-1.5 py-0.5 text-xs focus:outline-none" />
      <button onClick={commit} className="text-emerald-600"><Check size={12} /></button>
      <button onClick={() => setEditing(false)} className="text-slate-900 font-semibold"><X size={12} /></button>
    </div>
  );
  return (
    <button onClick={() => { setVal(value ?? ''); setEditing(true); }} className="flex items-center gap-1 group text-left">
      <span className={clsx('text-xs', value ? 'text-slate-900 font-bold' : 'text-slate-300 italic')}>
        {value ? `${prefix || ''}${value}` : (placeholder || '—')}
      </span>
      <Edit2 size={10} className="text-slate-300 group-hover:text-blue-400 opacity-0 group-hover:opacity-100 transition" />
    </button>
  );
}

/* ── Import Modal (same as Store Ledger) ──────────────────────── */
function ImportModal({ projects, onClose, onDone }) {
  const fileRef = useRef();
  const [step, setStep]           = useState(1);
  const [file, setFile]           = useState(null);
  const [projectId, setProjectId] = useState('');
  const [siteLocation, setSite]   = useState('main');
  const [overwrite, setOverwrite] = useState(true);
  const [preview, setPreview]     = useState([]);
  const [result, setResult]       = useState(null);
  const [loading, setLoading]     = useState(false);

  const handleFile = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    setFile(f); setLoading(true);
    try {
      const res = await inventoryAPI.importPreview(f);
      setPreview(res.data?.data ?? res.data ?? []); setStep(2);
    } catch (err) { toast.error(err?.response?.data?.error || 'Failed to parse file'); }
    finally { setLoading(false); }
  };

  const handleImport = async () => {
    if (!projectId) { toast.error('Please select a project'); return; }
    setLoading(true);
    try {
      const res = await inventoryAPI.importData(file, projectId, siteLocation, overwrite);
      setResult(res.data); setStep(3); onDone();
    } catch (err) { toast.error(err?.response?.data?.error || 'Import failed'); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="bg-slate-900 px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-lg font-medium text-white flex items-center gap-2">
              <FileSpreadsheet size={18} className="text-emerald-400" /> Import Stock from Excel
            </h2>
            <p className="text-xs text-slate-900 font-medium mt-0.5">Columns: Category · Material Description · Unit · Opening Stock · Closing Stock · Rate</p>
          </div>
          <button onClick={onClose} className="text-slate-900 font-medium hover:text-white transition"><X size={20} /></button>
        </div>
        <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2 flex-shrink-0">
          {[['1','Upload File'],['2','Preview'],['3','Done']].map(([n, label], i) => (
            <React.Fragment key={n}>
              <div className={clsx('flex items-center gap-1.5 text-xs font-semibold', step >= parseInt(n) ? 'text-indigo-700' : 'text-slate-900 font-semibold')}>
                <div className={clsx('w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-medium',
                  step > parseInt(n) ? 'bg-emerald-500 text-white' : step === parseInt(n) ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-900 font-bold'
                )}>{step > parseInt(n) ? <Check size={10} /> : n}</div>
                {label}
              </div>
              {i < 2 && <ArrowRight size={12} className="text-slate-300 mx-1" />}
            </React.Fragment>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto">
          {step === 1 && (
            <div className="p-8 space-y-6">
              <div onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-slate-300 hover:border-indigo-400 rounded-2xl p-12 text-center cursor-pointer transition-colors group">
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} className="hidden" />
                {loading ? (
                  <div className="space-y-3"><Loader2 size={36} className="mx-auto text-indigo-500 animate-spin" /><p className="text-slate-900 font-medium font-bold">Parsing file…</p></div>
                ) : (
                  <div className="space-y-3">
                    <Upload size={36} className="mx-auto text-slate-300 group-hover:text-indigo-400 transition-colors" />
                    <div><p className="font-medium text-slate-700">Click to upload your Excel file</p><p className="text-sm text-slate-900 font-medium mt-1">Supports .xlsx · .xls · .csv</p></div>
                  </div>
                )}
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <p className="text-xs font-medium text-amber-800 mb-2 uppercase tracking-wide">Expected columns</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {['Category','MATERIAL DESCRPITION','Unit','OPENING STOCK','CLOSING STOCK','RATE'].map(c => (
                    <div key={c} className="bg-white border border-amber-100 rounded-lg px-2 py-1 text-xs font-mono text-amber-700">{c}</div>
                  ))}
                </div>
              </div>
            </div>
          )}
          {step === 2 && (
            <div className="flex flex-col h-full">
              <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-end gap-4">
                <div>
                  <label className="text-xs font-medium text-slate-900 block mb-1">Project <span className="text-red-500">*</span></label>
                  <select value={projectId} onChange={e => setProjectId(e.target.value)}
                    className="h-9 border border-slate-200 rounded-lg px-3 text-sm focus:outline-none focus:border-indigo-400 bg-white min-w-[200px]">
                    <option value="">Select project…</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-900 block mb-1">Site Location</label>
                  <input value={siteLocation} onChange={e => setSite(e.target.value)}
                    className="h-9 border border-slate-200 rounded-lg px-3 text-sm focus:outline-none focus:border-indigo-400 bg-white w-32" />
                </div>
                <label className="flex items-center gap-2 cursor-pointer pb-1">
                  <input type="checkbox" checked={overwrite} onChange={e => setOverwrite(e.target.checked)} className="w-4 h-4 rounded" />
                  <span className="text-sm font-medium text-slate-700">Overwrite existing</span>
                </label>
                <div className="ml-auto text-xs text-slate-900 font-bold">{preview.length} rows ready</div>
              </div>
              <div className="overflow-auto flex-1 p-4">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-800 text-white">
                      {['#','CATEGORY','MATERIAL DESCRIPTION','UNIT','OPENING','CLOSING','RATE (₹)','CLOSING VALUE'].map((h,i) => (
                        <th key={h} className={clsx('px-3 py-2 font-bold', i === 7 ? 'bg-indigo-700' : '', i >= 4 ? 'text-right' : 'text-left')}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row, i) => (
                      <tr key={i} className={clsx('hover:bg-slate-50', i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40')}>
                        <td className="px-3 py-2 text-slate-900 font-medium font-mono">{i+1}</td>
                        <td className="px-3 py-2 text-slate-600">{row.category || '—'}</td>
                        <td className="px-3 py-2 font-medium text-slate-900 font-medium">{row.material_name}</td>
                        <td className="px-3 py-2 text-center uppercase">{row.unit}</td>
                        <td className="px-3 py-2 text-right font-mono">{row.opening_stock}</td>
                        <td className="px-3 py-2 text-right font-mono font-bold">{row.closing_stock}</td>
                        <td className="px-3 py-2 text-right font-mono">{row.unit_rate > 0 ? `₹${inr(row.unit_rate)}` : '—'}</td>
                        <td className="px-3 py-2 text-right font-mono font-medium text-indigo-700 bg-indigo-50/30">
                          {row.closing_stock * row.unit_rate > 0 ? `₹${inr(row.closing_stock * row.unit_rate)}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {step === 3 && result && (
            <div className="p-8 text-center space-y-6">
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
                <CheckCircle2 size={32} className="text-emerald-600" />
              </div>
              <div>
                <h3 className="text-xl font-medium text-slate-900">Import Complete!</h3>
                <p className="text-slate-900 font-medium text-sm mt-1">Stock data has been imported into inventory.</p>
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
              <button onClick={onClose} className="bg-slate-900 text-white font-medium px-8 py-2.5 rounded-xl hover:bg-slate-800 transition">Close</button>
            </div>
          )}
        </div>
        {step === 2 && (
          <div className="px-6 py-4 border-t border-slate-200 bg-white flex items-center justify-between flex-shrink-0">
            <button onClick={() => { setStep(1); setPreview([]); setFile(null); }} className="text-sm text-slate-900 font-medium hover:text-slate-900 font-medium transition">← Back</button>
            <button onClick={handleImport} disabled={!projectId || loading}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium px-6 py-2.5 rounded-xl text-sm transition">
              {loading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
              {loading ? 'Importing…' : `Import ${preview.length} Records`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Issue Material Modal ─────────────────────────────────────── */
function IssueModal({ item, onClose }) {
  const qc = useQueryClient();
  const { register, handleSubmit, reset } = useForm();
  const issueMutation = useMutation({
    mutationFn: (d) => inventoryAPI.issue(d),
    onSuccess: () => {
      toast.success('Material issued & stock updated!');
      reset(); onClose();
      qc.invalidateQueries({ queryKey: ['inventory'] });
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed to issue material'),
  });

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="bg-slate-900 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-medium text-white flex items-center gap-2">
              <ArrowUpDown size={16} className="text-emerald-400" /> Issue Material
            </h2>
            <p className="text-xs text-slate-900 font-medium mt-0.5">{item.material_name}</p>
          </div>
          <button onClick={onClose} className="text-slate-900 font-medium hover:text-white transition"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-5">
          {/* Stock info */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-900 font-medium font-bold">Available Stock</div>
              <div className="text-2xl font-medium text-emerald-600 font-mono mt-0.5">
                {qty(item.closing_stock)} <span className="text-sm text-slate-900 font-semibold">{item.unit}</span>
              </div>
            </div>
            {parseFloat(item.unit_rate) > 0 && (
              <div className="text-right">
                <div className="text-xs text-slate-900 font-medium font-bold">Unit Rate</div>
                <div className="text-base font-medium text-slate-900 font-mono">₹{inr(item.unit_rate)}</div>
              </div>
            )}
          </div>
          <form onSubmit={handleSubmit(d => issueMutation.mutate({ ...d, inventory_id: item.id, project_id: item.project_id }))} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-slate-900 block mb-1.5">Quantity to Issue *</label>
              <input type="number" step="0.001"
                {...register('quantity', { required: true, max: { value: parseFloat(item.closing_stock), message: `Max: ${item.closing_stock}` } })}
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-base font-mono font-medium focus:outline-none focus:border-emerald-400"
                placeholder={`Max ${qty(item.closing_stock)}`} />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-900 block mb-1.5">Issued To *</label>
              <input {...register('issued_to', { required: true })}
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-400"
                placeholder="Contractor / Work Order" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-900 block mb-1.5">Remarks</label>
              <textarea {...register('remarks')}
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-400 h-20 resize-none"
                placeholder="Work order ref, floor no., etc." />
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={onClose}
                className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 hover:bg-slate-50 transition">Cancel</button>
              <button type="submit" disabled={issueMutation.isPending}
                className="flex-[2] py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-medium rounded-xl text-sm transition flex items-center justify-center gap-2">
                <ArrowUpDown size={14} />
                {issueMutation.isPending ? 'Processing…' : 'Issue Material'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

/* ── Main Page ────────────────────────────────────────────────── */
export default function InventoryPage() {
  const qc = useQueryClient();
  const [search, setSearch]           = useState('');
  const [filterProject, setFilterProject] = useState('');
  const [filterStatus, setFilterStatus]   = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [expandedId, setExpandedId]   = useState(null);
  const [issueItem, setIssueItem]     = useState(null);
  const [showImport, setShowImport]   = useState(false);

  const { data: allItems = [], isLoading, refetch } = useQuery({
    queryKey: ['inventory', filterProject],
    queryFn: () => inventoryAPI.list(filterProject ? { project_id: filterProject } : {}).then(r => r.data?.data).catch(() => []),
  });

  const { data: projectsData = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectAPI.list().then(r => r.data?.data ?? r.data ?? []).catch(() => []),
  });

  const { data: batches = [] } = useQuery({
    queryKey: ['inventory-batches', expandedId],
    queryFn: () => inventoryAPI.getBatches(expandedId).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    enabled: !!expandedId,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => inventoryAPI.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['inventory'] }); toast.success('Updated'); },
    onError: () => toast.error('Update failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/inventory/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['inventory'] }); toast.success('Record deleted'); },
    onError: () => toast.error('Delete failed'),
  });

  const categories = [...new Set(allItems.map(s => s.category).filter(Boolean))].sort();

  const items = allItems.filter(i => {
    const st = stockStatus(i);
    if (filterStatus === 'out'      && st.label !== 'Out of Stock') return false;
    if (filterStatus === 'low'      && !['Critical Low','Reorder Now','Out of Stock'].includes(st.label)) return false;
    if (filterStatus === 'adequate' && st.label !== 'Adequate') return false;
    if (categoryFilter && i.category !== categoryFilter) return false;
    if (search && !i.material_name?.toLowerCase().includes(search.toLowerCase()) &&
        !i.project_name?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // Stats
  const outCount  = allItems.filter(i => parseFloat(i.closing_stock) <= 0).length;
  const lowCount  = allItems.filter(i => { const st = stockStatus(i); return ['Critical Low','Reorder Now'].includes(st.label); }).length;
  const totalClosingVal  = items.reduce((s, i) => s + parseFloat(i.closing_stock || 0) * parseFloat(i.unit_rate || 0), 0);
  const totalGrandTotal  = totalClosingVal * (1 + GST_RATE);

  // Footer totals
  const fTotalOpening = items.reduce((s, i) => s + parseFloat(i.opening_stock || 0) * parseFloat(i.unit_rate || 0), 0);
  const fTotalIssued  = items.reduce((s, i) => {
    const issued = Math.max(0, parseFloat(i.opening_stock || 0) - parseFloat(i.closing_stock || 0));
    return s + issued * parseFloat(i.unit_rate || 0);
  }, 0);
  const fTotalClosing = totalClosingVal;
  const fTotalGST     = fTotalClosing * GST_RATE;
  const fGrandTotal   = fTotalClosing + fTotalGST;

  return (
    <div style={{ background: Theme.pageBg, minHeight: '100vh' }}>

      <PageHeader
        title="Store Inventory"
        subtitle="Material-wise stock position with rate, value & issue tracking"
        breadcrumbs={[{ label: 'Procurement' }, { label: 'Inventory' }]}
        actions={
          <>
            <button onClick={() => refetch()}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg"
              style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.20)', color: '#fff' }}>
              <RefreshCw size={13} /> Refresh
            </button>
            <button onClick={() => setShowImport(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg shadow-sm"
              style={{ background: '#fff', color: Theme.navyDark, border: '1px solid rgba(255,255,255,0.4)' }}>
              <Upload size={14} /> Import
            </button>
          </>
        }
      />

      <div className="p-6 md:p-8 max-w-full mx-auto">

      {/* ── KPI cards ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        <ThemeKpiCard label="Total Materials"  value={allItems.length}             color="slate"   />
        <ThemeKpiCard label="Out of Stock"      value={outCount}                    color="red"     />
        <ThemeKpiCard label="Low / Reorder"     value={lowCount}                    color="amber"   />
        <ThemeKpiCard label="Closing Stock Value" value={`₹${inr(totalClosingVal)}`} color="blue"    />
        <ThemeKpiCard label="Grand Total (incl. GST)" value={`₹${inr(totalGrandTotal)}`} color="emerald" />
      </div>

      {/* ── Filters ────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-wrap items-center gap-3 shadow-sm mb-4">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-900 font-semibold" />
          <input className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-900 placeholder:text-slate-900 font-medium outline-none focus:border-indigo-400"
            placeholder="Search material…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select value={filterProject} onChange={e => setFilterProject(e.target.value)}
          className="h-9 bg-slate-50 border border-slate-200 rounded-lg px-3 text-sm text-slate-900 outline-none focus:border-indigo-400">
          <option value="">All Projects</option>
          {projectsData.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
          className="h-9 bg-slate-50 border border-slate-200 rounded-lg px-3 text-sm text-slate-900 outline-none focus:border-indigo-400">
          <option value="">All Categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <div className="flex items-center gap-1.5">
          {[['all','All'],['out','Out of Stock'],['low','Low/Reorder'],['adequate','Adequate']].map(([v,l]) => (
            <button key={v} onClick={() => setFilterStatus(v)}
              className={clsx('px-3 py-1.5 rounded-lg text-xs font-medium border transition',
                filterStatus === v ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-900 font-medium border-slate-200 hover:border-slate-400'
              )}>{l}</button>
          ))}
        </div>
      </div>

      {/* ── Main Table ─────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20 gap-3 text-slate-900 font-semibold">
            <Loader2 className="w-5 h-5 animate-spin" /> Loading inventory…
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-800 text-white">
                  <th className="px-3 py-3 text-center text-xs font-medium uppercase w-10">SL</th>
                  <th className="px-3 py-3 text-left   text-xs font-medium uppercase">CATEGORY</th>
                  <th className="px-3 py-3 text-left   text-xs font-medium uppercase">MATERIAL DESCRIPTION</th>
                  <th className="px-3 py-3 text-center text-xs font-medium uppercase w-16">UNIT</th>
                  <th className="px-3 py-3 text-right  text-xs font-medium uppercase">OPENING STOCK</th>
                  <th className="px-3 py-3 text-right  text-xs font-medium uppercase">CLOSING STOCK</th>
                  <th className="px-3 py-3 text-right  text-xs font-medium uppercase">RATE (₹)</th>
                  <th className="px-3 py-3 text-right  text-xs font-medium uppercase bg-rose-700">ISSUED VALUE</th>
                  <th className="px-3 py-3 text-right  text-xs font-medium uppercase bg-slate-700">OPENING VALUE</th>
                  <th className="px-3 py-3 text-right  text-xs font-medium uppercase bg-indigo-700">CLOSING VALUE</th>
                  <th className="px-3 py-3 text-right  text-xs font-medium uppercase bg-amber-700">GST @18%</th>
                  <th className="px-3 py-3 text-right  text-xs font-medium uppercase bg-emerald-700">GRAND TOTAL</th>
                  <th className="px-3 py-3 text-center text-xs font-medium uppercase">ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => {
                  const rate        = parseFloat(item.unit_rate   || 0);
                  const opening     = parseFloat(item.opening_stock || 0);
                  const closing     = parseFloat(item.closing_stock || 0);
                  const issued      = Math.max(0, opening - closing);
                  const issuedVal   = issued   * rate;
                  const openingVal  = opening  * rate;
                  const closingVal  = closing  * rate;
                  const gst         = closingVal * GST_RATE;
                  const grandTotal  = closingVal + gst;
                  const st          = stockStatus(item);
                  const reorder     = parseFloat(item.reorder_level || 0);
                  const pct         = reorder > 0 ? Math.min(100, (closing / reorder) * 100) : 100;
                  const isExpanded  = expandedId === item.id;

                  return (
                    <React.Fragment key={item.id}>
                      <tr className={clsx('border-b border-slate-100 hover:bg-slate-50 transition-colors',
                        closing <= 0 ? 'bg-red-50/20' : ''
                      )}>
                        <td className="px-3 py-3 text-center text-xs text-slate-900 font-medium font-mono">{idx + 1}</td>

                        {/* Category — editable */}
                        <td className="px-3 py-3 text-xs">
                          <EditCell value={item.category} placeholder="Set category"
                            onSave={v => updateMutation.mutate({ id: item.id, data: { category: v } })} />
                        </td>

                        {/* Material + project */}
                        <td className="px-3 py-3">
                          <div className="font-medium text-slate-900 font-medium text-xs">{item.material_name}</div>
                          <div className="text-[10px] text-slate-900 font-medium mt-0.5">{item.project_name}{item.site_location ? ` · ${item.site_location}` : ''}</div>
                        </td>

                        <td className="px-3 py-3 text-center text-xs font-medium text-slate-900 uppercase">{item.unit}</td>

                        <td className="px-3 py-3 text-right font-mono text-xs text-slate-900 font-bold">{qty(opening)}</td>

                        {/* Closing stock + bar */}
                        <td className="px-3 py-3 text-right">
                          <div className="font-mono text-xs font-medium text-slate-900">{qty(closing)}</div>
                          <div className="h-1 bg-slate-100 rounded-full mt-1 w-16 ml-auto">
                            <div className={clsx('h-full rounded-full', st.bar)} style={{ width: `${pct}%` }} />
                          </div>
                          <span className={clsx('text-[10px] font-medium px-1.5 py-0.5 rounded-full border mt-0.5 inline-block', st.cls)}>
                            {st.label}
                          </span>
                        </td>

                        {/* Rate — editable */}
                        <td className="px-3 py-3 text-right text-xs">
                          <EditCell value={rate > 0 ? rate.toFixed(2) : ''} placeholder="Set rate" prefix="₹" numeric
                            onSave={v => updateMutation.mutate({ id: item.id, data: { unit_rate: parseFloat(v) } })} />
                        </td>

                        {/* Value columns */}
                        <td className="px-3 py-3 text-right font-mono text-xs text-rose-600 bg-rose-50/20">
                          {issuedVal > 0 ? `₹${inr(issuedVal)}` : '—'}
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-xs text-slate-900 bg-slate-50/30">
                          {openingVal > 0 ? `₹${inr(openingVal)}` : '—'}
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-xs font-medium text-indigo-700 bg-indigo-50/20">
                          {closingVal > 0 ? `₹${inr(closingVal)}` : '—'}
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-xs text-amber-700 bg-amber-50/20">
                          {gst > 0 ? `₹${inr(gst)}` : '—'}
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-xs font-medium text-emerald-700 bg-emerald-50/20">
                          {grandTotal > 0 ? `₹${inr(grandTotal)}` : '—'}
                        </td>

                        {/* Actions */}
                        <td className="px-3 py-3">
                          <div className="flex items-center justify-center gap-1.5">
                            <button onClick={() => setExpandedId(isExpanded ? null : item.id)}
                              title="View Batches"
                              className={clsx('p-1.5 rounded-lg border text-xs transition',
                                isExpanded ? 'bg-slate-900 text-white border-slate-900' : 'border-slate-200 text-slate-900 font-medium hover:border-slate-400 hover:text-slate-900 font-medium'
                              )}>
                              <Layers size={13} />
                            </button>
                            {closing > 0 && (
                              <button onClick={() => setIssueItem(item)} title="Issue Material"
                                className="p-1.5 rounded-lg border border-emerald-200 text-emerald-600 hover:bg-emerald-50 transition">
                                <ArrowUpDown size={13} />
                              </button>
                            )}
                            <button onClick={() => { if (window.confirm('Delete this inventory record?')) deleteMutation.mutate(item.id); }}
                              title="Delete"
                              className="p-1.5 rounded-lg border border-slate-200 text-slate-900 font-medium hover:border-red-200 hover:text-red-500 transition">
                              <X size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Batch expansion */}
                      {isExpanded && (
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <td colSpan={13} className="px-6 py-4">
                            <div className="flex items-center gap-2 text-xs font-medium text-slate-900 font-medium uppercase tracking-wide mb-3">
                              <Layers size={13} /> Batch Breakdown (FIFO) — {item.material_name}
                            </div>
                            {batches.length === 0 ? (
                              <p className="text-xs text-slate-900 font-medium italic">No batch records found.</p>
                            ) : (
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                {batches.map((b, i) => {
                                  const isExpired  = b.expiry_date && dayjs().isAfter(dayjs(b.expiry_date));
                                  const isNearExp  = b.expiry_date && dayjs(b.expiry_date).diff(dayjs(), 'day') < 30;
                                  return (
                                    <div key={b.id} className={clsx('bg-white border rounded-xl p-4 shadow-sm',
                                      isExpired ? 'border-red-200' : isNearExp ? 'border-amber-200' : 'border-slate-200'
                                    )}>
                                      <div className="flex items-center justify-between mb-2">
                                        <span className="text-[10px] font-mono font-medium text-slate-900 font-medium uppercase">{b.batch_number}</span>
                                        {i === 0 && <span className="text-[9px] bg-emerald-100 text-emerald-700 font-medium px-2 py-0.5 rounded-full">FIFO #1</span>}
                                      </div>
                                      <div className="text-xl font-medium text-slate-900 font-mono">
                                        {parseFloat(b.current_quantity).toLocaleString()}
                                        <span className="text-xs text-slate-900 font-medium ml-1">{item.unit}</span>
                                      </div>
                                      <div className="text-[10px] text-slate-900 font-medium mt-1">
                                        Rcvd: {dayjs(b.received_date).format('DD-MM-YYYY')}
                                      </div>
                                      {b.expiry_date && (
                                        <div className={clsx('text-[10px] font-medium mt-1 flex items-center gap-1',
                                          isExpired ? 'text-red-500' : isNearExp ? 'text-amber-500' : 'text-slate-900 font-semibold'
                                        )}>
                                          <Clock size={10} /> Exp: {dayjs(b.expiry_date).format('DD-MM-YYYY')}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}

                {items.length === 0 && (
                  <tr>
                    <td colSpan={13} className="py-16 text-center">
                      <Package className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                      <p className="text-sm text-slate-900 font-semibold">
                        {allItems.length === 0
                          ? 'No inventory records yet. Materials appear here after GRN QC approval.'
                          : 'No materials match your filters.'}
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>

              {/* ── Totals footer ─────────────────────────────── */}
              {items.length > 0 && (
                <tfoot>
                  <tr className="bg-slate-800 text-white font-medium text-xs">
                    <td colSpan={7} className="px-3 py-3 text-right uppercase tracking-wide">TOTALS ({items.length} items)</td>
                    <td className="px-3 py-3 text-right font-mono bg-rose-900">₹{inr(fTotalIssued)}</td>
                    <td className="px-3 py-3 text-right font-mono bg-slate-700">₹{inr(fTotalOpening)}</td>
                    <td className="px-3 py-3 text-right font-mono bg-indigo-900">₹{inr(fTotalClosing)}</td>
                    <td className="px-3 py-3 text-right font-mono bg-amber-900">₹{inr(fTotalGST)}</td>
                    <td className="px-3 py-3 text-right font-mono bg-emerald-900">₹{inr(fGrandTotal)}</td>
                    <td className="bg-slate-800" />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
        {!isLoading && (
          <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50 text-xs text-slate-900 font-medium flex items-center justify-between">
            <span>Showing {items.length} of {allItems.length} materials</span>
            <span className="flex items-center gap-1"><Edit2 size={10} /> Click CATEGORY or RATE cell to edit inline</span>
          </div>
        )}
      </div>

      {/* Modals */}
      {issueItem  && <IssueModal  item={issueItem}  onClose={() => setIssueItem(null)} />}
      {showImport && <ImportModal projects={projectsData} onClose={() => setShowImport(false)} onDone={() => qc.invalidateQueries({ queryKey: ['inventory'] })} />}
      </div>
    </div>
  );
}
