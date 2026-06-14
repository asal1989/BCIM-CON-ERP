// src/pages/accounts/TaxSummaryPage.jsx — GST & TDS position derived from Chart of Accounts
import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Landmark, ArrowRight } from 'lucide-react';
import { chartOfAccountsAPI } from '../../api/client';
import { inr, FlatKPI } from '../dashboards/DashKPI';

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

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-md bg-blue-50 flex items-center justify-center">
            <Landmark className="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-800">Tax Summary</h1>
            <p className="text-xs text-slate-400">GST and TDS position from posted journal entries</p>
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
