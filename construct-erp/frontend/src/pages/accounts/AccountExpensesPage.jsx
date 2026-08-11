import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Wallet, Search, CheckCircle, Clock, XCircle } from 'lucide-react';
import dayjs from 'dayjs';
import { pettyCashAPI } from '../../api/client';

const inr = v => `₹${(+v || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const fmt = d => d ? dayjs(d).format('DD MMM YYYY') : '—';

const STATUS_CLS = {
  approved:  'bg-emerald-50 text-emerald-700',
  submitted: 'bg-blue-50 text-blue-700',
  draft:     'bg-slate-100 text-slate-500',
  rejected:  'bg-red-50 text-red-600',
};
const STATUS_ICON = {
  approved:  CheckCircle,
  submitted: Clock,
  draft:     Clock,
  rejected:  XCircle,
};

export default function AccountExpensesPage() {
  const [search, setSearch]   = useState('');
  const [status, setStatus]   = useState('approved');

  const { data, isLoading } = useQuery({
    queryKey: ['accounts-pc-expenses', status],
    queryFn:  () => pettyCashAPI.expenses({ status: status || undefined, limit: 500 }).then(r => r.data?.data ?? []),
    staleTime: 30000,
  });

  const rows = (data ?? []).filter(r => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return [r.description, r.vendor_name, r.voucher_number, r.category_name, r.project_name]
      .some(v => v?.toLowerCase().includes(q));
  });

  const total = rows.reduce((s, r) => s + parseFloat(r.amount || 0), 0);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-md bg-orange-50 flex items-center justify-center">
            <Wallet className="w-4 h-4 text-orange-600" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-black">Expenses</h1>
            <p className="text-xs text-slate-400">Petty cash expenses · JV auto-posted on approval</p>
          </div>
        </div>
      </div>

      <div className="px-6 py-4 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search description, vendor, project…"
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
        </div>
        <div className="flex gap-1">
          {[['approved','Approved'],['submitted','Pending'],['','All']].map(([v, label]) => (
            <button key={v} onClick={() => setStatus(v)}
              className={`px-3 py-1.5 text-xs rounded-md border ${status === v ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-6 pb-6">
        <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
          {isLoading ? (
            <div className="py-16 flex justify-center">
              <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {['Voucher No.','Date','Description','Category','Vendor','Project','Mode','Amount','Status'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {rows.map(r => {
                  const Icon = STATUS_ICON[r.status] || Clock;
                  return (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-500 whitespace-nowrap">{r.voucher_number}</td>
                      <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{fmt(r.expense_date)}</td>
                      <td className="px-4 py-2.5 font-medium text-black max-w-[180px] truncate">{r.description}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-500">{r.category_name || '—'}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-500 max-w-[120px] truncate">{r.vendor_name || '—'}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-500 max-w-[120px] truncate">{r.project_name || '—'}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-500">{r.payment_mode || '—'}</td>
                      <td className="px-4 py-2.5 font-mono font-semibold text-black text-right whitespace-nowrap">{inr(r.amount)}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_CLS[r.status] || 'bg-slate-100 text-slate-500'}`}>
                          <Icon className="w-3 h-3" /> {r.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr className="border-t border-slate-200 bg-slate-50">
                    <td colSpan={7} className="px-4 py-2.5 text-sm font-semibold text-slate-700">
                      Total ({rows.length} expenses)
                    </td>
                    <td className="px-4 py-2.5 font-mono font-bold text-black text-right">{inr(total)}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          )}
          {!isLoading && rows.length === 0 && (
            <p className="px-4 py-10 text-sm text-slate-400 text-center">No expenses found</p>
          )}
        </div>
      </div>
    </div>
  );
}
