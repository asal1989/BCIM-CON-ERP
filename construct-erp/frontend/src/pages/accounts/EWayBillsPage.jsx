import React, { useState } from 'react';
import { Truck, Plus, Search } from 'lucide-react';
import dayjs from 'dayjs';

const STATUS_CLS = {
  active:    'bg-emerald-50 text-emerald-700',
  cancelled: 'bg-red-50 text-red-600',
  expired:   'bg-amber-50 text-amber-600',
};

const SAMPLE = [
  { id: 1, ewbNo: '1208034567890', date: '2025-11-02', from: 'Chennai', to: 'Bengaluru', supplier: 'Ultratech Cement', value: 480000, vehicle: 'TN 09 AZ 3421', validUntil: '2025-11-04', status: 'expired' },
  { id: 2, ewbNo: '1208034567891', date: '2025-11-10', from: 'Hyderabad', to: 'Chennai', supplier: 'JSW Steel Ltd', value: 1250000, vehicle: 'TS 11 EX 7892', validUntil: '2025-11-14', status: 'active' },
  { id: 3, ewbNo: '1208034567892', date: '2025-11-15', from: 'Chennai', to: 'Coimbatore', supplier: 'Saint Gobain Glass', value: 380000, vehicle: 'TN 77 CG 1234', validUntil: '2025-11-16', status: 'active' },
  { id: 4, ewbNo: '1208034567893', date: '2025-11-18', from: 'Mumbai', to: 'Chennai', supplier: 'Pipe & Fitting Co', value: 220000, vehicle: 'MH 04 AS 5561', validUntil: '2025-11-22', status: 'cancelled' },
];

const inr = v => `₹${(+v || 0).toLocaleString('en-IN')}`;

export default function EWayBillsPage() {
  const [search, setSearch] = useState('');
  const rows = SAMPLE.filter(r =>
    r.ewbNo.includes(search) ||
    r.supplier.toLowerCase().includes(search.toLowerCase()) ||
    r.vehicle.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-sky-50 flex items-center justify-center">
              <Truck className="w-4 h-4 text-sky-600" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-800">E-Way Bills</h1>
              <p className="text-xs text-slate-400">GST e-Way bills for goods movement above ₹50,000</p>
            </div>
          </div>
          <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700">
            <Plus className="w-3.5 h-3.5" /> Generate E-Way Bill
          </button>
        </div>
      </div>

      <div className="px-6 py-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search EWB no., supplier, vehicle…"
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
        </div>
      </div>

      <div className="px-6 pb-6">
        <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                {['EWB No.', 'Date', 'From → To', 'Supplier', 'Value', 'Vehicle No.', 'Valid Until', 'Status'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-slate-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map(r => (
                <tr key={r.id} className="hover:bg-slate-50 cursor-pointer">
                  <td className="px-4 py-2.5 font-mono text-xs text-blue-700">{r.ewbNo}</td>
                  <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{dayjs(r.date).format('DD MMM YY')}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">{r.from} → {r.to}</td>
                  <td className="px-4 py-2.5 font-medium text-slate-800">{r.supplier}</td>
                  <td className="px-4 py-2.5 font-mono text-slate-700">{inr(r.value)}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-600">{r.vehicle}</td>
                  <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{dayjs(r.validUntil).format('DD MMM YY')}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_CLS[r.status] || ''}`}>{r.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <p className="px-4 py-10 text-sm text-slate-400 text-center">No e-way bills found</p>}
        </div>
      </div>
    </div>
  );
}
