import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { FileBarChart, Plus, Save } from 'lucide-react';
import { chartOfAccountsAPI } from '../../api/client';

const GROUP_LABEL = { asset: 'Assets', liability: 'Liabilities', equity: 'Equity', income: 'Income', expense: 'Expense' };
const ACCOUNT_GROUPS = ['Assets', 'Liabilities', 'Equity', 'Income', 'Expense'];
// Debit-normal account types show their opening balance in the Debit column;
// everything else (liability/equity/income) is credit-normal.
const DEBIT_NORMAL = new Set(['asset', 'expense']);

const inr = v => (v || v === 0) ? `₹${(+v).toLocaleString('en-IN')}` : '—';

export default function OpeningBalancesPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [filter, setFilter] = useState('All');
  const [edits, setEdits] = useState({}); // code -> string value being edited

  const { data, isLoading } = useQuery({
    queryKey: ['chart-of-accounts', 'opening-balances'],
    queryFn: () => chartOfAccountsAPI.list().then(r => r.data?.data ?? []),
  });
  const accounts = data || [];

  // Reset local edits whenever fresh data loads (initial load or after save)
  useEffect(() => {
    const next = {};
    accounts.forEach(a => { next[a.code] = a.opening_balance || 0; });
    setEdits(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const rows = useMemo(() => {
    return accounts
      .map(a => ({
        ...a,
        group: GROUP_LABEL[a.account_type] || a.account_type,
        debitNormal: DEBIT_NORMAL.has(a.account_type),
        value: parseFloat(edits[a.code]) || 0,
      }))
      .filter(r => filter === 'All' || r.group === filter);
  }, [accounts, edits, filter]);

  const totalDr = rows.reduce((s, r) => s + (r.debitNormal ? r.value : 0), 0);
  const totalCr = rows.reduce((s, r) => s + (!r.debitNormal ? r.value : 0), 0);
  const balanced = Math.abs(totalDr - totalCr) < 0.01;

  const saveMut = useMutation({
    mutationFn: () => chartOfAccountsAPI.setOpeningBalances(
      accounts.map(a => ({ code: a.code, opening_balance: parseFloat(edits[a.code]) || 0 }))
    ),
    onSuccess: (res) => {
      toast.success(`Saved opening balances for ${res.data?.updated || 0} account(s)`);
      qc.invalidateQueries({ queryKey: ['chart-of-accounts'] });
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed to save'),
  });

  const setValue = (code, val) => setEdits(prev => ({ ...prev, [code]: val }));

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-blue-50 flex items-center justify-center">
              <FileBarChart className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-800">Opening Balances</h1>
              <p className="text-xs text-slate-400">Set account balances at the start of the financial year — one figure per account, in its natural debit/credit direction</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => navigate('/accounts/accountant/chart-of-accounts')}
              className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-600 text-sm rounded-md hover:bg-slate-50">
              <Plus className="w-3.5 h-3.5" /> Add Account
            </button>
            <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !balanced || isLoading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50">
              <Save className="w-3.5 h-3.5" /> {saveMut.isPending ? 'Saving…' : 'Save Balances'}
            </button>
          </div>
        </div>
      </div>

      <div className="px-6 py-4 flex gap-1 flex-wrap">
        {['All', ...ACCOUNT_GROUPS].map(g => (
          <button key={g} onClick={() => setFilter(g)}
            className={`px-3 py-1.5 text-xs rounded-md border ${filter === g ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            {g}
          </button>
        ))}
      </div>

      <div className="px-6 pb-6">
        {!balanced && (
          <div className="mb-3 bg-amber-50 border border-amber-200 rounded-md px-4 py-2.5 text-sm text-amber-700">
            Trial balance is out of balance — Debit total and Credit total must match before saving. Difference: {inr(Math.abs(totalDr - totalCr))}
          </div>
        )}
        <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
          {isLoading ? (
            <div className="flex justify-center py-16">
              <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                {['Code', 'Account Name', 'Group', 'Debit (₹)', 'Credit (₹)'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-slate-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map(r => (
                <tr key={r.code} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{r.code}</td>
                  <td className="px-4 py-2.5 font-medium text-slate-800">{r.name}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-400">{r.group}</td>
                  <td className="px-4 py-2.5 text-right">
                    {r.debitNormal ? (
                      <input type="number" step="0.01" value={edits[r.code] ?? ''}
                        onChange={e => setValue(r.code, e.target.value)}
                        className="w-32 text-right font-mono border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-200" />
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {!r.debitNormal ? (
                      <input type="number" step="0.01" value={edits[r.code] ?? ''}
                        onChange={e => setValue(r.code, e.target.value)}
                        className="w-32 text-right font-mono border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-200" />
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-300 bg-slate-50">
                <td colSpan={3} className="px-4 py-2.5 text-sm font-bold text-slate-700">Total</td>
                <td className="px-4 py-2.5 font-mono font-bold text-slate-800 text-right">{inr(totalDr)}</td>
                <td className={`px-4 py-2.5 font-mono font-bold text-right ${balanced ? 'text-emerald-700' : 'text-red-600'}`}>{inr(totalCr)}</td>
              </tr>
            </tfoot>
          </table>
          )}
          {!isLoading && rows.length === 0 && <p className="px-4 py-10 text-sm text-slate-400 text-center">No accounts found — seed or create a Chart of Accounts first</p>}
        </div>
      </div>
    </div>
  );
}
