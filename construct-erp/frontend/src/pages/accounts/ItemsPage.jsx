import React, { useState } from 'react';
import { Package, Plus, Search } from 'lucide-react';

const SAMPLE_ITEMS = [];

export default function ItemsPage() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All');

  const filtered = SAMPLE_ITEMS.filter(i =>
    (filter === 'All' || i.type === filter) &&
    (i.name.toLowerCase().includes(search.toLowerCase()) || i.code.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-indigo-50 flex items-center justify-center">
              <Package className="w-4 h-4 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-black">Items & Services</h1>
              <p className="text-xs text-slate-400">Products and services used in invoices and purchase orders</p>
            </div>
          </div>
          <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700">
            <Plus className="w-3.5 h-3.5" /> New Item
          </button>
        </div>
      </div>

      <div className="px-6 py-4 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search items…"
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
        </div>
        {['All', 'Product', 'Service'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-2 text-sm rounded-md border ${filter === f ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            {f}
          </button>
        ))}
      </div>

      <div className="px-6 pb-6">
        <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                {['Code', 'Name', 'Type', 'Category', 'Unit', 'Rate (₹)', 'HSN', 'GST %'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-slate-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map(item => (
                <tr key={item.id} className="hover:bg-slate-50 cursor-pointer">
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{item.code}</td>
                  <td className="px-4 py-2.5 font-medium text-black">{item.name}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${item.type === 'Product' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>
                      {item.type}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-500 text-xs">{item.category}</td>
                  <td className="px-4 py-2.5 text-slate-600">{item.unit}</td>
                  <td className="px-4 py-2.5 font-mono text-black">₹{item.rate.toLocaleString('en-IN')}</td>
                  <td className="px-4 py-2.5 text-slate-500 text-xs">{item.hsn}</td>
                  <td className="px-4 py-2.5 text-slate-600">{item.gst}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p className="px-4 py-10 text-sm text-slate-400 text-center">No items found</p>
          )}
        </div>
      </div>
    </div>
  );
}
