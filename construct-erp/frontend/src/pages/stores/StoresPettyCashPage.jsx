// src/pages/stores/StoresPettyCashPage.jsx
// Stores Petty Cash Tracker — a simple site-level cash book (Local Purchases +
// Other Advances), deliberately separate from the Accounts > Petty Cash module
// (no custodian/approval/settlement workflow, no GL postings). Mirrors the
// storekeeper's manual Excel register: "LOCAL PURCHASE" + "OTHER PETTY CASH".
import React, { useState, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import dayjs from 'dayjs';
import toast from 'react-hot-toast';
import {
  Wallet, Plus, Search, Trash2, X, Package,
  ShoppingBag, Users,
} from 'lucide-react';
import { storesPettyCashAPI, projectAPI } from '../../api/client';

const inr = (v) => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const F  = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent bg-white';
const FS = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white';

function Lbl({ children, req }) {
  return (
    <label className="block text-xs font-medium text-slate-600 mb-1">
      {children}{req && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  );
}

const EMPTY_ITEM = { material_name: '', unit: "NO'S", quantity: '' };
const EMPTY_ENTRY = { project_id: '', entry_date: dayjs().format('YYYY-MM-DD'), supplier: '', invoice_no: '', amount: '', remarks: '' };
const EMPTY_ADVANCE = { project_id: '', advance_date: dayjs().format('YYYY-MM-DD'), payee_name: '', description: 'SALARY ADVANCE', amount: '', remarks: '' };

/* ═══════════════════════════════════════════════════════════════════════════
   LOCAL PURCHASE — Entry Form (header + materials)
═══════════════════════════════════════════════════════════════════════════ */
function EntryForm({ initial, projects, defaultProjectId, onClose }) {
  const qc = useQueryClient();
  const isEdit = !!initial?.id;

  const [form, setForm] = useState(
    isEdit
      ? {
          project_id: initial.project_id || '',
          entry_date: initial.entry_date?.slice(0, 10) || dayjs().format('YYYY-MM-DD'),
          supplier:   initial.supplier || '',
          invoice_no: initial.invoice_no || '',
          amount:     initial.amount || '',
          remarks:    initial.remarks || '',
        }
      : { ...EMPTY_ENTRY, project_id: defaultProjectId || '' }
  );
  const [items, setItems] = useState(
    isEdit && initial.items?.length
      ? initial.items.map(it => ({ material_name: it.material_name, unit: it.unit, quantity: it.quantity }))
      : [{ ...EMPTY_ITEM }]
  );

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const updateItem = (idx, key, val) => setItems(prev => {
    const next = [...prev];
    next[idx] = { ...next[idx], [key]: val };
    return next;
  });
  const addItem    = () => setItems(p => [...p, { ...EMPTY_ITEM }]);
  const removeItem = (idx) => setItems(p => p.filter((_, i) => i !== idx));

  const saveMut = useMutation({
    mutationFn: (payload) => isEdit
      ? storesPettyCashAPI.updateEntry(initial.id, payload).then(r => r.data)
      : storesPettyCashAPI.createEntry(payload).then(r => r.data),
    onSuccess: () => {
      toast.success(isEdit ? 'Entry updated' : 'Entry added');
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
    saveMut.mutate({
      ...form,
      amount: parseFloat(form.amount) || 0,
      items: items.filter(it => it.material_name?.trim()),
    });
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
          <button onClick={onClose} className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Lbl req>Date</Lbl>
              <input type="date" className={F} value={form.entry_date} onChange={e => set('entry_date', e.target.value)} required />
            </div>
            <div>
              <Lbl>Project</Lbl>
              <select className={FS} value={form.project_id} onChange={e => set('project_id', e.target.value)}>
                <option value="">— Not linked —</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <Lbl req>Supplier</Lbl>
              <input className={F} placeholder="e.g. Ponam Hardware" value={form.supplier} onChange={e => set('supplier', e.target.value)} required />
            </div>
            <div>
              <Lbl>Invoice No.</Lbl>
              <input className={F} placeholder="49045" value={form.invoice_no} onChange={e => set('invoice_no', e.target.value)} />
            </div>
            <div className="col-span-2">
              <Lbl req>Amount (₹)</Lbl>
              <input type="number" step="0.01" className={F} placeholder="0.00" value={form.amount} onChange={e => set('amount', e.target.value)} required />
              <p className="text-[11px] text-slate-400 mt-1">Total bill amount — single figure even if multiple materials are listed below.</p>
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
                        <input className={F} placeholder="Material name" value={it.material_name}
                          onChange={e => updateItem(idx, 'material_name', e.target.value)} />
                      </td>
                      <td className="px-2 py-1.5 w-24">
                        <input className={F} placeholder="NO'S" value={it.unit}
                          onChange={e => updateItem(idx, 'unit', e.target.value)} />
                      </td>
                      <td className="px-2 py-1.5 w-24">
                        <input type="number" step="any" className={F} placeholder="0"
                          value={it.quantity} onChange={e => updateItem(idx, 'quantity', e.target.value)} />
                      </td>
                      <td className="px-2 py-1.5 w-8">
                        {items.length > 1 && (
                          <button type="button" onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <Lbl>Remarks</Lbl>
            <textarea className={clsx(F, 'resize-none')} rows={2} placeholder="Any additional notes…"
              value={form.remarks} onChange={e => set('remarks', e.target.value)} />
          </div>
        </form>

        <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-white">
          <button type="button" onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={saveMut.isPending}
            className="px-6 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50">
            {saveMut.isPending ? 'Saving…' : isEdit ? 'Update Entry' : 'Save Entry'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   OTHER PETTY CASH — Advance Form
═══════════════════════════════════════════════════════════════════════════ */
function AdvanceForm({ initial, projects, defaultProjectId, onClose }) {
  const qc = useQueryClient();
  const isEdit = !!initial?.id;

  const [form, setForm] = useState(
    isEdit
      ? {
          project_id:   initial.project_id || '',
          advance_date: initial.advance_date?.slice(0, 10) || dayjs().format('YYYY-MM-DD'),
          payee_name:   initial.payee_name || '',
          description:  initial.description || 'SALARY ADVANCE',
          amount:       initial.amount || '',
          remarks:      initial.remarks || '',
        }
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
              <p className="font-semibold text-slate-900">{isEdit ? 'Edit Advance' : 'New Other Petty Cash Entry'}</p>
              <p className="text-xs text-slate-500 mt-0.5">Cash paid to a contractor / employee (e.g. salary advance)</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Lbl req>Date</Lbl>
              <input type="date" className={F} value={form.advance_date} onChange={e => set('advance_date', e.target.value)} required />
            </div>
            <div>
              <Lbl>Project</Lbl>
              <select className={FS} value={form.project_id} onChange={e => set('project_id', e.target.value)}>
                <option value="">— Not linked —</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <Lbl req>Contractor / Employee Name</Lbl>
            <input className={F} placeholder="e.g. Mukesh 3250008" value={form.payee_name} onChange={e => set('payee_name', e.target.value)} required />
          </div>
          <div>
            <Lbl>Description</Lbl>
            <input className={F} placeholder="SALARY ADVANCE" value={form.description} onChange={e => set('description', e.target.value)} />
          </div>
          <div>
            <Lbl req>Amount Paid (₹)</Lbl>
            <input type="number" step="0.01" className={F} placeholder="0.00" value={form.amount} onChange={e => set('amount', e.target.value)} required />
          </div>
          <div>
            <Lbl>Remarks</Lbl>
            <textarea className={clsx(F, 'resize-none')} rows={2} value={form.remarks} onChange={e => set('remarks', e.target.value)} />
          </div>
        </form>

        <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-white">
          <button type="button" onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={saveMut.isPending}
            className="px-6 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50">
            {saveMut.isPending ? 'Saving…' : isEdit ? 'Update' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════════════════════════════════ */
export default function StoresPettyCashPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState('local'); // 'local' | 'other'
  const [projectId, setProjectId] = useState('');
  const [filters, setFilters] = useState({ search: '', from: '', to: '' });
  const [showEntryForm, setShowEntryForm]     = useState(false);
  const [editEntry, setEditEntry]             = useState(null);
  const [showAdvanceForm, setShowAdvanceForm] = useState(false);
  const [editAdvance, setEditAdvance]         = useState(null);

  const { data: projects = [] } = useQuery({
    queryKey: ['projects-list'],
    queryFn: () => projectAPI.list({ limit: 500 }).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    staleTime: 60000,
  });

  const params = useMemo(() => ({
    project_id: projectId || undefined,
    search: filters.search || undefined,
    from: filters.from || undefined,
    to: filters.to || undefined,
  }), [projectId, filters]);

  const { data: entriesResp, isLoading: loadingEntries } = useQuery({
    queryKey: ['spc-entries', params],
    queryFn: () => storesPettyCashAPI.listEntries(params).then(r => r.data),
    enabled: tab === 'local',
  });
  const { data: advancesResp, isLoading: loadingAdvances } = useQuery({
    queryKey: ['spc-advances', params],
    queryFn: () => storesPettyCashAPI.listAdvances(params).then(r => r.data),
    enabled: tab === 'other',
  });
  const { data: summaryResp } = useQuery({
    queryKey: ['spc-summary', projectId],
    queryFn: () => storesPettyCashAPI.summary({ project_id: projectId || undefined }).then(r => r.data),
  });

  const entries  = entriesResp?.data ?? [];
  const advances = advancesResp?.data ?? [];
  const summary  = summaryResp?.data ?? {};

  const deleteEntryMut = useMutation({
    mutationFn: (id) => storesPettyCashAPI.deleteEntry(id),
    onSuccess: () => { toast.success('Entry deleted'); qc.invalidateQueries({ queryKey: ['spc-entries'] }); qc.invalidateQueries({ queryKey: ['spc-summary'] }); },
    onError: e => toast.error(e?.response?.data?.error || 'Delete failed'),
  });
  const deleteAdvanceMut = useMutation({
    mutationFn: (id) => storesPettyCashAPI.deleteAdvance(id),
    onSuccess: () => { toast.success('Advance deleted'); qc.invalidateQueries({ queryKey: ['spc-advances'] }); qc.invalidateQueries({ queryKey: ['spc-summary'] }); },
    onError: e => toast.error(e?.response?.data?.error || 'Delete failed'),
  });

  const setFilter = (k, v) => setFilters(f => ({ ...f, [k]: v }));

  return (
    <div className="min-h-screen bg-[#f4f6f9]">
      {/* ── Top bar ── */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center">
              <Wallet className="w-4 h-4 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-900">Stores Petty Cash Tracker</h1>
              <p className="text-xs text-slate-500">Site cash book — Local Purchases &amp; Advances. Independent of Accounts &gt; Petty Cash.</p>
            </div>
          </div>
          <select className={clsx(FS, 'w-56')} value={projectId} onChange={e => setProjectId(e.target.value)}>
            <option value="">All Projects</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>

      {/* ── Summary cards ── */}
      <div className="px-6 pt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="border border-slate-200 rounded-xl p-4 bg-white">
          <p className="text-xs text-slate-500 font-medium mb-1">Local Purchases</p>
          <p className="text-lg font-bold text-indigo-700">₹ {inr(summary.local_purchase_total)}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">{summary.local_purchase_count || 0} entries</p>
        </div>
        <div className="border border-slate-200 rounded-xl p-4 bg-amber-50">
          <p className="text-xs text-slate-500 font-medium mb-1">Other Petty Cash (Advances)</p>
          <p className="text-lg font-bold text-amber-700">₹ {inr(summary.advance_total)}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">{summary.advance_count || 0} entries</p>
        </div>
        <div className="border border-slate-200 rounded-xl p-4 bg-emerald-50">
          <p className="text-xs text-slate-500 font-medium mb-1">Grand Total</p>
          <p className="text-lg font-bold text-emerald-700">₹ {inr(summary.grand_total)}</p>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="px-6 pt-5">
        <div className="flex gap-2 border-b border-slate-200">
          {[
            { id: 'local', label: 'Local Purchases', icon: ShoppingBag },
            { id: 'other', label: 'Other Petty Cash', icon: Users },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={clsx('flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                tab === t.id ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800')}>
              <t.icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Filters + action ── */}
      <div className="px-6 pt-4 pb-2 flex flex-wrap gap-2 items-center">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input className="pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-white w-52 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            placeholder={tab === 'local' ? 'Search supplier / material…' : 'Search name / description…'}
            value={filters.search} onChange={e => setFilter('search', e.target.value)} />
        </div>
        <input type="date" className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
          value={filters.from} onChange={e => setFilter('from', e.target.value)} title="From date" />
        <input type="date" className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
          value={filters.to} onChange={e => setFilter('to', e.target.value)} title="To date" />
        {(filters.search || filters.from || filters.to) && (
          <button onClick={() => setFilters({ search: '', from: '', to: '' })} className="px-3 py-2 text-sm text-slate-500 hover:text-slate-800">
            Clear filters
          </button>
        )}
        <button
          onClick={() => tab === 'local' ? (setEditEntry(null), setShowEntryForm(true)) : (setEditAdvance(null), setShowAdvanceForm(true))}
          className="ml-auto flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700">
          <Plus className="w-4 h-4" /> {tab === 'local' ? 'New Entry' : 'New Advance'}
        </button>
      </div>

      {/* ── LOCAL PURCHASES TABLE ── */}
      {tab === 'local' && (
        <div className="px-6 pb-10">
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            {loadingEntries ? (
              <div className="flex justify-center py-16">
                <div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : entries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
                <ShoppingBag className="w-10 h-10 opacity-20" />
                <p className="text-sm font-medium">No local purchase entries yet</p>
                <button onClick={() => { setEditEntry(null); setShowEntryForm(true); }} className="text-sm text-indigo-600 hover:underline flex items-center gap-1">
                  <Plus className="w-3.5 h-3.5" /> Add first entry
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      {['Sl No', 'Date', 'Supplier', 'Materials', 'Invoice No', 'Amount (₹)', ''].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-slate-500 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {entries.map(row => {
                      const items = row.items || [];
                      const matSummary = items.length
                        ? items.length === 1 ? items[0].material_name
                          : `${items[0].material_name} +${items.length - 1} more`
                        : '—';
                      return (
                        <tr key={row.id} className="hover:bg-slate-50 transition-colors cursor-pointer"
                          onClick={() => { setEditEntry(row); setShowEntryForm(true); }}>
                          <td className="px-4 py-3 font-mono text-xs font-semibold text-indigo-700">{row.sl_no}</td>
                          <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{dayjs(row.entry_date).format('DD MMM YYYY')}</td>
                          <td className="px-4 py-3 font-medium text-slate-800">{row.supplier}</td>
                          <td className="px-4 py-3 text-slate-500 text-xs max-w-[260px] truncate" title={items.map(i => i.material_name).join(', ')}>{matSummary}</td>
                          <td className="px-4 py-3 text-slate-500 text-xs font-mono">{row.invoice_no || '—'}</td>
                          <td className="px-4 py-3 font-mono font-semibold text-slate-800 text-right whitespace-nowrap">₹ {inr(row.amount)}</td>
                          <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                            <button onClick={() => { if (window.confirm('Delete this entry?')) deleteEntryMut.mutate(row.id); }}
                              className="text-red-400 hover:text-red-600">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 border-t-2 border-slate-200">
                      <td colSpan={5} className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase">Total ({entries.length} entries)</td>
                      <td className="px-4 py-3 font-mono font-bold text-indigo-700 text-right">
                        ₹ {inr(entries.reduce((s, r) => s + Number(r.amount || 0), 0))}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── OTHER PETTY CASH TABLE ── */}
      {tab === 'other' && (
        <div className="px-6 pb-10">
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            {loadingAdvances ? (
              <div className="flex justify-center py-16">
                <div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : advances.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
                <Users className="w-10 h-10 opacity-20" />
                <p className="text-sm font-medium">No advances recorded yet</p>
                <button onClick={() => { setEditAdvance(null); setShowAdvanceForm(true); }} className="text-sm text-amber-600 hover:underline flex items-center gap-1">
                  <Plus className="w-3.5 h-3.5" /> Add first entry
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      {['Date', 'Contractor / Employee', 'Description', 'Amount (₹)', ''].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-slate-500 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {advances.map(row => (
                      <tr key={row.id} className="hover:bg-slate-50 transition-colors cursor-pointer"
                        onClick={() => { setEditAdvance(row); setShowAdvanceForm(true); }}>
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{dayjs(row.advance_date).format('DD MMM YYYY')}</td>
                        <td className="px-4 py-3 font-medium text-slate-800">{row.payee_name}</td>
                        <td className="px-4 py-3 text-slate-500 text-xs">{row.description}</td>
                        <td className="px-4 py-3 font-mono font-semibold text-slate-800 text-right whitespace-nowrap">₹ {inr(row.amount)}</td>
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          <button onClick={() => { if (window.confirm('Delete this advance?')) deleteAdvanceMut.mutate(row.id); }}
                            className="text-red-400 hover:text-red-600">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 border-t-2 border-slate-200">
                      <td colSpan={3} className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase">Total ({advances.length} entries)</td>
                      <td className="px-4 py-3 font-mono font-bold text-amber-700 text-right">
                        ₹ {inr(advances.reduce((s, r) => s + Number(r.amount || 0), 0))}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      {showEntryForm && (
        <EntryForm
          initial={editEntry}
          projects={projects}
          defaultProjectId={projectId}
          onClose={() => { setShowEntryForm(false); setEditEntry(null); }}
        />
      )}
      {showAdvanceForm && (
        <AdvanceForm
          initial={editAdvance}
          projects={projects}
          defaultProjectId={projectId}
          onClose={() => { setShowAdvanceForm(false); setEditAdvance(null); }}
        />
      )}
    </div>
  );
}
