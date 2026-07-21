import React, { useState } from 'react';
import { clsx } from 'clsx';
import { LayoutDashboard, Table2 } from 'lucide-react';
import BudgetControlDashboard from './BudgetControlDashboard';
import BOQBudgetBreakdownPage from '../qs/BOQBudgetBreakdownPage';

const TABS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'details',  label: 'Details',  icon: Table2 },
];

export default function BudgetPage() {
  const [tab, setTab] = useState('overview');
  const [detailsFocus, setDetailsFocus] = useState({ costHead: null, filter: null });

  return (
    <div>
      <div className="bg-white border-b border-slate-200 px-6 py-2.5 flex items-center gap-2">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={clsx('flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg border transition',
              tab === t.id ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50')}>
            <t.icon className="w-3.5 h-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <BudgetControlDashboard
          onJumpToDetails={({ costHead, filter }) => {
            setDetailsFocus({ costHead: costHead || null, filter: filter || null });
            setTab('details');
          }}
        />
      )}
      {tab === 'details' && (
        <BOQBudgetBreakdownPage
          lockedView="costhead"
          pageTitle="Budget Control"
          pageSubtitle="Cost head budget allocation vs actual expenditure"
          highlightCostHead={detailsFocus.costHead}
          initialChFilter={detailsFocus.filter}
        />
      )}
    </div>
  );
}
