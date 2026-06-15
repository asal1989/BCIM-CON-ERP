// src/pages/accounts/InvoicesPage.jsx — thin read list of RA Bills (client invoices)
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { clsx } from 'clsx';
import { Receipt, Search, ExternalLink } from 'lucide-react';
import { raBillAPI } from '../../api/client';
import { inr } from '../dashboards/DashKPI';

const STATUS_CLS = {
  submitted:        'bg-slate-100 text-slate-600 border-slate-200',
  qs_review:        'bg-amber-50 text-amber-600 border-amber-100',
  pm_approval:      'bg-amber-50 text-amber-600 border-amber-100',
  accounts_verify:  'bg-blue-50 text-blue-600 border-blue-100',
  certified:        'bg-emerald-50 text-emerald-600 border-emerald-100',
  rejected:         'bg-red-50 text-red-600 border-red-100',
  paid:             'bg-purple-50 text-purple-600 border-purple-100',
};

export default function InvoicesPage() {
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['accounts-invoices'],
    queryFn: () => raBillAPI.list({ limit: 500 }).then(r => r.data?.data ?? []),
  });
  const rows = data ?? [];
  const filtered = rows.filter(r =>
    !search ||
    r.bill_number?.toLowerCase().includes(search.toLowerCase()) ||
    r.project_name?.toLowerCase().includes(search.toLowerCase())
  );

  const totalNet = filtered.reduce((s, r) => s + Number(r.net_payable || 0), 0);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-blue-50 flex items-center justify-center">
              <Receipt className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-800">Invoices</h1>
              <p className="text-xs text-slate-400">Client RA Bills — create &amp; manage in QS &amp; Billing</p>
            </div>
          </div>
          <button onClick={() => navigate('/qs/ra-bills')}
            className="flex items-center gap-1.5 px-4 py-2 text-sm border border-slate-200 rounded-md text-slate-700 hover:bg-slate-50">
            Open RA Bills <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="px-6 py-5 grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="bg-white border border-slate-200 rounded-md p-4">
          <div className="text-xs text-slate-400">Total Invoices</div>
          <div className="text-2xl font-semibold text-slate-800 mt-1">{filtered.length}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-md p-4">
          <div className="text-xs text-slate-400">Net Payable (filtered)</div>
          <div className="text-2xl font-semibold text-slate-800 mt-1">{inr(totalNet)}</div>
        </div>
      </div>

      <div className="px-6 pb-3">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input className="pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-md bg-white w-full focus:outline-none focus:ring-2 focus:ring-blue-200"
            placeholder="Search bill number / project…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="px-6 pb-10">
        <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
          {isLoading ? (
            <div className="flex justify-center py-16">
              <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-slate-400">
              <Receipt className="w-10 h-10 opacity-20" />
              <p className="text-sm font-medium">No invoices found</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {['Bill Number', 'Date', 'Project', 'Gross (₹)', 'Net Payable (₹)', 'Status'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => navigate('/qs/ra-bills')}>
                    <td className="px-4 py-2.5 font-mono text-xs font-semibold text-blue-700">{r.bill_number}</td>
                    <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{dayjs(r.bill_date).format('DD MMM YYYY')}</td>
                    <td className="px-4 py-2.5 text-slate-600">{r.project_name}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{inr(r.gross_amount)}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold text-slate-800">{inr(r.net_payable)}</td>
                    <td className="px-4 py-2.5">
                      <span className={clsx('px-2 py-0.5 rounded-full text-[10px] font-medium border capitalize', STATUS_CLS[r.status] || STATUS_CLS.submitted)}>
                        {r.status?.replace(/_/g, ' ')}
                      </span>
                    </td>
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
