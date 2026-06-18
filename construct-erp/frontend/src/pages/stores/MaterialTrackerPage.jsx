// src/pages/stores/MaterialTrackerPage.jsx
// Material Tracker — Cement / Concrete / Steel
// Stores staff register POs and record per-load delivery entries.
import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, X, Pencil, Trash2, ChevronRight,
  Package, Truck, Search, RefreshCw,
  ChevronDown, ChevronUp,
} from 'lucide-react';
import { clsx } from 'clsx';
import dayjs from 'dayjs';
import toast from 'react-hot-toast';
import { materialTrackerAPI, poAPI, projectAPI } from '../../api/client';
import useAuthStore from '../../store/authStore';
import { PageHeader } from '../../theme';
import { FIELD_HL } from '../../constants/fieldStyles';

const INP = `w-full h-9 rounded-lg px-3 text-xs font-medium outline-none transition-all border ${FIELD_HL}`;

const MATERIAL_TABS = [
  { id: 'cement',   label: 'Cement',   color: 'blue' },
  { id: 'concrete', label: 'Concrete', color: 'emerald' },
  { id: 'steel',    label: 'Steel',    color: 'orange' },
];

const SUB_TABS = ['Loadwise Entry', 'Abstract'];

const WRITE_ROLES = ['store_keeper','stores_manager','stores_officer','admin','super_admin'];

const DIA_COLS = ['dia_8mm','dia_10mm','dia_12mm','dia_16mm','dia_20mm','dia_25mm','dia_32mm'];
const DIA_LABELS = ['8mm','10mm','12mm','16mm','20mm','25mm','32mm'];

const n3 = v => parseFloat(v || 0).toFixed(3);
const n2 = v => parseFloat(v || 0).toFixed(2);
const inr = v => Math.round(parseFloat(v || 0)).toLocaleString('en-IN');
const pct = (a, b) => b > 0 ? Math.round((a / b) * 100) : 0;

function emptyLoad() {
  return {
    received_date: dayjs().format('YYYY-MM-DD'),
    invoice_no: '', ign_no: '', grs_no: '', vehicle_no: '',
    invoice_qty: '', weighbridge_qty: '', rate: '', gst_rate: 18,
    gst_amount: '', tcs_amount: 0, grand_total: '', remarks: '',
    dia: { dia_8mm:0, dia_10mm:0, dia_12mm:0, dia_16mm:0, dia_20mm:0, dia_25mm:0, dia_32mm:0 },
  };
}

