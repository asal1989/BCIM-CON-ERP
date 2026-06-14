// src/pages/accounts/JournalEntryPage.jsx
import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import { clsx } from 'clsx';
import { ScrollText, Plus, X, Trash2, Check, ChevronRight, Download, FileDown } from 'lucide-react';
import { journalEntryAPI, chartOfAccountsAPI } from '../../api/client';
import { inr } from '../dashboards/DashKPI';
import { downloadCsv, downloadPdf } from '../../utils/exportCsv';

const F  = 'w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white';
const FS = F;

const STATUS_CLS = {
  draft:  'bg-amber-50 text-amber-600 border-amber-100',
  posted: 'bg-emerald-50 text-emerald-600 border-emerald-100',
};

const EMPTY_LINE = { account_id: '', debit: '', credit: '', description: '' };

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
  const addLine = () => setLines(p => [...p, { ...EMPTY_LINE }]);
  const removeLine = (idx) => setLines(p => p.filter((_, i) => i !== idx));

  const totalDebit  = lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;

  const saveMut = useMutation({
    mutationFn: (status) => journalEntryAPI.create({ entry_date, reference, narration, status, lines }).then(r => r.data),
    onSuccess: () => {
      toast.success('Journal entry saved');
      qc.invalidateQueries({ queryKey: ['journal-entries'] });
      onClose();
    },
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
                      <select className={FS} value={l.account_id} onChange={e => updateLine(idx, 'account_id', e.target.value)}>
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
                        <button onClick={() => removeLine(idx)} className="text-red-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-100 bg-slate-50">
                  <td colSpan={2} className="px-3 py-2">
                    <button onClick={addLine} className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Add Line</button>
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-semibold text-slate-700">{inr(totalDebit)}</td>
                  <td className="px-3 py-2 text-right font-mono font-semibold text-slate-700">{inr(totalCredit)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
          {!balanced && (
            <p className="text-xs text-amber-600">Total debits must equal total credits, and the entry cannot be zero.</p>
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

function JEDetail({ je, onClose }) {
  const qc = useQueryClient();
  const statusMut = useMutation({
    mutationFn: (status) => journalEntryAPI.updateStatus(je.id, status),
    onSuccess: () => { toast.success('Status updated'); qc.invalidateQueries({ queryKey: ['journal-entries'] }); onClose(); },
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
          <div>
            <p className="text-sm font-semibold text-slate-800">{je.entry_no}</p>
            <p className="text-xs text-slate-400">{dayjs(je.entry_date).format('DD MMM YYYY')} · {je.narration || '—'}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          <table className="w-full text-sm border border-slate-200 rounded-md overflow-hidden">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {['Account', 'Description', 'Debit (₹)', 'Credit (₹)'].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-slate-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {je.lines.map(l => (
                <tr key={l.id}>
                  <td className="px-3 py-2"><span className="font-mono text-xs text-slate-500">{l.account_code}</span> {l.account_name}</td>
                  <td className="px-3 py-2 text-slate-500 text-xs">{l.description || '—'}</td>
                  <td className="px-3 py-2 text-right font-mono">{l.debit > 0 ? inr(l.debit) : ''}</td>
                  <td className="px-3 py-2 text-right font-mono">{l.credit > 0 ? inr(l.credit) : ''}</td>
                </tr>
              ))}
            </tbody>
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

export default function JournalEntryPage() {
  const [showForm, setShowForm] = useState(false);
  const [viewRecord, setViewRecord] = useState(null);

  const { data: coaData } = useQuery({
    queryKey: ['chart-of-accounts-all'],
    queryFn: () => chartOfAccountsAPI.list().then(r => r.data?.data ?? []),
  });
  const accounts = coaData ?? [];

  const { data, isLoading } = useQuery({
    queryKey: ['journal-entries'],
    queryFn: () => journalEntryAPI.list().then(r => r.data?.data ?? []),
  });
  const rows = data ?? [];

  const totals = useMemo(() => ({
    draft: rows.filter(r => r.status === 'draft').length,
    posted: rows.filter(r => r.status === 'posted').length,
  }), [rows]);

  const journalRows = () => {
    const lines = [['Entry No', 'Date', 'Reference', 'Narration', 'Debit', 'Credit', 'Status']];
    rows.forEach(r => lines.push([r.entry_no, dayjs(r.entry_date).format('DD MMM YYYY'), r.reference || '', r.narration || '', r.total_debit, r.total_credit, r.status]));
    return lines;
  };
  const exportCsv = () => downloadCsv(`journal-entries-${dayjs().format('YYYY-MM-DD')}.csv`, journalRows());
  const exportPdf = () => downloadPdf(`journal-entries-${dayjs().format('YYYY-MM-DD')}.pdf`, 'Journal Entries', journalRows());

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-blue-50 flex items-center justify-center">
              <ScrollText className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-800">Journal Entries</h1>
              <p className="text-xs text-slate-400">Manual journals with double-entry validation</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={exportCsv} disabled={rows.length === 0}
              className="flex items-center gap-1.5 px-4 py-2 text-sm border border-slate-200 rounded-md text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
            <button onClick={exportPdf} disabled={rows.length === 0}
              className="flex items-center gap-1.5 px-4 py-2 text-sm border border-slate-200 rounded-md text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              <FileDown className="w-3.5 h-3.5" /> PDF
            </button>
            <button onClick={() => setShowForm(true)} disabled={accounts.length === 0}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">
              <Plus className="w-4 h-4" /> New Journal Entry
            </button>
          </div>
        </div>
        {accounts.length === 0 && (
          <p className="text-xs text-amber-600 mt-2">Set up the Chart of Accounts before creating journal entries.</p>
        )}
      </div>

      <div className="px-6 py-5 grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Entries', value: rows.length },
          { label: 'Draft', value: totals.draft },
          { label: 'Posted', value: totals.posted },
        ].map(k => (
          <div key={k.label} className="bg-white border border-slate-200 rounded-md p-4">
            <div className="text-xs text-slate-400">{k.label}</div>
            <div className="text-2xl font-semibold text-slate-800 mt-1">{k.value}</div>
          </div>
        ))}
      </div>

      <div className="px-6 pb-10">
        <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
          {isLoading ? (
            <div className="flex justify-center py-16">
              <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-slate-400">
              <ScrollText className="w-10 h-10 opacity-20" />
              <p className="text-sm font-medium">No journal entries yet</p>
            </div>
          ) : (
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
          )}
        </div>
      </div>

      {showForm && <JEForm accounts={accounts} onClose={() => setShowForm(false)} />}
      {viewRecord && <JEDetail je={viewRecord} onClose={() => setViewRecord(null)} />}
    </div>
  );
}
