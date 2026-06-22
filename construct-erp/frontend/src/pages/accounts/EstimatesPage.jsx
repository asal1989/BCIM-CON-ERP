import React, { useState } from 'react';
import { FileText, Plus, Search } from 'lucide-react';
import dayjs from 'dayjs';

const STATUS_CLS = {
  draft:    'bg-slate-100 text-slate-600',
  sent:     'bg-blue-50 text-blue-700',
  accepted: 'bg-emerald-50 text-emerald-700',
  declined: 'bg-red-50 text-red-600',
  expired:  'bg-amber-50 text-amber-600',
};

const SAMPLE = [
  { id: 1, ref: 'EST-2025-001', client: 'Ramco Builders', project: 'Skyline Tower Phase 1', amount: 4850000, date: '2025-11-01', expiry: '2025-11-30', status: 'accepted' },
  { id: 2, ref: 'EST-2025-002', client: 'Prestige Constructions', project: 'NH-48 Road Widening', amount: 12300000, date: '2025-11-10', expiry: '2025-12-10', status: 'sent' },
  { id: 3, ref: 'EST-2025-003', client: 'DLF Infrastructure', project: 'IT Park Foundation', amount: 7200000, date: '2025-10-15', expiry: '2025-11-15', status: 'draft' },
];

const inr = v => `₹${(+v || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export default function EstimatesPage() {
  const [search, setSearch] = useState('');
  const rows = SAMPLE.filter(r => r.client.toLowerCase().includes(search.toLowerCase()) || r.ref.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-amber-50 flex items-center justify-center">
              <FileText className="w-4 h-4 text-amber-600" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-800">Estimates</h1>
              <p className="text-xs text-slate-400">Quotes and proposals sent to clients before invoicing</p>
            </div>
          </div>
          <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700">
            <Plus className="w-3.5 h-3.5" /> New Estimate
          </button>
        </div>
      </div>

      <div className="px-6 py-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search estimates…"
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
        </div>
      </div>

      <div className="px-6 pb-6">
        <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                {['Estimate #', 'Client', 'Project', 'Date', 'Expiry', 'Amount', 'Status'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-slate-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map(r => (
                <tr key={r.id} className="hover:bg-slate-50 cursor-pointer">
                  <td className="px-4 py-2.5 font-mono text-xs text-blue-700">{r.ref}</td>
                  <td className="px-4 py-2.5 font-medium text-slate-800">{r.client}</td>
                  <td className="px-4 py-2.5 text-slate-500 text-xs">{r.project}</td>
                  <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{dayjs(r.date).format('DD MMM YYYY')}</td>
                  <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{dayjs(r.expiry).format('DD MMM YYYY')}</td>
                  <td className="px-4 py-2.5 font-mono font-semibold text-slate-800">{inr(r.amount)}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_CLS[r.status] || ''}`}>{r.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <p className="px-4 py-10 text-sm text-slate-400 text-center">No estimates found</p>}
        </div>
      </div>
    </div>
  );
}
