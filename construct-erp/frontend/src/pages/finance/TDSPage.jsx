import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, FileSignature, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import api, { reportAPI } from '../../api/client';
import dayjs from 'dayjs';
import { clsx } from 'clsx';
import DataToolbar from '../../components/common/DataToolbar';
import useAuthStore from '../../store/authStore';

const fmt  = v => `₹${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function download26Q(records) {
  const rows = [
    ['Payee', 'PAN', 'Section', 'Payment Amount', 'TDS Rate %', 'TDS Amount', 'Payment Date', 'Reference'].join(','),
    ...records.map(r => [
      `"${r.entity_name || ''}"`,
      r.entity_pan || '',
      r.tds_section || '194C',
      r.amount || 0,
      r.tds_rate || 2,
      r.tds_deducted || 0,
      r.payment_date ? dayjs(r.payment_date).format('DD-MM-YYYY') : '',
      `"${r.reference_number || ''}"`,
    ].join(',')),
  ].join('\n');
  const blob = new Blob([rows], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Form_26Q_${dayjs().format('YYYY-MM')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function TDSPage() {
  const [activeTab, setActiveTab] = useState('outgoing'); // 'outgoing' | 'incoming'
  const { selectedProjectId } = useAuthStore();

  const { data: raw } = useQuery({
    queryKey: ['tds', selectedProjectId],
    queryFn: () => api.get('/tds', { params: { project_id: selectedProjectId || '' } }).then(r => r.data),
  });

  const outgoing = raw?.outgoing || [];
  const incoming = raw?.incoming || [];

  // KPIs
  const totalOutTDS   = outgoing.reduce((s, r) => s + Number(r.tds_amount || 0), 0);
  const totalInTDS    = incoming.reduce((s, r) => s + Number(r.tds_amount || 0), 0);
  const depositedOut  = outgoing.filter(r => r.deposited).reduce((s, r) => s + Number(r.tds_amount || 0), 0);
  const pendingDeposit = totalOutTDS - depositedOut;

  const records = activeTab === 'outgoing' ? outgoing : incoming;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto bg-slate-50 min-h-screen text-[0.94rem]">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 flex items-center justify-center shadow-sm">
            <FileSignature className="w-6 h-6 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-[1.25rem] md:text-[1.5rem] font-medium text-slate-900 uppercase tracking-tight italic">TDS Register</h1>
            <p className="text-[9px] text-slate-900 font-medium uppercase tracking-widest mt-1">
              TDS deducted by us (payable) · TDS deducted by client (receivable credit)
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => download26Q(outgoing)}
            className="px-4 py-2.5 bg-white border border-slate-200 text-indigo-600 hover:border-indigo-300 font-medium uppercase text-[9px] tracking-widest rounded-xl transition-all shadow-sm flex items-center gap-2 italic"
          >
            <Download className="w-3.5 h-3.5" /> Download Form 26Q
          </button>
          <DataToolbar data={records} fileName="TDS_Register_Export" hideAdd />
        </div>
      </div>

      {/* KPIs — two sides */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white border border-red-100 rounded-[1.5rem] p-4 text-center shadow-sm">
          <div className="text-[9px] font-medium text-red-300 uppercase tracking-widest mb-2 italic">We Deduct (Payable)</div>
          <div className="text-[1.4rem] font-medium text-red-500 font-mono tracking-tighter italic">{fmt(totalOutTDS)}</div>
          <div className="text-[9px] font-medium text-slate-900 font-medium uppercase tracking-widest mt-2 italic">TDS on Vendor / Labour Payments</div>
        </div>
        <div className="bg-white border border-amber-100 rounded-[1.5rem] p-4 text-center shadow-sm">
          <div className="text-[9px] font-medium text-amber-300 uppercase tracking-widest mb-2 italic">We Deduct (Payable)</div>
          <div className="text-[1.4rem] font-medium text-amber-500 font-mono tracking-tighter italic">{fmt(pendingDeposit)}</div>
          <div className="text-[9px] font-medium text-slate-900 font-medium uppercase tracking-widest mt-2 italic">Pending Deposit to Govt</div>
        </div>
        <div className="bg-white border border-emerald-100 rounded-[1.5rem] p-4 text-center shadow-sm">
          <div className="text-[9px] font-medium text-emerald-400 uppercase tracking-widest mb-2 italic">Client Deducts (Credit)</div>
          <div className="text-[1.4rem] font-medium text-emerald-600 font-mono tracking-tighter italic">{fmt(totalInTDS)}</div>
          <div className="text-[9px] font-medium text-slate-900 font-medium uppercase tracking-widest mt-2 italic">TDS Deducted by Client (26AS Credit)</div>
        </div>
        <div className="bg-white border border-indigo-100 rounded-[1.5rem] p-4 text-center shadow-sm">
          <div className="text-[9px] font-medium text-indigo-400 uppercase tracking-widest mb-2 italic">Net TDS Position</div>
          <div className={clsx('text-[1.4rem] font-medium font-mono tracking-tighter italic',
            totalOutTDS > totalInTDS ? 'text-red-600' : 'text-emerald-600')}>
            {fmt(Math.abs(totalOutTDS - totalInTDS))}
          </div>
          <div className="text-[9px] font-medium text-slate-900 font-medium uppercase tracking-widest mt-2 italic">
            {totalOutTDS > totalInTDS ? 'Net Payable to Govt' : 'Net Credit Available'}
          </div>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab('outgoing')}
          className={clsx(
            'flex items-center gap-2 px-4 py-2.5 rounded-xl text-[10px] font-medium uppercase tracking-widest transition-all',
            activeTab === 'outgoing'
              ? 'bg-red-500 text-white shadow-md'
              : 'bg-white border border-slate-200 text-slate-900 font-medium hover:text-slate-900'
          )}
        >
          <ArrowUpCircle size={14} />
          TDS Deducted by Us — Vendor / Labour / Sub-con
          <span className={clsx('ml-1 px-2 py-0.5 rounded-full text-[9px] font-medium',
            activeTab === 'outgoing' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500')}>
            {outgoing.length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab('incoming')}
          className={clsx(
            'flex items-center gap-2 px-5 py-3 rounded-xl text-[11px] font-medium uppercase tracking-widest transition-all',
            activeTab === 'incoming'
              ? 'bg-emerald-600 text-white shadow-md'
              : 'bg-white border border-slate-200 text-slate-900 font-medium hover:text-slate-900'
          )}
        >
          <ArrowDownCircle size={14} />
          TDS Deducted by Client — RA Bills
          <span className={clsx('ml-1 px-2 py-0.5 rounded-full text-[9px] font-medium',
            activeTab === 'incoming' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500')}>
            {incoming.length}
          </span>
        </button>
      </div>

      {/* Context banner */}
      <div className={clsx('rounded-2xl px-6 py-4 text-[11px] font-medium border',
        activeTab === 'outgoing'
          ? 'bg-red-50 border-red-200 text-red-700'
          : 'bg-emerald-50 border-emerald-200 text-emerald-700')}>
        {activeTab === 'outgoing'
          ? '⚠ These are TDS amounts WE deducted from vendor/labour/subcontractor payments. We are the deductor — must deposit with govt via Form 281 and file Form 26Q.'
          : '✓ These are TDS amounts the CLIENT deducted from our RA bill receipts. Client is the deductor — they issue Form 16A. This appears as credit in our 26AS statement.'}
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-[2.5rem] overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                {(activeTab === 'outgoing'
                  ? ['Payee', 'PAN', 'Section', 'Project', 'Payment Amount', 'TDS Rate', 'TDS Deducted', 'Net Paid', 'Payment Date', 'Challan #', 'Deposited']
                  : ['Client', 'PAN', 'Section', 'Project', 'Bill Gross', 'TDS Rate', 'TDS by Client', 'Amount Received', 'Receipt Date', 'UTR / Ref', 'Form 16A']
                ).map((h, i) => (
                  <th key={i} className={clsx(
                    'py-5 px-4 text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest italic whitespace-nowrap',
                    ['Payment Amount','TDS Deducted','Net Paid','Bill Gross','TDS by Client','Amount Received'].includes(h) ? 'text-right' : ''
                  )}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {records.map(r => (
                <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="p-4 pl-6">
                    <div className="font-medium text-slate-900 text-sm uppercase tracking-tight italic">{r.payee_name}</div>
                    <div className="text-[10px] text-slate-900 font-medium uppercase tracking-widest mt-1">{r.payee_type}</div>
                  </td>
                  <td className="p-4 font-mono text-xs font-medium text-indigo-600 tracking-widest">{r.pan || '—'}</td>
                  <td className="p-4">
                    <span className="px-3 py-1.5 rounded-xl text-[9px] font-medium uppercase tracking-widest italic shadow-sm bg-indigo-50 text-indigo-600 border border-indigo-200">
                      {r.section}
                    </span>
                  </td>
                  <td className="p-4 font-medium text-slate-900 uppercase text-[10px] tracking-widest max-w-[120px] truncate">{r.project_name}</td>
                  <td className="p-4 text-right font-mono font-medium text-slate-900 tracking-tighter italic">{fmt(r.invoice_amount)}</td>
                  <td className="p-4 text-right font-mono font-medium text-slate-600">{r.tds_rate}%</td>
                  <td className="p-4 text-right font-mono font-medium text-red-500 text-sm tracking-tighter italic bg-red-50/30">{fmt(r.tds_amount)}</td>
                  <td className="p-4 text-right font-mono font-medium text-emerald-600 text-base tracking-tighter italic bg-emerald-50/30">{fmt(r.net_paid)}</td>
                  <td className="p-4 text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest whitespace-nowrap">
                    {r.payment_date ? dayjs(r.payment_date).format('DD MMM YYYY') : '—'}
                  </td>
                  <td className="p-4 font-mono font-medium text-slate-900 text-[10px] tracking-widest">
                    {r.challan_number || <span className="text-slate-900 font-medium italic font-normal">—</span>}
                  </td>
                  <td className="p-4">
                    {activeTab === 'outgoing' ? (
                      r.deposited
                        ? <span className="px-3 py-1.5 rounded-xl text-[9px] font-medium uppercase tracking-widest italic shadow-sm bg-emerald-50 text-emerald-600 border border-emerald-200">Deposited</span>
                        : <span className="px-3 py-1.5 rounded-xl text-[9px] font-medium uppercase tracking-widest italic shadow-sm bg-amber-50 text-amber-600 border border-amber-200">Pending</span>
                    ) : (
                      r.deposited
                        ? <span className="px-3 py-1.5 rounded-xl text-[9px] font-medium uppercase tracking-widest italic shadow-sm bg-emerald-50 text-emerald-600 border border-emerald-200">Received</span>
                        : <span className="px-3 py-1.5 rounded-xl text-[9px] font-medium uppercase tracking-widest italic shadow-sm bg-violet-50 text-violet-600 border border-violet-200">Pending 16A</span>
                    )}
                  </td>
                </tr>
              ))}
              {records.length === 0 && (
                <tr>
                  <td colSpan={11} className="py-24 text-center">
                    <FileSignature className="w-10 h-10 text-slate-300 mx-auto mb-4" />
                    <span className="font-medium text-slate-900 font-medium uppercase tracking-[0.3em] italic block">
                      {activeTab === 'outgoing' ? 'No outgoing TDS recorded yet' : 'No client TDS entries yet — mark RA bills as received'}
                    </span>
                  </td>
                </tr>
              )}
            </tbody>
            {records.length > 0 && (
              <tfoot>
                <tr className="bg-slate-50 border-t border-slate-200">
                  <td colSpan={4} className="p-5 pl-6 text-slate-900 font-medium uppercase tracking-widest text-[10px] italic">
                    Total ({records.length} entries)
                  </td>
                  <td className="p-5 text-right text-slate-900 font-mono font-medium text-base italic tracking-tighter">
                    {fmt(records.reduce((s, r) => s + Number(r.invoice_amount || 0), 0))}
                  </td>
                  <td className="p-5 bg-slate-100" />
                  <td className="p-5 text-right text-red-500 font-mono font-medium text-xl italic tracking-tighter bg-red-50/50">
                    {fmt(records.reduce((s, r) => s + Number(r.tds_amount || 0), 0))}
                  </td>
                  <td className="p-5 text-right text-emerald-600 font-mono font-medium text-xl italic tracking-tighter bg-emerald-50/50">
                    {fmt(records.reduce((s, r) => s + Number(r.net_paid || 0), 0))}
                  </td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
