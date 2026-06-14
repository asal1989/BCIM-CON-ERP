// src/pages/accounts/JournalEntryPage.jsx
import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import { clsx } from 'clsx';
import {
  ScrollText, Plus, X, Trash2, Check, ChevronRight, Download,
  Zap, RefreshCw, Play, ToggleLeft, ToggleRight, Calendar, BookOpen
} from 'lucide-react';
import { journalEntryAPI, chartOfAccountsAPI, tqsBillsAPI } from '../../api/client';
import { inr } from '../dashboards/DashKPI';
import { downloadCsv, downloadPdf } from '../../utils/exportCsv';

const F = 'w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white';

const STATUS_CLS = {
  draft:  'bg-amber-50 text-amber-600 border-amber-100',
  posted: 'bg-emerald-50 text-emerald-600 border-emerald-100',
};

const SOURCE_LABELS = {
  manual:           { label: 'Manual',       cls: 'bg-slate-100 text-slate-600' },
  auto_payment:     { label: 'Payment',      cls: 'bg-blue-100 text-blue-700' },
  auto_invoice:     { label: 'Invoice',      cls: 'bg-purple-100 text-purple-700' },
  auto_petty_cash:  { label: 'Petty Cash',   cls: 'bg-amber-100 text-amber-700' },
  auto_recurring:   { label: 'Recurring',    cls: 'bg-green-100 text-green-700' },
  auto_credit_note: { label: 'Credit Note',  cls: 'bg-rose-100 text-rose-700' },
  auto_debit_note:  { label: 'Debit Note',   cls: 'bg-orange-100 text-orange-700' },
  auto_client_advance: { label: 'Client Advance', cls: 'bg-cyan-100 text-cyan-700' },
  auto_tqs_bill:    { label: 'Bill Tracker', cls: 'bg-indigo-100 text-indigo-700' },
  auto:             { label: 'Auto',         cls: 'bg-teal-100 text-teal-700' },
};

const FREQ_LABELS = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', quarterly: 'Quarterly', annual: 'Annual', manual: 'Manual' };

const EMPTY_LINE = { account_id: '', debit: '', credit: '', description: '' };
const n = v => parseFloat(v) || 0;

// ── Shared helpers ─────────────────────────────────────────────────────────────
function SourceBadge({ source }) {
  const s = SOURCE_LABELS[source] || SOURCE_LABELS.auto;
  return <span className={clsx('px-2 py-0.5 rounded-full text-[10px] font-semibold', s.cls)}>{s.label}</span>;
}

