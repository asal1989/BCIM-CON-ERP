import React, { useState } from 'react';
import { Cog, Plus, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';

const SAMPLE_RULES = [
  { id: 1, name: 'Vendor Salary Transfers', condition: 'Description contains "SALARY"', action: 'Categorise as Salary Expense', account: '6010 — Salaries', active: true },
  { id: 2, name: 'GST Payments', condition: 'Description contains "GST" AND Amount > 10000', action: 'Categorise as GST Payable', account: '2100 — GST Payable', active: true },
  { id: 3, name: 'Material Supplier Payments', condition: 'Reference starts with "PO-"', action: 'Categorise as Material Purchase', account: '5100 — Raw Materials', active: false },
];

export default function BankRulesPage() {
  const [rules, setRules] = useState(SAMPLE_RULES);

  const toggle = (id) => setRules(prev =>
    prev.map(r => r.id === id ? { ...r, active: !r.active } : r)
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-blue-50 flex items-center justify-center">
              <Cog className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-800">Bank Rules</h1>
              <p className="text-xs text-slate-400">Auto-categorise bank transactions based on conditions</p>
            </div>
          </div>
          <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700">
            <Plus className="w-3.5 h-3.5" /> New Rule
          </button>
        </div>
      </div>

      <div className="px-6 py-5 space-y-3">
        {rules.map(rule => (
          <div key={rule.id} className="bg-white border border-slate-200 rounded-md p-4 flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-semibold text-slate-800">{rule.name}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${rule.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                  {rule.active ? 'Active' : 'Inactive'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mb-0.5"><span className="font-medium text-slate-600">When:</span> {rule.condition}</p>
              <p className="text-xs text-slate-500"><span className="font-medium text-slate-600">Then:</span> {rule.action} → {rule.account}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => toggle(rule.id)} className="text-slate-400 hover:text-blue-600">
                {rule.active ? <ToggleRight className="w-5 h-5 text-blue-600" /> : <ToggleLeft className="w-5 h-5" />}
              </button>
              <button className="text-slate-400 hover:text-red-500">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
