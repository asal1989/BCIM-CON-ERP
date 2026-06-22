import React, { useState } from 'react';
import { FileBarChart, Plus, Save } from 'lucide-react';

const ACCOUNT_GROUPS = ['Assets', 'Liabilities', 'Equity', 'Income', 'Expense'];

const SAMPLE = [
  { id: 1, account: 'Cash in Hand', code: '1001', group: 'Assets',       debit: 85000,   credit: 0 },
  { id: 2, account: 'HDFC Current Account', code: '1002', group: 'Assets', debit: 1250000, credit: 0 },
  { id: 3, account: 'Sundry Debtors',  code: '1101', group: 'Assets',    debit: 3200000, credit: 0 },
  { id: 4, account: 'Sundry Creditors',code: '2001', group: 'Liabilities',debit: 0,       credit: 1800000 },
  { id: 5, account: 'TDS Payable',     code: '2101', group: 'Liabilities',debit: 0,       credit: 145000 },
  { id: 6, account: 'Capital Account', code: '3001', group: 'Equity',    debit: 0,       credit: 2590000 },
];

const inr = v => v ? `₹${(+v).toLocaleString('en-IN')}` : '—';

export default function OpeningBalancesPage() {
  const [filter, setFilter] = useState('All');
  const rows = filter === 'All' ? SAMPLE : SAMPLE.filter(r => r.group === filter);
  const totalDr = rows.reduce((s, r) => s + r.debit, 0);
  const totalCr = rows.reduce((s, r) => s + r.credit, 0);
  const balanced = totalDr === totalCr;

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
              <p className="text-xs text-slate-400">Set account balances at the start of the financial year</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-600 text-sm rounded-md hover:bg-slate-50">
              <Plus className="w-3.5 h-3.5" /> Add Account
            </button>
            <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700">
              <Save className="w-3.5 h-3.5" /> Save Balances
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
            Trial balance is out of balance — Debit total and Credit total must match before saving.
          </div>
        )}
        <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
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
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{r.code}</td>
                  <td className="px-4 py-2.5 font-medium text-slate-800">{r.account}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-400">{r.group}</td>
                  <td className="px-4 py-2.5 font-mono text-slate-700 text-right">{inr(r.debit)}</td>
                  <td className="px-4 py-2.5 font-mono text-slate-700 text-right">{inr(r.credit)}</td>
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
        </div>
      </div>
    </div>
  );
}