function JEDetail({ je, onClose }) {
  const qc = useQueryClient();
  const statusMut = useMutation({
    mutationFn: (status) => journalEntryAPI.updateStatus(je.id, status),
    onSuccess: () => {
      toast.success('Status updated');
      qc.invalidateQueries({ queryKey: ['journal-entries'] });
      qc.invalidateQueries({ queryKey: ['je-auto-log'] });
      onClose();
    },
    onError: e => toast.error(e?.response?.data?.error || 'Update failed'),
  });
  const deleteMut = useMutation({
    mutationFn: () => journalEntryAPI.remove(je.id),
    onSuccess: () => { toast.success('Entry deleted'); qc.invalidateQueries({ queryKey: ['journal-entries'] }); onClose(); },
    onError: e => toast.error(e?.response?.data?.error || 'Delete failed'),
  });

  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4 overflow-auto">
      <div className="bg-white w-full max-w-2xl rounded-md border border-slate-200 shadow-xl flex flex-col max-h-[94vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div>
              <p className="text-sm font-semibold text-slate-800">{je.entry_no}</p>
              <p className="text-xs text-slate-400">{dayjs(je.entry_date).format('DD MMM YYYY')} · {je.narration || '—'}</p>
            </div>
            <SourceBadge source={je.source || 'manual'} />
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {je.reference && <p className="text-xs text-slate-500">Ref: <span className="font-mono">{je.reference}</span></p>}
          <table className="w-full text-sm border border-slate-200 rounded-md overflow-hidden">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {['Account', 'Description', 'Debit (₹)', 'Credit (₹)'].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-slate-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {(je.lines || []).map(l => (
                <tr key={l.id}>
                  <td className="px-3 py-2"><span className="font-mono text-xs text-slate-500">{l.account_code}</span> {l.account_name}</td>
                  <td className="px-3 py-2 text-slate-500 text-xs">{l.description || '—'}</td>
                  <td className="px-3 py-2 text-right font-mono">{l.debit > 0 ? inr(l.debit) : ''}</td>
                  <td className="px-3 py-2 text-right font-mono">{l.credit > 0 ? inr(l.credit) : ''}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 border-t border-slate-100">
                <td colSpan={2} className="px-3 py-2 text-xs text-slate-400">Total</td>
                <td className="px-3 py-2 text-right font-mono font-semibold">{inr(je.total_debit || (je.lines || []).reduce((s, l) => s + n(l.debit), 0))}</td>
                <td className="px-3 py-2 text-right font-mono font-semibold">{inr(je.total_credit || (je.lines || []).reduce((s, l) => s + n(l.credit), 0))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-t border-slate-100">
          <div>
            {je.status === 'draft' && (
              <button onClick={() => deleteMut.mutate()} disabled={deleteMut.isPending}
                className="px-3 py-1.5 text-xs border border-red-200 text-red-600 rounded-md hover:bg-red-50">Delete</button>
            )}
          </div>
          <div className="flex gap-2">
            {je.status === 'draft' ? (
              <button onClick={() => statusMut.mutate('posted')} disabled={statusMut.isPending}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5" /> Post Entry
              </button>
            ) : (
              <button onClick={() => statusMut.mutate('draft')} disabled={statusMut.isPending}
                className="px-4 py-2 text-sm border border-slate-200 rounded-md text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                Unpost
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function JEForm({ onClose, accounts }) {
  const qc = useQueryClient();
  const [entry_date, setDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [reference, setReference] = useState('');
  const [narration, setNarration] = useState('');
  const [lines, setLines] = useState([{ ...EMPTY_LINE }, { ...EMPTY_LINE }]);

  const updateLine = (idx, key, val) => setLines(prev => {
    const next = [...prev];
    next[idx] = { ...next[idx], [key]: val };
    if (key === 'debit' && val) next[idx].credit = '';
    if (key === 'credit' && val) next[idx].debit = '';
    return next;
  });

  const totalDebit  = lines.reduce((s, l) => s + n(l.debit), 0);
  const totalCredit = lines.reduce((s, l) => s + n(l.credit), 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;

  const saveMut = useMutation({
    mutationFn: (status) => journalEntryAPI.create({ entry_date, reference, narration, status, lines }),
    onSuccess: () => { toast.success('Journal entry saved'); qc.invalidateQueries({ queryKey: ['journal-entries'] }); onClose(); },
    onError: e => toast.error(e?.response?.data?.error || 'Save failed'),
  });

  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4 overflow-auto">
      <div className="bg-white w-full max-w-3xl rounded-md border border-slate-200 shadow-xl flex flex-col max-h-[94vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-blue-50 flex items-center justify-center">
              <ScrollText className="w-4 h-4 text-blue-600" />
            </div>
            <p className="text-sm font-semibold text-slate-800">New Journal Entry</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Date</label>
              <input type="date" className={F} value={entry_date} onChange={e => setDate(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Reference</label>
              <input className={F} value={reference} onChange={e => setReference(e.target.value)} placeholder="Optional" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Narration</label>
              <input className={F} value={narration} onChange={e => setNarration(e.target.value)} placeholder="Description" />
            </div>
          </div>

          <div className="border border-slate-200 rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {['Account', 'Description', 'Debit (₹)', 'Credit (₹)', ''].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {lines.map((l, idx) => (
                  <tr key={idx}>
                    <td className="px-2 py-1.5 min-w-[200px]">
                      <select className={F} value={l.account_id} onChange={e => updateLine(idx, 'account_id', e.target.value)}>
                        <option value="">— Select account —</option>
                        {accounts.map(a => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <input className={F} value={l.description} onChange={e => updateLine(idx, 'description', e.target.value)} placeholder="Optional" />
                    </td>
                    <td className="px-2 py-1.5 w-32">
                      <input type="number" step="0.01" className={F} value={l.debit} onChange={e => updateLine(idx, 'debit', e.target.value)} placeholder="0.00" />
                    </td>
                    <td className="px-2 py-1.5 w-32">
                      <input type="number" step="0.01" className={F} value={l.credit} onChange={e => updateLine(idx, 'credit', e.target.value)} placeholder="0.00" />
                    </td>
                    <td className="px-2 py-1.5 w-8">
                      {lines.length > 2 && (
                        <button onClick={() => setLines(p => p.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-600">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-100 bg-slate-50">
                  <td colSpan={2} className="px-3 py-2">
                    <button onClick={() => setLines(p => [...p, { ...EMPTY_LINE }])} className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1">
                      <Plus className="w-3.5 h-3.5" /> Add Line
                    </button>
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-semibold text-slate-700">{inr(totalDebit)}</td>
                  <td className="px-3 py-2 text-right font-mono font-semibold text-slate-700">{inr(totalCredit)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
          {!balanced && totalDebit > 0 && (
            <p className="text-xs text-amber-600">Difference: {inr(Math.abs(totalDebit - totalCredit))} — debits must equal credits.</p>
          )}
        </div>

        <div className="flex-shrink-0 flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-slate-200 rounded-md text-slate-600 hover:bg-slate-50">Cancel</button>
          <button onClick={() => saveMut.mutate('draft')} disabled={!balanced || saveMut.isPending}
            className="px-4 py-2 text-sm border border-slate-200 rounded-md text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            Save Draft
          </button>
          <button onClick={() => saveMut.mutate('posted')} disabled={!balanced || saveMut.isPending}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">
            {saveMut.isPending ? 'Saving…' : 'Save & Post'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Manual JE tab ─────────────────────────────────────────────────────────────
function ManualJETab({ accounts }) {
  const [showForm, setShowForm] = useState(false);
  const [viewRecord, setViewRecord] = useState(null);
  const [filters, setFilters] = useState({ status: '', search: '', from: '', to: '' });

  const params = useMemo(() => Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), [filters]);
  const { data, isLoading } = useQuery({
    queryKey: ['journal-entries', params],
    queryFn: () => journalEntryAPI.list({ ...params, source: 'manual' }).then(r => r.data?.data ?? []),
  });
  const rows = data ?? [];

  const exportRows = () => {
    const lines = [['Entry No', 'Date', 'Reference', 'Narration', 'Debit', 'Credit', 'Status']];
    rows.forEach(r => lines.push([r.entry_no, dayjs(r.entry_date).format('DD MMM YYYY'), r.reference || '', r.narration || '', r.total_debit, r.total_credit, r.status]));
    return lines;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <input className="border border-slate-200 rounded-md px-3 py-2 text-sm w-44 focus:outline-none focus:ring-2 focus:ring-blue-200"
          placeholder="Search…" value={filters.search} onChange={e => setFilters(f => ({ ...f, search: e.target.value }))} />
        <select className="border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
          value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
          <option value="">All Status</option>
          <option value="draft">Draft</option>
          <option value="posted">Posted</option>
        </select>
        <input type="date" className="border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
          value={filters.from} onChange={e => setFilters(f => ({ ...f, from: e.target.value }))} />
        <input type="date" className="border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
          value={filters.to} onChange={e => setFilters(f => ({ ...f, to: e.target.value }))} />
        <div className="ml-auto flex gap-2">
          <button onClick={() => downloadCsv(`je-${dayjs().format('YYYY-MM-DD')}.csv`, exportRows())} disabled={!rows.length}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border border-slate-200 rounded-md text-slate-700 hover:bg-slate-50 disabled:opacity-40">
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
          <button onClick={() => setShowForm(true)} disabled={accounts.length === 0}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">
            <Plus className="w-4 h-4" /> New Entry
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" /></div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2 text-slate-400">
          <ScrollText className="w-10 h-10 opacity-20" />
          <p className="text-sm">No journal entries found</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                {['Entry No', 'Date', 'Narration', 'Debit (₹)', 'Credit (₹)', 'Status', ''].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-slate-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map(je => (
                <tr key={je.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setViewRecord(je)}>
                  <td className="px-4 py-2.5 font-mono text-xs font-semibold text-blue-700">{je.entry_no}</td>
                  <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{dayjs(je.entry_date).format('DD MMM YYYY')}</td>
                  <td className="px-4 py-2.5 text-slate-600">{je.narration || '—'}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{inr(je.total_debit)}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{inr(je.total_credit)}</td>
                  <td className="px-4 py-2.5">
                    <span className={clsx('px-2 py-0.5 rounded-full text-[10px] font-medium border capitalize', STATUS_CLS[je.status])}>{je.status}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right"><ChevronRight className="w-4 h-4 text-slate-300" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && <JEForm accounts={accounts} onClose={() => setShowForm(false)} />}
      {viewRecord && <JEDetail je={viewRecord} onClose={() => setViewRecord(null)} />}
    </div>
  );
}

// ── Automation Log tab ────────────────────────────────────────────────────────
function AutomationLogTab() {
  const [viewRecord, setViewRecord] = useState(null);
  const [filters, setFilters] = useState({ source: '', from: '', to: '' });

  const params = useMemo(() => Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), [filters]);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['je-auto-log', params],
    queryFn: () => journalEntryAPI.automationLog(params).then(r => r.data?.data ?? []),
  });
  const rows = data ?? [];

  const handleView = async (je) => {
    const full = await journalEntryAPI.get(je.id).then(r => r.data?.data);
    if (full) setViewRecord(full);
  };

  const [backfilling, setBackfilling] = useState(false);
  const handleBackfill = async () => {
    setBackfilling(true);
    try {
      // 1) Dry run to preview how many old bills qualify
      const prev = await tqsBillsAPI.backfillJV({ dry_run: true }).then(r => r.data);
      if (!prev?.eligible) { toast.success('No old bills need a JV — all caught up.'); return; }
      const ok = window.confirm(
        `${prev.eligible} previously-certified bill(s) totalling ₹${Number(prev.total_value || 0).toLocaleString('en-IN')} have no journal voucher yet.\n\nPost JVs for all of them now?`
      );
      if (!ok) return;
      // 2) Real run
      const res = await tqsBillsAPI.backfillJV({}).then(r => r.data);
      toast.success(res?.message || `Posted ${res?.posted ?? 0} JV(s)`);
      if (res?.skipped) toast.error(`${res.skipped} skipped — check Chart of Accounts is seeded, then run again.`);
      refetch();
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Backfill failed');
    } finally {
      setBackfilling(false);
    }
  };

  const stats = useMemo(() => {
    const bySource = {};
    rows.forEach(r => { bySource[r.source] = (bySource[r.source] || 0) + 1; });
    return { total: rows.length, bySource };
  }, [rows]);

  return (
    <div className="space-y-4">
      {/* Summary chips */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(stats.bySource).map(([src, count]) => (
          <div key={src} className={clsx('flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium', (SOURCE_LABELS[src] || SOURCE_LABELS.auto).cls)}>
            <Zap className="w-3 h-3" />
            {(SOURCE_LABELS[src] || SOURCE_LABELS.auto).label}: {count}
          </div>
        ))}
        {rows.length === 0 && !isLoading && <span className="text-xs text-slate-400">No auto-posted JVs yet</span>}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <select className="border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none"
          value={filters.source} onChange={e => setFilters(f => ({ ...f, source: e.target.value }))}>
          <option value="">All Sources</option>
          <option value="auto_payment">Payment</option>
          <option value="auto_invoice">Invoice</option>
          <option value="auto_petty_cash">Petty Cash</option>
          <option value="auto_recurring">Recurring</option>
          <option value="auto_credit_note">Credit Note</option>
          <option value="auto_debit_note">Debit Note</option>
          <option value="auto_client_advance">Client Advance</option>
          <option value="auto_tqs_bill">Bill Tracker</option>
        </select>
        <input type="date" className="border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none"
          value={filters.from} onChange={e => setFilters(f => ({ ...f, from: e.target.value }))} />
        <input type="date" className="border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none"
          value={filters.to} onChange={e => setFilters(f => ({ ...f, to: e.target.value }))} />
        <button onClick={() => refetch()} className="flex items-center gap-1 px-3 py-2 text-sm border border-slate-200 rounded-md text-slate-600 hover:bg-slate-50">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
        <button onClick={handleBackfill} disabled={backfilling}
          title="Post JVs for previously-certified bill-tracker bills that don't have one yet"
          className="flex items-center gap-1 px-3 py-2 text-sm border border-indigo-200 bg-indigo-50 text-indigo-700 rounded-md hover:bg-indigo-100 disabled:opacity-50">
          <Zap className="w-3.5 h-3.5" /> {backfilling ? 'Backfilling…' : 'Backfill Bill JVs'}
        </button>
        <span className="ml-auto text-xs text-slate-400">{rows.length} entries</span>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                {['Entry No', 'Date', 'Source', 'Reference', 'Narration', 'Amount (₹)', 'By', ''].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-slate-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map(je => (
                <tr key={je.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => handleView(je)}>
                  <td className="px-4 py-2.5 font-mono text-xs font-semibold text-blue-700">{je.entry_no}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-slate-600">{dayjs(je.entry_date).format('DD MMM YYYY')}</td>
                  <td className="px-4 py-2.5"><SourceBadge source={je.source} /></td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{je.reference || '—'}</td>
                  <td className="px-4 py-2.5 text-slate-600 max-w-[200px] truncate">{je.narration || '—'}</td>
                  <td className="px-4 py-2.5 text-right font-mono font-semibold">{inr(je.total_debit)}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-400">{je.created_by_name || '—'}</td>
                  <td className="px-4 py-2.5 text-right"><ChevronRight className="w-4 h-4 text-slate-300" /></td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={8} className="py-12 text-center text-slate-400 text-sm">
                  No auto-posted journal entries yet. They will appear here once payments, invoices, or petty cash expenses are processed.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {viewRecord && <JEDetail je={viewRecord} onClose={() => setViewRecord(null)} />}
    </div>
  );
}

// ── Recurring Templates tab ────────────────────────────────────────────────────
function RecurringTab({ accounts }) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState(null); // for execute preview
  const [execDate, setExecDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [tplForm, setTplForm] = useState({ template_name: '', narration: '', frequency: 'monthly', day_of_month: 1, next_run_date: '', auto_post: true, lines: [{ ...EMPTY_LINE }, { ...EMPTY_LINE }] });

  const { data, isLoading } = useQuery({
    queryKey: ['jv-templates'],
    queryFn: () => journalEntryAPI.templates().then(r => r.data?.data ?? []),
  });
  const templates = data ?? [];

  const createMut = useMutation({
    mutationFn: d => journalEntryAPI.createTemplate(d),
    onSuccess: () => { toast.success('Template created'); qc.invalidateQueries({ queryKey: ['jv-templates'] }); setShowForm(false); },
    onError: e => toast.error(e?.response?.data?.error || 'Failed'),
  });
  const toggleMut = useMutation({
    mutationFn: ({ id, is_active }) => journalEntryAPI.updateTemplate(id, { is_active }),
    onSuccess: () => { toast.success('Updated'); qc.invalidateQueries({ queryKey: ['jv-templates'] }); },
  });
  const deleteMut = useMutation({
    mutationFn: id => journalEntryAPI.deleteTemplate(id),
    onSuccess: () => { toast.success('Deleted'); qc.invalidateQueries({ queryKey: ['jv-templates'] }); },
    onError: e => toast.error(e?.response?.data?.error || 'Failed'),
  });
  const executeMut = useMutation({
    mutationFn: ({ id, entry_date }) => journalEntryAPI.executeTemplate(id, { entry_date }),
    onSuccess: (r) => {
      toast.success(`JV posted: ${r.data?.data?.entry_no}`);
      qc.invalidateQueries({ queryKey: ['jv-templates'] });
      qc.invalidateQueries({ queryKey: ['je-auto-log'] });
      setSelected(null);
    },
    onError: e => toast.error(e?.response?.data?.error || 'Could not post — ensure Chart of Accounts is set up'),
  });

  const updateTplLine = (idx, key, val) => setTplForm(f => {
    const lines = [...f.lines];
    lines[idx] = { ...lines[idx], [key]: val };
    if (key === 'debit' && val) lines[idx].credit = '';
    if (key === 'credit' && val) lines[idx].debit = '';
    return { ...f, lines };
  });

  const tplTotalD = tplForm.lines.reduce((s, l) => s + n(l.debit), 0);
  const tplTotalC = tplForm.lines.reduce((s, l) => s + n(l.credit), 0);
  const tplBalanced = Math.abs(tplTotalD - tplTotalC) < 0.01 && tplTotalD > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">Templates auto-post recurring JVs (depreciation, rent, provisions, etc.)</p>
        <button onClick={() => setShowForm(true)} disabled={accounts.length === 0}
          className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">
          <Plus className="w-4 h-4" /> New Template
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" /></div>
      ) : templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2 text-slate-400">
          <Calendar className="w-10 h-10 opacity-20" />
          <p className="text-sm">No recurring templates yet</p>
          <p className="text-xs">Create templates for monthly depreciation, rent, salary provisions, etc.</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                {['Template', 'Frequency', 'Next Run', 'Last Run', 'Lines', 'Auto-post', 'Active', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-slate-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {templates.map(t => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{t.template_name}</p>
                    {t.narration && <p className="text-xs text-slate-400">{t.narration}</p>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{FREQ_LABELS[t.frequency] || t.frequency}</td>
                  <td className="px-4 py-3">
                    {t.next_run_date
                      ? <span className={clsx('text-xs font-medium', dayjs(t.next_run_date).isBefore(dayjs()) ? 'text-red-600' : 'text-slate-600')}>
                          {dayjs(t.next_run_date).format('DD MMM YYYY')}
                          {dayjs(t.next_run_date).isBefore(dayjs()) && <span className="ml-1 text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">Due</span>}
                        </span>
                      : <span className="text-slate-400 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">{t.last_run_date ? dayjs(t.last_run_date).format('DD MMM YYYY') : '—'}</td>
                  <td className="px-4 py-3 text-center text-slate-600">{t.line_count}</td>
                  <td className="px-4 py-3">
                    <span className={clsx('text-[10px] px-2 py-0.5 rounded-full font-medium', t.auto_post ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500')}>
                      {t.auto_post ? 'Yes' : 'Manual'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => toggleMut.mutate({ id: t.id, is_active: !t.is_active })}>
                      {t.is_active
                        ? <ToggleRight className="w-5 h-5 text-green-500" />
                        : <ToggleLeft className="w-5 h-5 text-slate-300" />}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5">
                      <button onClick={() => { setSelected(t); setExecDate(dayjs().format('YYYY-MM-DD')); }}
                        className="flex items-center gap-1 px-2.5 py-1 text-xs bg-blue-50 text-blue-700 rounded-md hover:bg-blue-100 font-medium">
                        <Play className="w-3 h-3" /> Run
                      </button>
                      <button onClick={() => { if (window.confirm('Delete template?')) deleteMut.mutate(t.id); }}
                        className="px-2.5 py-1 text-xs text-red-500 hover:bg-red-50 rounded-md">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Template Modal */}
      {showForm && (
        <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4 overflow-auto">
          <div className="bg-white w-full max-w-3xl rounded-md border border-slate-200 shadow-xl flex flex-col max-h-[94vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
              <p className="text-sm font-semibold text-slate-800">New Recurring JV Template</p>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1">Template Name *</label>
                  <input className={F} value={tplForm.template_name} onChange={e => setTplForm(f => ({ ...f, template_name: e.target.value }))} placeholder="e.g. Monthly Depreciation" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Narration</label>
                  <input className={F} value={tplForm.narration} onChange={e => setTplForm(f => ({ ...f, narration: e.target.value }))} placeholder="JV description" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Frequency</label>
                  <select className={F} value={tplForm.frequency} onChange={e => setTplForm(f => ({ ...f, frequency: e.target.value }))}>
                    {Object.entries(FREQ_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                {tplForm.frequency === 'monthly' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Day of Month</label>
                    <input type="number" min={1} max={28} className={F} value={tplForm.day_of_month}
                      onChange={e => setTplForm(f => ({ ...f, day_of_month: e.target.value }))} />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Next Run Date</label>
                  <input type="date" className={F} value={tplForm.next_run_date} onChange={e => setTplForm(f => ({ ...f, next_run_date: e.target.value }))} />
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="auto_post" checked={tplForm.auto_post} onChange={e => setTplForm(f => ({ ...f, auto_post: e.target.checked }))} />
                  <label htmlFor="auto_post" className="text-sm text-slate-600 cursor-pointer">Auto-post when executed</label>
                </div>
              </div>

              <div className="border border-slate-200 rounded-md overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      {['Account', 'Description', 'Debit (₹)', 'Credit (₹)', ''].map(h => (
                        <th key={h} className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-slate-400">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {tplForm.lines.map((l, idx) => (
                      <tr key={idx}>
                        <td className="px-2 py-1.5 min-w-[200px]">
                          <select className={F} value={l.account_id} onChange={e => updateTplLine(idx, 'account_id', e.target.value)}>
                            <option value="">— Select account —</option>
                            {accounts.map(a => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
                          </select>
                        </td>
                        <td className="px-2 py-1.5">
                          <input className={F} value={l.description} onChange={e => updateTplLine(idx, 'description', e.target.value)} placeholder="Optional" />
                        </td>
                        <td className="px-2 py-1.5 w-32">
                          <input type="number" step="0.01" className={F} value={l.debit} onChange={e => updateTplLine(idx, 'debit', e.target.value)} placeholder="0.00" />
                        </td>
                        <td className="px-2 py-1.5 w-32">
                          <input type="number" step="0.01" className={F} value={l.credit} onChange={e => updateTplLine(idx, 'credit', e.target.value)} placeholder="0.00" />
                        </td>
                        <td className="px-2 py-1.5 w-8">
                          {tplForm.lines.length > 2 && (
                            <button onClick={() => setTplForm(f => ({ ...f, lines: f.lines.filter((_, i) => i !== idx) }))} className="text-red-400 hover:text-red-600">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-slate-100 bg-slate-50">
                      <td colSpan={2} className="px-3 py-2">
                        <button onClick={() => setTplForm(f => ({ ...f, lines: [...f.lines, { ...EMPTY_LINE }] }))}
                          className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1">
                          <Plus className="w-3.5 h-3.5" /> Add Line
                        </button>
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-semibold text-slate-700">{inr(tplTotalD)}</td>
                      <td className="px-3 py-2 text-right font-mono font-semibold text-slate-700">{inr(tplTotalC)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
              {!tplBalanced && tplTotalD > 0 && (
                <p className="text-xs text-amber-600">Difference: {inr(Math.abs(tplTotalD - tplTotalC))} — lines must balance</p>
              )}
            </div>
            <div className="flex-shrink-0 flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm border border-slate-200 rounded-md text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={() => createMut.mutate(tplForm)} disabled={!tplBalanced || !tplForm.template_name || createMut.isPending}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">
                {createMut.isPending ? 'Saving…' : 'Save Template'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Execute Modal */}
      {selected && (
        <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-md border border-slate-200 shadow-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-800">Run: {selected.template_name}</p>
              <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Journal Entry Date</label>
              <input type="date" className={F} value={execDate} onChange={e => setExecDate(e.target.value)} />
            </div>
            <p className="text-xs text-slate-500">This will post a journal entry using the template lines on the selected date and update the next run date.</p>
            <div className="flex gap-2 justify-end pt-1">
              <button onClick={() => setSelected(null)} className="px-4 py-2 text-sm border border-slate-200 rounded-md text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={() => executeMut.mutate({ id: selected.id, entry_date: execDate })}
                disabled={!execDate || executeMut.isPending}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5">
                <Play className="w-3.5 h-3.5" />{executeMut.isPending ? 'Posting…' : 'Post JV'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Day Book tab ───────────────────────────────────────────────────────────────
function DayBookTab() {
  const [range, setRange] = useState({ from: dayjs().format('YYYY-MM-DD'), to: dayjs().format('YYYY-MM-DD') });
  const [viewRecord, setViewRecord] = useState(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['je-day-book', range],
    queryFn: () => journalEntryAPI.dayBook(range).then(r => r.data?.data ?? []),
  });
  const entries = data ?? [];
  const grandTotal = entries.reduce((s, e) => s + (e.lines || []).reduce((ss, l) => ss + n(l.debit), 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-center">
        <input type="date" className="border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none"
          value={range.from} onChange={e => setRange(r => ({ ...r, from: e.target.value }))} />
        <span className="text-slate-400 text-sm">to</span>
        <input type="date" className="border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none"
          value={range.to} onChange={e => setRange(r => ({ ...r, to: e.target.value }))} />
        <button onClick={() => refetch()} className="flex items-center gap-1 px-3 py-2 text-sm border border-slate-200 rounded-md text-slate-600 hover:bg-slate-50">
          <RefreshCw className="w-3.5 h-3.5" /> Load
        </button>
        {grandTotal > 0 && <span className="ml-auto text-sm font-semibold text-slate-700">Total: {inr(grandTotal)}</span>}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" /></div>
      ) : entries.length === 0 ? (
        <div className="text-center py-12 text-slate-400 text-sm">No posted entries for this date range</div>
      ) : (
        <div className="space-y-3">
          {entries.map(je => (
            <div key={je.id} className="bg-white border border-slate-200 rounded-md overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-slate-50 cursor-pointer"
                onClick={() => setViewRecord(je)}>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs font-semibold text-blue-700">{je.entry_no}</span>
                  <SourceBadge source={je.source || 'manual'} />
                  <span className="text-xs text-slate-500">{je.narration || je.reference || '—'}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm font-semibold text-slate-700">
                    {inr((je.lines || []).reduce((s, l) => s + n(l.debit), 0))}
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-300" />
                </div>
              </div>
              <table className="w-full text-xs">
                <tbody className="divide-y divide-slate-50">
                  {(je.lines || []).map(l => (
                    <tr key={l.id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-1.5 w-24 font-mono text-slate-400">{l.account_code}</td>
                      <td className="px-2 py-1.5 text-slate-600">{l.account_name}</td>
                      <td className="px-2 py-1.5 text-slate-400">{l.description || ''}</td>
                      <td className="px-4 py-1.5 text-right font-mono text-slate-700">{l.debit > 0 ? inr(l.debit) : ''}</td>
                      <td className="px-4 py-1.5 text-right font-mono text-slate-500">{l.credit > 0 ? inr(l.credit) : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
      {viewRecord && <JEDetail je={viewRecord} onClose={() => setViewRecord(null)} />}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'manual',     label: 'Manual JE',       icon: ScrollText },
  { id: 'automation', label: 'Automation Log',   icon: Zap },
  { id: 'recurring',  label: 'Recurring',        icon: Calendar },
  { id: 'daybook',    label: 'Day Book',         icon: BookOpen },
];

export default function JournalEntryPage() {
  const [activeTab, setActiveTab] = useState('manual');

  const { data: coaData } = useQuery({
    queryKey: ['chart-of-accounts-all'],
    queryFn: () => chartOfAccountsAPI.list().then(r => r.data?.data ?? []),
  });
  const accounts = coaData ?? [];

  // Check for due recurring templates on mount
  const { data: dueData } = useQuery({
    queryKey: ['jv-due'],
    queryFn: () => journalEntryAPI.dueTemplates().then(r => r.data?.data ?? []),
    staleTime: 5 * 60 * 1000,
  });
  const dueCount = (dueData ?? []).length;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-md bg-blue-50 flex items-center justify-center">
            <ScrollText className="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-800">Journal Vouchers</h1>
            <p className="text-xs text-slate-400">Manual entries · Auto-posting · Recurring templates</p>
          </div>
          {dueCount > 0 && (
            <div className="ml-4 flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-full text-xs font-medium text-amber-700">
              <Calendar className="w-3.5 h-3.5" />
              {dueCount} recurring template{dueCount > 1 ? 's' : ''} due — check Recurring tab
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-slate-200 px-6">
        <div className="flex gap-0">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={clsx(
                'flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors',
                activeTab === t.id
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              )}>
              <t.icon className="w-4 h-4" />
              {t.label}
              {t.id === 'recurring' && dueCount > 0 && (
                <span className="ml-1 bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{dueCount}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {accounts.length === 0 && (
        <div className="mx-6 mt-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-700">
          Chart of Accounts not set up. Go to <strong>Chart of Accounts</strong> and click <strong>Seed Standard COA</strong> to enable auto-posting.
        </div>
      )}

      <div className="px-6 py-5">
        {activeTab === 'manual'     && <ManualJETab accounts={accounts} />}
        {activeTab === 'automation' && <AutomationLogTab />}
        {activeTab === 'recurring'  && <RecurringTab accounts={accounts} />}
        {activeTab === 'daybook'    && <DayBookTab />}
      </div>
    </div>
  );
}
