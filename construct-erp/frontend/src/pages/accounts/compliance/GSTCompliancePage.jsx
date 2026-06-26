import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { IndianRupee, Download, RefreshCw } from 'lucide-react';
import { reportAPI } from '../../../api/client';
import useAuthStore from '../../../store/authStore';
import ProjectFilter from '../../../components/ProjectFilter';

const inr = v => `₹${(+v || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

const TABS = ['Returns Tracker', 'ITC Reconciliation', 'GST Payments'];

// Current Indian financial year start (April–March)
const now = new Date();
const CURRENT_FY = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;

export default function GSTCompliancePage() {
  const [tab, setTab] = useState('Returns Tracker');
  const [fy, setFy] = useState(CURRENT_FY);
  const { selectedProjectId } = useAuthStore();

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['gst-compliance', fy, selectedProjectId],
    queryFn: () => reportAPI.gstCompliance({
      fy,
      project_id: selectedProjectId || undefined,
    }).then(r => r.data),
  });

  const returns = data?.returns ?? [];
  const summary = data?.summary ?? {};
  const fyLabel = data?.fy ?? `FY ${fy}-${String(fy + 1).slice(-2)}`;
  const activeReturns = returns.filter(r => r.has_activity);

  const fyOptions = [CURRENT_FY, CURRENT_FY - 1, CURRENT_FY - 2];

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-violet-50 flex items-center justify-center">
              <IndianRupee className="w-4 h-4 text-violet-600" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-800">GST Compliance</h1>
              <p className="text-xs text-slate-400">{fyLabel} — output GST, input tax credit, net liability from your ERP transactions</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <ProjectFilter />
            <select value={fy} onChange={e => setFy(Number(e.target.value))}
              className="px-3 py-1.5 border border-slate-200 text-slate-600 text-xs rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-violet-200">
              {fyOptions.map(y => <option key={y} value={y}>FY {y}-{String(y + 1).slice(-2)}</option>)}
            </select>
            <button onClick={() => refetch()} disabled={isFetching}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-slate-600 text-xs rounded-md hover:bg-slate-50 disabled:opacity-50">
              <RefreshCw className={`w-3 h-3 ${isFetching ? 'animate-spin' : ''}`} /> {isFetching ? 'Syncing…' : 'Sync from ERP'}
            </button>
          </div>
        </div>

        {/* Summary KPIs */}
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total Taxable Value', value: inr(summary.total_taxable),    sub: fyLabel },
            { label: 'Output GST',          value: inr(summary.total_output_gst), sub: 'On client RA bills' },
            { label: 'Input Tax Credit',    value: inr(summary.total_itc),        sub: 'From vendor invoices' },
            { label: 'Net GST Payable',     value: inr(summary.net_payable),      sub: 'Output GST − ITC' },
          ].map(({ label, value, sub }) => (
            <div key={label} className="bg-slate-50 border border-slate-200 rounded-md px-4 py-3">
              <p className="text-xs text-slate-500 mb-1">{label}</p>
              <p className="text-base font-bold text-slate-800">{value}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
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
          <div className="flex justify-center py-16">
            <div className="w-6 h-6 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {tab === 'Returns Tracker' && (
              <div className="bg-white border border-slate-200 rounded-md overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      {['Month', 'Taxable Value', 'CGST', 'SGST', 'Output GST', 'ITC', 'Net Payable'].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-slate-400">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {returns.map(r => (
                      <tr key={r.month_key} className={`hover:bg-slate-50 ${!r.has_activity ? 'opacity-50' : ''}`}>
                        <td className="px-4 py-2.5 font-medium text-slate-800 whitespace-nowrap">{r.month}</td>
                        <td className="px-4 py-2.5 font-mono text-slate-700">{r.taxable ? inr(r.taxable) : '—'}</td>
                        <td className="px-4 py-2.5 font-mono text-slate-700">{r.cgst ? inr(r.cgst) : '—'}</td>
                        <td className="px-4 py-2.5 font-mono text-slate-700">{r.sgst ? inr(r.sgst) : '—'}</td>
                        <td className="px-4 py-2.5 font-mono text-slate-700">{r.output_gst ? inr(r.output_gst) : '—'}</td>
                        <td className="px-4 py-2.5 font-mono text-emerald-700">{r.itc_books ? inr(r.itc_books) : '—'}</td>
                        <td className="px-4 py-2.5 font-mono font-semibold text-slate-800">{inr(r.net_payable)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-300 bg-slate-50 font-bold">
                      <td className="px-4 py-2.5 text-sm text-slate-700">Total</td>
                      <td className="px-4 py-2.5 font-mono text-slate-800">{inr(summary.total_taxable)}</td>
                      <td className="px-4 py-2.5 font-mono text-slate-800">{inr((summary.total_output_gst || 0) / 2)}</td>
                      <td className="px-4 py-2.5 font-mono text-slate-800">{inr((summary.total_output_gst || 0) / 2)}</td>
                      <td className="px-4 py-2.5 font-mono text-slate-800">{inr(summary.total_output_gst)}</td>
                      <td className="px-4 py-2.5 font-mono text-emerald-700">{inr(summary.total_itc)}</td>
                      <td className="px-4 py-2.5 font-mono text-slate-800">{inr(summary.net_payable)}</td>
                    </tr>
                  </tfoot>
                </table>
                {activeReturns.length === 0 && (
                  <p className="px-4 py-10 text-sm text-slate-400 text-center">No GST activity recorded for {fyLabel}. Raise RA bills and vendor invoices to populate this.</p>
                )}
              </div>
            )}

            {tab === 'ITC Reconciliation' && (
              <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 bg-amber-50">
                  <p className="text-xs text-amber-700 font-medium">ITC in your books (from vendor invoices). The GSTR-2B column requires a GST portal connection to auto-import — track manually until then.</p>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      {['Month', 'ITC in Books', 'ITC per GSTR-2B', 'Difference'].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-slate-400">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {activeReturns.filter(r => r.itc_books > 0).map(r => (
                      <tr key={r.month_key} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5 font-medium text-slate-800">{r.month}</td>
                        <td className="px-4 py-2.5 font-mono text-slate-700">{inr(r.itc_books)}</td>
                        <td className="px-4 py-2.5 font-mono text-slate-400">—</td>
                        <td className="px-4 py-2.5">
                          <span className="text-[10px] px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full font-medium">Pending 2B import</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-300 bg-slate-50 font-bold">
                      <td className="px-4 py-2.5 text-sm text-slate-700">Total ITC in Books</td>
                      <td className="px-4 py-2.5 font-mono text-slate-800">{inr(summary.total_itc)}</td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
                {activeReturns.filter(r => r.itc_books > 0).length === 0 && (
                  <p className="px-4 py-10 text-sm text-slate-400 text-center">No input tax credit recorded for {fyLabel}.</p>
                )}
              </div>
            )}

            {tab === 'GST Payments' && (
              <div className="bg-white border border-slate-200 rounded-md p-6 text-center">
                <IndianRupee className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-sm font-medium text-slate-700 mb-1">GST Payment Challan History</p>
                <p className="text-xs text-slate-400">Net GST payable for {fyLabel}: <span className="font-semibold text-slate-700">{inr(summary.net_payable)}</span>. Challan tracking requires a GST portal connection to auto-import.</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
