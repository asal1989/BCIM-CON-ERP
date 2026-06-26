// src/pages/accounts/DebitNotesPage.jsx
import React, { useState, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import dayjs from 'dayjs';
import toast from 'react-hot-toast';
import { ArrowUpRight, Building2, ChevronRight, FileText, Package, Plus, Search, Trash2, X } from 'lucide-react';
import { debitNoteAPI, projectAPI, vendorAPI } from '../../api/client';
import useAuthStore from '../../store/authStore';
import ProjectFilter from '../../components/ProjectFilter';

const STATUS_CFG = {
  pending:   { cls: 'bg-amber-50  text-amber-700  border-amber-200',   label: 'Pending' },
  applied:   { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'Applied' },
  cancelled: { cls: 'bg-red-50    text-red-500    border-red-200',     label: 'Cancelled' },
};

const inr = (v) => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const EMPTY_ITEM = { material_name: '', unit: 'Nos', quantity: '', rate: '', amount: '' };
const EMPTY_FORM = {
  dn_date: dayjs().format('YYYY-MM-DD'),
  vendor_id: '', vendor_name: '',
  project_id: '',
  invoice_number: '', invoice_date: '',
  reason: '',
  tax_mode: 'intrastate',
  basic_amount: '',
  cgst_pct: '', cgst_amt: '',
  sgst_pct: '', sgst_amt: '',
  igst_pct: '', igst_amt: '',
  remarks: '',
};

const F  = 'w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white';

function Lbl({ children, req }) {
  return (
    <label className="block text-xs font-medium text-slate-600 mb-1">
      {children}{req && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  );
}

function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] || STATUS_CFG.pending;
  return <span className={clsx('px-2 py-0.5 rounded-full text-[11px] font-medium border', cfg.cls)}>{cfg.label}</span>;
}

