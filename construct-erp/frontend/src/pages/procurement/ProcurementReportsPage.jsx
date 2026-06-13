// src/pages/procurement/ProcurementReportsPage.jsx — Procurement Reports Section
import React, { useState, useMemo } from 'react';
import { ChevronRight, FileBarChart, Search, X, Truck } from 'lucide-react';
import { clsx } from 'clsx';
import { REPORTS, ReportGenerator } from '../reports/ReportsPage';

const PROCUREMENT_REPORTS = REPORTS.filter(r => r.dept === 'procurement');

const CATEGORY_ORDER = [
  'Purchase Requisition Reports',
  'RFQ Reports',
  'Quotation Reports',
  'Purchase Order Reports',
  'Delivery Reports',
  'Vendor Reports',
];

export default function ProcurementReportsPage() {
  const [search, setSearch] = useState('');
  const [selectedReport, setSelectedReport] = useState(PROCUREMENT_REPORTS[0] || null);

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? PROCUREMENT_REPORTS.filter(r => r.title.toLowerCase().includes(q) || r.desc.toLowerCase().includes(q))
      : PROCUREMENT_REPORTS;
    const byCategory = {};
    filtered.forEach(r => {
      const cat = r.category || 'Other';
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(r);
    });
    return CATEGORY_ORDER
      .filter(cat => byCategory[cat]?.length)
      .map(cat => ({ category: cat, reports: byCategory[cat] }));
  }, [search]);

  return (
    <div className="flex h-full min-h-0 bg-slate-50 overflow-hidden max-xl:flex-col">

      {/* ── Report list sidebar ───────────────────────────────────────────── */}
      <aside className="report-hub-list-panel w-80 flex-shrink-0 bg-white border-r border-slate-200 flex flex-col overflow-hidden max-xl:w-full max-xl:max-h-[300px]">

        {/* Header */}
        <div className="px-4 pt-4 pb-3.5 flex-shrink-0 border-b border-slate-100">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm"
                 style={{ background: 'linear-gradient(135deg, #b45309 0%, #d97706 100%)' }}>
              <Truck className="w-4.5 h-4.5 text-white" style={{ width: 18, height: 18 }} />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900 leading-tight">Procurement Reports</p>
              <p className="text-[11px] text-slate-400 mt-0.5">{PROCUREMENT_REPORTS.length} reports · {CATEGORY_ORDER.length} categories</p>
            </div>
          </div>
          {/* Search */}
          <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2 border border-slate-200
                          focus-within:border-amber-300 focus-within:ring-2 focus-within:ring-amber-100 focus-within:bg-white transition-all">
            <Search className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search reports…"
              className="flex-1 bg-transparent text-xs text-slate-700 placeholder-slate-400 outline-none"
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-slate-300 hover:text-slate-500 transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Report list grouped by category */}
        <div className="flex-1 overflow-y-auto py-2.5 px-2.5
                        [&::-webkit-scrollbar]:w-1
                        [&::-webkit-scrollbar-track]:transparent
                        [&::-webkit-scrollbar-thumb]:rounded-full
                        [&::-webkit-scrollbar-thumb]:bg-slate-200">
          {groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2.5 text-slate-400">
              <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                <Search className="w-4 h-4 opacity-50" />
              </div>
              <p className="text-xs font-medium">No reports found</p>
            </div>
          ) : (
            groups.map(group => (
              <div key={group.category} className="mb-3">
                <p className="px-2.5 pt-1 pb-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
                  {group.category}
                </p>
                {group.reports.map(r => {
                  const Icon = r.icon;
                  const active = selectedReport?.key === r.key;
                  return (
                    <button
                      key={r.key}
                      onClick={() => setSelectedReport(r)}
                      className={clsx(
                        'w-full text-left px-3 py-2.5 rounded-xl mb-1 transition-all duration-150 relative overflow-hidden group border',
                        active
                          ? 'bg-[#fffbeb] border-transparent shadow-sm ring-1 ring-[#fde68a]'
                          : 'border-transparent hover:bg-slate-50 hover:border-slate-100'
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className={clsx(
                          'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 transition-all duration-150',
                          active ? 'bg-white shadow-sm' : 'bg-slate-100 group-hover:bg-white group-hover:shadow-sm'
                        )}>
                          <Icon className={clsx('w-4 h-4 transition-all duration-150', active ? 'text-[#b45309]' : 'text-slate-400 group-hover:text-slate-600')} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={clsx(
                            'text-xs leading-tight',
                            active ? 'font-semibold text-slate-900' : 'font-medium text-slate-700 group-hover:text-slate-900'
                          )}>{r.title}</p>
                          <p className="text-[10.5px] text-slate-400 mt-1 leading-snug line-clamp-2">{r.desc}</p>
                        </div>
                        {active && (
                          <ChevronRight className="w-3.5 h-3.5 flex-shrink-0 mt-1 text-[#b45309]" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </aside>

      {/* ── Report generator ───────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0 min-h-0">
        {selectedReport
          ? <ReportGenerator report={selectedReport} />
          : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
              <FileBarChart className="w-12 h-12 mb-3 opacity-20" />
              <p className="text-sm font-medium">Select a report to generate</p>
            </div>
          )
        }
      </div>
    </div>
  );
}
