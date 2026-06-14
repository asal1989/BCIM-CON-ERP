// src/pages/accounts/AccountTransactionsPage.jsx
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { Landmark } from 'lucide-react';
import { chartOfAccountsAPI } from '../../api/client';
import { inr } from '../dashboards/DashKPI';

export default function AccountTransactionsPage() {
  const [accountId, setAccountId] = useState('');

  const { data: coaData } = useQuery({
    queryKey: ['chart-of-accounts-all'],
    queryFn: () => chartOfAccountsAPI.list().then(r => r.data?.data ?? []),
  });
  const accounts = coaData ?? [];

  const { data, isLoading } = useQuery({
    queryKey: ['account-transactions', accountId],
    queryFn: () => chartOfAccountsAPI.transactions(accountId).then(r => r.data?.data),
    enabled: !!accountId,
  });

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-md bg-blue-50 flex items-center justify-center">
            <Landmark className="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-800">Account Transactions</h1>
            <p className="text-xs text-slate-400">Posted journal lines &amp; running balance per ledger account</p>
          </div>
        </div>
      </div>

      <div className="px-6 py-5">
        <select className="border border-slate-200 rounded-md px-3 py-2 text-sm bg-white w-72 focus:outline-none focus:ring-2 focus:ring-blue-200"
          value={accountId} onChange={e => setAccountId(e.target.value)}>
          <option value="">— Select account —</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
        </select>
      </div>

      {accountId && (
        <div className="px-6 pb-10">
          {isLoading ? (
            <div className="flex justify-center py-16">
              <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : !data ? null : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                <div className="bg-white border border-slate-200 rounded-md p-4">
                  <div className="text-xs text-slate-400">Opening Balance</div>
                  <div className="text-xl font-semibold text-slate-800 mt-1">{inr(data.opening_balance)}</div>
                </div>
                <div className="bg-white border border-slate-200 rounded-md p-4">
                  <div className="text-xs text-slate-400">Closing Balance</div>
                  <div className="text-xl font-semibold text-slate-800 mt-1">{inr(data.closing_balance)}</div>
                </div>
                <div className="bg-white border border-slate-200 rounded-md p-4">
                  <div className="text-xs text-slate-400">Posted Transactions</div>
                  <div className="text-xl font-semibold text-slate-800 mt-1">{data.transactions.length}</div>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
                {data.transactions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-2 text-slate-400">
                    <Landmark className="w-10 h-10 opacity-20" />
                    <p className="text-sm font-medium">No posted transactions for this account</p>
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50">
                        {['Date', 'Entry No', 'Description', 'Debit (₹)', 'Credit (₹)', 'Balance (₹)'].map(h => (
                          <th key={h} className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-slate-400">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {data.transactions.map(t => (
                        <tr key={t.id} className="hover:bg-slate-50">
                          <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{dayjs(t.entry_date).format('DD MMM YYYY')}</td>
                          <td className="px-4 py-2.5 font-mono text-xs font-semibold text-blue-700">{t.entry_no}</td>
                          <td className="px-4 py-2.5 text-slate-600">{t.description || t.narration || '—'}</td>
                          <td className="px-4 py-2.5 text-right font-mono">{t.debit > 0 ? inr(t.debit) : ''}</td>
                          <td className="px-4 py-2.5 text-right font-mono">{t.credit > 0 ? inr(t.credit) : ''}</td>
                          <td className="px-4 py-2.5 text-right font-mono font-semibold text-slate-800">{inr(t.running_balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
