import React, { useState } from 'react';
import { Truck, Plus, Search } from 'lucide-react';
import dayjs from 'dayjs';

const STATUS_CLS = {
  draft:     'bg-slate-100 text-slate-600',
  sent:      'bg-blue-50 text-blue-700',
  delivered: 'bg-emerald-50 text-emerald-700',
  cancelled: 'bg-red-50 text-red-600',
};

const SAMPLE = [
  { id: 1, ref: 'DC-2025-001', customer: 'Ramco Builders', project: 'Skyline Tower Phase 1', items: 3, date: '2025-11-05', status: 'delivered' },
  { id: 2, ref: 'DC-2025-002', customer: 'Prestige Constructions', project: 'NH-48 Road Widening', items: 7, date: '2025-11-12', status: 'sent' },
  { id: 3, ref: 'DC-2025-003', customer: 'DLF Infrastructure', project: 'IT Park Foundation', items: 2, date: '2025-11-18', status: 'draft' },
];

export default function DeliveryChallansPage() {
  const [search, setSearch] = useState('');
  const rows = SAMPLE.filter(r => r.customer.toLowerCase().includes(search.toLowerCase()) || r.ref.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-teal-50 flex items-center justify-center">
              <Truck className="w-4 h-4 text-teal-600" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-800">Delivery Challans</h1>
              <p className="text-xs text-slate-400">Documents accompanying goods dispatched to customers</p>
            </div>
          </div>
          <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700">
            <Plus className="w-3.5 h-3.5" /> New Delivery Challan
          </button>
        </div>
      </div>

      <div className="px-6 py-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search challans…"
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
        </div>
      </div>

      <div className="px-6 pb-6">
        <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                {['DC #', 'Customer', 'Project', 'Items', 'Date', 'Status'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-slate-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map(r => (
                <tr key={r.id} className="hover:bg-slate-50 cursor-pointer">
                  <td className="px-4 py-2.5 font-mono text-xs text-blue-700">{r.ref}</td>
                  <td className="px-4 py-2.5 font-medium text-slate-800">{r.customer}</td>
                  <td className="px-4 py-2.5 text-slate-500 text-xs">{r.project}</td>
                  <td className="px-4 py-2.5 text-slate-600">{r.items} items</td>
                  <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{dayjs(r.date).format('DD MMM YYYY')}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_CLS[r.status] || ''}`}>{r.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <p className="px-4 py-10 text-sm text-slate-400 text-center">No delivery challans found</p>}
        </div>
      </div>
    </div>
  );
}
