// src/pages/finance/CustomerStatementsPage.jsx
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, FileSignature, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { clsx } from 'clsx';
import { projectAPI, raBillAPI } from '../../api/client';
import { inr, FlatKPI } from '../dashboards/DashKPI';
import dayjs from 'dayjs';

const STATUS_CLS = {
  draft:     'bg-slate-100 text-slate-600 border-slate-200',
  submitted: 'bg-amber-50 text-amber-600 border-amber-100',
  verified:  'bg-blue-50 text-blue-600 border-blue-100',
  certified: 'bg-indigo-50 text-indigo-600 border-indigo-100',
  paid:      'bg-emerald-50 text-emerald-600 border-emerald-100',
  rejected:  'bg-red-50 text-red-600 border-red-100',
};

export default function CustomerStatementsPage() {
  const [selectedProject, setSelectedProject] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');

  const { data: projects = [] } = useQuery({
    queryKey: ['finance-customer-projects'],
    queryFn: () => projectAPI.list().then(r => r.data?.data || []).catch(() => []),
  });

  // skipProjectInject: this page has its own project dropdown (selectedProject,
  // filtered client-side below) — the global top-bar project filter must not
  // silently narrow the fetch, or switching projects elsewhere in the app makes
  // this page appear empty for no visible reason.
  const { data: bills = [], isLoading } = useQuery({
    queryKey: ['finance-customer-statements'],
    queryFn: () => raBillAPI.list({ limit: 500 }, { skipProjectInject: true }).then(r => r.data?.data || []).catch(() => []),
  });

  const filtered = bills.filter(b => {
    if (selectedProject && b.project_id !== selectedProject) return false;
    if (status && b.status !== status) return false;
    if (search) {
      const s = search.toLowerCase();
      return [b.bill_number, b.project_name, b.contractor_name, b.work_description]
        .some(v => String(v || '').toLowerCase().includes(s));
    }
    return true;
  });

  const billed = filtered.reduce((s, b) => s + Number(b.net_payable || 0), 0);
  const received = filtered.reduce((s, b) => s + Number(b.amount_received || 0), 0);
  const outstanding = billed - received;
  const paidCount = filtered.filter(b => b.status === 'paid').length;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-blue-50 flex items-center justify-center">
              <FileSignature className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-800">Customer Statements</h1>
              <p className="text-xs text-slate-400">Project-wise receivables, RA bills and collections</p>
            </div>
          </div>
          <Link to="/qs/ra-bills"
            className="flex items-center gap-1.5 px-4 py-2 text-sm border border-slate-200 rounded-md text-slate-700 hover:bg-slate-50">
            Open RA Bills <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      <div className="px-6 py-5 grid grid-cols-2 md:grid-cols-4 gap-3">
        <FlatKPI label="Total Billed" value={inr(billed)} sub={`${filtered.length} bills`} color="blue" loading={isLoading} />
        <FlatKPI label="Total Received" value={inr(received)} sub="Client receipts posted" color="emerald" loading={isLoading} />
        <FlatKPI label="Outstanding" value={inr(outstanding)} sub="Open receivable balance" color="red" loading={isLoading} />
        <FlatKPI label="Paid Bills" value={paidCount} sub="Closed / cleared" color="amber" loading={isLoading} />
      </div>

      <div className="px-6 pb-2 flex flex-wrap gap-2 items-center">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input className="pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-md bg-white w-60 focus:outline-none focus:ring-2 focus:ring-blue-200"
            placeholder="Search project, contractor or bill number"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="border border-slate-200 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
          value={selectedProject} onChange={e => setSelectedProject(e.target.value)}>
          <option value="">All Projects</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className="border border-slate-200 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
          value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">All Status</option>
          <option value="draft">Draft</option>
          <option value="submitted">Submitted</option>
          <option value="verified">Verified</option>
          <option value="certified">Certified</option>
          <option value="paid">Paid</option>
        </select>
        {(search || selectedProject || status) && (
          <button onClick={() => { setSearch(''); setSelectedProject(''); setStatus(''); }}
            className="px-3 py-2 text-sm text-slate-500 hover:text-slate-800">
            Clear filters
          </button>
        )}
      </div>

      <div className="px-6 pb-10">
        <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
          {isLoading ? (
            <div className="flex justify-center py-16">
              <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="px-4 py-16 text-sm text-slate-400 text-center">No statements found</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    {['Project / Contractor', 'Bill', 'Bill Date', 'Net Payable', 'Received', 'Balance', 'Status'].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-slate-400 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filtered.map(b => {
                    const balance = Number(b.net_payable || 0) - Number(b.amount_received || 0);
                    return (
                      <tr key={b.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5">
                          <div className="text-slate-800">{b.project_name || '—'}</div>
                          <div className="text-[11px] text-slate-400">{b.contractor_name || 'Contractor'}</div>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs font-semibold text-blue-700">{b.bill_number || `RA-${b.id.slice(0, 8)}`}</td>
                        <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{b.bill_date ? dayjs(b.bill_date).format('DD MMM YYYY') : '—'}</td>
                        <td className="px-4 py-2.5 text-right font-mono">{inr(b.net_payable)}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-emerald-600">{inr(b.amount_received || 0)}</td>
                        <td className="px-4 py-2.5 text-right font-mono font-semibold text-red-600">{inr(balance)}</td>
                        <td className="px-4 py-2.5">
                          <span className={clsx('px-2 py-0.5 rounded-full text-[11px] font-medium border', STATUS_CLS[b.status] || STATUS_CLS.draft)}>
                            {b.status || 'pending'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
