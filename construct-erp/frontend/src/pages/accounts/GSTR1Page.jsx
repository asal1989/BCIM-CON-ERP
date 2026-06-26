// src/pages/accounts/GSTR1Page.jsx — GSTR-1 outward supplies (sales) from RA bills
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, RefreshCw } from 'lucide-react';
import dayjs from 'dayjs';
import { reportAPI } from '../../api/client';
import useAuthStore from '../../store/authStore';
import ProjectFilter from '../../components/ProjectFilter';

const inr = v => `₹${(+v || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const now = new Date();
const CURRENT_FY = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;

export default function GSTR1Page() {
  const [fy, setFy] = useState(CURRENT_FY);
  const { selectedProjectId } = useAuthStore();

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['gstr1', fy, selectedProjectId],
    queryFn: () => reportAPI.gstr1({ fy, project_id: selectedProjectId || undefined }).then(r => r.data),
  });

  const supplies = data?.supplies ?? [];
  const summary = data?.summary ?? {};
  const fyLabel = data?.fy ?? `FY ${fy}-${String(fy + 1).slice(-2)}`;
  const fyOptions = [CURRENT_FY, CURRENT_FY - 1, CURRENT_FY - 2];

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-violet-50 flex items-center justify-center">
              <FileText className="w-4 h-4 text-violet-600" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-800">GSTR-1 — Outward Supplies</h1>
              <p className="text-xs text-slate-400">{fyLabel} — client RA bills (sales) with GST. Due 11th of the following month.</p>
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

        <div className="mt-4 grid grid-cols-3 gap-3">
          {[
            { label: 'Outward Invoices', value: summary.invoice_count || 0, sub: 'RA bills' },
            { label: 'Taxable Value',    value: inr(summary.total_taxable), sub: fyLabel },
            { label: 'Output GST',       value: inr(summary.total_gst),     sub: 'CGST + SGST' },
          ].map(({ label, value, sub }) => (
            <div key={label} className="bg-slate-50 border border-slate-200 rounded-md px-4 py-3">
              <p className="text-xs text-slate-500 mb-1">{label}</p>
              <p className="text-base font-bold text-slate-800">{value}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="px-6 py-4 pb-8">
        {isLoading ? (
          <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" /></div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-md overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {['Bill No', 'Date', 'Project', 'Taxable Value', 'Rate', 'CGST', 'SGST', 'Total GST', 'Invoice Total'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {supplies.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-mono text-xs font-semibold text-violet-700">{r.bill_number}</td>
                    <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{dayjs(r.bill_date).format('DD MMM YYYY')}</td>
                    <td className="px-4 py-2.5 text-slate-600 text-xs">{r.project_name}</td>
                    <td className="px-4 py-2.5 font-mono text-slate-700">{inr(r.taxable)}</td>
                    <td className="px-4 py-2.5 text-slate-500 text-xs">{r.gst_rate}%</td>
                    <td className="px-4 py-2.5 font-mono text-slate-700">{inr(r.cgst)}</td>
                    <td className="px-4 py-2.5 font-mono text-slate-700">{inr(r.sgst)}</td>
                    <td className="px-4 py-2.5 font-mono text-slate-700">{inr(r.total_gst)}</td>
                    <td className="px-4 py-2.5 font-mono font-semibold text-slate-800">{inr(r.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 bg-slate-50 font-bold">
                  <td colSpan={3} className="px-4 py-2.5 text-sm text-slate-700">Total ({summary.invoice_count || 0})</td>
                  <td className="px-4 py-2.5 font-mono text-slate-800">{inr(summary.total_taxable)}</td>
                  <td />
                  <td className="px-4 py-2.5 font-mono text-slate-800">{inr((summary.total_gst || 0) / 2)}</td>
                  <td className="px-4 py-2.5 font-mono text-slate-800">{inr((summary.total_gst || 0) / 2)}</td>
                  <td className="px-4 py-2.5 font-mono text-slate-800">{inr(summary.total_gst)}</td>
                  <td className="px-4 py-2.5 font-mono text-slate-800">{inr((summary.total_taxable || 0) + (summary.total_gst || 0))}</td>
                </tr>
              </tfoot>
            </table>
            {supplies.length === 0 && <p className="px-4 py-10 text-sm text-slate-400 text-center">No outward supplies (RA bills) for {fyLabel}.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
