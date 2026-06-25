// src/pages/accounts/ChartOfAccountsPage.jsx
import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import {
  BookOpen, Plus, Search, X, Sparkles, Trash2, Pencil,
  ChevronDown, ChevronRight, Scale,
  Wallet, Landmark, PiggyBank, ArrowDownLeft, ArrowUpRight,
  ListTree, Table2, BarChart3,
} from 'lucide-react';
import { chartOfAccountsAPI, projectAPI } from '../../api/client';
import { inr } from '../dashboards/DashKPI';

const TYPES = ['asset', 'liability', 'equity', 'income', 'expense'];

// Display metadata per account type. `nature` = the side that increases the account.
const TYPE_META = {
  asset:     { label: 'Assets',      nature: 'Dr', icon: Wallet,        badge: 'bg-blue-50 text-blue-600 border-blue-100',         bar: 'bg-blue-500',    dot: 'bg-blue-500',    text: 'text-blue-600',    soft: 'bg-blue-50',    ring: 'ring-blue-100',    topbar: 'before:bg-blue-500' },
  liability: { label: 'Liabilities', nature: 'Cr', icon: Landmark,      badge: 'bg-amber-50 text-amber-600 border-amber-100',       bar: 'bg-amber-500',   dot: 'bg-amber-500',   text: 'text-amber-600',   soft: 'bg-amber-50',   ring: 'ring-amber-100',   topbar: 'before:bg-amber-500' },
  equity:    { label: 'Equity',      nature: 'Cr', icon: PiggyBank,     badge: 'bg-purple-50 text-purple-600 border-purple-100',    bar: 'bg-purple-500',  dot: 'bg-purple-500',  text: 'text-purple-600',  soft: 'bg-purple-50',  ring: 'ring-purple-100',  topbar: 'before:bg-purple-500' },
  income:    { label: 'Income',      nature: 'Cr', icon: ArrowDownLeft, badge: 'bg-emerald-50 text-emerald-600 border-emerald-100', bar: 'bg-emerald-500', dot: 'bg-emerald-500', text: 'text-emerald-600', soft: 'bg-emerald-50', ring: 'ring-emerald-100', topbar: 'before:bg-emerald-500' },
  expense:   { label: 'Expenses',    nature: 'Dr', icon: ArrowUpRight,  badge: 'bg-red-50 text-red-600 border-red-100',             bar: 'bg-red-500',     dot: 'bg-red-500',     text: 'text-red-600',     soft: 'bg-red-50',     ring: 'ring-red-100',     topbar: 'before:bg-red-500' },
};

const F = 'w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white';
const EMPTY = { code: '', name: '', account_type: 'asset', sub_type: '', opening_balance: '' };

// Show a signed natural balance as |amount| + Dr/Cr nature.
function balanceParts(account) {
  const bal = Number(account.balance || 0);
  const natural = TYPE_META[account.account_type]?.nature || 'Dr';
  const side = bal >= 0 ? natural : (natural === 'Dr' ? 'Cr' : 'Dr');
  return { amount: Math.abs(bal), side };
}

/* ── Create / Edit modal ─────────────────────────────────────────────────── */
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
      <div className="bg-white w-full max-w-md rounded-xl border border-slate-200 shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <p className="text-sm font-semibold text-slate-800">{isEdit ? 'Edit Account' : 'New Account'}</p>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Code</label>
              <input className={clsx(F, 'font-mono')} value={form.code} onChange={e => set('code', e.target.value)} placeholder="1000" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Account Type</label>
              <select className={F} value={form.account_type} onChange={e => set('account_type', e.target.value)}>
                {TYPES.map(t => <option key={t} value={t}>{TYPE_META[t].label}</option>)}
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
          <p className="text-[11px] text-slate-400">
            {TYPE_META[form.account_type]?.nature === 'Dr'
              ? 'Debit-natured: increases with debits (assets & expenses).'
              : 'Credit-natured: increases with credits (liabilities, equity & income).'}
          </p>
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

