// src/pages/stores/MaterialTrackerPage.jsx
// Material Tracker — Daily Concrete (RMC) | Steel
// Flat load-wise view using /material-tracker/report/loadwise
import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, X, Pencil, Trash2, Search, RefreshCw, Zap,
  Package, Truck, FileSpreadsheet, Layers, Scale,
  TrendingDown, BarChart3, Waves, IndianRupee,
} from 'lucide-react';
import { clsx } from 'clsx';
import dayjs from 'dayjs';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import { materialTrackerAPI, poAPI, projectAPI } from '../../api/client';
import useAuthStore from '../../store/authStore';
import { PageHeader } from '../../theme';
import { FIELD_HL } from '../../constants/fieldStyles';

const INP = `w-full h-9 rounded-lg px-3 text-xs font-medium outline-none transition-all border ${FIELD_HL}`;
const WRITE_ROLES = ['store_keeper','stores_manager','stores_officer','admin','super_admin'];
const DIA_COLS   = ['dia_8mm','dia_10mm','dia_12mm','dia_16mm','dia_20mm','dia_25mm','dia_32mm'];
const DIA_LABELS = ['8mm','10mm','12mm','16mm','20mm','25mm','32mm'];

const n3 = v => parseFloat(v || 0).toFixed(3);
const n2 = v => parseFloat(v || 0).toFixed(2);
const inr = v => Math.round(parseFloat(v || 0)).toLocaleString('en-IN');
const pct = (a, b) => b > 0 ? Math.round((a / b) * 100) : 0;
const fmt = d => d ? dayjs(d).format('DD-MM-YYYY') : '—';

