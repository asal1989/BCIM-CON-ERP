import React from 'react';
import { ScrollText, Plus, Play, Pause } from 'lucide-react';

const SAMPLE = [
  { id: 1, name: 'Site Office Rent', vendor: 'Sri Lakshmi Properties', amount: 45000, frequency: 'Monthly', nextDate: '2025-12-01', status: 'active' },
  { id: 2, name: 'Security Agency Charges', vendor: 'Shield Security Services', amount: 62000, frequency: 'Monthly', nextDate: '2025-12-01', status: 'active' },
  { id: 3, name: 'Software License — AutoCAD', vendor: 'Autodesk India Pvt Ltd', amount: 180000, frequency: 'Yearly', nextDate: '2026-04-01', status: 'active' },
  { id: 4, name: 'Diesel Supply Contract', vendor: 'HP Petroleum', amount: 85000, frequency: 'Monthly', nextDate: '2025-12-15', status: 'paused' },
];

const inr = v => `₹${(+v || 0).toLocaleString('en-IN')}`;

export default function RecurringBillsPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-violet-50 flex items-center justify-center">
              <ScrollText className="w-4 h-4 text-violet-600" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-800">Recurring Bills</h1>
              <p className="text-xs text-slate-400">Automatically scheduled vendor bills on a recurring basis</p>
            </div>
          </div>
          <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700">
            <Plus className="w-3.5 h-3.5" /> New Recurring Bill
          </button>
        </div>
      </div>

      <div className="px-6 py-5 space-y-3">
        {SAMPLE.map(r => (
          <div key={r.id} className="bg-white border border-slate-200 rounded-md p-4 flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <p className="text-sm font-semibold text-slate-800">{r.name}</p>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${r.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-600'}`}>
                  {r.status}
                </span>
              </div>
              <p className="text-xs text-slate-500">{r.vendor} · {r.frequency} · Next: {r.nextDate}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-mono font-semibold text-slate-800">{inr(r.amount)}</span>
              <button className="p-1.5 rounded border border-slate-200 text-slate-500 hover:bg-slate-50">
                {r.status === 'active' ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
