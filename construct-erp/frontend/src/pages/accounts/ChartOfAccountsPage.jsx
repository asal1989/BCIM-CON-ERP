// src/pages/accounts/ChartOfAccountsPage.jsx
import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import { BookOpen, Plus, Search, X, Sparkles, Trash2, Pencil } from 'lucide-react';
import { chartOfAccountsAPI } from '../../api/client';
import { inr } from '../dashboards/DashKPI';

const TYPES = ['asset', 'liability', 'equity', 'income', 'expense'];

const TYPE_BADGE = {
  asset:     'bg-blue-50 text-blue-600 border-blue-100',
  liability: 'bg-amber-50 text-amber-600 border-amber-100',
  equity:    'bg-purple-50 text-purple-600 border-purple-100',
  income:    'bg-emerald-50 text-emerald-600 border-emerald-100',
  expense:   'bg-red-50 text-red-600 border-red-100',
};

const F = 'w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white';

const EMPTY = { code: '', name: '', account_type: 'asset', sub_type: '', opening_balance: '' };

function AccountModal({ initial, onClose }) {
  const qc = useQueryClient();
  const isEdit = !!initial?.id;
  const [form, setForm] = useState(isEdit ? {
    code: initial.code, name: initial.name, account_type: initial.account_type,
    sub_type: initial.sub_type || '', opening_balance: initial.opening_balance || '',
  } : { ...EMPTY });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const saveMut = useMutation({
    mutationFn: () => isEdit
      ? chartOfAccountsAPI.update(initial.id, form).then(r => r.data)
      : chartOfAccountsAPI.create(form).then(r => r.data),
    onSuccess: () => {
      toast.success(isEdit ? 'Account updated' : 'Account created');
      qc.invalidateQueries({ queryKey: ['chart-of-accounts'] });
      onClose();
    },
    onError: e => toast.error(e?.response?.data?.error || 'Save failed'),
  });

  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-md border border-slate-200 shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <p className="text-sm font-semibold text-slate-800">{isEdit ? 'Edit Account' : 'New Account'}</p>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Code</label>
              <input className={F} value={form.code} onChange={e => set('code', e.target.value)} placeholder="1000" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Account Type</label>
              <select className={F} value={form.account_type} onChange={e => set('account_type', e.target.value)}>
                {TYPES.map(t => <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Account Name</label>
            <input className={F} value={form.name} onChange={e => set('name', e.target.value)} placeholder="Cash in Hand" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Sub-Type</label>
              <input className={F} value={form.sub_type} onChange={e => set('sub_type', e.target.value)} placeholder="Current Asset" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Opening Balance (₹)</label>
              <input type="number" step="0.01" className={F} value={form.opening_balance} onChange={e => set('opening_balance', e.target.value)} />
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-slate-200 rounded-md text-slate-600 hover:bg-slate-50">Cancel</button>
          <button onClick={() => {
              if (!form.code.trim() || !form.name.trim()) return toast.error('Code and Name are required');
              saveMut.mutate();
            }}
            disabled={saveMut.isPending}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">
            {saveMut.isPending ? 'Saving…' : isEdit ? 'Update' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ChartOfAccountsPage() {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [modal, setModal] = useState(null); // null | {} | account
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['chart-of-accounts', typeFilter, search],
    queryFn: () => chartOfAccountsAPI.list({ account_type: typeFilter || undefined, search: search || undefined }).then(r => r.data),
  });
  const rows = data?.data ?? [];

  const seedMut = useMutation({
    mutationFn: () => chartOfAccountsAPI.seed().then(r => r.data),
    onSuccess: (d) => {
      toast.success(`Seeded ${d?.data?.length ?? ''} standard accounts`);
      qc.invalidateQueries({ queryKey: ['chart-of-accounts'] });
    },
    onError: e => toast.error(e?.response?.data?.error || 'Seed failed'),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => chartOfAccountsAPI.remove(id),
    onSuccess: () => {
      toast.success('Account deleted');
      qc.invalidateQueries({ queryKey: ['chart-of-accounts'] });
    },
    onError: e => toast.error(e?.response?.data?.error || 'Delete failed'),
  });

  const totals = useMemo(() => {
    const t = { asset: 0, liability: 0, equity: 0, income: 0, expense: 0 };
    rows.forEach(r => { t[r.account_type] = (t[r.account_type] || 0) + Number(r.balance || 0); });
    return t;
  }, [rows]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-blue-50 flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-800">Chart of Accounts</h1>
              <p className="text-xs text-slate-400">Ledger accounts for journal entries and reporting</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {rows.length === 0 && !isLoading && (
              <button onClick={() => seedMut.mutate()} disabled={seedMut.isPending}
                className="flex items-center gap-1.5 px-4 py-2 text-sm border border-blue-200 text-blue-600 rounded-md hover:bg-blue-50 disabled:opacity-50">
                <Sparkles className="w-4 h-4" /> {seedMut.isPending ? 'Seeding…' : 'Seed Standard COA'}
              </button>
            )}
            <button onClick={() => setModal({})}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700">
              <Plus className="w-4 h-4" /> New Account
            </button>
          </div>
        </div>
      </div>

      <div className="px-6 py-5 grid grid-cols-2 md:grid-cols-5 gap-3">
        {TYPES.map(t => (
          <div key={t} className="bg-white border border-slate-200 rounded-md p-4">
            <div className="text-xs text-slate-400 capitalize">{t}</div>
            <div className="text-xl font-semibold text-slate-800 mt-1">{inr(totals[t] || 0)}</div>
          </div>
        ))}
      </div>

      <div className="px-6 pb-3 flex flex-wrap gap-2 items-center">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input className="pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-md bg-white w-56 focus:outline-none focus:ring-2 focus:ring-blue-200"
            placeholder="Search code or name…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="border border-slate-200 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
          value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="">All Types</option>
          {TYPES.map(t => <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>)}
        </select>
        <span className="ml-auto text-xs text-slate-400">{rows.length} account{rows.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="px-6 pb-10">
        <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
          {isLoading ? (
            <div className="flex justify-center py-16">
              <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
              <BookOpen className="w-10 h-10 opacity-20" />
              <p className="text-sm font-medium">No accounts yet</p>
              <button onClick={() => seedMut.mutate()} className="text-sm text-blue-600 hover:underline">Seed the standard Chart of Accounts</button>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {['Code', 'Name', 'Type', 'Sub-Type', 'Balance', ''].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {rows.map(a => (
                  <tr key={a.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{a.code}</td>
                    <td className="px-4 py-2.5 font-medium text-slate-800">{a.name}</td>
                    <td className="px-4 py-2.5">
                      <span className={clsx('px-2 py-0.5 rounded-full text-[10px] font-medium border capitalize', TYPE_BADGE[a.account_type])}>{a.account_type}</span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 text-xs">{a.sub_type || '—'}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold text-slate-800">{inr(a.balance)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button onClick={() => setModal(a)} className="text-slate-400 hover:text-blue-600 mr-2"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => { if (window.confirm('Delete this account?')) deleteMut.mutate(a.id); }} className="text-slate-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {modal !== null && <AccountModal initial={modal.id ? modal : null} onClose={() => setModal(null)} />}
    </div>
  );
}
