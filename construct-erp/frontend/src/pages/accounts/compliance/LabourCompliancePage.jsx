import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users, RefreshCw, AlertTriangle } from 'lucide-react';
import dayjs from 'dayjs';
import { reportAPI } from '../../../api/client';
import useAuthStore from '../../../store/authStore';
import ProjectFilter from '../../../components/ProjectFilter';

const inr = v => `₹${(+v || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const now = new Date();
const CURRENT_FY = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;

const TABS = ['Monthly Summary', 'Statutory Rates'];

function DuePill({ dueDate, hasActivity }) {
  if (!dueDate) return <span className="text-[10px] text-slate-400">—</span>;
  const overdue = dayjs(dueDate).isBefore(dayjs(), 'day');
  if (hasActivity && overdue) return <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-medium">Computed</span>;
  if (overdue) return <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">{dayjs(dueDate).format('DD MMM')}</span>;
  return <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium">Due {dayjs(dueDate).format('DD MMM')}</span>;
}

export default function LabourCompliancePage() {
  const [tab, setTab] = useState('Monthly Summary');
  const [fy, setFy] = useState(CURRENT_FY);
  const { selectedProjectId } = useAuthStore();

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['labour-compliance', fy, selectedProjectId],
    queryFn: () => reportAPI.labourCompliance({ fy, project_id: selectedProjectId || undefined }).then(r => r.data),
  });

  const months  = data?.months ?? [];
  const summary = data?.summary ?? {};
  const fyLabel = data?.fy ?? `FY ${fy}-${String(fy + 1).slice(-2)}`;
  const activeMonths = months.filter(m => m.has_activity);
  const fyOptions = [CURRENT_FY, CURRENT_FY - 1, CURRENT_FY - 2];

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-teal-50 flex items-center justify-center">
              <Users className="w-4 h-4 text-teal-600" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-800">Labour Law Compliance</h1>
              <p className="text-xs text-slate-400">{fyLabel} — PF, ESI & Professional Tax computed from your payroll runs</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <ProjectFilter />
            <select value={fy} onChange={e => setFy(Number(e.target.value))}
              className="px-3 py-1.5 border border-slate-200 text-slate-600 text-xs rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-teal-200">
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
            { label: 'Employees (latest)', value: summary.latest_employees || 0, sub: 'On payroll' },
            { label: 'Total PF',  value: inr(summary.total_pf),  sub: 'Employee + Employer' },
            { label: 'Total ESI', value: inr(summary.total_esi), sub: 'Employee + Employer' },
            { label: 'Total Prof. Tax', value: inr(summary.total_pt), sub: 'Deducted' },
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
          <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" /></div>
        ) : (
          <>
            {tab === 'Monthly Summary' && (
              <div className="space-y-3">
                <div className="bg-white border border-slate-200 rounded-md overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50">
                        {['Month', 'Employees', 'Gross Wages', 'PF', 'ESI', 'Prof. Tax', 'Due (15th/20th)', 'Status'].map(h => (
                          <th key={h} className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-slate-400">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {months.map(m => (
                        <tr key={m.month_key} className={`hover:bg-slate-50 ${!m.has_activity ? 'opacity-50' : ''}`}>
                          <td className="px-4 py-2.5 font-medium text-slate-800">{m.month}</td>
                          <td className="px-4 py-2.5 text-slate-600">{m.employees || '—'}</td>
                          <td className="px-4 py-2.5 font-mono text-slate-700">{m.gross ? inr(m.gross) : '—'}</td>
                          <td className="px-4 py-2.5 font-mono text-slate-700">{m.pf ? inr(m.pf) : '—'}</td>
                          <td className="px-4 py-2.5 font-mono text-slate-700">{m.esi ? inr(m.esi) : '—'}</td>
                          <td className="px-4 py-2.5 font-mono text-slate-700">{m.pt ? inr(m.pt) : '—'}</td>
                          <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{m.pf_due ? dayjs(m.pf_due).format('DD MMM') : '—'}</td>
                          <td className="px-4 py-2.5"><DuePill dueDate={m.pf_due} hasActivity={m.has_activity} /></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-slate-300 bg-slate-50 font-bold">
                        <td className="px-4 py-2.5 text-sm text-slate-700">Total</td>
                        <td className="px-4 py-2.5" />
                        <td className="px-4 py-2.5 font-mono text-slate-800">{inr(summary.total_gross)}</td>
                        <td className="px-4 py-2.5 font-mono text-slate-800">{inr(summary.total_pf)}</td>
                        <td className="px-4 py-2.5 font-mono text-slate-800">{inr(summary.total_esi)}</td>
                        <td className="px-4 py-2.5 font-mono text-slate-800">{inr(summary.total_pt)}</td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  </table>
                  {activeMonths.length === 0 && <p className="px-4 py-10 text-sm text-slate-400 text-center">No finalized payroll for {fyLabel}. Run payroll to populate PF/ESI/PT here.</p>}
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-md px-4 py-3 flex items-start gap-2 text-sm text-amber-700">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>PF (ECR) &amp; ESI challans are due by the 15th of the following month; Professional Tax by the 20th. Amounts are computed from finalized payroll — actual challan filing is tracked on the EPFO / ESIC portals.</span>
                </div>
              </div>
            )}

            {tab === 'Statutory Rates' && (
              <div className="grid md:grid-cols-2 gap-4">
                <div className="bg-white border border-slate-200 rounded-md p-5 text-sm">
                  <h3 className="font-semibold text-slate-700 mb-3">PF &amp; ESI Rates</h3>
                  <div className="space-y-2 text-slate-600">
                    {[
                      ['PF — Employee', '12% of Basic (capped ₹15,000)'],
                      ['PF — Employer', '12% (3.67% EPF + 8.33% EPS)'],
                      ['EDLI + Admin', '0.5% + 0.5%'],
                      ['ESI — Employee', '0.75% (wages ≤ ₹21,000)'],
                      ['ESI — Employer', '3.25% (wages ≤ ₹21,000)'],
                    ].map(([k, v]) => (
                      <div key={k} className="flex justify-between border-b border-slate-100 pb-1.5">
                        <span>{k}</span><span className="font-mono font-medium text-slate-800">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-md p-5 text-sm">
                  <h3 className="font-semibold text-slate-700 mb-3">Professional Tax — Karnataka</h3>
                  <div className="space-y-2 text-slate-600">
                    {[
                      ['Up to ₹15,000/month', 'Nil'],
                      ['₹15,001 – ₹35,000/month', '₹150/month'],
                      ['Above ₹35,000/month', '₹200/month (max ₹2,400/yr)'],
                    ].map(([k, v]) => (
                      <div key={k} className="flex justify-between border-b border-slate-100 pb-1.5">
                        <span>{k}</span><span className="font-mono font-medium text-slate-800">{v}</span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-xs text-slate-400">PT due 20th monthly. LWF (Karnataka): Employee ₹20 + Employer ₹40 per year, in January.</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