// ── StatCard ──────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, color = 'slate' }) {
  const C = {
    slate:   { chip: 'bg-slate-100 text-slate-600',    bar: 'bg-slate-400' },
    emerald: { chip: 'bg-emerald-50 text-emerald-600', bar: 'bg-emerald-500' },
    blue:    { chip: 'bg-blue-50 text-blue-600',       bar: 'bg-blue-500' },
    amber:   { chip: 'bg-amber-50 text-amber-600',     bar: 'bg-amber-500' },
    red:     { chip: 'bg-rose-50 text-rose-600',       bar: 'bg-rose-500' },
    orange:  { chip: 'bg-orange-50 text-orange-600',   bar: 'bg-orange-500' },
    indigo:  { chip: 'bg-indigo-50 text-indigo-600',   bar: 'bg-indigo-500' },
  }[color] || {};
  return (
    <div className="relative bg-white rounded-2xl border border-slate-200 shadow-sm p-4 overflow-hidden">
      <span className={clsx('absolute left-0 top-0 h-full w-1', C.bar)} />
      <div className={clsx('w-9 h-9 rounded-xl flex items-center justify-center mb-2.5', C.chip)}>
        {Icon && <Icon className="w-4 h-4" strokeWidth={2.2} />}
      </div>
      <div className="text-[24px] leading-none font-bold tabular-nums text-slate-900">{value}</div>
      <div className="mt-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</div>
      {sub && <div className="text-[10px] text-slate-400 mt-0.5 truncate">{sub}</div>}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function emptyLoad() {
  return {
    received_date: dayjs().format('YYYY-MM-DD'),
    invoice_no: '', ign_no: '', grs_no: '', vehicle_no: '',
    invoice_qty: '', weighbridge_qty: '', rate: '', gst_rate: 18,
    gst_amount: '', tcs_amount: 0, grand_total: '', remarks: '',
    dia: { dia_8mm:0, dia_10mm:0, dia_12mm:0, dia_16mm:0, dia_20mm:0, dia_25mm:0, dia_32mm:0 },
  };
}

// ── Load Form Modal ───────────────────────────────────────────────────────────
function LoadForm({ entryId, materialType, defaultRate, editLoad, onClose, onSaved }) {
  const isEdit = Boolean(editLoad);
  const [f, setF] = useState(() => {
    if (isEdit) {
      const d = {};
      DIA_COLS.forEach(k => { d[k] = editLoad[k] ?? 0; });
      return { ...emptyLoad(), ...editLoad, dia: d };
    }
    return { ...emptyLoad(), rate: defaultRate || '' };
  });

  const setField = (k, v) => setF(p => {
    const next = { ...p, [k]: v };
    const iQty = parseFloat(next.invoice_qty || 0);
    const rate = parseFloat(next.rate || 0);
    const gstPct = parseFloat(next.gst_rate || 0);
    const tcs = parseFloat(next.tcs_amount || 0);
    const basic = iQty * rate;
    const gst = basic * gstPct / 100;
    next.gst_amount  = gst > 0  ? parseFloat(gst.toFixed(2))          : next.gst_amount;
    next.grand_total = basic > 0 ? parseFloat((basic + gst + tcs).toFixed(2)) : next.grand_total;
    return next;
  });

  const setDia = (k, v) => setF(p => ({ ...p, dia: { ...p.dia, [k]: parseFloat(v) || 0 } }));
  const diaTotal = DIA_COLS.reduce((s, k) => s + (parseFloat(f.dia[k]) || 0), 0);
  const diaMismatch = materialType === 'steel' && f.invoice_qty && Math.abs(diaTotal - parseFloat(f.invoice_qty)) > 0.01;
  const diff = parseFloat(f.weighbridge_qty || 0) - parseFloat(f.invoice_qty || 0);

  const saveMutation = useMutation({
    mutationFn: (payload) => isEdit
      ? materialTrackerAPI.updateLoad(entryId, editLoad.id, payload)
      : materialTrackerAPI.addLoad(entryId, payload),
    onSuccess: () => { toast.success(isEdit ? 'Load updated' : 'Load added'); onSaved(); onClose(); },
    onError: e => toast.error(e?.response?.data?.error || 'Failed to save load'),
  });

  const submit = () => {
    if (!f.received_date) return toast.error('Received date required');
    if (!f.invoice_qty)   return toast.error('Invoice qty required');
    if (diaMismatch) return toast.error(`Dia total (${n3(diaTotal)} MT) ≠ invoice qty (${f.invoice_qty})`);
    saveMutation.mutate({ ...f, dia: materialType === 'steel' ? f.dia : undefined });
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-800">{isEdit ? 'Edit Load Entry' : 'Add Load Entry'}</h3>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center">
            <X size={14} className="text-slate-500" />
          </button>
        </div>
        <div className="overflow-y-auto p-5 space-y-4 flex-1">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Received Date *</label>
              <input type="date" value={f.received_date} onChange={e => setField('received_date', e.target.value)} className={INP} />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Vehicle No</label>
              <input value={f.vehicle_no} onChange={e => setField('vehicle_no', e.target.value)} placeholder="KA01AB1234" className={INP} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Invoice No</label>
              <input value={f.invoice_no} onChange={e => setField('invoice_no', e.target.value)} placeholder="INV-001" className={INP} />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">IGN No</label>
              <input value={f.ign_no} onChange={e => setField('ign_no', e.target.value)} placeholder="IGN/2024/0001" className={INP} />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">GRS No</label>
              <input value={f.grs_no} onChange={e => setField('grs_no', e.target.value)} placeholder="GRS/2024/0001" className={INP} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 items-end">
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Invoice Qty *</label>
              <input type="number" step="0.001" value={f.invoice_qty} onChange={e => setField('invoice_qty', e.target.value)} className={INP} />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Weighbridge Qty (W/M)</label>
              <input type="number" step="0.001" value={f.weighbridge_qty} onChange={e => setField('weighbridge_qty', e.target.value)} className={INP} />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Difference</label>
              <div className={clsx('h-9 px-3 rounded-lg border text-xs font-mono flex items-center',
                diff < 0 ? 'bg-red-50 border-red-200 text-red-700'
                         : diff > 0 ? 'bg-green-50 border-green-200 text-green-700'
                                    : 'bg-slate-50 border-slate-200 text-slate-500')}>
                {f.weighbridge_qty && f.invoice_qty ? `${diff >= 0 ? '+' : ''}${n3(diff)}` : '—'}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <div><label className="block text-[11px] font-medium text-slate-500 mb-1">Rate</label>
              <input type="number" step="0.01" value={f.rate} onChange={e => setField('rate', e.target.value)} className={INP} /></div>
            <div><label className="block text-[11px] font-medium text-slate-500 mb-1">GST %</label>
              <input type="number" step="0.01" value={f.gst_rate} onChange={e => setField('gst_rate', e.target.value)} className={INP} /></div>
            <div><label className="block text-[11px] font-medium text-slate-500 mb-1">TCS Amt</label>
              <input type="number" step="0.01" value={f.tcs_amount} onChange={e => setField('tcs_amount', e.target.value)} className={INP} /></div>
            <div><label className="block text-[11px] font-medium text-slate-500 mb-1">Grand Total</label>
              <input type="number" step="0.01" value={f.grand_total} onChange={e => setField('grand_total', e.target.value)} className={INP} /></div>
          </div>
          {f.rate && f.invoice_qty && (
            <div className="bg-slate-50 rounded-xl px-4 py-2.5 flex gap-6 text-[11px]">
              <span><span className="text-slate-500">Basic: </span><strong>₹{inr(parseFloat(f.invoice_qty||0) * parseFloat(f.rate||0))}</strong></span>
              <span><span className="text-slate-500">GST: </span><strong>₹{inr(f.gst_amount)}</strong></span>
              <span><span className="text-slate-500">Grand Total: </span><strong>₹{inr(f.grand_total)}</strong></span>
            </div>
          )}
          {materialType === 'steel' && (
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-2">
                Dia-wise Breakdown (MT)
                {diaMismatch && <span className="ml-2 text-red-600 font-semibold">⚠ Total {n3(diaTotal)} ≠ Invoice Qty {f.invoice_qty}</span>}
              </label>
              <div className="grid grid-cols-7 gap-1.5">
                {DIA_COLS.map((k, i) => (
                  <div key={k}>
                    <div className="text-center text-[10px] text-slate-500 mb-1">{DIA_LABELS[i]}</div>
                    <input type="number" step="0.001" value={f.dia[k] || ''}
                      onChange={e => setDia(k, e.target.value)}
                      className="w-full h-8 px-2 text-xs rounded-lg border border-slate-200 focus:border-blue-400 focus:outline-none text-center" />
                  </div>
                ))}
              </div>
              <div className="text-right text-[11px] text-slate-500 mt-1">
                Total: <strong className={diaMismatch ? 'text-red-600' : 'text-slate-700'}>{n3(diaTotal)} MT</strong>
              </div>
            </div>
          )}
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Remarks</label>
            <input value={f.remarks} onChange={e => setField('remarks', e.target.value)} placeholder="Optional" className={INP} />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-100">
          <button onClick={onClose} className="h-9 px-4 rounded-xl border border-slate-200 text-xs text-slate-600 hover:bg-slate-50">Cancel</button>
          <button onClick={submit} disabled={saveMutation.isPending}
            className="h-9 px-5 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50">
            {saveMutation.isPending ? 'Saving…' : isEdit ? 'Update Load' : 'Add Load'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Register PO Form ──────────────────────────────────────────────────────────
function RegisterPOForm({ materialType, projects, onClose, onSaved }) {
  const [projectId, setProjectId] = useState('');
  const [selectedPO, setSelectedPO] = useState(null);
  const [grade, setGrade] = useState('');
  const [mrNumber, setMrNumber] = useState('');
  const [mrQty, setMrQty] = useState('');
  const [orderedQty, setOrderedQty] = useState('');
  const [unit, setUnit] = useState('');

  const { data: poList = [], isFetching: loadingPOs } = useQuery({
    queryKey: ['po-list-for-mt', projectId],
    queryFn: () => poAPI.list({ project_id: projectId, limit: 200 }).then(r => r.data?.data || r.data || []),
    enabled: !!projectId,
  });

  const handleSelectPO = (poId) => {
    const po = poList.find(p => p.id === poId);
    if (!po) { setSelectedPO(null); return; }
    setSelectedPO(po);
    const totalQty = po.items?.reduce((s, i) => s + parseFloat(i.quantity || 0), 0) || 0;
    const firstItem = po.items?.[0];
    setOrderedQty(totalQty > 0 ? String(totalQty) : '');
    setUnit(firstItem?.unit || (materialType === 'concrete' ? 'CUM' : 'MT'));
  };

  const saveMutation = useMutation({
    mutationFn: (d) => materialTrackerAPI.register(d),
    onSuccess: () => { toast.success('PO added to tracker'); onSaved(); onClose(); },
    onError: e => toast.error(e?.response?.data?.error || 'Failed'),
  });

  const submit = () => {
    if (!projectId)  return toast.error('Select a project');
    if (!selectedPO) return toast.error('Select a PO');
    saveMutation.mutate({
      project_id: projectId, po_id: selectedPO.id,
      po_number: selectedPO.po_number || selectedPO.serial_no_formatted || '',
      vendor_name: selectedPO.vendor_name || '', material_type: materialType,
      grade, mr_number: mrNumber, mr_qty: mrQty, ordered_qty: orderedQty, unit,
    });
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-800 capitalize">Add {materialType === 'concrete' ? 'RMC' : 'Steel'} PO to Tracker</h3>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center"><X size={14} className="text-slate-500" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Project *</label>
            <select value={projectId} onChange={e => { setProjectId(e.target.value); setSelectedPO(null); }} className={INP}>
              <option value="">Select project…</option>
              {(projects || []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">
              Select PO * {loadingPOs && <span className="ml-1 text-slate-400">(loading…)</span>}
            </label>
            <select value={selectedPO?.id || ''} onChange={e => handleSelectPO(e.target.value)} disabled={!projectId} className={INP}>
              <option value="">{projectId ? 'Select PO…' : 'Select project first'}</option>
              {poList.map(po => (
                <option key={po.id} value={po.id}>{po.po_number || po.serial_no_formatted} — {po.vendor_name}</option>
              ))}
            </select>
          </div>
          {selectedPO && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-[11px] space-y-1">
              <div><span className="text-slate-500">Vendor: </span><strong>{selectedPO.vendor_name || '—'}</strong></div>
              <div className="flex gap-4">
                <span><span className="text-slate-500">Ordered Qty: </span><strong>{orderedQty || '—'} {unit}</strong></span>
                <span><span className="text-slate-500">PO Date: </span><strong>{selectedPO.po_date ? dayjs(selectedPO.po_date).format('DD-MM-YYYY') : '—'}</strong></span>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">{materialType === 'concrete' ? 'Grade (M10 / M25…)' : 'Grade (optional)'}</label>
              <input value={grade} onChange={e => setGrade(e.target.value)} placeholder={materialType === 'concrete' ? 'M25' : 'e.g. Fe500'} className={INP} />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Unit</label>
              <input value={unit} onChange={e => setUnit(e.target.value)} placeholder="MT / CUM" className={INP} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="block text-[11px] font-medium text-slate-500 mb-1">MR Number</label>
              <input value={mrNumber} onChange={e => setMrNumber(e.target.value)} placeholder="MR-001" className={INP} /></div>
            <div><label className="block text-[11px] font-medium text-slate-500 mb-1">MR Qty</label>
              <input type="number" value={mrQty} onChange={e => setMrQty(e.target.value)} className={INP} /></div>
            <div><label className="block text-[11px] font-medium text-slate-500 mb-1">Ordered Qty</label>
              <input type="number" value={orderedQty} onChange={e => setOrderedQty(e.target.value)} className={INP} /></div>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-100">
          <button onClick={onClose} className="h-9 px-4 rounded-xl border border-slate-200 text-xs text-slate-600 hover:bg-slate-50">Cancel</button>
          <button onClick={submit} disabled={saveMutation.isPending || !selectedPO}
            className="h-9 px-5 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50">
            {saveMutation.isPending ? 'Saving…' : 'Add to Tracker'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Sync Modal ────────────────────────────────────────────────────────────────
function SyncModal({ materialType, projectId, onClose, onSynced }) {
  const qc = useQueryClient();
  const [step, setStep] = useState('preview');
  const [result, setResult] = useState(null);

  const { data: preview, isLoading, error } = useQuery({
    queryKey: ['mt-sync-preview', materialType, projectId],
    queryFn: () => materialTrackerAPI.autoImportPreview({ material_type: materialType, project_id: projectId || undefined }).then(r => r.data?.data),
  });

  const runMut = useMutation({
    mutationFn: () => materialTrackerAPI.autoImportRun({ material_type: materialType, project_id: projectId || undefined }),
    onSuccess: (r) => {
      setResult(r.data?.data);
      setStep('done');
      qc.invalidateQueries({ queryKey: ['mt-loads'] });
      qc.invalidateQueries({ queryKey: ['mt-list'] });
      qc.invalidateQueries({ queryKey: ['mt-abstract'] });
      onSynced?.();
    },
    onError: e => toast.error(e?.response?.data?.error || 'Import failed'),
  });

  const label = materialType === 'concrete' ? 'RMC' : 'Steel';

  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2"><Zap size={16} className="text-yellow-500" />
            <h3 className="text-sm font-semibold">Sync {label} from GRNs & Bills</h3></div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center"><X size={14} className="text-slate-500" /></button>
        </div>
        <div className="p-6">
          {step === 'preview' && (
            <>
              {isLoading && <div className="flex items-center justify-center py-8 text-slate-400 text-sm"><RefreshCw size={18} className="animate-spin mr-2" /> Scanning…</div>}
              {error && <div className="text-red-600 text-sm py-4">Failed to scan: {error.message}</div>}
              {preview && !isLoading && (
                <div className="space-y-4">
                  <p className="text-xs text-slate-500">Found {label} records in Purchase Orders, GRNs and Bills. The following will be auto-imported.</p>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: `${label} POs found`, value: preview.pos_found, color: 'blue' },
                      { label: 'New POs to register', value: preview.pos_new, color: preview.pos_new > 0 ? 'emerald' : 'slate' },
                      { label: 'From GRNs (loads)', value: preview.grns_new, color: preview.grns_new > 0 ? 'emerald' : 'slate' },
                      { label: 'From Bills (loads)', value: preview.bills_new, color: preview.bills_new > 0 ? 'blue' : 'slate' },
                    ].map(k => (
                      <div key={k.label} className={`bg-${k.color}-50 border border-${k.color}-100 rounded-xl p-3`}>
                        <div className={`text-2xl font-bold text-${k.color}-700`}>{k.value}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">{k.label}</div>
                      </div>
                    ))}
                  </div>
                  {preview.pos_found > 0 && (
                    <div className="bg-slate-50 rounded-xl p-3 max-h-40 overflow-y-auto">
                      <div className="text-[11px] font-medium text-slate-500 mb-2">POs detected:</div>
                      {preview.pos.map(p => (
                        <div key={p.id} className="flex items-center gap-2 text-[11px] py-1 border-b border-slate-100 last:border-0">
                          <span className="font-mono font-semibold text-slate-700 flex-1">{p.po_number || p.serial_no_formatted}</span>
                          <span className="text-slate-400 truncate max-w-[120px]">{p.vendor_name}</span>
                          {p.already_imported
                            ? <span className="text-[10px] bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded">imported</span>
                            : <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">new</span>}
                        </div>
                      ))}
                    </div>
                  )}
                  {preview.loads_new === 0 && preview.pos_new === 0 && (
                    <div className="text-center text-slate-500 text-sm py-2">Everything is already up to date.</div>
                  )}
                </div>
              )}
            </>
          )}
          {step === 'done' && result && (
            <div className="text-center space-y-3 py-4">
              <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto"><Zap size={26} className="text-emerald-600" /></div>
              <div className="font-semibold text-slate-800">Import complete!</div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-blue-50 rounded-xl p-3"><div className="text-xl font-bold text-blue-700">{result.total_pos}</div><div className="text-[11px] text-slate-500">POs found</div></div>
                <div className="bg-emerald-50 rounded-xl p-3"><div className="text-xl font-bold text-emerald-700">{result.entries_created}</div><div className="text-[11px] text-slate-500">POs registered</div></div>
                <div className="bg-purple-50 rounded-xl p-3"><div className="text-xl font-bold text-purple-700">{result.loads_created}</div><div className="text-[11px] text-slate-500">Loads imported</div></div>
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-100">
          <button onClick={onClose} className="h-9 px-4 rounded-xl border border-slate-200 text-xs text-slate-600 hover:bg-slate-50">{step === 'done' ? 'Close' : 'Cancel'}</button>
          {step === 'preview' && preview && (preview.loads_new > 0 || preview.pos_new > 0) && (
            <button onClick={() => { setStep('running'); runMut.mutate(); }} disabled={runMut.isPending}
              className="h-9 px-5 rounded-xl bg-yellow-500 text-white text-xs font-semibold hover:bg-yellow-600 disabled:opacity-50 flex items-center gap-2">
              <Zap size={13} /> {runMut.isPending ? 'Importing…' : `Import ${preview.loads_new} load${preview.loads_new !== 1 ? 's' : ''}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Tracker Tab (main content per material type) ──────────────────────────────
function TrackerTab({ materialType, projectId, projects, canWrite }) {
  const qc = useQueryClient();
  const today      = dayjs().format('YYYY-MM-DD');
  const monthStart = dayjs().startOf('month').format('YYYY-MM-DD');

  const [subTab, setSubTab]             = useState('loads');
  const [fromDate, setFromDate]         = useState(monthStart);
  const [toDate, setToDate]             = useState(today);
  const [search, setSearch]             = useState('');
  const [showRegister, setShowRegister] = useState(false);
  const [showSync, setShowSync]         = useState(false);
  const [showPOPicker, setShowPOPicker] = useState(false);
  const [addLoadEntryId, setAddLoadEntryId] = useState(null);
  const [editLoad, setEditLoad]         = useState(null); // { entryId, load }

  const { data: loads = [], isLoading, refetch } = useQuery({
    queryKey: ['mt-loads', materialType, projectId, fromDate, toDate],
    queryFn: () => materialTrackerAPI.loadwise({
      material_type: materialType,
      project_id: projectId || undefined,
      from_date: fromDate || undefined,
      to_date:   toDate   || undefined,
    }).then(r => r.data?.data || []),
  });

  const { data: entries = [] } = useQuery({
    queryKey: ['mt-list', materialType, projectId],
    queryFn: () => materialTrackerAPI.list({ material_type: materialType, project_id: projectId || undefined })
      .then(r => r.data?.data || []),
  });

  const { data: abstract = [] } = useQuery({
    queryKey: ['mt-abstract', materialType, projectId],
    queryFn: () => materialTrackerAPI.abstract({ material_type: materialType, project_id: projectId || undefined })
      .then(r => r.data?.data || []),
    enabled: subTab === 'abstract',
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return loads;
    const q = search.toLowerCase();
    return loads.filter(l =>
      l.po_number?.toLowerCase().includes(q) ||
      l.vendor_name?.toLowerCase().includes(q) ||
      l.grade?.toLowerCase().includes(q) ||
      l.vehicle_no?.toLowerCase().includes(q) ||
      l.invoice_no?.toLowerCase().includes(q) ||
      l.ign_no?.toLowerCase().includes(q) ||
      l.grs_no?.toLowerCase().includes(q)
    );
  }, [loads, search]);

  // KPIs — ordered qty from entries (not date-filtered), supplied from date-filtered loads
  const totalPOs      = new Set(loads.map(l => l.entry_id)).size;
  const totalOrdered  = entries.reduce((s, e) => s + parseFloat(e.ordered_qty || 0), 0);
  const totalSupplied = loads.reduce((s, l) => s + parseFloat(l.invoice_qty  || 0), 0);
  const totalBalance  = totalOrdered - totalSupplied;
  const totalValue    = loads.reduce((s, l) => s + parseFloat(l.grand_total  || 0), 0);
  const diaTotals     = DIA_COLS.reduce((acc, k) => {
    acc[k] = loads.reduce((s, l) => s + parseFloat(l[k] || 0), 0);
    return acc;
  }, {});

  const unit  = materialType === 'concrete' ? 'CUM' : 'MT';
  const color = materialType === 'concrete' ? 'emerald' : 'orange';

  const deleteMut = useMutation({
    mutationFn: ({ entryId, loadId }) => materialTrackerAPI.deleteLoad(entryId, loadId),
    onSuccess: () => {
      toast.success('Load deleted');
      invalidateAll();
    },
    onError: e => toast.error(e?.response?.data?.error || 'Failed'),
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['mt-loads', materialType] });
    qc.invalidateQueries({ queryKey: ['mt-list', materialType] });
    qc.invalidateQueries({ queryKey: ['mt-abstract', materialType] });
  };

  const exportExcel = () => {
    const rows = filtered.map((l, i) => ({
      '#': i + 1,
      'Date': fmt(l.received_date),
      'PO No': l.po_number,
      'Vendor': l.vendor_name || '',
      ...(materialType === 'concrete' ? { 'Grade': l.grade || '' } : {}),
      'Vehicle No': l.vehicle_no || '',
      'Invoice No': l.invoice_no || '',
      'IGN No': l.ign_no || '',
      'GRS No': l.grs_no || '',
      [`Inv Qty (${unit})`]: parseFloat(l.invoice_qty || 0),
      [`W/M Qty (${unit})`]: parseFloat(l.weighbridge_qty || 0),
      'Diff': parseFloat(l.difference || 0),
      'Rate': parseFloat(l.rate || 0),
      'GST %': parseFloat(l.gst_rate || 0),
      'GST Amt': parseFloat(l.gst_amount || 0),
      'Grand Total (₹)': parseFloat(l.grand_total || 0),
      ...(materialType === 'steel'
        ? DIA_COLS.reduce((acc, k, i) => { acc[`${DIA_LABELS[i]} (MT)`] = parseFloat(l[k] || 0); return acc; }, {})
        : {}),
      'Remarks': l.remarks || '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    const sheetName = materialType === 'concrete' ? 'RMC Tracker' : 'Steel Tracker';
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, `${materialType === 'concrete' ? 'RMC' : 'Steel'}_Tracker_${dayjs().format('YYYYMMDD')}.xlsx`);
  };

  // Concrete: Grade col present; Steel: dia cols present
  const isConcrete = materialType === 'concrete';

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* KPI Strip */}
      <div className="px-5 pt-4 pb-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 flex-shrink-0 bg-[#f5f6fa]">
        <StatCard icon={Truck}        label="Loads / Trips"        value={loads.length}       color={color} />
        <StatCard icon={Package}      label="POs Tracked"          value={totalPOs}            color="blue" />
        <StatCard icon={Scale}        label={`Ordered (${unit})`}  value={n3(totalOrdered)}   color="slate" />
        <StatCard icon={Layers}       label={`Supplied (${unit})`} value={n3(totalSupplied)}  color={color} />
        <StatCard icon={TrendingDown} label={`Balance (${unit})`}  value={n3(totalBalance)}
          color={totalBalance < 0 ? 'red' : 'emerald'} />
        <StatCard icon={IndianRupee}  label="Total Value"          value={`₹${inr(totalValue)}`} color="indigo" />
      </div>

      {/* Steel: Dia-wise summary banner */}
      {!isConcrete && (
        <div className="px-5 pb-3 flex-shrink-0 bg-[#f5f6fa]">
          <div className="bg-orange-50 border border-orange-100 rounded-2xl px-4 py-2.5 flex flex-wrap gap-x-5 gap-y-1 text-[11px]">
            <span className="font-bold text-orange-700 mr-1">Dia-wise Supplied (MT):</span>
            {DIA_COLS.map((k, i) => (
              <span key={k} className={diaTotals[k] > 0 ? 'text-slate-700' : 'text-slate-400'}>
                <span className="text-slate-500">{DIA_LABELS[i]}: </span>
                <strong>{n3(diaTotals[k])}</strong>
              </span>
            ))}
            <span className="ml-auto font-semibold text-orange-700">Total: {n3(DIA_COLS.reduce((s,k) => s + diaTotals[k], 0))} MT</span>
          </div>
        </div>
      )}

      {/* Controls bar */}
      <div className="px-5 py-3 bg-white border-b border-slate-200 flex-shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Date range */}
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
            className="h-8 px-2.5 text-xs rounded-lg border border-slate-200 focus:border-blue-400 focus:outline-none" />
          <span className="text-slate-400 text-xs">to</span>
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
            className="h-8 px-2.5 text-xs rounded-lg border border-slate-200 focus:border-blue-400 focus:outline-none" />
          {/* Search */}
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="PO, vendor, vehicle, invoice, IGN…"
              className="h-8 pl-7 pr-3 w-60 text-xs rounded-lg border border-slate-200 focus:border-blue-400 focus:outline-none" />
          </div>
          <div className="flex-1" />
          {canWrite && (
            <>
              <button onClick={() => setShowSync(true)}
                className="h-8 px-3 flex items-center gap-1.5 rounded-lg bg-yellow-50 border border-yellow-200 text-yellow-700 text-[11px] font-semibold hover:bg-yellow-100">
                <Zap size={12} /> Sync from GRNs
              </button>
              <button onClick={() => setShowRegister(true)}
                className="h-8 px-3 flex items-center gap-1.5 rounded-lg border border-slate-200 text-slate-700 text-[11px] font-semibold hover:bg-slate-50">
                <Plus size={12} /> Register PO
              </button>
              <button onClick={() => setShowPOPicker(true)}
                className={clsx('h-8 px-3 flex items-center gap-1.5 rounded-lg text-white text-[11px] font-semibold',
                  isConcrete ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-orange-600 hover:bg-orange-700')}>
                <Plus size={12} /> Add Load
              </button>
            </>
          )}
          <button onClick={exportExcel}
            className="h-8 px-3 flex items-center gap-1.5 rounded-lg border border-slate-200 text-slate-700 text-[11px] font-semibold hover:bg-slate-50">
            <FileSpreadsheet size={12} /> Excel
          </button>
        </div>

        {/* Sub-tabs */}
        <div className="flex gap-1 mt-3">
          {[['loads', 'Load-wise Detail'], ['abstract', 'PO Summary / Abstract']].map(([id, lbl]) => (
            <button key={id} onClick={() => setSubTab(id)}
              className={clsx('px-4 py-1.5 text-xs font-medium rounded-t-lg border-b-2 -mb-px transition-colors',
                subTab === id ? 'border-blue-600 text-blue-700 bg-blue-50/50' : 'border-transparent text-slate-500 hover:text-slate-700')}>
              {lbl}
            </button>
          ))}
          {subTab === 'loads' && (
            <span className="ml-auto self-center text-[11px] text-slate-400">
              {filtered.length} load{filtered.length !== 1 ? 's' : ''}
              {search ? ` matching "${search}"` : ''}
            </span>
          )}
        </div>
      </div>

      {/* Table area */}
      <div className="flex-1 overflow-hidden bg-white">
        {subTab === 'loads' && (
          <div className="h-full overflow-auto" style={{ scrollbarWidth:'thin', scrollbarColor:'#94a3b8 transparent' }}>
            <style>{`
              .mt-hscroll::-webkit-scrollbar { height: 10px; }
              .mt-hscroll::-webkit-scrollbar-track { background: #f1f5f9; }
              .mt-hscroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 8px; }
              .mt-hscroll::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
            `}</style>
            <div className="mt-hscroll overflow-x-auto min-w-full">
              {isLoading ? (
                <div className="flex items-center justify-center h-48 text-slate-400 text-sm">
                  <RefreshCw size={18} className="animate-spin mr-2" /> Loading…
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-slate-400">
                  <Truck size={36} className="mb-2 opacity-20" />
                  <p className="text-sm">No loads found for the selected date range</p>
                  <p className="text-xs mt-1 text-slate-300">Try expanding the date range or use Sync from GRNs</p>
                </div>
              ) : (
                <table className="w-full text-[11px] border-collapse">
                  <thead className="sticky top-0 z-10">
                    <tr className={isConcrete ? 'bg-emerald-800 text-white' : 'bg-orange-800 text-white'}>
                      <th className="px-2.5 py-2.5 text-left font-semibold whitespace-nowrap">#</th>
                      <th className="px-2.5 py-2.5 text-left font-semibold whitespace-nowrap">Date</th>
                      <th className="px-2.5 py-2.5 text-left font-semibold whitespace-nowrap">PO No</th>
                      <th className="px-2.5 py-2.5 text-left font-semibold whitespace-nowrap">Vendor</th>
                      {isConcrete && <th className="px-2.5 py-2.5 text-left font-semibold whitespace-nowrap">Grade</th>}
                      <th className="px-2.5 py-2.5 text-left font-semibold whitespace-nowrap">Vehicle No</th>
                      <th className="px-2.5 py-2.5 text-left font-semibold whitespace-nowrap">Invoice No</th>
                      <th className="px-2.5 py-2.5 text-left font-semibold whitespace-nowrap">IGN No</th>
                      <th className="px-2.5 py-2.5 text-left font-semibold whitespace-nowrap">GRS No</th>
                      <th className="px-2.5 py-2.5 text-right font-semibold whitespace-nowrap">Inv Qty ({unit})</th>
                      <th className="px-2.5 py-2.5 text-right font-semibold whitespace-nowrap">W/M Qty</th>
                      <th className="px-2.5 py-2.5 text-right font-semibold whitespace-nowrap">Diff</th>
                      <th className="px-2.5 py-2.5 text-right font-semibold whitespace-nowrap">Rate</th>
                      <th className="px-2.5 py-2.5 text-right font-semibold whitespace-nowrap">GST%</th>
                      <th className="px-2.5 py-2.5 text-right font-semibold whitespace-nowrap">GST Amt</th>
                      <th className="px-2.5 py-2.5 text-right font-semibold whitespace-nowrap">Grand Total</th>
                      {!isConcrete && DIA_COLS.map((_, i) => (
                        <th key={DIA_LABELS[i]} className="px-2.5 py-2.5 text-right font-semibold whitespace-nowrap">{DIA_LABELS[i]}</th>
                      ))}
                      <th className="px-2.5 py-2.5 text-left font-semibold whitespace-nowrap">Remarks</th>
                      {canWrite && <th className="px-2.5 py-2.5 whitespace-nowrap" />}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((l, idx) => {
                      const diff = parseFloat(l.difference ?? (parseFloat(l.weighbridge_qty||0) - parseFloat(l.invoice_qty||0)));
                      const isEven = idx % 2 === 0;
                      return (
                        <tr key={l.load_id} className={clsx('border-b border-slate-100 hover:bg-blue-50/40 transition-colors', isEven ? 'bg-white' : 'bg-slate-50/40')}>
                          <td className="px-2.5 py-2 text-slate-400">{idx + 1}</td>
                          <td className="px-2.5 py-2 whitespace-nowrap font-medium text-slate-800">{fmt(l.received_date)}</td>
                          <td className="px-2.5 py-2 font-mono font-semibold text-blue-700 whitespace-nowrap">{l.po_number}</td>
                          <td className="px-2.5 py-2 max-w-[140px] truncate text-slate-600">{l.vendor_name || '—'}</td>
                          {isConcrete && <td className="px-2.5 py-2 text-emerald-700 font-semibold whitespace-nowrap">{l.grade || '—'}</td>}
                          <td className="px-2.5 py-2 font-mono text-[10px] text-slate-600">{l.vehicle_no || '—'}</td>
                          <td className="px-2.5 py-2 text-slate-700">{l.invoice_no || '—'}</td>
                          <td className="px-2.5 py-2 text-slate-500">{l.ign_no || '—'}</td>
                          <td className="px-2.5 py-2 text-slate-500">{l.grs_no || '—'}</td>
                          <td className="px-2.5 py-2 text-right font-mono font-bold text-slate-800">{n3(l.invoice_qty)}</td>
                          <td className="px-2.5 py-2 text-right font-mono text-slate-600">{l.weighbridge_qty ? n3(l.weighbridge_qty) : '—'}</td>
                          <td className={clsx('px-2.5 py-2 text-right font-mono font-semibold',
                            diff < -0.001 ? 'text-red-600' : diff > 0.001 ? 'text-emerald-600' : 'text-slate-400')}>
                            {l.weighbridge_qty ? (diff >= 0 ? '+' : '') + n3(diff) : '—'}
                          </td>
                          <td className="px-2.5 py-2 text-right text-slate-600">{l.rate ? n2(l.rate) : '—'}</td>
                          <td className="px-2.5 py-2 text-right text-slate-500">{l.gst_rate || 0}%</td>
                          <td className="px-2.5 py-2 text-right text-slate-500">{l.gst_amount ? `₹${inr(l.gst_amount)}` : '—'}</td>
                          <td className="px-2.5 py-2 text-right font-semibold text-slate-800">₹{inr(l.grand_total)}</td>
                          {!isConcrete && DIA_COLS.map(k => (
                            <td key={k} className={clsx('px-2.5 py-2 text-right font-mono',
                              parseFloat(l[k]) > 0 ? 'text-orange-700 font-semibold' : 'text-slate-300')}>
                              {parseFloat(l[k]) > 0 ? n3(l[k]) : '—'}
                            </td>
                          ))}
                          <td className="px-2.5 py-2 text-slate-400 text-[10px] max-w-[120px] truncate">{l.remarks || ''}</td>
                          {canWrite && (
                            <td className="px-2.5 py-2">
                              <div className="flex gap-1">
                                <button onClick={() => setEditLoad({ entryId: l.entry_id, load: { ...l, id: l.load_id } })}
                                  className="w-6 h-6 rounded hover:bg-slate-200 flex items-center justify-center">
                                  <Pencil size={11} className="text-slate-500" />
                                </button>
                                <button onClick={() => {
                                  if (window.confirm('Delete this load entry?'))
                                    deleteMut.mutate({ entryId: l.entry_id, loadId: l.load_id });
                                }} className="w-6 h-6 rounded hover:bg-red-100 flex items-center justify-center">
                                  <Trash2 size={11} className="text-red-400" />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                  {filtered.length > 1 && (() => {
                    const totInv = filtered.reduce((s,l) => s + parseFloat(l.invoice_qty||0), 0);
                    const totWb  = filtered.reduce((s,l) => s + parseFloat(l.weighbridge_qty||0), 0);
                    const totGT  = filtered.reduce((s,l) => s + parseFloat(l.grand_total||0), 0);
                    const totGST = filtered.reduce((s,l) => s + parseFloat(l.gst_amount||0), 0);
                    return (
                      <tfoot>
                        <tr className={isConcrete ? 'bg-emerald-800 text-white font-semibold' : 'bg-orange-800 text-white font-semibold'}>
                          <td className="px-2.5 py-2.5" colSpan={isConcrete ? 9 : 8}>
                            Totals — {filtered.length} loads
                          </td>
                          <td className="px-2.5 py-2.5 text-right font-mono">{n3(totInv)}</td>
                          <td className="px-2.5 py-2.5 text-right font-mono">{n3(totWb)}</td>
                          <td className="px-2.5 py-2.5 text-right font-mono">{(totWb - totInv) >= 0 ? '+' : ''}{n3(totWb - totInv)}</td>
                          <td className="px-2.5 py-2.5" colSpan={2} />
                          <td className="px-2.5 py-2.5 text-right">₹{inr(totGST)}</td>
                          <td className="px-2.5 py-2.5 text-right">₹{inr(totGT)}</td>
                          {!isConcrete && DIA_COLS.map(k => (
                            <td key={k} className="px-2.5 py-2.5 text-right font-mono">
                              {n3(filtered.reduce((s,l) => s + parseFloat(l[k]||0), 0))}
                            </td>
                          ))}
                          <td colSpan={canWrite ? 2 : 1} />
                        </tr>
                      </tfoot>
                    );
                  })()}
                </table>
              )}
            </div>
          </div>
        )}

        {subTab === 'abstract' && (
          <div className="h-full overflow-auto">
            <div className="mt-hscroll overflow-x-auto min-w-full p-5">
              {abstract.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-slate-400">
                  <Package size={32} className="mb-2 opacity-30" />
                  <p className="text-sm">No POs registered yet — register POs and add loads first</p>
                </div>
              ) : (
                <table className="w-full text-[11px] border-collapse">
                  <thead>
                    <tr className={isConcrete ? 'bg-emerald-800 text-white' : 'bg-orange-800 text-white'}>
                      {['PO No','Vendor','Grade','MR No','MR Qty',`Ordered (${unit})`,`Supplied (${unit})`,`Balance (${unit})`,'Basic Value','Value + GST','Loads','Progress'].map(h => (
                        <th key={h} className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {abstract.map((row, i) => {
                      const bal  = parseFloat(row.balance_qty);
                      const prog = pct(parseFloat(row.supplied_qty), parseFloat(row.ordered_qty));
                      return (
                        <tr key={row.id} className={clsx('border-b border-slate-100', i % 2 === 0 ? 'bg-white' : 'bg-slate-50')}>
                          <td className="px-3 py-2 font-mono font-semibold text-blue-700 whitespace-nowrap">{row.po_number}</td>
                          <td className="px-3 py-2 max-w-[150px] truncate">{row.vendor_name || '—'}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{row.grade || '—'}</td>
                          <td className="px-3 py-2">{row.mr_number || '—'}</td>
                          <td className="px-3 py-2 text-right">{row.mr_qty ? n3(row.mr_qty) : '—'}</td>
                          <td className="px-3 py-2 text-right font-medium">{n3(row.ordered_qty)}</td>
                          <td className="px-3 py-2 text-right text-blue-700 font-semibold">{n3(row.supplied_qty)}</td>
                          <td className={clsx('px-3 py-2 text-right font-semibold', bal < 0 ? 'text-red-600' : 'text-emerald-700')}>{n3(bal)}</td>
                          <td className="px-3 py-2 text-right">₹{inr(row.basic_supplied_value)}</td>
                          <td className="px-3 py-2 text-right font-semibold">₹{inr(row.supplied_value_with_gst)}</td>
                          <td className="px-3 py-2 text-center text-slate-500">{row.load_count}</td>
                          <td className="px-3 py-2 min-w-[110px]">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                <div className={clsx('h-full rounded-full', isConcrete ? 'bg-emerald-500' : 'bg-orange-500')}
                                  style={{ width: `${Math.min(prog, 100)}%` }} />
                              </div>
                              <span className="text-[10px] text-slate-500 whitespace-nowrap">{Math.min(prog, 100)}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className={isConcrete ? 'bg-emerald-800 text-white font-semibold' : 'bg-orange-800 text-white font-semibold'}>
                      <td className="px-3 py-2.5" colSpan={5}>Total ({abstract.length} POs)</td>
                      <td className="px-3 py-2.5 text-right">{n3(abstract.reduce((s,r) => s+parseFloat(r.ordered_qty||0),0))}</td>
                      <td className="px-3 py-2.5 text-right">{n3(abstract.reduce((s,r) => s+parseFloat(r.supplied_qty||0),0))}</td>
                      <td className="px-3 py-2.5 text-right">{n3(abstract.reduce((s,r) => s+parseFloat(r.balance_qty||0),0))}</td>
                      <td className="px-3 py-2.5 text-right">₹{inr(abstract.reduce((s,r) => s+parseFloat(r.basic_supplied_value||0),0))}</td>
                      <td className="px-3 py-2.5 text-right">₹{inr(abstract.reduce((s,r) => s+parseFloat(r.supplied_value_with_gst||0),0))}</td>
                      <td className="px-3 py-2.5 text-center">{abstract.reduce((s,r) => s+parseInt(r.load_count||0),0)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {showRegister && (
        <RegisterPOForm materialType={materialType} projects={projects}
          onClose={() => setShowRegister(false)} onSaved={invalidateAll} />
      )}
      {showSync && (
        <SyncModal materialType={materialType} projectId={projectId}
          onClose={() => setShowSync(false)} onSynced={invalidateAll} />
      )}

      {/* PO picker before Add Load */}
      {showPOPicker && (
        <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-800">Select PO for this Load</h3>
              <button onClick={() => setShowPOPicker(false)} className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center">
                <X size={14} className="text-slate-500" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-xs text-slate-500">Choose which PO this load delivery belongs to:</p>
              <select className={INP} defaultValue=""
                onChange={e => { if (e.target.value) { setAddLoadEntryId(e.target.value); setShowPOPicker(false); } }}>
                <option value="">Select a PO…</option>
                {entries.map(e => (
                  <option key={e.id} value={e.id}>
                    {e.po_number} — {e.vendor_name || 'Unknown'}{e.grade ? ` (${e.grade})` : ''}
                  </option>
                ))}
              </select>
              {entries.length === 0 && (
                <p className="text-xs text-amber-600">No POs registered yet. Please register a PO first using "Register PO".</p>
              )}
            </div>
            <div className="flex justify-end px-5 py-3 border-t border-slate-100">
              <button onClick={() => setShowPOPicker(false)}
                className="h-9 px-4 rounded-xl border border-slate-200 text-xs text-slate-600 hover:bg-slate-50">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {addLoadEntryId && (
        <LoadForm entryId={addLoadEntryId} materialType={materialType}
          defaultRate={entries.find(e => e.id === addLoadEntryId)?.unit_price}
          onClose={() => setAddLoadEntryId(null)}
          onSaved={() => { setAddLoadEntryId(null); invalidateAll(); }}
        />
      )}

      {editLoad && (
        <LoadForm entryId={editLoad.entryId} materialType={materialType}
          editLoad={editLoad.load}
          onClose={() => setEditLoad(null)}
          onSaved={() => { setEditLoad(null); invalidateAll(); }}
        />
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function MaterialTrackerPage() {
  const { user } = useAuthStore();
  const [tab, setTab]           = useState('concrete');
  const [projectId, setProjectId] = useState('');

  const canWrite = WRITE_ROLES.includes(user?.role);

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectAPI.list().then(r => r.data?.data || r.data || []),
  });

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#f5f6fa]">
      <PageHeader
        title="Material Tracker"
        subtitle="Daily Concrete (RMC) pours and Steel deliveries — load-wise against POs"
        breadcrumbs={[{ label: 'Stores' }, { label: 'Material Tracker' }]}
        actions={
          <select value={projectId} onChange={e => setProjectId(e.target.value)}
            className="h-9 pl-3 pr-8 text-xs rounded-xl border border-slate-200 bg-white/20 text-white focus:outline-none focus:bg-white focus:text-slate-800 focus:border-blue-400">
            <option value="" className="text-slate-800">All Projects</option>
            {projects.map(p => <option key={p.id} value={p.id} className="text-slate-800">{p.name}</option>)}
          </select>
        }
      />

      {/* Main tabs */}
      <div className="flex bg-white border-b border-slate-200 flex-shrink-0 px-5">
        <button onClick={() => setTab('concrete')}
          className={clsx('flex items-center gap-2 px-6 py-3.5 text-sm font-semibold border-b-2 -mb-px transition-colors',
            tab === 'concrete'
              ? 'border-emerald-600 text-emerald-700 bg-emerald-50/50'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50')}>
          <Waves size={16} />
          Daily Concrete (RMC) Tracker
        </button>
        <button onClick={() => setTab('steel')}
          className={clsx('flex items-center gap-2 px-6 py-3.5 text-sm font-semibold border-b-2 -mb-px transition-colors',
            tab === 'steel'
              ? 'border-orange-600 text-orange-700 bg-orange-50/50'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50')}>
          <BarChart3 size={16} />
          Steel Tracker
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <TrackerTab
          key={tab}
          materialType={tab}
          projectId={projectId}
          projects={projects}
          canWrite={canWrite}
        />
      </div>
    </div>
  );
}
