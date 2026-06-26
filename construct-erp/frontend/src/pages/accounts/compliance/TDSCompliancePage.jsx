import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileBarChart, RefreshCw } from 'lucide-react';
import dayjs from 'dayjs';
import { reportAPI } from '../../../api/client';
import useAuthStore from '../../../store/authStore';
import ProjectFilter from '../../../components/ProjectFilter';

const inr = v => `₹${(+v || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const now = new Date();
const CURRENT_FY = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;

// Reference data (statutory facts, not ERP transactions)
const TDS_SECTIONS = [
  { section: '194C', nature: 'Contractor Payments', rate: '1% / 2%', threshold: '₹30,000 / ₹1,00,000' },
  { section: '194I', nature: 'Rent (Equipment / Property)', rate: '2% / 10%', threshold: '₹2,40,000' },
  { section: '194J', nature: 'Professional / Technical Services', rate: '2% / 10%', threshold: '₹30,000' },
  { section: '194A', nature: 'Interest (other than securities)', rate: '10%', threshold: '₹40,000' },
  { section: '192',  nature: 'Salary', rate: 'Slab rate', threshold: 'Taxable salary' },
];

const TABS = ['TDS Deposits', 'TDS Returns', 'Sections Reference'];

function DuePill({ dueDate, hasActivity }) {
  if (!dueDate) return <span className="text-[10px] text-slate-400">—</span>;
  const overdue = dayjs(dueDate).isBefore(dayjs(), 'day');
  if (hasActivity && overdue) return <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-medium">Deducted</span>;
  if (overdue) return <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">{dayjs(dueDate).format('DD MMM')}</span>;
  return <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium">Due {dayjs(dueDate).format('DD MMM')}</span>;
}

export default function TDSCompliancePage() {
  const [tab, setTab] = useState('TDS Deposits');
  const [fy, setFy] = useState(CURRENT_FY);
  const { selectedProjectId } = useAuthStore();

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['tds-compliance', fy, selectedProjectId],
    queryFn: () => reportAPI.tdsCompliance({ fy, project_id: selectedProjectId || undefined }).then(r => r.data),
  });

  const deposits = data?.deposits ?? [];
  const returns  = data?.returns ?? [];
  const summary  = data?.summary ?? {};
  const fyLabel  = data?.fy ?? `FY ${fy}-${String(fy + 1).slice(-2)}`;
  const activeDeposits = deposits.filter(d => d.has_activity);
  const activeReturns  = returns.filter(r => r.has_activity);
  const fyOptions = [CURRENT_FY, CURRENT_FY - 1, CURRENT_FY - 2];

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-blue-50 flex items-center justify-center">
              <FileBarChart className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-800">TDS Compliance</h1>
              <p className="text-xs text-slate-400">{fyLabel} — TDS deducted from your payments, grouped into 26Q / 24Q returns</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <ProjectFilter />
            <select value={fy} onChange={e => setFy(Number(e.target.value))}
              className="px-3 py-1.5 border border-slate-200 text-slate-600 text-xs rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-200">
              {fyOptions.map(y => <option key={y} value={y}>FY {y}-{String(y + 1).slice(-2)}</option>)}
            </select>
            <button onClick={() => refetch()} disabled={isFetching}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-slate-600 text-xs rounded-md hover:bg-slate-50 disabled:opacity-50">
              <RefreshCw className={`w-3 h-3 ${isFetching ? 'animate-spin' : ''}`} /> {isFetching ? 'Syncing…' : 'Sync from ERP'}
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total TDS Deducted', value: inr(summary.total_tds), sub: fyLabel },
            { label: '26Q (Non-Salary)',   value: inr(summary.total_26q), sub: 'Contractors / Vendors' },
            { label: '24Q (Salary)',        value: inr(summary.total_24q), sub: 'Employee TDS' },
            { label: 'Active Months',       value: `${summary.months_with_activity || 0}/12`, sub: 'With deductions' },
          ].map(({ label, value, sub }) => (
            <div key={label} className="bg-slate-50 border border-slate-200 rounded-md px-4 py-3">
              <p className="text-xs text-slate-500 mb-1">{label}</p>
              <p className="text-base font-bold text-slate-800">{value}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 flex gap-1 border-b border-slate-100">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="px-6 py-4 pb-8">
        {isLoading ? (
          <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" /></div>
        ) : (
          <>
            {tab === 'TDS Deposits' && (
              <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      {['Month', '26Q (Non-Salary)', '24Q (Salary)', 'Total TDS', 'Deposit Due', 'Status'].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-slate-400">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {deposits.map(d => (
                      <tr key={d.month_key} className={`hover:bg-slate-50 ${!d.has_activity ? 'opacity-50' : ''}`}>
                        <td className="px-4 py-2.5 font-medium text-slate-800">{d.month}</td>
                        <td className="px-4 py-2.5 font-mono text-slate-700">{d.amount_26q ? inr(d.amount_26q) : '—'}</td>
                        <td className="px-4 py-2.5 font-mono text-slate-700">{d.amount_24q ? inr(d.amount_24q) : '—'}</td>
                        <td className="px-4 py-2.5 font-mono font-semibold text-slate-800">{d.total ? inr(d.total) : '—'}</td>
                        <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{d.due_date ? dayjs(d.due_date).format('DD MMM YYYY') : '—'}</td>
                        <td className="px-4 py-2.5"><DuePill dueDate={d.due_date} hasActivity={d.has_activity} /></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-300 bg-slate-50 font-bold">
                      <td className="px-4 py-2.5 text-sm text-slate-700">Total</td>
                      <td className="px-4 py-2.5 font-mono text-slate-800">{inr(summary.total_26q)}</td>
                      <td className="px-4 py-2.5 font-mono text-slate-800">{inr(summary.total_24q)}</td>
                      <td className="px-4 py-2.5 font-mono text-slate-800">{inr(summary.total_tds)}</td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
                {activeDeposits.length === 0 && <p className="px-4 py-10 text-sm text-slate-400 text-center">No TDS deducted in {fyLabel}. Record payments with TDS to populate this.</p>}
              </div>
            )}

            {tab === 'TDS Returns' && (
              <div className="space-y-3">
                <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50">
                        {['Form', 'Quarter', 'Deductees', 'TDS Amount', 'Due Date', 'Status'].map(h => (
                          <th key={h} className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-slate-400">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {returns.map((r, i) => (
                        <tr key={i} className={`hover:bg-slate-50 ${!r.has_activity ? 'opacity-50' : ''}`}>
                          <td className="px-4 py-2.5"><span className="text-[11px] px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full font-medium">{r.form}</span></td>
                          <td className="px-4 py-2.5 text-slate-700">{r.quarter}</td>
                          <td className="px-4 py-2.5 text-slate-600">{r.deductees || '—'}</td>
                          <td className="px-4 py-2.5 font-mono text-slate-700">{r.amount ? inr(r.amount) : '—'}</td>
                          <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{dayjs(r.due_date).format('DD MMM YYYY')}</td>
                          <td className="px-4 py-2.5"><DuePill dueDate={r.due_date} hasActivity={r.has_activity} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {activeReturns.length === 0 && <p className="px-4 py-10 text-sm text-slate-400 text-center">No quarterly TDS to report for {fyLabel}.</p>}
                </div>
                <div className="bg-blue-50 border border-blue-100 rounded-md px-4 py-3 text-sm text-blue-700">
                  Form 16A (vendors) is due within 15 days of the return due date; Form 16 (employees) by 15 June following the FY. Actual filing acknowledgements must be tracked on the TRACES portal.
                </div>
              </div>
            )}

            {tab === 'Sections Reference' && (
              <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      {['Section', 'Nature of Payment', 'Rate', 'Threshold'].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-slate-400">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {TDS_SECTIONS.map(s => (
                      <tr key={s.section} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5"><span className="text-[11px] px-2 py-0.5 bg-slate-100 text-slate-700 rounded font-mono">{s.section}</span></td>
                        <td className="px-4 py-2.5 font-medium text-slate-800">{s.nature}</td>
                        <td className="px-4 py-2.5 text-slate-700 font-mono text-xs">{s.rate}</td>
                        <td className="px-4 py-2.5 text-slate-500 text-xs">{s.threshold}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
