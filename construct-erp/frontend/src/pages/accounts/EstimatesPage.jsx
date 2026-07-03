// src/pages/accounts/EstimatesPage.jsx
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import dayjs from 'dayjs';
import toast from 'react-hot-toast';
import { FileText, Plus, Search, Trash2, X, Package, ChevronRight, Check } from 'lucide-react';
import { estimateAPI, projectAPI } from '../../api/client';

const STATUS_CLS = {
  draft:    'bg-slate-100 text-slate-600',
  sent:     'bg-blue-50 text-blue-700',
  accepted: 'bg-emerald-50 text-emerald-700',
  declined: 'bg-red-50 text-red-600',
  expired:  'bg-amber-50 text-amber-600',
};
const STATUS_OPTIONS = ['draft','sent','accepted','declined','expired'];

const inr = v => `₹${(+v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const F = 'w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white';

function Lbl({ children, req }) {
  return <label className="block text-xs font-medium text-slate-600 mb-1">{children}{req && <span className="text-red-500 ml-0.5">*</span>}</label>;
}

const EMPTY_ITEM = { material_name: '', unit: 'Nos', quantity: '', rate: '', amount: '' };
const EMPTY_FORM = {
  estimate_date: dayjs().format('YYYY-MM-DD'),
  expiry_date: dayjs().add(30, 'day').format('YYYY-MM-DD'),
  client_name: '', project_id: '', work_description: '',
  tax_mode: 'intrastate',
  basic_amount: '', cgst_pct: '', cgst_amt: '', sgst_pct: '', sgst_amt: '', igst_pct: '', igst_amt: '',
  status: 'draft', remarks: '',
};

function EstimateForm({ initial, onClose }) {
  const qc = useQueryClient();
  const isEdit = !!initial?.id;
  const [form, setForm] = useState(isEdit ? {
    estimate_date: initial.estimate_date?.slice(0, 10) || dayjs().format('YYYY-MM-DD'),
    expiry_date: initial.expiry_date?.slice(0, 10) || '',
    client_name: initial.client_name || '', project_id: initial.project_id || '',
    work_description: initial.work_description || '',
    tax_mode: initial.tax_mode || 'intrastate',
    basic_amount: initial.basic_amount || '', cgst_pct: initial.cgst_pct || '', cgst_amt: initial.cgst_amt || '',
    sgst_pct: initial.sgst_pct || '', sgst_amt: initial.sgst_amt || '', igst_pct: initial.igst_pct || '', igst_amt: initial.igst_amt || '',
    status: initial.status || 'draft', remarks: initial.remarks || '',
  } : { ...EMPTY_FORM });
  const [items, setItems] = useState(isEdit && initial.items?.length ? initial.items : [{ ...EMPTY_ITEM }]);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

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

  const itemsBasicSum = items.reduce((s, it) => s + (parseFloat(it.amount) || 0), 0);
  const basicAmt = itemsBasicSum > 0 ? itemsBasicSum : (parseFloat(form.basic_amount) || 0);

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
    mutationFn: () => {
      const payload = {
        ...form,
        basic_amount: basicAmt,
        cgst_pct: parseFloat(form.cgst_pct) || 0, cgst_amt: parseFloat(form.cgst_amt) || 0,
        sgst_pct: parseFloat(form.sgst_pct) || 0, sgst_amt: parseFloat(form.sgst_amt) || 0,
        igst_pct: parseFloat(form.igst_pct) || 0, igst_amt: parseFloat(form.igst_amt) || 0,
        items: items.filter(it => it.material_name?.trim()),
      };
      return isEdit ? estimateAPI.update(initial.id, payload).then(r => r.data) : estimateAPI.create(payload).then(r => r.data);
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Estimate updated' : 'Estimate created');
      qc.invalidateQueries({ queryKey: ['estimates'] });
      onClose();
    },
    onError: e => toast.error(e?.response?.data?.error || 'Save failed'),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.client_name.trim()) return toast.error('Client name is required');
    if (!form.estimate_date) return toast.error('Estimate date is required');
    saveMut.mutate();
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4 overflow-auto">
      <div className="bg-white w-full max-w-3xl rounded-md border border-slate-200 shadow-xl flex flex-col max-h-[96vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-amber-50 flex items-center justify-center">
              <FileText className="w-4 h-4 text-amber-600" />
            </div>
            <p className="text-sm font-semibold text-slate-800">{isEdit ? `Edit Estimate — ${initial.estimate_no}` : 'New Estimate'}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div><Lbl req>Estimate Date</Lbl><input type="date" className={F} value={form.estimate_date} onChange={e => set('estimate_date', e.target.value)} required /></div>
            <div><Lbl>Expiry Date</Lbl><input type="date" className={F} value={form.expiry_date} onChange={e => set('expiry_date', e.target.value)} /></div>
            <div>
              <Lbl>Tax Mode</Lbl>
              <select className={F} value={form.tax_mode} onChange={e => { set('tax_mode', e.target.value); set('cgst_pct',''); set('cgst_amt',''); set('sgst_pct',''); set('sgst_amt',''); set('igst_pct',''); set('igst_amt',''); }}>
                <option value="intrastate">Intrastate (CGST + SGST)</option>
                <option value="interstate">Interstate (IGST)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><Lbl req>Client Name</Lbl><input className={F} value={form.client_name} onChange={e => set('client_name', e.target.value)} /></div>
            <div>
              <Lbl>Project</Lbl>
              <select className={F} value={form.project_id} onChange={e => set('project_id', e.target.value)}>
                <option value="">— Not linked —</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>
          <div><Lbl>Work Description</Lbl><textarea className={clsx(F, 'resize-none')} rows={2} value={form.work_description} onChange={e => set('work_description', e.target.value)} /></div>

          <div className="border border-slate-200 rounded-md overflow-hidden">
            <div className="px-3 py-2 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
              <Package className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Line Items</span>
              <button type="button" onClick={addItem} className="ml-auto text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Add Item</button>
            </div>
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
                    <td className="px-2 py-1.5 min-w-[200px]"><input className={F} placeholder="Material / work item" value={it.material_name} onChange={e => updateItem(idx, 'material_name', e.target.value)} /></td>
                    <td className="px-2 py-1.5 w-20"><input className={F} placeholder="Nos" value={it.unit} onChange={e => updateItem(idx, 'unit', e.target.value)} /></td>
                    <td className="px-2 py-1.5 w-24"><input type="number" step="any" className={F} placeholder="0" value={it.quantity} onChange={e => updateItem(idx, 'quantity', e.target.value)} /></td>
                    <td className="px-2 py-1.5 w-28"><input type="number" step="0.01" className={F} placeholder="0.00" value={it.rate} onChange={e => updateItem(idx, 'rate', e.target.value)} /></td>
                    <td className="px-2 py-1.5 w-28"><input type="number" step="0.01" className={clsx(F, 'bg-slate-50')} placeholder="0.00" value={it.amount} onChange={e => updateItem(idx, 'amount', e.target.value)} /></td>
                    <td className="px-2 py-1.5 w-8">{items.length > 1 && <button type="button" onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-md p-4 space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div><Lbl>Basic Amount (₹)</Lbl><input type="number" step="0.01" className={clsx(F, itemsBasicSum > 0 && 'bg-slate-100')} value={basicAmt || ''} readOnly={itemsBasicSum > 0} onChange={e => set('basic_amount', e.target.value)} /></div>
              {form.tax_mode === 'intrastate' ? (<>
                <div><Lbl>CGST %</Lbl><input type="number" step="0.01" className={F} placeholder="9" value={form.cgst_pct} onChange={e => handleGstPct('cgst_pct', e.target.value)} /></div>
                <div><Lbl>CGST Amount (₹)</Lbl><input type="number" step="0.01" className={F} value={form.cgst_amt} onChange={e => { set('cgst_amt', e.target.value); set('sgst_amt', e.target.value); }} /></div>
                <div><Lbl>SGST Amount (₹)</Lbl><input type="number" step="0.01" className={clsx(F, 'bg-slate-100')} value={form.sgst_amt} readOnly /></div>
              </>) : (<>
                <div><Lbl>IGST %</Lbl><input type="number" step="0.01" className={F} placeholder="18" value={form.igst_pct} onChange={e => handleGstPct('igst_pct', e.target.value)} /></div>
                <div><Lbl>IGST Amount (₹)</Lbl><input type="number" step="0.01" className={F} value={form.igst_amt} onChange={e => set('igst_amt', e.target.value)} /></div>
                <div />
              </>)}
            </div>
            <div className="flex items-center justify-end gap-4 pt-2 border-t border-slate-200">
              {totalGST > 0 && <div className="text-right"><p className="text-[10px] text-slate-400 uppercase">Total GST</p><p className="text-sm font-semibold text-slate-700">{inr(totalGST)}</p></div>}
              <div className="bg-amber-600 text-white rounded-md px-5 py-2.5 text-right">
                <p className="text-[10px] uppercase tracking-wider text-amber-100">Total Estimate Value</p>
                <p className="text-lg font-bold">{inr(grandTotal)}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Lbl>Status</Lbl>
              <select className={F} value={form.status} onChange={e => set('status', e.target.value)}>
                {STATUS_OPTIONS.map(s => <option key={s} value={s} className="capitalize">{s}</option>)}
              </select>
            </div>
            <div><Lbl>Remarks</Lbl><input className={F} value={form.remarks} onChange={e => set('remarks', e.target.value)} /></div>
          </div>
        </form>

        <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-t border-slate-100">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm border border-slate-200 rounded-md text-slate-600 hover:bg-slate-50">Cancel</button>
          <button onClick={handleSubmit} disabled={saveMut.isPending} className="px-6 py-2 bg-amber-600 text-white text-sm font-medium rounded-md hover:bg-amber-700 disabled:opacity-50">
            {saveMut.isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Estimate'}
          </button>
        </div>
      </div>
    </div>
  );
}

function EstimateDetail({ est, onClose }) {
  const qc = useQueryClient();
  const statusMut = useMutation({
    mutationFn: (status) => estimateAPI.updateStatus(est.id, status),
    onSuccess: () => { toast.success('Status updated'); qc.invalidateQueries({ queryKey: ['estimates'] }); onClose(); },
    onError: e => toast.error(e?.response?.data?.error || 'Update failed'),
  });
  const deleteMut = useMutation({
    mutationFn: () => estimateAPI.remove(est.id),
    onSuccess: () => { toast.success('Estimate deleted'); qc.invalidateQueries({ queryKey: ['estimates'] }); onClose(); },
    onError: e => toast.error(e?.response?.data?.error || 'Delete failed'),
  });

  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4 overflow-auto">
      <div className="bg-white w-full max-w-2xl rounded-md border border-slate-200 shadow-xl flex flex-col max-h-[96vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-amber-50 flex items-center justify-center"><FileText className="w-4 h-4 text-amber-600" /></div>
            <div>
              <p className="text-sm font-semibold text-slate-800">{est.estimate_no}</p>
              <p className="text-xs text-slate-400">{est.client_name} · {dayjs(est.estimate_date).format('DD MMM YYYY')}</p>
            </div>
            <span className={clsx('text-[11px] px-2 py-0.5 rounded-full font-medium capitalize', STATUS_CLS[est.status])}>{est.status}</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {est.items?.length > 0 && (
            <table className="w-full text-xs border border-slate-200 rounded-md overflow-hidden">
              <thead><tr className="bg-slate-50 border-b border-slate-100">{['Material','Unit','Qty','Rate','Amount'].map(h => <th key={h} className="px-3 py-2 text-left font-medium text-slate-400 uppercase tracking-wider">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-50">
                {est.items.map((it, i) => (
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
            <div><p className="text-[10px] text-slate-400 mb-0.5">Basic Amount</p><p className="text-sm font-semibold text-slate-800">{inr(est.basic_amount)}</p></div>
            <div><p className="text-[10px] text-slate-400 mb-0.5">Total GST</p><p className="text-sm font-semibold text-slate-600">{inr(est.gst_amount)}</p></div>
            <div><p className="text-[10px] text-slate-400 mb-0.5">Total Value</p><p className="text-base font-bold text-amber-700">{inr(est.total_amount)}</p></div>
          </div>
          {est.remarks && <div className="bg-slate-50 border border-slate-200 rounded-md p-4"><p className="text-xs font-medium text-slate-400 mb-1">Remarks</p><p className="text-sm text-slate-700">{est.remarks}</p></div>}
        </div>
        <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-t border-slate-100">
          <div className="flex gap-2">
            {est.status === 'sent' && (
              <>
                <button onClick={() => statusMut.mutate('accepted')} disabled={statusMut.isPending} className="px-3 py-1.5 bg-emerald-600 text-white text-xs font-medium rounded-md hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1"><Check className="w-3 h-3" /> Accepted</button>
                <button onClick={() => statusMut.mutate('declined')} disabled={statusMut.isPending} className="px-3 py-1.5 border border-red-200 text-red-600 text-xs font-medium rounded-md hover:bg-red-50 disabled:opacity-50">Declined</button>
              </>
            )}
            {est.status === 'draft' && (
              <button onClick={() => statusMut.mutate('sent')} disabled={statusMut.isPending} className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-md hover:bg-blue-700 disabled:opacity-50">Mark as Sent</button>
            )}
            {est.status === 'draft' && (
              <button onClick={() => { if (window.confirm('Delete this estimate?')) deleteMut.mutate(); }} disabled={deleteMut.isPending} className="px-3 py-1.5 border border-red-200 text-red-600 text-xs rounded-md hover:bg-red-50 disabled:opacity-50">Delete</button>
            )}
          </div>
          <button onClick={onClose} className="px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-md hover:bg-slate-800">Close</button>
        </div>
      </div>
    </div>
  );
}

export default function EstimatesPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editRecord, setEditRecord] = useState(null);
  const [viewRecord, setViewRecord] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['estimates', search, status],
    queryFn: () => estimateAPI.list({ search: search || undefined, status: status || undefined }).then(r => r.data),
  });
  const rows = data?.data ?? [];

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-amber-50 flex items-center justify-center"><FileText className="w-4 h-4 text-amber-600" /></div>
            <div>
              <h1 className="text-lg font-semibold text-slate-800">Estimates</h1>
              <p className="text-xs text-slate-400">Quotes and proposals sent to clients before invoicing</p>
            </div>
          </div>
          <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white text-sm rounded-md hover:bg-amber-700">
            <Plus className="w-3.5 h-3.5" /> New Estimate
          </button>
        </div>
      </div>

      <div className="px-6 py-4 flex flex-wrap gap-2 items-center">
        <div className="relative max-w-sm flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search estimates…" className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
        </div>
        <select className="border border-slate-200 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-200" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">All Statuses</option>
          {STATUS_OPTIONS.map(s => <option key={s} value={s} className="capitalize">{s}</option>)}
        </select>
      </div>

      <div className="px-6 pb-6">
        <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
          {isLoading ? (
            <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" /></div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-slate-400">
              <FileText className="w-10 h-10 opacity-20" />
              <p className="text-sm font-medium">No estimates found</p>
              <button onClick={() => setShowForm(true)} className="text-sm text-amber-600 hover:underline flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Create first estimate</button>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {['Estimate #', 'Client', 'Project', 'Date', 'Expiry', 'Amount', 'Status', ''].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {rows.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setViewRecord(r)}>
                    <td className="px-4 py-2.5 font-mono text-xs text-amber-700">{r.estimate_no}</td>
                    <td className="px-4 py-2.5 font-medium text-slate-800">{r.client_name}</td>
                    <td className="px-4 py-2.5 text-slate-500 text-xs">{r.project_name || '—'}</td>
                    <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{dayjs(r.estimate_date).format('DD MMM YYYY')}</td>
                    <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{r.expiry_date ? dayjs(r.expiry_date).format('DD MMM YYYY') : '—'}</td>
                    <td className="px-4 py-2.5 font-mono font-semibold text-slate-800">{inr(r.total_amount)}</td>
                    <td className="px-4 py-2.5"><span className={clsx('text-[11px] px-2 py-0.5 rounded-full font-medium capitalize', STATUS_CLS[r.status])}>{r.status}</span></td>
                    <td className="px-4 py-2.5"><ChevronRight className="w-4 h-4 text-slate-300" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showForm && <EstimateForm onClose={() => setShowForm(false)} />}
      {viewRecord && <EstimateDetail est={viewRecord} onClose={() => setViewRecord(null)} />}
    </div>
  );
}