function DNForm({ onClose }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [items, setItems] = useState([{ ...EMPTY_ITEM }]);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors-list'],
    queryFn: () => vendorAPI.list({ limit: 500 }).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    staleTime: 60000,
  });
  const { data: projects = [] } = useQuery({
    queryKey: ['projects-list'],
    queryFn: () => projectAPI.list({ limit: 500 }).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    staleTime: 60000,
  });

  const updateItem = (idx, key, val) => setItems(prev => {
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

  const basicAmt = parseFloat(form.basic_amount) || 0;

  const handleGstPct = (field, val) => {
    const pct = parseFloat(val) || 0;
    if (field === 'cgst_pct') {
      set('cgst_pct', val); set('sgst_pct', val);
      set('cgst_amt', (pct * basicAmt / 100).toFixed(2));
      set('sgst_amt', (pct * basicAmt / 100).toFixed(2));
      set('igst_pct', ''); set('igst_amt', '');
    } else {
      set('igst_pct', val);
      set('igst_amt', (pct * basicAmt / 100).toFixed(2));
      set('cgst_pct', ''); set('cgst_amt', ''); set('sgst_pct', ''); set('sgst_amt', '');
    }
  };

  const totalGST = (parseFloat(form.cgst_amt) || 0) + (parseFloat(form.sgst_amt) || 0) + (parseFloat(form.igst_amt) || 0);
  const grandTotal = basicAmt + totalGST;

  const saveMut = useMutation({
    mutationFn: () => debitNoteAPI.create({
      ...form,
      basic_amount: basicAmt,
      cgst_pct: parseFloat(form.cgst_pct) || 0, cgst_amt: parseFloat(form.cgst_amt) || 0,
      sgst_pct: parseFloat(form.sgst_pct) || 0, sgst_amt: parseFloat(form.sgst_amt) || 0,
      igst_pct: parseFloat(form.igst_pct) || 0, igst_amt: parseFloat(form.igst_amt) || 0,
      items: items.filter(it => it.material_name?.trim()),
    }).then(r => r.data),
    onSuccess: () => {
      toast.success('Debit note created');
      qc.invalidateQueries({ queryKey: ['debit-notes'] });
      onClose();
    },
    onError: e => toast.error(e?.response?.data?.error || 'Save failed'),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.vendor_name.trim()) return toast.error('Vendor name is required');
    if (!form.dn_date) return toast.error('Debit note date is required');
    saveMut.mutate();
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4 overflow-auto">
      <div className="bg-white w-full max-w-3xl rounded-md border border-slate-200 shadow-xl flex flex-col max-h-[96vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-blue-50 flex items-center justify-center">
              <ArrowUpRight className="w-4 h-4 text-blue-600" />
            </div>
            <p className="text-sm font-semibold text-slate-800">New Debit Note</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <Lbl req>DN Date</Lbl>
              <input type="date" className={F} value={form.dn_date} onChange={e => set('dn_date', e.target.value)} required />
            </div>
            <div>
              <Lbl>Tax Mode</Lbl>
              <select className={F} value={form.tax_mode} onChange={e => {
                set('tax_mode', e.target.value);
                set('cgst_pct',''); set('cgst_amt',''); set('sgst_pct',''); set('sgst_amt','');
                set('igst_pct',''); set('igst_amt','');
              }}>
                <option value="intrastate">Intrastate (CGST + SGST)</option>
                <option value="interstate">Interstate (IGST)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Lbl req>Vendor</Lbl>
              <select className={F} value={form.vendor_id}
                onChange={e => {
                  const v = vendors.find(x => x.id === e.target.value);
                  set('vendor_id', e.target.value);
                  set('vendor_name', v?.name || '');
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
              <select className={F} value={form.project_id} onChange={e => set('project_id', e.target.value)}>
                <option value="">— Not linked —</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Lbl>Invoice Number</Lbl>
              <input className={F} placeholder="INV-001" value={form.invoice_number} onChange={e => set('invoice_number', e.target.value)} />
            </div>
            <div>
              <Lbl>Invoice Date</Lbl>
              <input type="date" className={F} value={form.invoice_date} onChange={e => set('invoice_date', e.target.value)} />
            </div>
          </div>
          <div>
            <Lbl req>Reason</Lbl>
            <textarea className={clsx(F, 'resize-none')} rows={2} placeholder="Describe why this debit note is being issued…"
              value={form.reason} onChange={e => set('reason', e.target.value)} required />
          </div>

          {/* Line items */}
          <div className="border border-slate-200 rounded-md overflow-hidden">
            <div className="px-3 py-2 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
              <Package className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Line Items</span>
              <button type="button" onClick={addItem} className="ml-auto text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" /> Add Item
              </button>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {['#', 'Material', 'Unit', 'Qty', 'Rate (₹)', 'Amount (₹)', ''].map(h => (
                    <th key={h} className="px-3 py-2 text-left font-medium text-slate-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {items.map((it, idx) => (
                  <tr key={idx}>
                    <td className="px-3 py-2 text-slate-400 w-8">{idx + 1}</td>
                    <td className="px-2 py-1.5 min-w-[200px]">
                      <input className={F} placeholder="Material name" value={it.material_name} onChange={e => updateItem(idx, 'material_name', e.target.value)} />
                    </td>
                    <td className="px-2 py-1.5 w-20">
                      <input className={F} placeholder="Nos" value={it.unit} onChange={e => updateItem(idx, 'unit', e.target.value)} />
                    </td>
                    <td className="px-2 py-1.5 w-24">
                      <input type="number" step="any" className={F} placeholder="0" value={it.quantity} onChange={e => updateItem(idx, 'quantity', e.target.value)} />
                    </td>
                    <td className="px-2 py-1.5 w-28">
                      <input type="number" step="0.01" className={F} placeholder="0.00" value={it.rate} onChange={e => updateItem(idx, 'rate', e.target.value)} />
                    </td>
                    <td className="px-2 py-1.5 w-28">
                      <input type="number" step="0.01" className={clsx(F, 'bg-slate-50')} placeholder="0.00" value={it.amount} onChange={e => updateItem(idx, 'amount', e.target.value)} />
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

          {/* Financials */}
          <div className="bg-slate-50 border border-slate-200 rounded-md p-4 space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <Lbl req>Basic Amount (₹)</Lbl>
                <input type="number" step="0.01" className={F} placeholder="0.00" value={form.basic_amount}
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
                    <input type="number" step="0.01" className={F} placeholder="9" value={form.cgst_pct} onChange={e => handleGstPct('cgst_pct', e.target.value)} />
                  </div>
                  <div>
                    <Lbl>CGST Amount (₹)</Lbl>
                    <input type="number" step="0.01" className={F} value={form.cgst_amt} onChange={e => { set('cgst_amt', e.target.value); set('sgst_amt', e.target.value); }} />
                  </div>
                  <div>
                    <Lbl>SGST Amount (₹)</Lbl>
                    <input type="number" step="0.01" className={clsx(F, 'bg-slate-100')} value={form.sgst_amt} readOnly />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <Lbl>IGST %</Lbl>
                    <input type="number" step="0.01" className={F} placeholder="18" value={form.igst_pct} onChange={e => handleGstPct('igst_pct', e.target.value)} />
                  </div>
                  <div>
                    <Lbl>IGST Amount (₹)</Lbl>
                    <input type="number" step="0.01" className={F} value={form.igst_amt} onChange={e => set('igst_amt', e.target.value)} />
                  </div>
                  <div />
                </>
              )}
            </div>
            <div className="flex items-center justify-end gap-4 pt-2 border-t border-slate-200">
              {totalGST > 0 && (
                <div className="text-right">
                  <p className="text-[10px] text-slate-400 uppercase">Total GST</p>
                  <p className="text-sm font-semibold text-slate-700">₹ {inr(totalGST)}</p>
                </div>
              )}
              <div className="bg-blue-600 text-white rounded-md px-5 py-2.5 text-right">
                <p className="text-[10px] uppercase tracking-wider text-blue-200">Total Debit Value</p>
                <p className="text-lg font-bold">₹ {inr(grandTotal)}</p>
              </div>
            </div>
          </div>

          <div>
            <Lbl>Remarks</Lbl>
            <textarea className={clsx(F, 'resize-none')} rows={2} value={form.remarks} onChange={e => set('remarks', e.target.value)} />
          </div>
        </form>

        <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-t border-slate-100">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm border border-slate-200 rounded-md text-slate-600 hover:bg-slate-50">Cancel</button>
          <button onClick={handleSubmit} disabled={saveMut.isPending}
            className="px-6 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50">
            {saveMut.isPending ? 'Saving…' : 'Create Debit Note'}
          </button>
        </div>
      </div>
    </div>
  );
}

function DNDetail({ dn, onClose }) {
  const qc = useQueryClient();
  const statusMut = useMutation({
    mutationFn: (status) => debitNoteAPI.updateStatus(dn.id, status),
    onSuccess: () => { toast.success('Status updated'); qc.invalidateQueries({ queryKey: ['debit-notes'] }); onClose(); },
    onError: e => toast.error(e?.response?.data?.error || 'Update failed'),
  });
  const deleteMut = useMutation({
    mutationFn: () => debitNoteAPI.remove(dn.id),
    onSuccess: () => { toast.success('Debit note deleted'); qc.invalidateQueries({ queryKey: ['debit-notes'] }); onClose(); },
    onError: e => toast.error(e?.response?.data?.error || 'Delete failed'),
  });

  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4 overflow-auto">
      <div className="bg-white w-full max-w-2xl rounded-md border border-slate-200 shadow-xl flex flex-col max-h-[96vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-blue-50 flex items-center justify-center">
              <ArrowUpRight className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">{dn.dn_number}</p>
              <p className="text-xs text-slate-400">{dn.vendor_name} · {dayjs(dn.dn_date).format('DD MMM YYYY')}</p>
            </div>
            <StatusBadge status={dn.status} />
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              ['DN Number', dn.dn_number],
              ['DN Date', dayjs(dn.dn_date).format('DD MMM YYYY')],
              ['Vendor', dn.vendor_name],
              ['Project', dn.project_name || '—'],
              ['Invoice Number', dn.invoice_number || '—'],
              ['Status', <StatusBadge key="s" status={dn.status} />],
            ].map(([label, value]) => (
              <div key={label} className="bg-slate-50 border border-slate-200 rounded-md p-3">
                <p className="text-xs text-slate-400 mb-0.5">{label}</p>
                <p className="text-sm font-medium text-slate-800">{value}</p>
              </div>
            ))}
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-md p-4">
            <p className="text-xs font-medium text-amber-700 mb-1">Reason</p>
            <p className="text-sm text-amber-900">{dn.reason || '—'}</p>
          </div>

          {dn.items?.length > 0 && (
            <table className="w-full text-xs border border-slate-200 rounded-md overflow-hidden">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {['Material', 'Unit', 'Qty', 'Rate', 'Amount'].map(h => (
                    <th key={h} className="px-3 py-2 text-left font-medium text-slate-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {dn.items.map((it, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2 font-medium text-slate-800">{it.material_name}</td>
                    <td className="px-3 py-2 text-slate-500">{it.unit}</td>
                    <td className="px-3 py-2 text-right font-mono">{Number(it.quantity).toLocaleString('en-IN', { maximumFractionDigits: 3 })}</td>
                    <td className="px-3 py-2 text-right font-mono">{inr(it.rate)}</td>
                    <td className="px-3 py-2 text-right font-mono font-semibold">{inr(it.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="bg-white border border-slate-200 rounded-md p-4 grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-[10px] text-slate-400 mb-0.5">Basic Amount</p>
              <p className="text-sm font-semibold text-slate-800">{inr(dn.basic_amount)}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-400 mb-0.5">Total GST</p>
              <p className="text-sm font-semibold text-slate-600">{inr(dn.gst_amount)}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-400 mb-0.5">Total Debit</p>
              <p className="text-base font-bold text-blue-700">₹ {inr(dn.total_amount)}</p>
            </div>
          </div>

          {dn.remarks && (
            <div className="bg-slate-50 border border-slate-200 rounded-md p-4">
              <p className="text-xs font-medium text-slate-400 mb-1">Remarks</p>
              <p className="text-sm text-slate-700">{dn.remarks}</p>
            </div>
          )}
        </div>

        <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-t border-slate-100">
          <div className="flex gap-2">
            {dn.status === 'pending' && (
              <>
                <button onClick={() => statusMut.mutate('applied')} disabled={statusMut.isPending}
                  className="px-3 py-1.5 bg-emerald-600 text-white text-xs font-medium rounded-md hover:bg-emerald-700 disabled:opacity-50">Mark Applied</button>
                <button onClick={() => { if (window.confirm('Cancel this debit note?')) statusMut.mutate('cancelled'); }} disabled={statusMut.isPending}
                  className="px-3 py-1.5 border border-red-200 text-red-600 text-xs font-medium rounded-md hover:bg-red-50 disabled:opacity-50">Cancel</button>
              </>
            )}
          </div>
          <div className="flex gap-2">
            {dn.status === 'pending' && (
              <button onClick={() => { if (window.confirm('Delete this debit note?')) deleteMut.mutate(); }} disabled={deleteMut.isPending}
                className="px-4 py-2 border border-red-200 text-red-600 text-sm rounded-md hover:bg-red-50 disabled:opacity-50">Delete</button>
            )}
            <button onClick={onClose} className="px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-md hover:bg-slate-800">Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DebitNotesPage() {
  const [showForm, setShowForm] = useState(false);
  const [viewRecord, setViewRecord] = useState(null);
  const [filters, setFilters] = useState({ search: '', status: '' });
  const qc = useQueryClient();
  const { selectedProjectId } = useAuthStore();

  const { data, isLoading } = useQuery({
    queryKey: ['debit-notes', filters, selectedProjectId],
    queryFn: () => debitNoteAPI.list({ ...filters, project_id: selectedProjectId || undefined }).then(r => r.data),
  });
  const rows = data?.data ?? [];

  const setFilter = (k, v) => setFilters(f => ({ ...f, [k]: v }));

  const totalAmt   = rows.reduce((s, r) => s + Number(r.total_amount || 0), 0);
  const pendingAmt = rows.filter(r => r.status === 'pending').reduce((s, r) => s + Number(r.total_amount || 0), 0);
  const appliedAmt = rows.filter(r => r.status === 'applied').reduce((s, r) => s + Number(r.total_amount || 0), 0);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-blue-50 flex items-center justify-center">
              <ArrowUpRight className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-800">Debit Notes</h1>
              <p className="text-xs text-slate-400">Debit notes raised against vendors</p>
            </div>
          </div>
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700">
            <Plus className="w-4 h-4" /> New Debit Note
          </button>
        </div>
      </div>

      <div className="px-6 py-5 grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="bg-white border border-slate-200 rounded-md p-4">
          <div className="text-xs text-slate-400">Total (filtered)</div>
          <div className="text-2xl font-semibold text-slate-800 mt-1">₹ {inr(totalAmt)}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-md p-4">
          <div className="text-xs text-slate-400">Pending</div>
          <div className="text-2xl font-semibold text-amber-600 mt-1">₹ {inr(pendingAmt)}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-md p-4">
          <div className="text-xs text-slate-400">Applied</div>
          <div className="text-2xl font-semibold text-emerald-600 mt-1">₹ {inr(appliedAmt)}</div>
        </div>
      </div>

      <div className="px-6 pb-3 flex flex-wrap gap-2 items-center">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input className="pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-md bg-white w-56 focus:outline-none focus:ring-2 focus:ring-blue-200"
            placeholder="Search DN / vendor / invoice…" value={filters.search} onChange={e => setFilter('search', e.target.value)} />
        </div>
        <select className="border border-slate-200 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
          value={filters.status} onChange={e => setFilter('status', e.target.value)}>
          <option value="">All Statuses</option>
          {Object.entries(STATUS_CFG).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
        </select>
        <ProjectFilter />
        <span className="ml-auto text-xs text-slate-400">{rows.length} record{rows.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="px-6 pb-10">
        <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
          {isLoading ? (
            <div className="flex justify-center py-16">
              <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-slate-400">
              <ArrowUpRight className="w-10 h-10 opacity-20" />
              <p className="text-sm font-medium">No debit notes found</p>
              <button onClick={() => setShowForm(true)} className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" /> Create first debit note
              </button>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {['DN Number', 'Date', 'Vendor', 'Project', 'Invoice Ref', 'Total (₹)', 'Status', ''].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {rows.map(row => (
                  <tr key={row.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setViewRecord(row)}>
                    <td className="px-4 py-2.5 font-mono text-xs font-semibold text-blue-700">{row.dn_number}</td>
                    <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{dayjs(row.dn_date).format('DD MMM YYYY')}</td>
                    <td className="px-4 py-2.5 font-medium text-slate-800">{row.vendor_name}</td>
                    <td className="px-4 py-2.5 text-slate-500 text-xs">{row.project_name || '—'}</td>
                    <td className="px-4 py-2.5 text-slate-500 text-xs font-mono">{row.invoice_number || '—'}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold text-slate-800">₹ {inr(row.total_amount)}</td>
                    <td className="px-4 py-2.5"><StatusBadge status={row.status} /></td>
                    <td className="px-4 py-2.5"><ChevronRight className="w-4 h-4 text-slate-300" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showForm && <DNForm onClose={() => setShowForm(false)} />}
      {viewRecord && <DNDetail dn={viewRecord} onClose={() => setViewRecord(null)} />}
    </div>
  );
}