// ── Load Form ─────────────────────────────────────────────────────────────────
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
    // Auto-compute gst_amount and grand_total when relevant fields change
    const iQty   = parseFloat(next.invoice_qty  || 0);
    const rate   = parseFloat(next.rate          || 0);
    const gstPct = parseFloat(next.gst_rate      || 0);
    const tcs    = parseFloat(next.tcs_amount    || 0);
    const basic  = iQty * rate;
    const gst    = basic * gstPct / 100;
    next.gst_amount  = gst > 0  ? parseFloat(gst.toFixed(2))  : next.gst_amount;
    next.grand_total = basic > 0 ? parseFloat((basic + gst + tcs).toFixed(2)) : next.grand_total;
    return next;
  });

  const setDia = (k, v) => setF(p => ({ ...p, dia: { ...p.dia, [k]: parseFloat(v) || 0 } }));

  const diaTotal = DIA_COLS.reduce((s, k) => s + (parseFloat(f.dia[k]) || 0), 0);
  const diaMismatch = materialType === 'steel' && f.invoice_qty && Math.abs(diaTotal - parseFloat(f.invoice_qty)) > 0.01;

  const saveMutation = useMutation({
    mutationFn: (payload) => isEdit
      ? materialTrackerAPI.updateLoad(entryId, editLoad.id, payload)
      : materialTrackerAPI.addLoad(entryId, payload),
    onSuccess: () => {
      toast.success(isEdit ? 'Load updated' : 'Load added');
      onSaved();
      onClose();
    },
    onError: e => toast.error(e?.response?.data?.error || 'Failed to save load'),
  });

  const submit = () => {
    if (!f.received_date) return toast.error('Received date required');
    if (!f.invoice_qty)   return toast.error('Invoice qty required');
    if (diaMismatch) return toast.error(`Dia total (${n3(diaTotal)} MT) ≠ invoice qty (${f.invoice_qty})`);
    saveMutation.mutate({ ...f, dia: materialType === 'steel' ? f.dia : undefined });
  };

  const iQty  = parseFloat(f.invoice_qty  || 0);
  const wbQty = parseFloat(f.weighbridge_qty || 0);
  const diff  = wbQty - iQty;

  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-800">
            {isEdit ? 'Edit Load Entry' : 'Add Load Entry'}
          </h3>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center">
            <X size={14} className="text-slate-500" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-5 space-y-4 flex-1">
          {/* Row 1 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Received Date *</label>
              <input type="date" value={f.received_date}
                onChange={e => setField('received_date', e.target.value)}
                className={INP} />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Vehicle No</label>
              <input value={f.vehicle_no} onChange={e => setField('vehicle_no', e.target.value)}
                placeholder="KA01AB1234" className={INP} />
            </div>
          </div>

          {/* Row 2 */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Invoice No *</label>
              <input value={f.invoice_no} onChange={e => setField('invoice_no', e.target.value)}
                placeholder="INV-001" className={INP} />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">IGN No</label>
              <input value={f.ign_no} onChange={e => setField('ign_no', e.target.value)}
                placeholder="IGN/2024/0001" className={INP} />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">GRS No</label>
              <input value={f.grs_no} onChange={e => setField('grs_no', e.target.value)}
                placeholder="GRS/2024/0001" className={INP} />
            </div>
          </div>

          {/* Qty + Weighbridge */}
          <div className="grid grid-cols-3 gap-3 items-end">
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Invoice Qty *</label>
              <input type="number" step="0.001" value={f.invoice_qty}
                onChange={e => setField('invoice_qty', e.target.value)}
                className={INP} />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Weighbridge Qty (W/M)</label>
              <input type="number" step="0.001" value={f.weighbridge_qty}
                onChange={e => setField('weighbridge_qty', e.target.value)}
                className={INP} />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Difference</label>
              <div className={clsx(
                'h-9 px-3 rounded-lg border text-xs font-mono flex items-center',
                diff < 0 ? 'bg-red-50 border-red-200 text-red-700'
                         : diff > 0 ? 'bg-green-50 border-green-200 text-green-700'
                                    : 'bg-slate-50 border-slate-200 text-slate-500'
              )}>
                {f.weighbridge_qty && f.invoice_qty ? `${diff >= 0 ? '+' : ''}${n3(diff)}` : '—'}
              </div>
            </div>
          </div>

          {/* Rate + GST + TCS */}
          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Rate</label>
              <input type="number" step="0.01" value={f.rate}
                onChange={e => setField('rate', e.target.value)}
                className={INP} />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">GST %</label>
              <input type="number" step="0.01" value={f.gst_rate}
                onChange={e => setField('gst_rate', e.target.value)}
                className={INP} />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">TCS Amt</label>
              <input type="number" step="0.01" value={f.tcs_amount}
                onChange={e => setField('tcs_amount', e.target.value)}
                className={INP} />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Grand Total</label>
              <input type="number" step="0.01" value={f.grand_total}
                onChange={e => setField('grand_total', e.target.value)}
                className={INP} />
            </div>
          </div>

          {/* Computed summary strip */}
          {f.rate && f.invoice_qty && (
            <div className="bg-slate-50 rounded-xl px-4 py-2.5 flex gap-6 text-[11px]">
              <span><span className="text-slate-500">Basic: </span>
                <strong>₹{inr(parseFloat(f.invoice_qty||0) * parseFloat(f.rate||0))}</strong></span>
              <span><span className="text-slate-500">GST: </span>
                <strong>₹{inr(f.gst_amount)}</strong></span>
              <span><span className="text-slate-500">Grand Total: </span>
                <strong>₹{inr(f.grand_total)}</strong></span>
            </div>
          )}

          {/* Steel dia table */}
          {materialType === 'steel' && (
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-2">
                Dia-wise Breakdown (MT)
                {diaMismatch && (
                  <span className="ml-2 text-red-600 font-semibold">
                    ⚠ Total {n3(diaTotal)} ≠ Invoice Qty {f.invoice_qty}
                  </span>
                )}
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

          {/* Remarks */}
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Remarks</label>
            <input value={f.remarks} onChange={e => setField('remarks', e.target.value)}
              placeholder="Optional" className={INP} />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-100">
          <button onClick={onClose}
            className="h-9 px-4 rounded-xl border border-slate-200 text-xs text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
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
  const [f, setF] = useState({
    project_id: '', po_id: '', po_number: '', vendor_name: '',
    grade: '', mr_number: '', mr_qty: '', ordered_qty: '', unit: '',
  });
  const [poSearch, setPoSearch] = useState('');
  const [poList, setPoList] = useState([]);

  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  // Search POs
  const { isFetching: loadingPOs } = useQuery({
    queryKey: ['po-search', f.project_id, poSearch],
    queryFn: async () => {
      if (!f.project_id || poSearch.length < 2) return [];
      const r = await poAPI.list({ project_id: f.project_id, search: poSearch, limit: 20 });
      const list = r.data?.data || r.data || [];
      setPoList(list);
      return list;
    },
    enabled: !!f.project_id && poSearch.length >= 2,
  });

  const selectPO = (po) => {
    setF(p => ({
      ...p,
      po_id: po.id,
      po_number: po.po_number || po.serial_no_formatted || '',
      vendor_name: po.vendor_name || '',
      ordered_qty: po.items?.[0]?.quantity || '',
      unit: po.items?.[0]?.unit || '',
    }));
    setPoSearch(po.po_number || po.serial_no_formatted || '');
    setPoList([]);
  };

  const saveMutation = useMutation({
    mutationFn: (d) => materialTrackerAPI.register(d),
    onSuccess: () => { toast.success('PO registered to tracker'); onSaved(); onClose(); },
    onError: e => toast.error(e?.response?.data?.error || 'Failed'),
  });

  const submit = () => {
    if (!f.project_id) return toast.error('Select a project');
    if (!f.po_number)  return toast.error('Enter or select a PO number');
    saveMutation.mutate({ ...f, material_type: materialType });
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-800 capitalize">
            Register {materialType} PO
          </h3>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center">
            <X size={14} className="text-slate-500" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Project */}
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Project *</label>
            <select value={f.project_id} onChange={e => set('project_id', e.target.value)}
              className={INP}>
              <option value="">Select project…</option>
              {(projects || []).map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* PO search */}
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">PO Number *</label>
            <div className="relative">
              <input value={poSearch}
                onChange={e => { setPoSearch(e.target.value); set('po_number', e.target.value); set('po_id', ''); }}
                placeholder="Type PO number to search…"
                className={INP} />
              {loadingPOs && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <RefreshCw size={12} className="animate-spin text-slate-400" />
                </div>
              )}
              {poList.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                  {poList.map(po => (
                    <button key={po.id} onClick={() => selectPO(po)}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 border-b border-slate-100 last:border-0">
                      <div className="font-medium text-slate-700">{po.po_number || po.serial_no_formatted}</div>
                      <div className="text-slate-400">{po.vendor_name}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Vendor */}
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Vendor Name</label>
            <input value={f.vendor_name} onChange={e => set('vendor_name', e.target.value)}
              className={INP} />
          </div>

          {/* Grade + Unit */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">
                {materialType === 'concrete' ? 'Grade (M10/M25…)' : 'Grade (optional)'}
              </label>
              <input value={f.grade} onChange={e => set('grade', e.target.value)}
                placeholder={materialType === 'concrete' ? 'M25' : ''}
                className={INP} />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Unit</label>
              <input value={f.unit} onChange={e => set('unit', e.target.value)}
                placeholder="MT / CUM" className={INP} />
            </div>
          </div>

          {/* MR + Ordered qty */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">MR Number</label>
              <input value={f.mr_number} onChange={e => set('mr_number', e.target.value)}
                className={INP} />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">MR Qty</label>
              <input type="number" value={f.mr_qty} onChange={e => set('mr_qty', e.target.value)}
                className={INP} />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Ordered Qty</label>
              <input type="number" value={f.ordered_qty} onChange={e => set('ordered_qty', e.target.value)}
                className={INP} />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-100">
          <button onClick={onClose}
            className="h-9 px-4 rounded-xl border border-slate-200 text-xs text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
          <button onClick={submit} disabled={saveMutation.isPending}
            className="h-9 px-5 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50">
            {saveMutation.isPending ? 'Saving…' : 'Register PO'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Loads Panel (right side) ──────────────────────────────────────────────────
function LoadsPanel({ entry, materialType, canWrite, onRefresh }) {
  const qc = useQueryClient();
  const [showForm, setShowForm]   = useState(false);
  const [editLoad, setEditLoad]   = useState(null);
  const [expandedDia, setExpandedDia] = useState(null);

  const { data: detail, isLoading } = useQuery({
    queryKey: ['mt-entry', entry.id],
    queryFn: () => materialTrackerAPI.get(entry.id).then(r => r.data?.data),
    enabled: !!entry.id,
  });

  const loads = detail?.loads || [];

  const deleteMutation = useMutation({
    mutationFn: (loadId) => materialTrackerAPI.deleteLoad(entry.id, loadId),
    onSuccess: () => {
      toast.success('Load deleted');
      qc.invalidateQueries({ queryKey: ['mt-entry', entry.id] });
      onRefresh();
    },
    onError: e => toast.error(e?.response?.data?.error || 'Failed'),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['mt-entry', entry.id] });
    onRefresh();
  };

  const totalInvoice    = loads.reduce((s, l) => s + parseFloat(l.invoice_qty    || 0), 0);
  const totalWb         = loads.reduce((s, l) => s + parseFloat(l.weighbridge_qty|| 0), 0);
  const totalGrandTotal = loads.reduce((s, l) => s + parseFloat(l.grand_total    || 0), 0);
  const orderedQty      = parseFloat(entry.ordered_qty || 0);
  const progress        = pct(totalInvoice, orderedQty);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Entry header */}
      <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 flex-shrink-0">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[11px] text-slate-400 font-medium uppercase tracking-wide">Selected PO</div>
            <div className="text-base font-bold text-slate-800 mt-0.5">{entry.po_number}</div>
            <div className="text-xs text-slate-500">{entry.vendor_name}{entry.grade ? ` — ${entry.grade}` : ''}</div>
          </div>
          {canWrite && (
            <button onClick={() => { setEditLoad(null); setShowForm(true); }}
              className="h-8 px-3 flex items-center gap-1.5 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700">
              <Plus size={13} /> Add Load
            </button>
          )}
        </div>

        {/* KPI strip */}
        <div className="mt-3 grid grid-cols-4 gap-2 text-[11px]">
          {[
            { label: 'Ordered', value: `${n3(orderedQty)} ${entry.unit||''}`, color: 'text-slate-700' },
            { label: 'Supplied', value: `${n3(totalInvoice)} ${entry.unit||''}`, color: 'text-blue-700' },
            { label: 'Balance', value: `${n3(orderedQty - totalInvoice)} ${entry.unit||''}`,
              color: (orderedQty - totalInvoice) < 0 ? 'text-red-600' : 'text-emerald-700' },
            { label: 'Total Value', value: `₹${inr(totalGrandTotal)}`, color: 'text-slate-700' },
          ].map(k => (
            <div key={k.label} className="bg-white rounded-lg px-3 py-2 border border-slate-200">
              <div className="text-slate-400">{k.label}</div>
              <div className={clsx('font-semibold mt-0.5', k.color)}>{k.value}</div>
            </div>
          ))}
        </div>

        {/* Progress bar */}
        {orderedQty > 0 && (
          <div className="mt-2.5">
            <div className="flex justify-between text-[10px] text-slate-400 mb-1">
              <span>Delivery progress</span>
              <span>{progress}%</span>
            </div>
            <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full transition-all"
                style={{ width: `${Math.min(progress, 100)}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* Loads table */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32 text-slate-400 text-sm">
            Loading loads…
          </div>
        ) : loads.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-slate-400">
            <Truck size={32} className="mb-2 opacity-30" />
            <p className="text-sm">No loads recorded yet</p>
            {canWrite && <p className="text-xs mt-1">Click "Add Load" to record a delivery</p>}
          </div>
        ) : (
          <table className="w-full text-[11px]">
            <thead className="bg-slate-50 sticky top-0">
              <tr>
                {['#','Date','Vehicle','Invoice No','IGN','Inv Qty','W/M Qty','Diff','Rate','GST%','Grand Total',''].map(h => (
                  <th key={h} className="px-2.5 py-2 text-left font-semibold text-slate-500 border-b border-slate-200 whitespace-nowrap">
                    {h}
                  </th>
                ))}
                {materialType === 'steel' && (
                  <th className="px-2.5 py-2 text-left font-semibold text-slate-500 border-b border-slate-200">Dia</th>
                )}
              </tr>
            </thead>
            <tbody>
              {loads.map((l, idx) => {
                const diff = parseFloat(l.difference ?? (parseFloat(l.weighbridge_qty||0) - parseFloat(l.invoice_qty||0)));
                const hasDia = materialType === 'steel' && DIA_COLS.some(k => parseFloat(l[k]) > 0);
                return (
                  <React.Fragment key={l.id}>
                    <tr className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-2.5 py-2 text-slate-400">{idx + 1}</td>
                      <td className="px-2.5 py-2 whitespace-nowrap">{dayjs(l.received_date).format('DD-MM-YY')}</td>
                      <td className="px-2.5 py-2 font-mono text-[10px]">{l.vehicle_no || '—'}</td>
                      <td className="px-2.5 py-2">{l.invoice_no || '—'}</td>
                      <td className="px-2.5 py-2 text-slate-500">{l.ign_no || '—'}</td>
                      <td className="px-2.5 py-2 text-right font-mono">{n3(l.invoice_qty)}</td>
                      <td className="px-2.5 py-2 text-right font-mono">{l.weighbridge_qty ? n3(l.weighbridge_qty) : '—'}</td>
                      <td className={clsx('px-2.5 py-2 text-right font-mono font-semibold',
                        diff < -0.001 ? 'text-red-600' : diff > 0.001 ? 'text-emerald-600' : 'text-slate-400')}>
                        {l.weighbridge_qty ? (diff >= 0 ? '+' : '') + n3(diff) : '—'}
                      </td>
                      <td className="px-2.5 py-2 text-right">{l.rate ? n2(l.rate) : '—'}</td>
                      <td className="px-2.5 py-2 text-right text-slate-500">{l.gst_rate}%</td>
                      <td className="px-2.5 py-2 text-right font-medium">₹{inr(l.grand_total)}</td>
                      <td className="px-2.5 py-2">
                        <div className="flex gap-1">
                          {canWrite && (
                            <>
                              <button onClick={() => { setEditLoad(l); setShowForm(true); }}
                                className="w-6 h-6 rounded hover:bg-slate-200 flex items-center justify-center">
                                <Pencil size={11} className="text-slate-500" />
                              </button>
                              <button onClick={() => {
                                if (window.confirm('Delete this load?')) deleteMutation.mutate(l.id);
                              }} className="w-6 h-6 rounded hover:bg-red-100 flex items-center justify-center">
                                <Trash2 size={11} className="text-red-400" />
                              </button>
                            </>
                          )}
                          {hasDia && (
                            <button onClick={() => setExpandedDia(expandedDia === l.id ? null : l.id)}
                              className="w-6 h-6 rounded hover:bg-slate-200 flex items-center justify-center">
                              {expandedDia === l.id ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {/* Dia breakdown row */}
                    {hasDia && expandedDia === l.id && (
                      <tr className="bg-orange-50 border-b border-orange-100">
                        <td colSpan={12} className="px-4 py-2">
                          <div className="flex flex-wrap gap-3 text-[11px]">
                            {DIA_COLS.map((k, i) => parseFloat(l[k]) > 0 ? (
                              <span key={k} className="bg-white rounded px-2 py-1 border border-orange-200">
                                <span className="text-slate-500">{DIA_LABELS[i]}: </span>
                                <strong>{n3(l[k])} MT</strong>
                              </span>
                            ) : null)}
                            <span className="bg-orange-100 rounded px-2 py-1 font-semibold text-orange-800">
                              Total: {n3(DIA_COLS.reduce((s,k)=>s+parseFloat(l[k]||0),0))} MT
                            </span>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
            {/* Totals row */}
            {loads.length > 1 && (
              <tfoot className="bg-slate-50 sticky bottom-0">
                <tr className="border-t-2 border-slate-200 font-semibold">
                  <td className="px-2.5 py-2" colSpan={5}>Totals</td>
                  <td className="px-2.5 py-2 text-right font-mono">{n3(totalInvoice)}</td>
                  <td className="px-2.5 py-2 text-right font-mono">{n3(totalWb) || '—'}</td>
                  <td className={clsx('px-2.5 py-2 text-right font-mono',
                    (totalWb - totalInvoice) < -0.001 ? 'text-red-600' : 'text-slate-700')}>
                    {totalWb ? (totalWb >= totalInvoice ? '+' : '') + n3(totalWb - totalInvoice) : '—'}
                  </td>
                  <td colSpan={2} />
                  <td className="px-2.5 py-2 text-right">₹{inr(totalGrandTotal)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </div>

      {/* Load form modal */}
      {showForm && (
        <LoadForm
          entryId={entry.id}
          materialType={materialType}
          defaultRate={entry.unit_price}
          editLoad={editLoad}
          onClose={() => { setShowForm(false); setEditLoad(null); }}
          onSaved={refresh}
        />
      )}
    </div>
  );
}

// ── Abstract Tab ──────────────────────────────────────────────────────────────
function AbstractTab({ materialType, projectId }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ['mt-abstract', materialType, projectId],
    queryFn: () => materialTrackerAPI.abstract({ material_type: materialType, project_id: projectId || undefined })
      .then(r => r.data?.data || []),
  });

  if (isLoading) return <div className="flex items-center justify-center h-40 text-slate-400">Loading…</div>;
  if (!data.length) return (
    <div className="flex flex-col items-center justify-center h-40 text-slate-400">
      <Package size={32} className="mb-2 opacity-30" />
      <p className="text-sm">No data — register POs and add loads first</p>
    </div>
  );

  return (
    <div className="overflow-auto p-4">
      <table className="w-full text-[11px] border-collapse">
        <thead>
          <tr className="bg-slate-700 text-white">
            {['PO No','PO Date','Vendor','Grade','MR No','MR Qty','Ordered Qty','Supplied Qty','Balance Qty','Basic Value','Value with GST','Loads'].map(h => (
              <th key={h} className="px-3 py-2 text-left font-semibold whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => {
            const bal = parseFloat(row.balance_qty);
            return (
              <tr key={row.id} className={clsx('border-b border-slate-100', i%2===0 ? 'bg-white' : 'bg-slate-50')}>
                <td className="px-3 py-2 font-mono font-semibold text-blue-700">{row.po_number}</td>
                <td className="px-3 py-2 whitespace-nowrap">{row.created_at ? dayjs(row.created_at).format('DD-MM-YYYY') : '—'}</td>
                <td className="px-3 py-2">{row.vendor_name || '—'}</td>
                <td className="px-3 py-2">{row.grade || '—'}</td>
                <td className="px-3 py-2">{row.mr_number || '—'}</td>
                <td className="px-3 py-2 text-right">{row.mr_qty ? n3(row.mr_qty) : '—'}</td>
                <td className="px-3 py-2 text-right font-medium">{n3(row.ordered_qty)}</td>
                <td className="px-3 py-2 text-right text-blue-700 font-medium">{n3(row.supplied_qty)}</td>
                <td className={clsx('px-3 py-2 text-right font-semibold', bal < 0 ? 'text-red-600' : 'text-emerald-700')}>
                  {n3(bal)}
                </td>
                <td className="px-3 py-2 text-right">₹{inr(row.basic_supplied_value)}</td>
                <td className="px-3 py-2 text-right font-medium">₹{inr(row.supplied_value_with_gst)}</td>
                <td className="px-3 py-2 text-center text-slate-500">{row.load_count}</td>
              </tr>
            );
          })}
        </tbody>
        {/* Totals */}
        <tfoot>
          <tr className="bg-slate-700 text-white font-semibold">
            <td className="px-3 py-2" colSpan={6}>Total</td>
            <td className="px-3 py-2 text-right">{n3(data.reduce((s,r)=>s+parseFloat(r.ordered_qty||0),0))}</td>
            <td className="px-3 py-2 text-right">{n3(data.reduce((s,r)=>s+parseFloat(r.supplied_qty||0),0))}</td>
            <td className="px-3 py-2 text-right">{n3(data.reduce((s,r)=>s+parseFloat(r.balance_qty||0),0))}</td>
            <td className="px-3 py-2 text-right">₹{inr(data.reduce((s,r)=>s+parseFloat(r.basic_supplied_value||0),0))}</td>
            <td className="px-3 py-2 text-right">₹{inr(data.reduce((s,r)=>s+parseFloat(r.supplied_value_with_gst||0),0))}</td>
            <td className="px-3 py-2 text-center">{data.reduce((s,r)=>s+parseInt(r.load_count||0),0)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ── Material Tab Content ──────────────────────────────────────────────────────
function MaterialTabContent({ materialType, projectId, projects, canWrite }) {
  const qc = useQueryClient();
  const [subTab, setSubTab]         = useState('Loadwise Entry');
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [showRegister, setShowRegister]   = useState(false);
  const [search, setSearch] = useState('');

  const { data: entries = [], isLoading, refetch } = useQuery({
    queryKey: ['mt-list', materialType, projectId],
    queryFn: () => materialTrackerAPI.list({ material_type: materialType, project_id: projectId || undefined })
      .then(r => r.data?.data || []),
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return entries;
    const q = search.toLowerCase();
    return entries.filter(e =>
      e.po_number?.toLowerCase().includes(q) ||
      e.vendor_name?.toLowerCase().includes(q) ||
      e.grade?.toLowerCase().includes(q)
    );
  }, [entries, search]);

  const deletePO = useMutation({
    mutationFn: (id) => materialTrackerAPI.remove(id),
    onSuccess: () => {
      toast.success('PO removed from tracker');
      qc.invalidateQueries({ queryKey: ['mt-list', materialType, projectId] });
      setSelectedEntry(null);
    },
    onError: e => toast.error(e?.response?.data?.error || 'Failed'),
  });

  const colorMap = { cement:'blue', concrete:'emerald', steel:'orange' };
  const color = colorMap[materialType] || 'blue';

  return (
    <div className="flex flex-col h-full">
      {/* Sub-tabs */}
      <div className="flex gap-1 px-4 pt-3 pb-0 border-b border-slate-200 flex-shrink-0">
        {SUB_TABS.map(t => (
          <button key={t} onClick={() => setSubTab(t)}
            className={clsx('px-4 py-2 text-xs font-medium rounded-t-lg border-b-2 -mb-px transition-colors',
              subTab === t
                ? 'border-blue-600 text-blue-700 bg-blue-50/50'
                : 'border-transparent text-slate-500 hover:text-slate-700')}>
            {t}
          </button>
        ))}
      </div>

      {subTab === 'Abstract' && (
        <div className="flex-1 overflow-hidden">
          <AbstractTab materialType={materialType} projectId={projectId} />
        </div>
      )}

      {subTab === 'Loadwise Entry' && (
        <div className="flex flex-1 overflow-hidden">
          {/* Left panel: PO list */}
          <div className="w-72 flex-shrink-0 border-r border-slate-200 flex flex-col overflow-hidden">
            {/* List header */}
            <div className="p-3 border-b border-slate-100 flex-shrink-0">
              <div className="flex items-center gap-2 mb-2">
                <div className="relative flex-1">
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="Search PO, vendor…"
                    className="w-full h-8 pl-7 pr-3 text-xs rounded-lg border border-slate-200 focus:border-blue-400 focus:outline-none" />
                </div>
                {canWrite && (
                  <button onClick={() => setShowRegister(true)}
                    className={clsx('h-8 px-2.5 rounded-lg text-white text-xs font-semibold flex items-center gap-1 flex-shrink-0',
                      `bg-${color}-600 hover:bg-${color}-700`)}>
                    <Plus size={13} />
                  </button>
                )}
              </div>
            </div>

            {/* PO list */}
            <div className="flex-1 overflow-y-auto">
              {isLoading ? (
                <div className="flex items-center justify-center h-24 text-slate-400 text-xs">Loading…</div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-slate-400 px-3 text-center">
                  <Package size={24} className="mb-2 opacity-30" />
                  <p className="text-xs">No POs registered yet</p>
                  {canWrite && <p className="text-[10px] mt-1">Click + to register a PO</p>}
                </div>
              ) : (
                filtered.map(e => {
                  const bal = parseFloat(e.balance_qty ?? (parseFloat(e.ordered_qty||0) - parseFloat(e.supplied_qty||0)));
                  const prog = pct(parseFloat(e.supplied_qty||0), parseFloat(e.ordered_qty||0));
                  const isSelected = selectedEntry?.id === e.id;
                  return (
                    <button key={e.id} onClick={() => setSelectedEntry(e)}
                      className={clsx('w-full text-left px-3 py-3 border-b border-slate-100 hover:bg-slate-50 transition-colors',
                        isSelected ? 'bg-blue-50 border-l-2 border-l-blue-500' : '')}>
                      <div className="flex items-start justify-between">
                        <div className="font-semibold text-[11px] text-slate-800 truncate flex-1">{e.po_number}</div>
                        <ChevronRight size={12} className={clsx('flex-shrink-0 mt-0.5', isSelected ? 'text-blue-500' : 'text-slate-300')} />
                      </div>
                      <div className="text-[10px] text-slate-500 truncate">{e.vendor_name}{e.grade ? ` · ${e.grade}` : ''}</div>
                      <div className="flex items-center gap-2 mt-1.5">
                        <div className="flex-1 h-1 bg-slate-200 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-400 rounded-full" style={{ width: `${Math.min(prog,100)}%` }} />
                        </div>
                        <span className="text-[10px] text-slate-400">{prog}%</span>
                      </div>
                      <div className="text-[10px] mt-1">
                        <span className="text-slate-400">Bal: </span>
                        <span className={clsx('font-medium', bal < 0 ? 'text-red-500' : 'text-slate-600')}>
                          {n3(bal)} {e.unit}
                        </span>
                        <span className="text-slate-300 mx-1">·</span>
                        <span className="text-slate-400">{e.load_count || 0} loads</span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Right panel: loads */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {selectedEntry ? (
              <LoadsPanel
                entry={selectedEntry}
                materialType={materialType}
                canWrite={canWrite}
                onRefresh={() => {
                  refetch();
                  // update selectedEntry with fresh data
                  qc.invalidateQueries({ queryKey: ['mt-list', materialType, projectId] });
                }}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-slate-400">
                <Truck size={40} className="mb-3 opacity-20" />
                <p className="text-sm">Select a PO from the left to see its loads</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Register PO modal */}
      {showRegister && (
        <RegisterPOForm
          materialType={materialType}
          projects={projects}
          onClose={() => setShowRegister(false)}
          onSaved={() => {
            refetch();
            qc.invalidateQueries({ queryKey: ['mt-abstract', materialType, projectId] });
          }}
        />
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function MaterialTrackerPage() {
  const { user } = useAuthStore();
  const [materialTab, setMaterialTab] = useState('cement');
  const [projectId, setProjectId]     = useState('');

  const canWrite = WRITE_ROLES.includes(user?.role);

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectAPI.list().then(r => r.data?.data || r.data || []),
  });

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#f5f6fa]">
      <PageHeader
        title="Material Tracker"
        subtitle="Track cement, concrete & steel delivery loads against POs"
        breadcrumbs={[{ label: 'Stores' }, { label: 'Material Tracker' }]}
        actions={
          <select value={projectId} onChange={e => setProjectId(e.target.value)}
            className="h-9 pl-3 pr-8 text-xs rounded-xl border border-slate-200 bg-white/20 text-white focus:outline-none focus:bg-white focus:text-slate-800 focus:border-blue-400">
            <option value="" className="text-slate-800">All Projects</option>
            {projects.map(p => <option key={p.id} value={p.id} className="text-slate-800">{p.name}</option>)}
          </select>
        }
      />

      {/* Material tabs */}
      <div className="flex gap-1 px-5 pt-3 bg-white border-b border-slate-200 flex-shrink-0">
        {MATERIAL_TABS.map(t => (
          <button key={t.id} onClick={() => setMaterialTab(t.id)}
            className={clsx('px-5 py-2.5 text-xs font-semibold rounded-t-xl border-b-2 -mb-px transition-colors',
              materialTab === t.id
                ? 'border-blue-600 text-blue-700 bg-blue-50'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50')}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden bg-white">
        <MaterialTabContent
          key={materialTab}
          materialType={materialTab}
          projectId={projectId}
          projects={projects}
          canWrite={canWrite}
        />
      </div>
    </div>
  );
}
