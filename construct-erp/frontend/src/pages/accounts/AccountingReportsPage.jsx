// src/pages/accounts/AccountingReportsPage.jsx — Trial Balance, P&L, Balance Sheet from Chart of Accounts
import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { BarChart3, Scale, FileBarChart, Download } from 'lucide-react';
import { chartOfAccountsAPI } from '../../api/client';
import { inr } from '../dashboards/DashKPI';
import { downloadCsv } from '../../utils/exportCsv';
import dayjs from 'dayjs';

const TABS = [
  { key: 'trial-balance', label: 'Trial Balance', icon: Scale },
  { key: 'pnl', label: 'Profit & Loss', icon: BarChart3 },
  { key: 'balance-sheet', label: 'Balance Sheet', icon: FileBarChart },
];

const DEBIT_TYPES = ['asset', 'expense'];

function Section({ title, rows, total, totalLabel }) {
  return (
    <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
      <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</p>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-slate-400 text-center">No accounts</p>
      ) : (
        <table className="w-full text-sm">
          <tbody className="divide-y divide-slate-50">
            {rows.map(r => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="px-4 py-2 text-slate-600 text-xs font-mono">{r.code}</td>
                <td className="px-4 py-2 text-slate-800">{r.name}</td>
                <td className="px-4 py-2 text-right font-mono">{inr(Math.abs(Number(r.balance || 0)))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-100 bg-slate-50">
        <span className="text-sm font-semibold text-slate-800">{totalLabel}</span>
        <span className="text-sm font-mono font-semibold text-slate-800">{inr(Math.abs(total))}</span>
      </div>
    </div>
  );
}

export default function AccountingReportsPage() {
  const [tab, setTab] = useState('trial-balance');

  const { data, isLoading } = useQuery({
    queryKey: ['chart-of-accounts', 'reports'],
    queryFn: () => chartOfAccountsAPI.list().then(r => r.data),
  });
  const rows = (data?.data ?? []).filter(a => a.is_active !== false);

  const byType = useMemo(() => {
    const g = { asset: [], liability: [], equity: [], income: [], expense: [] };
    rows.forEach(a => { (g[a.account_type] ||= []).push(a); });
    return g;
  }, [rows]);

  const sum = (list) => list.reduce((s, r) => s + Number(r.balance || 0), 0);

  const totalIncome = sum(byType.income);     // negative balance for income accounts
  const totalExpense = sum(byType.expense);
  const netProfit = Math.abs(totalIncome) - Math.abs(totalExpense);

  const totalAssets = sum(byType.asset);
  const totalLiabilities = sum(byType.liability);
  const totalEquity = sum(byType.equity);
  const retainedEarnings = netProfit;

  const trialDebit = sum(byType.asset) + sum(byType.expense);
  const trialCredit = -(sum(byType.liability) + sum(byType.equity) + sum(byType.income));

  const exportReport = () => {
    const stamp = dayjs().format('YYYY-MM-DD');
    if (tab === 'trial-balance') {
      const lines = [['Code', 'Name', 'Type', 'Amount']];
      [...byType.asset, ...byType.expense].forEach(r => lines.push([r.code, r.name, 'Debit', Math.abs(Number(r.balance || 0))]));
      [...byType.liability, ...byType.equity, ...byType.income].forEach(r => lines.push([r.code, r.name, 'Credit', Math.abs(Number(r.balance || 0))]));
      lines.push(['', 'Total Debit', '', trialDebit]);
      lines.push(['', 'Total Credit', '', Math.abs(trialCredit)]);
      downloadCsv(`trial-balance-${stamp}.csv`, lines);
    } else if (tab === 'pnl') {
      const lines = [['Code', 'Name', 'Section', 'Amount']];
      byType.income.forEach(r => lines.push([r.code, r.name, 'Income', Math.abs(Number(r.balance || 0))]));
      byType.expense.forEach(r => lines.push([r.code, r.name, 'Expense', Math.abs(Number(r.balance || 0))]));
      lines.push(['', netProfit >= 0 ? 'Net Profit' : 'Net Loss', '', Math.abs(netProfit)]);
      downloadCsv(`profit-and-loss-${stamp}.csv`, lines);
    } else {
      const lines = [['Code', 'Name', 'Section', 'Amount']];
      byType.asset.forEach(r => lines.push([r.code, r.name, 'Asset', Math.abs(Number(r.balance || 0))]));
      byType.liability.forEach(r => lines.push([r.code, r.name, 'Liability', Math.abs(Number(r.balance || 0))]));
      byType.equity.forEach(r => lines.push([r.code, r.name, 'Equity', Math.abs(Number(r.balance || 0))]));
      lines.push(['', 'Retained Earnings (Net Profit/Loss)', 'Equity', Math.abs(retainedEarnings)]);
      lines.push(['', 'Total Assets', '', Math.abs(totalAssets)]);
      lines.push(['', 'Total Liabilities + Equity', '', Math.abs(totalLiabilities) + Math.abs(totalEquity) + Math.abs(retainedEarnings)]);
      downloadCsv(`balance-sheet-${stamp}.csv`, lines);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-blue-50 flex items-center justify-center">
              <FileBarChart className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-800">Financial Reports</h1>
              <p className="text-xs text-slate-400">Trial Balance, Profit &amp; Loss and Balance Sheet from posted journal entries</p>
            </div>
          </div>
          <button onClick={exportReport}
            className="flex items-center gap-1.5 px-4 py-2 text-sm border border-slate-200 rounded-md text-slate-700 hover:bg-slate-50">
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
        </div>
      </div>

      <div className="px-6 pt-4">
        <div className="flex gap-1 border-b border-slate-200">
          {TABS.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={clsx('flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px',
                  tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700')}>
                <Icon className="w-3.5 h-3.5" /> {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-6 py-5">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : tab === 'trial-balance' ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Section title="Debit Balances (Assets &amp; Expenses)" rows={[...byType.asset, ...byType.expense]} total={trialDebit} totalLabel="Total Debit" />
            <Section title="Credit Balances (Liabilities, Equity &amp; Income)" rows={[...byType.liability, ...byType.equity, ...byType.income]} total={trialCredit} totalLabel="Total Credit" />
            <div className={clsx('lg:col-span-2 rounded-md border p-4 flex items-center justify-between',
              Math.abs(trialDebit - trialCredit) < 0.01 ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100')}>
              <span className="text-sm font-medium text-slate-700">
                {Math.abs(trialDebit - trialCredit) < 0.01 ? 'Trial balance is balanced ✓' : 'Trial balance is out of balance'}
              </span>
              <span className="text-sm font-mono font-semibold text-slate-800">
                Dr {inr(trialDebit)} &nbsp;|&nbsp; Cr {inr(trialCredit)}
              </span>
            </div>
          </div>
        ) : tab === 'pnl' ? (
          <div className="space-y-4 max-w-3xl">
            <Section title="Income" rows={byType.income} total={totalIncome} totalLabel="Total Income" />
            <Section title="Expenses" rows={byType.expense} total={totalExpense} totalLabel="Total Expenses" />
            <div className={clsx('rounded-md border p-4 flex items-center justify-between',
              netProfit >= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100')}>
              <span className="text-sm font-semibold text-slate-800">{netProfit >= 0 ? 'Net Profit' : 'Net Loss'}</span>
              <span className="text-lg font-mono font-bold text-slate-800">{inr(Math.abs(netProfit))}</span>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Section title="Assets" rows={byType.asset} total={totalAssets} totalLabel="Total Assets" />
            <div className="space-y-4">
              <Section title="Liabilities" rows={byType.liability} total={totalLiabilities} totalLabel="Total Liabilities" />
              <Section title="Equity" rows={[...byType.equity, { id: 'retained', code: '', name: 'Retained Earnings (Net Profit/Loss)', balance: retainedEarnings }]}
                total={Math.abs(totalEquity) + Math.abs(retainedEarnings)} totalLabel="Total Equity" />
            </div>
            <div className={clsx('lg:col-span-2 rounded-md border p-4 flex items-center justify-between',
              Math.abs(Math.abs(totalAssets) - (Math.abs(totalLiabilities) + Math.abs(totalEquity) + Math.abs(retainedEarnings))) < 0.01
                ? 'bg-emerald-50 border-emerald-100' : 'bg-amber-50 border-amber-100')}>
              <span className="text-sm font-medium text-slate-700">Assets = Liabilities + Equity</span>
              <span className="text-sm font-mono font-semibold text-slate-800">
                {inr(Math.abs(totalAssets))} = {inr(Math.abs(totalLiabilities) + Math.abs(totalEquity) + Math.abs(retainedEarnings))}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
