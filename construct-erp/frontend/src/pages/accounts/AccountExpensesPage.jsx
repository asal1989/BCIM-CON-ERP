import React, { useState } from 'react';
import { Wallet, Plus, Search } from 'lucide-react';
import dayjs from 'dayjs';

const CATEGORIES = ['All', 'Travel', 'Office Supplies', 'Utilities', 'Repairs', 'Miscellaneous'];

const SAMPLE = [
  { id: 1, ref: 'EXP-001', date: '2025-11-02', paid_to: 'NHAI Toll', category: 'Travel', amount: 2400, paid_via: 'Cash', notes: 'Site vehicle toll — NH-48', status: 'recorded' },
  { id: 2, ref: 'EXP-002', date: '2025-11-05', paid_to: 'BSNL Broadband', category: 'Utilities', amount: 3200, paid_via: 'Bank Transfer', notes: 'Site office internet', status: 'recorded' },
  { id: 3, ref: 'EXP-003', date: '2025-11-08', paid_to: 'Stationery Mart', category: 'Office Supplies', amount: 1850, paid_via: 'Cash', notes: 'Drawing sheets, markers', status: 'recorded' },
  { id: 4, ref: 'EXP-004', date: '2025-11-10', paid_to: 'Electrician Labour', category: 'Repairs', amount: 4500, paid_via: 'Cash', notes: 'Site office wiring repair', status: 'draft' },
];

const inr = v => `₹${(+v || 0).toLocaleString('en-IN')}`;

export default function AccountExpensesPage() {
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('All');

  const rows = SAMPLE.filter(r =>
    (cat === 'All' || r.category === cat) &&
    (r.paid_to.toLowerCase().includes(search.toLowerCase()) || r.ref.toLowerCase().includes(search.toLowerCase()))
  );
  const total = rows.reduce((s, r) => s + r.amount, 0);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-orange-50 flex items-center justify-center">
              <Wallet className="w-4 h-4 text-orange-600" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-800">Expenses</h1>
              <p className="text-xs text-slate-400">Business expenses not linked to vendor bills or purchase orders</p>
            </div>
          </div>
          <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700">
            <Plus className="w-3.5 h-3.5" /> New Expense
          </button>
        </div>
      </div>

      <div className="px-6 py-4 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search expenses…"
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
        </div>
        <div className="flex gap-1 flex-wrap">
          {CATEGORIES.map(c => (
            <button key={c} onClick={() => setCat(c)}
              className={`px-3 py-1.5 text-xs rounded-md border ${cat === c ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="px-6 pb-6">
        <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                {['Ref', 'Date', 'Paid To', 'Category', 'Paid Via', 'Notes', 'Amount'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-slate-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map(r => (
                <tr key={r.id} className="hover:bg-slate-50 cursor-pointer">
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{r.ref}</td>
                  <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{dayjs(r.date).format('DD MMM YYYY')}</td>
                  <td className="px-4 py-2.5 font-medium text-slate-800">{r.paid_to}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">{r.category}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">{r.paid_via}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-400 max-w-[180px] truncate">{r.notes}</td>
                  <td className="px-4 py-2.5 font-mono font-semibold text-slate-800 text-right">{inr(r.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50">
                <td colSpan={6} className="px-4 py-2.5 text-sm font-semibold text-slate-700">Total</td>
                <td className="px-4 py-2.5 font-mono font-bold text-slate-800 text-right">{inr(total)}</td>
              </tr>
            </tfoot>
          </table>
          {rows.length === 0 && <p className="px-4 py-10 text-sm text-slate-400 text-center">No expenses found</p>}
        </div>
      </div>
    </div>
  );
}