/* ── Ledger drill-down drawer ────────────────────────────────────────────── */
function LedgerDrawer({ account, projectId, onClose }) {
  const meta = TYPE_META[account.account_type];
  const { data, isLoading } = useQuery({
    queryKey: ['coa-txns', account.id, projectId],
    queryFn: () => chartOfAccountsAPI.transactions(account.id, { project_id: projectId || undefined }).then(r => r.data?.data),
  });
  const txns = data?.transactions ?? [];

  return (
    <div className="fixed inset-0 z-[65] flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm text-slate-500">{account.code}</span>
              <span className={clsx('px-2 py-0.5 rounded-full text-[10px] font-medium border', meta.badge)}>{meta.label}</span>
            </div>
            <h2 className="text-lg font-semibold text-slate-800 mt-1">{account.name}</h2>
            {account.sub_type && <p className="text-xs text-slate-400">{account.sub_type}</p>}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
        </div>

        {/* Balance summary */}
        <div className="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100">
          {[
            ['Opening', data?.opening_balance],
            ['Movements', txns.length, true],
            ['Closing', data?.closing_balance],
          ].map(([label, val, isCount]) => (
            <div key={label} className="px-6 py-3">
              <p className="text-[10px] uppercase tracking-wide text-slate-400">{label}</p>
              <p className="text-sm font-semibold font-mono text-slate-800 mt-0.5">
                {isCount ? `${val} ${val === 1 ? 'entry' : 'entries'}` : `₹${inr(val || 0)}`}
              </p>
            </div>
          ))}
        </div>

        {/* Ledger table */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" /></div>
          ) : txns.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-2">
              <BookOpen className="w-9 h-9 opacity-20" />
              <p className="text-sm">No posted transactions{projectId ? ' for this project' : ''}.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 border-b border-slate-100">
                <tr className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                  <th className="px-4 py-2.5 text-left">Date</th>
                  <th className="px-4 py-2.5 text-left">Entry / Narration</th>
                  <th className="px-3 py-2.5 text-right">Debit</th>
                  <th className="px-3 py-2.5 text-right">Credit</th>
                  <th className="px-4 py-2.5 text-right">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {txns.map(t => (
                  <tr key={t.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{t.entry_date ? new Date(t.entry_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'}</td>
                    <td className="px-4 py-2.5">
                      <div className="font-mono text-[11px] text-slate-400">{t.entry_no}</div>
                      <div className="text-slate-700 text-xs">{t.description || t.narration || '—'}</div>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-slate-700">{Number(t.debit) ? inr(t.debit) : '—'}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-slate-700">{Number(t.credit) ? inr(t.credit) : '—'}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold text-slate-800">{inr(t.running_balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Balance cell ────────────────────────────────────────────────────────── */
function BalanceCell({ a }) {
  const { amount, side } = balanceParts(a);
  if (!Number(a.balance)) return <span className="font-mono text-xs text-slate-300">—</span>;
  return (
    <span className={clsx('font-mono font-semibold', side === 'Dr' ? 'text-blue-600' : 'text-emerald-600')}>
      ₹{inr(amount)} <span className="text-[10px] font-medium opacity-70">{side}</span>
    </span>
  );
}

/* ── Account row (used in both grouped & flat tables) ────────────────────── */
function AccountRow({ a, indent, onOpen, onEdit, onDelete }) {
  const m = TYPE_META[a.account_type];
  return (
    <tr className="group hover:bg-slate-50 border-b border-slate-50 last:border-0">
      <td className="w-1.5 p-0"><div className={clsx('w-1 h-9 mx-auto rounded-full opacity-30', m.bar)} /></td>
      <td className={clsx('pr-4 py-2.5 font-mono text-xs text-slate-500', indent ? 'pl-8' : 'pl-4')}>{a.code}</td>
      <td className="px-4 py-2.5">
        <button onClick={() => onOpen(a)} className="font-medium text-slate-800 hover:text-blue-600 text-left">{a.name}</button>
      </td>
      <td className="px-4 py-2.5">
        <span className={clsx('inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold border', m.badge)}>{m.label}</span>
      </td>
      <td className="px-4 py-2.5 text-slate-500 text-xs">{a.sub_type || '—'}</td>
      <td className="px-4 py-2.5 text-right whitespace-nowrap">
        <button onClick={() => onOpen(a)} className="hover:opacity-80"><BalanceCell a={a} /></button>
      </td>
      <td className="px-4 py-2.5 text-center">
        <span className="font-mono text-[11px] text-slate-400">{m.nature}</span>
      </td>
      <td className="px-4 py-2.5 text-right whitespace-nowrap">
        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => onOpen(a)} title="View Ledger"
            className="w-7 h-7 rounded-md border border-slate-200 text-slate-400 hover:text-blue-600 hover:border-blue-200 flex items-center justify-center">
            <BarChart3 className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => onEdit(a)} title="Edit"
            className="w-7 h-7 rounded-md border border-slate-200 text-slate-400 hover:text-blue-600 hover:border-blue-200 flex items-center justify-center">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => onDelete(a)} title="Delete"
            className="w-7 h-7 rounded-md border border-slate-200 text-slate-400 hover:text-red-600 hover:border-red-200 flex items-center justify-center">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

/* ── Opening Balances bulk-edit modal ────────────────────────────────────── */
function OpeningBalancesModal({ accounts, onClose }) {
  const qc = useQueryClient();
  const [vals, setVals] = useState(() => {
    const m = {};
    accounts.forEach(a => { m[a.code] = a.opening_balance != null ? String(a.opening_balance) : ''; });
    return m;
  });

  const saveMut = useMutation({
    mutationFn: () => {
      const balances = Object.entries(vals)
        .filter(([, v]) => v !== '' && !isNaN(parseFloat(v)))
        .map(([code, v]) => ({ code, opening_balance: parseFloat(v) }));
      return chartOfAccountsAPI.setOpeningBalances(balances).then(r => r.data);
    },
    onSuccess: d => {
      toast.success(`Updated opening balances for ${d.updated} account(s)`);
      qc.invalidateQueries({ queryKey: ['chart-of-accounts'] });
      onClose();
    },
    onError: e => toast.error(e?.response?.data?.error || 'Save failed'),
  });

  const byType = useMemo(() => {
    const m = {};
    accounts.forEach(a => { (m[a.account_type] = m[a.account_type] || []).push(a); });
    return m;
  }, [accounts]);

  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-2xl rounded-xl border border-slate-200 shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <p className="text-sm font-semibold text-slate-800">Set Opening Balances</p>
            <p className="text-xs text-slate-400 mt-0.5">Enter your trial balance figures as of your accounting start date</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
        </div>
        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          {TYPES.filter(t => byType[t]?.length).map(t => {
            const m = TYPE_META[t];
            return (
              <div key={t}>
                <p className={clsx('text-xs font-semibold uppercase tracking-wide mb-2', m.text)}>{m.label} — {m.nature}-natured</p>
                <div className="grid grid-cols-1 gap-1.5">
                  {(byType[t] || []).map(a => (
                    <div key={a.code} className="flex items-center gap-3">
                      <span className="font-mono text-xs text-slate-400 w-12 shrink-0">{a.code}</span>
                      <span className="text-sm text-slate-700 flex-1 truncate">{a.name}</span>
                      <input
                        type="number" step="0.01" placeholder="0.00"
                        className="w-36 border border-slate-200 rounded px-2 py-1 text-sm text-right font-mono focus:outline-none focus:ring-2 focus:ring-blue-200"
                        value={vals[a.code] ?? ''}
                        onChange={e => setVals(v => ({ ...v, [a.code]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-between px-5 py-4 border-t border-slate-100 bg-slate-50/60">
          <p className="text-xs text-slate-400">Blank fields are skipped. Enter Dr-side amounts as positive, Cr-side as negative if contra.</p>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm border border-slate-200 rounded-md text-slate-600 hover:bg-slate-50">Cancel</button>
            <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">
              {saveMut.isPending ? 'Saving…' : 'Save Opening Balances'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Sidebar filter item ─────────────────────────────────────────────────── */
function FilterItem({ active, dot, label, count, onClick }) {
  return (
    <button onClick={onClick}
      className={clsx('w-full flex items-center justify-between px-2.5 py-2 rounded-md text-sm transition-colors',
        active ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-600 hover:bg-slate-100')}>
      <span className="flex items-center gap-2 truncate">
        {dot && <span className={clsx('w-2 h-2 rounded-full shrink-0', dot)} />}
        <span className="truncate">{label}</span>
      </span>
      {count != null && (
        <span className={clsx('text-[11px] rounded-full px-1.5 py-0.5', active ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-400')}>{count}</span>
      )}
    </button>
  );
}

/* ── Main page ───────────────────────────────────────────────────────────── */
export default function ChartOfAccountsPage() {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');        // '' = all
  const [normalFilter, setNormalFilter] = useState('all'); // all | dr | cr
  const [subFilter, setSubFilter] = useState('');          // sub-type
  const [projectFilter, setProjectFilter] = useState('');
  const [view, setView] = useState('grouped');             // grouped | flat
  const [modal, setModal] = useState(null);     // null | {} | account
  const [drill, setDrill] = useState(null);      // account being viewed
  const [collapsed, setCollapsed] = useState({}); // { [type]: true }
  const [obModal, setObModal] = useState(false);  // opening balances
  const qc = useQueryClient();

  const { data: projects = [] } = useQuery({
    queryKey: ['coa-projects'],
    queryFn: () => projectAPI.list().then(r => r.data?.data ?? r.data ?? []),
    staleTime: 5 * 60 * 1000,
  });

  // Fetch ALL accounts (no type filter) so sidebar counts stay accurate; type
  // filtering is applied client-side.
  const { data, isLoading } = useQuery({
    queryKey: ['chart-of-accounts', search, projectFilter],
    queryFn: () => chartOfAccountsAPI.list({ search: search || undefined, project_id: projectFilter || undefined }).then(r => r.data),
  });
  const allRows = data?.data ?? [];

  const seedMut = useMutation({
    mutationFn: () => chartOfAccountsAPI.seed().then(r => r.data),
    onSuccess: (d) => { toast.success(`Seeded ${d?.data?.length ?? ''} standard accounts`); qc.invalidateQueries({ queryKey: ['chart-of-accounts'] }); },
    onError: e => toast.error(e?.response?.data?.error || 'Seed failed'),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => chartOfAccountsAPI.remove(id),
    onSuccess: () => { toast.success('Account deleted'); qc.invalidateQueries({ queryKey: ['chart-of-accounts'] }); },
    onError: e => toast.error(e?.response?.data?.error || 'Delete failed'),
  });

  // Totals / counts per type from the full set (drives sidebar + summary cards)
  const totals = useMemo(() => {
    const t = { asset: 0, liability: 0, equity: 0, income: 0, expense: 0 };
    allRows.forEach(r => { t[r.account_type] = (t[r.account_type] || 0) + Number(r.balance || 0); });
    return t;
  }, [allRows]);

  const counts = useMemo(() => {
    const c = { asset: 0, liability: 0, equity: 0, income: 0, expense: 0 };
    allRows.forEach(r => { c[r.account_type] = (c[r.account_type] || 0) + 1; });
    return c;
  }, [allRows]);

  // Distinct sub-types for the sub-group dropdown
  const subTypes = useMemo(() => {
    const s = new Set();
    allRows.forEach(r => s.add(r.sub_type || 'Other'));
    return [...s].sort();
  }, [allRows]);

  const netIncome = (totals.income || 0) - (totals.expense || 0);
  const lhs = totals.asset || 0;
  const rhs = (totals.liability || 0) + (totals.equity || 0) + netIncome;
  const diff = lhs - rhs;
  const balanced = Math.abs(diff) < 1;
  const typesPresent = TYPES.filter(t => counts[t] > 0).length;

  // Apply client-side filters (type / normal-side / sub-group) to get displayed rows
  const displayed = useMemo(() => {
    return allRows.filter(r => {
      if (typeFilter && r.account_type !== typeFilter) return false;
      if (normalFilter !== 'all' && (TYPE_META[r.account_type]?.nature || 'Dr').toLowerCase() !== normalFilter) return false;
      if (subFilter && (r.sub_type || 'Other') !== subFilter) return false;
      return true;
    });
  }, [allRows, typeFilter, normalFilter, subFilter]);

  // Group displayed rows by type → sub_type
  const grouped = useMemo(() => {
    return TYPES
      .map(type => {
        const accts = displayed.filter(r => r.account_type === type);
        if (!accts.length) return null;
        const subMap = {};
        accts.forEach(a => {
          const k = a.sub_type || 'Other';
          (subMap[k] = subMap[k] || []).push(a);
        });
        const subGroups = Object.entries(subMap)
          .map(([sub, items]) => ({ sub, items, subtotal: items.reduce((s, a) => s + Number(a.balance || 0), 0) }))
          .sort((a, b) => a.sub.localeCompare(b.sub));
        const total = accts.reduce((s, a) => s + Number(a.balance || 0), 0);
        return { type, accts, subGroups, total, count: accts.length };
      })
      .filter(Boolean);
  }, [displayed]);

  const flatSorted = useMemo(
    () => [...displayed].sort((a, b) => String(a.code).localeCompare(String(b.code), undefined, { numeric: true })),
    [displayed]
  );

  const allCollapsed = grouped.length > 0 && grouped.every(g => collapsed[g.type]);
  const toggleAll = () => {
    if (allCollapsed) setCollapsed({});
    else setCollapsed(Object.fromEntries(TYPES.map(t => [t, true])));
  };

  const rowActions = {
    onOpen: setDrill,
    onEdit: setModal,
    onDelete: (acc) => { if (window.confirm(`Delete account ${acc.code} — ${acc.name}?`)) deleteMut.mutate(acc.id); },
  };

  const TH = ({ children, className }) => (
    <th className={clsx('px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 whitespace-nowrap', className)}>{children}</th>
  );

  return (
    <div className="flex min-h-screen bg-slate-50">

      {/* ── FILTER SIDEBAR ─────────────────────────────────────────────── */}
      <aside className="w-60 shrink-0 bg-white border-r border-slate-200 sticky top-0 self-start max-h-screen overflow-y-auto py-5 hidden lg:block">
        <div className="px-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 px-1 mb-2">Filter by Type</p>
          <div className="space-y-0.5">
            <FilterItem active={!typeFilter} dot="bg-blue-400" label="All Accounts" count={allRows.length} onClick={() => setTypeFilter('')} />
            {TYPES.map(t => (
              <FilterItem key={t} active={typeFilter === t} dot={TYPE_META[t].dot} label={TYPE_META[t].label}
                count={counts[t] || 0} onClick={() => setTypeFilter(typeFilter === t ? '' : t)} />
            ))}
          </div>
        </div>

        <div className="h-px bg-slate-100 my-4 mx-4" />

        <div className="px-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 px-1 mb-2">Projects</p>
          <div className="space-y-0.5">
            <FilterItem active={!projectFilter} label="All Projects" onClick={() => setProjectFilter('')} />
            {projects.map(p => (
              <FilterItem key={p.id} active={projectFilter === p.id}
                label={`${p.project_code ? p.project_code + ' — ' : ''}${p.name}`}
                onClick={() => setProjectFilter(projectFilter === p.id ? '' : p.id)} />
            ))}
          </div>
        </div>

        <div className="h-px bg-slate-100 my-4 mx-4" />

        {/* KPI mini stack */}
        <div className="px-4 space-y-2">
          <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wide text-slate-400">Total Accounts</p>
            <p className="text-xl font-bold text-blue-600 leading-none mt-1">{allRows.length}</p>
            <p className="text-[11px] text-slate-400 mt-1">Across {typesPresent} categor{typesPresent === 1 ? 'y' : 'ies'}</p>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wide text-slate-400">Accounting Equation</p>
            <p className={clsx('text-sm font-bold leading-none mt-1.5', balanced ? 'text-emerald-600' : 'text-amber-600')}>
              {balanced ? 'Balanced' : `Off by ₹${inr(Math.abs(diff))}`}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">A = L + E + Net Income</p>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wide text-slate-400">Net Income (YTD)</p>
            <p className={clsx('text-sm font-bold font-mono leading-none mt-1.5', netIncome >= 0 ? 'text-emerald-600' : 'text-red-600')}>₹{inr(netIncome)}</p>
            <p className="text-[11px] text-slate-400 mt-1">Income − Expense</p>
          </div>
        </div>
      </aside>

      {/* ── MAIN ───────────────────────────────────────────────────────── */}
      <main className="flex-1 min-w-0 px-6 py-5 space-y-5">

        {/* Page header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800 tracking-tight">Chart of Accounts</h1>
              <p className="text-xs text-slate-400">Structured account hierarchy — Indian GAAP · GST-compliant</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {allRows.length === 0 && !isLoading && (
              <button onClick={() => seedMut.mutate()} disabled={seedMut.isPending}
                className="flex items-center gap-1.5 px-4 py-2 text-sm border border-blue-200 text-blue-600 rounded-md hover:bg-blue-50 disabled:opacity-50">
                <Sparkles className="w-4 h-4" /> {seedMut.isPending ? 'Seeding…' : 'Seed Standard COA'}
              </button>
            )}
            {allRows.length > 0 && (
              <button onClick={() => setObModal(true)}
                className="flex items-center gap-1.5 px-4 py-2 text-sm border border-slate-200 text-slate-600 rounded-md hover:bg-slate-50">
                <Scale className="w-4 h-4" /> Opening Balances
              </button>
            )}
            <button onClick={() => setModal({})}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700">
              <Plus className="w-4 h-4" /> New Account
            </button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {TYPES.map(t => {
            const m = TYPE_META[t];
            const Icon = m.icon;
            return (
              <button key={t} onClick={() => setTypeFilter(typeFilter === t ? '' : t)}
                className={clsx(
                  'relative bg-white border rounded-xl p-4 text-left transition-all hover:shadow-sm overflow-hidden',
                  "before:content-[''] before:absolute before:top-0 before:left-0 before:right-0 before:h-[3px]", m.topbar,
                  typeFilter === t ? clsx('border-transparent ring-2', m.ring) : 'border-slate-200')}>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{m.label}</span>
                  <Icon className={clsx('w-4 h-4', m.text)} />
                </div>
                <div className={clsx('text-xl font-bold mt-2 font-mono tracking-tight', m.text)}>₹{inr(totals[t] || 0)}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">{counts[t] || 0} account{counts[t] !== 1 ? 's' : ''} · {m.nature} normal</div>
              </button>
            );
          })}
        </div>

        {/* Toolbar */}
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-md bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
              placeholder="Search by name or code…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="w-px h-7 bg-slate-200" />
          <select className="border border-slate-200 rounded-md px-3 py-2 text-sm bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-200"
            value={normalFilter} onChange={e => setNormalFilter(e.target.value)}>
            <option value="all">All Normal Bal.</option>
            <option value="dr">Debit Normal</option>
            <option value="cr">Credit Normal</option>
          </select>
          <select className="border border-slate-200 rounded-md px-3 py-2 text-sm bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-200"
            value={subFilter} onChange={e => setSubFilter(e.target.value)}>
            <option value="">All Sub-groups</option>
            {subTypes.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          <div className="ml-auto flex items-center gap-2">
            <div className="flex bg-slate-100 rounded-md p-0.5 border border-slate-200">
              <button onClick={() => setView('grouped')} title="Grouped"
                className={clsx('px-2 py-1 rounded flex items-center gap-1 text-xs', view === 'grouped' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400')}>
                <ListTree className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => setView('flat')} title="Flat table"
                className={clsx('px-2 py-1 rounded flex items-center gap-1 text-xs', view === 'flat' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400')}>
                <Table2 className="w-3.5 h-3.5" />
              </button>
            </div>
            {view === 'grouped' && grouped.length > 0 && (
              <button onClick={toggleAll} className="text-xs text-slate-500 hover:text-blue-600 border border-slate-200 rounded-md px-2.5 py-2">
                {allCollapsed ? 'Expand all' : 'Collapse all'}
              </button>
            )}
          </div>
        </div>

        {projectFilter && (
          <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-100 rounded-md px-3 py-1.5 inline-block">
            Project view — balances reflect only this project's posted entries; company-wide opening balances are excluded.
          </p>
        )}

        {/* Table */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {isLoading ? (
            <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" /></div>
          ) : allRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
              <BookOpen className="w-10 h-10 opacity-20" />
              <p className="text-sm font-medium">No accounts {search ? 'match your search' : 'yet'}</p>
              {!search && <button onClick={() => seedMut.mutate()} className="text-sm text-blue-600 hover:underline">Seed the standard Chart of Accounts</button>}
            </div>
          ) : displayed.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-slate-400">
              <Search className="w-8 h-8 opacity-20" />
              <p className="text-sm">No accounts match the current filters.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="w-1.5 p-0" />
                  <TH>Code</TH>
                  <TH>Account Name</TH>
                  <TH>Type</TH>
                  <TH>Sub-group</TH>
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">Balance (₹)</th>
                  <th className="px-4 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-400">Normal</th>
                  <th className="w-24" />
                </tr>
              </thead>
              <tbody>
                {view === 'flat'
                  ? flatSorted.map(a => <AccountRow key={a.id} a={a} {...rowActions} />)
                  : grouped.map(g => {
                      const m = TYPE_META[g.type];
                      const Icon = m.icon;
                      const isCollapsed = collapsed[g.type];
                      return (
                        <React.Fragment key={g.type}>
                          {/* Group header */}
                          <tr className="bg-slate-50/80 border-y border-slate-200">
                            <td className="w-1.5 p-0"><div className={clsx('w-1 h-full min-h-[40px] mx-auto rounded-full', m.bar)} /></td>
                            <td colSpan={7} className="px-4 py-2.5">
                              <button onClick={() => setCollapsed(c => ({ ...c, [g.type]: !c[g.type] }))}
                                className="w-full flex items-center gap-2.5">
                                {isCollapsed ? <ChevronRight className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                                <Icon className={clsx('w-4 h-4', m.text)} />
                                <span className={clsx('font-semibold text-sm', m.text)}>{m.label}</span>
                                <span className="text-[11px] text-slate-400">{g.count} account{g.count !== 1 ? 's' : ''}</span>
                                <span className="ml-auto font-mono font-semibold text-slate-700">₹{inr(g.total)}</span>
                                <span className="text-[10px] font-medium text-slate-400 w-6 text-right">{m.nature}</span>
                              </button>
                            </td>
                          </tr>
                          {!isCollapsed && g.subGroups.map(sg => (
                            <React.Fragment key={sg.sub}>
                              {/* Sub-group label (only when more than one sub-group) */}
                              {g.subGroups.length > 1 && (
                                <tr className="bg-slate-50/40">
                                  <td className="w-1.5 p-0" />
                                  <td colSpan={4} className="pl-8 pr-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{sg.sub}</td>
                                  <td className="px-4 py-1.5 text-right font-mono text-[11px] text-slate-400">₹{inr(sg.subtotal)}</td>
                                  <td colSpan={2} />
                                </tr>
                              )}
                              {sg.items.map(a => (
                                <AccountRow key={a.id} a={a} indent={g.subGroups.length > 1} {...rowActions} />
                              ))}
                            </React.Fragment>
                          ))}
                        </React.Fragment>
                      );
                    })}
              </tbody>
            </table>
          )}

          {/* Footer */}
          {displayed.length > 0 && (
            <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-200 bg-slate-50/60">
              <span className="text-xs text-slate-400">
                Showing {displayed.length} of {allRows.length} account{allRows.length !== 1 ? 's' : ''}
                {(typeFilter || normalFilter !== 'all' || subFilter) && ' · filtered'}
              </span>
              {(typeFilter || normalFilter !== 'all' || subFilter) && (
                <button onClick={() => { setTypeFilter(''); setNormalFilter('all'); setSubFilter(''); }}
                  className="text-xs text-blue-600 hover:underline">Clear filters</button>
              )}
            </div>
          )}
        </div>
      </main>

      {modal !== null && <AccountModal initial={modal.id ? modal : null} onClose={() => setModal(null)} />}
      {drill && <LedgerDrawer account={drill} projectId={projectFilter} onClose={() => setDrill(null)} />}
      {obModal && <OpeningBalancesModal accounts={allRows} onClose={() => setObModal(false)} />}
    </div>
  );
}
