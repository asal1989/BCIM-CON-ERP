// src/pages/accounts/TaxSummaryPage.jsx — GST & TDS position derived from Chart of Accounts
import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { Landmark, ArrowRight, Download, FileDown } from 'lucide-react';
import { chartOfAccountsAPI } from '../../api/client';
import { inr, FlatKPI } from '../dashboards/DashKPI';
import { downloadCsv, downloadPdf } from '../../utils/exportCsv';
import ProjectFilter from '../../components/ProjectFilter';

const CODE = {
  outputGst: '2100', // Output GST Payable
  inputGst:  '1300', // Input GST / ITC
  tdsPayable: '2200', // TDS Payable
};

export default function TaxSummaryPage() {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['chart-of-accounts', 'tax-summary'],
    queryFn: () => chartOfAccountsAPI.list().then(r => r.data?.data ?? []),
  });
  const rows = data ?? [];

  const byCode = useMemo(() => {
    const m = {};
    rows.forEach(a => { m[a.code] = a; });
    return m;
  }, [rows]);

  const outputGst = Math.abs(Number(byCode[CODE.outputGst]?.balance || 0));
  const inputGst  = Math.abs(Number(byCode[CODE.inputGst]?.balance || 0));
  const netGst    = outputGst - inputGst;
  const tdsPayable = Math.abs(Number(byCode[CODE.tdsPayable]?.balance || 0));

  const { data: monthlyData, isLoading: monthlyLoading } = useQuery({
    queryKey: ['tax-monthly-summary'],
    queryFn: () => chartOfAccountsAPI.taxMonthlySummary().then(r => r.data?.data ?? []),
  });
  const monthly = monthlyData ?? [];

  const monthlyRows = () => {
    const lines = [['Month', 'Output GST', 'Input GST (ITC)', 'Net GST Payable', 'TDS Payable']];
    monthly.forEach(m => lines.push([
      dayjs(m.month + '-01').format('MMM YYYY'),
      m.output_gst.toFixed(2), m.input_gst.toFixed(2), m.net_gst_payable.toFixed(2), m.tds_payable.toFixed(2),
    ]));
    return lines;
  };
  const exportCsv = () => downloadCsv(`tax-monthly-summary-${dayjs().format('YYYY')}.csv`, monthlyRows());
  const exportPdf = () => downloadPdf(`tax-monthly-summary-${dayjs().format('YYYY')}.pdf`, 'Monthly GST/TDS Summary', monthlyRows());

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-blue-50 flex items-center justify-center">
              <Landmark className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-800">Tax Summary</h1>
              <p className="text-xs text-slate-400">GST and TDS position from posted journal entries</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <ProjectFilter />
            <button onClick={exportCsv} disabled={monthly.length === 0}
              className="flex items-center gap-1.5 px-4 py-2 text-sm border border-slate-200 rounded-md text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
            <button onClick={exportPdf} disabled={monthly.length === 0}
              className="flex items-center gap-1.5 px-4 py-2 text-sm border border-slate-200 rounded-md text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              <FileDown className="w-3.5 h-3.5" /> PDF
            </button>
          </div>
        </div>
      </div>

      <div className="px-6 py-5 grid grid-cols-2 md:grid-cols-4 gap-3">
        <FlatKPI label="Output GST Payable" value={inr(outputGst)} sub="Collected on sales" color="amber" loading={isLoading} />
        <FlatKPI label="Input GST / ITC" value={inr(inputGst)} sub="Available credit" color="blue" loading={isLoading} />
        <FlatKPI label={netGst >= 0 ? 'Net GST Payable' : 'Net GST Refundable'} value={inr(Math.abs(netGst))}
          sub={netGst >= 0 ? 'Due to government' : 'Carry forward / claim'} color={netGst >= 0 ? 'red' : 'emerald'} loading={isLoading} />
        <FlatKPI label="TDS Payable" value={inr(tdsPayable)} sub="Deducted, to be deposited" color="purple" loading={isLoading} />
      </div>

      <div className="px-6 pb-5">
        <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
          <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Monthly GST / TDS Movement ({dayjs().format('YYYY')})</p>
          </div>
          {monthlyLoading ? (
            <div className="flex justify-center py-10">
              <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : monthly.length === 0 ? (
            <p className="px-4 py-8 text-sm text-slate-400 text-center">No posted journal entries yet for GST/TDS accounts</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {['Month', 'Output GST', 'Input GST (ITC)', 'Net GST Payable', 'TDS Payable'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {monthly.map(m => (
                  <tr key={m.month} className="hover:bg-slate-50">
                    <td className="px-4 py-2 text-slate-800">{dayjs(m.month + '-01').format('MMM YYYY')}</td>
                    <td className="px-4 py-2 text-right font-mono">{inr(m.output_gst)}</td>
                    <td className="px-4 py-2 text-right font-mono">{inr(m.input_gst)}</td>
                    <td className="px-4 py-2 text-right font-mono font-semibold text-slate-800">{inr(m.net_gst_payable)}</td>
                    <td className="px-4 py-2 text-right font-mono">{inr(m.tds_payable)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="px-6 pb-10 grid grid-cols-1 md:grid-cols-2 gap-4">
        <button onClick={() => navigate('/accounts/taxes/gst')}
          className="bg-white border border-slate-200 rounded-md p-5 text-left hover:bg-slate-50 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-800">GST Filing</p>
            <p className="text-xs text-slate-400 mt-1">GSTR-1 / GSTR-3B summaries, returns &amp; reconciliation</p>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-400" />
        </button>
        <button onClick={() => navigate('/accounts/taxes/tds')}
          className="bg-white border border-slate-200 rounded-md p-5 text-left hover:bg-slate-50 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-800">TDS Management</p>
            <p className="text-xs text-slate-400 mt-1">TDS deducted by vendor, due dates &amp; certificates</p>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-400" />
        </button>
      </div>
    </div>
  );
}
