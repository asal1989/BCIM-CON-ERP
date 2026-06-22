import React, { useState } from 'react';
import { IndianRupee, CheckCircle2, Clock, XCircle, Download, RefreshCw } from 'lucide-react';
import dayjs from 'dayjs';

const FY = 'FY 2025-26';
const TODAY = dayjs('2026-06-22');

const inr = v => `₹${(+v || 0).toLocaleString('en-IN')}`;

const RETURNS = [
  { month: 'April 2025',    gstr1Due: '2025-05-11', gstr1Filed: '2025-05-09', gstr3bDue: '2025-05-20', gstr3bFiled: '2025-05-18', taxable: 8450000, igst: 0, cgst: 760500, sgst: 760500, toPay: 1521000 },
  { month: 'May 2025',      gstr1Due: '2025-06-11', gstr1Filed: '2025-06-10', gstr3bDue: '2025-06-20', gstr3bFiled: '2025-06-19', taxable: 9200000, igst: 0, cgst: 828000, sgst: 828000, toPay: 1656000 },
  { month: 'June 2025',     gstr1Due: '2025-07-11', gstr1Filed: '2025-07-11', gstr3bDue: '2025-07-20', gstr3bFiled: '2025-07-18', taxable: 10100000, igst: 0, cgst: 909000, sgst: 909000, toPay: 1818000 },
  { month: 'July 2025',     gstr1Due: '2025-08-11', gstr1Filed: '2025-08-09', gstr3bDue: '2025-08-20', gstr3bFiled: '2025-08-20', taxable: 7800000, igst: 0, cgst: 702000, sgst: 702000, toPay: 1404000 },
  { month: 'August 2025',   gstr1Due: '2025-09-11', gstr1Filed: '2025-09-10', gstr3bDue: '2025-09-20', gstr3bFiled: '2025-09-19', taxable: 11200000, igst: 0, cgst: 1008000, sgst: 1008000, toPay: 2016000 },
  { month: 'September 2025',gstr1Due: '2025-10-11', gstr1Filed: '2025-10-10', gstr3bDue: '2025-10-20', gstr3bFiled: '2025-10-20', taxable: 13500000, igst: 0, cgst: 1215000, sgst: 1215000, toPay: 2430000 },
  { month: 'October 2025',  gstr1Due: '2025-11-11', gstr1Filed: '2025-11-10', gstr3bDue: '2025-11-20', gstr3bFiled: '2025-11-19', taxable: 12000000, igst: 0, cgst: 1080000, sgst: 1080000, toPay: 2160000 },
  { month: 'November 2025', gstr1Due: '2025-12-11', gstr1Filed: '2025-12-10', gstr3bDue: '2025-12-20', gstr3bFiled: '2025-12-19', taxable: 9800000, igst: 0, cgst: 882000, sgst: 882000, toPay: 1764000 },
  { month: 'December 2025', gstr1Due: '2026-01-11', gstr1Filed: '2026-01-10', gstr3bDue: '2026-01-20', gstr3bFiled: '2026-01-19', taxable: 14200000, igst: 0, cgst: 1278000, sgst: 1278000, toPay: 2556000 },
  { month: 'January 2026',  gstr1Due: '2026-02-11', gstr1Filed: '2026-02-11', gstr3bDue: '2026-02-20', gstr3bFiled: '2026-02-20', taxable: 11500000, igst: 0, cgst: 1035000, sgst: 1035000, toPay: 2070000 },
  { month: 'February 2026', gstr1Due: '2026-03-11', gstr1Filed: '2026-03-10', gstr3bDue: '2026-03-20', gstr3bFiled: '2026-03-19', taxable: 10200000, igst: 0, cgst: 918000, sgst: 918000, toPay: 1836000 },
  { month: 'March 2026',    gstr1Due: '2026-04-11', gstr1Filed: '2026-04-10', gstr3bDue: '2026-04-20', gstr3bFiled: '2026-04-18', taxable: 16500000, igst: 0, cgst: 1485000, sgst: 1485000, toPay: 2970000 },
  { month: 'April 2026',    gstr1Due: '2026-05-11', gstr1Filed: '2026-05-09', gstr3bDue: '2026-05-20', gstr3bFiled: '2026-05-19', taxable: 9100000, igst: 0, cgst: 819000, sgst: 819000, toPay: 1638000 },
  { month: 'May 2026',      gstr1Due: '2026-06-11', gstr1Filed: '2026-06-10', gstr3bDue: '2026-06-20', gstr3bFiled: '2026-06-19', taxable: 8800000, igst: 0, cgst: 792000, sgst: 792000, toPay: 1584000 },
  { month: 'June 2026',     gstr1Due: '2026-07-11', gstr1Filed: null,         gstr3bDue: '2026-07-20', gstr3bFiled: null,          taxable: 0, igst: 0, cgst: 0, sgst: 0, toPay: 0 },
];

const ITC = [
  { month: 'April 2025',  claimed: 920000, available: 1050000 },
  { month: 'May 2025',    claimed: 1020000, available: 1150000 },
  { month: 'June 2025',   claimed: 1100000, available: 1180000 },
  { month: 'May 2026',    claimed: 680000, available: 740000 },
  { month: 'June 2026',   claimed: 0, available: 0 },
];

function StatusPill({ filed, dueDate }) {
  if (filed) return <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-medium"><CheckCircle2 className="w-3 h-3" />{dayjs(filed).format('DD MMM')}</span>;
  const diff = dayjs(dueDate).diff(TODAY, 'day');
  if (diff < 0) return <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-red-50 text-red-700 font-medium"><XCircle className="w-3 h-3" />Overdue</span>;
  return <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium"><Clock className="w-3 h-3" />{dayjs(dueDate).format('DD MMM')}</span>;
}

const TABS = ['Returns Tracker', 'ITC Reconciliation', 'GST Payments'];

export default function GSTCompliancePage() {
  const [tab, setTab] = useState('Returns Tracker');
  const totalTax = RETURNS.reduce((s, r) => s + r.toPay, 0);
  const totalTaxable = RETURNS.reduce((s, r) => s + r.taxable, 0);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-violet-50 flex items-center justify-center">
              <IndianRupee className="w-4 h-4 text-violet-600" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-800">GST Compliance</h1>
              <p className="text-xs text-slate-400">{FY} — GSTR filings, ITC reconciliation, GST payments</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-slate-600 text-xs rounded-md hover:bg-slate-50">
              <RefreshCw className="w-3 h-3" /> Sync GST Portal
            </button>
            <button className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-slate-600 text-xs rounded-md hover:bg-slate-50">
              <Download className="w-3 h-3" /> Export
            </button>
          </div>
        </div>

        {/* Summary KPIs */}
        <div className="mt-4 grid grid-cols-4 gap-3">
          {[
            { label: 'Total Taxable Value', value: inr(totalTaxable), sub: FY },
            { label: 'Total GST Paid',      value: inr(totalTax),     sub: 'CGST + SGST' },
            { label: 'ITC Available',       value: inr(ITC.reduce((s,r)=>s+r.available,0)), sub: 'From 2B reconciliation' },
            { label: 'Returns Filed',       value: `${RETURNS.filter(r=>r.gstr3bFiled).length}/${RETURNS.length}`, sub: 'GSTR-3B' },
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
        {tab === 'Returns Tracker' && (
          <div className="bg-white border border-slate-200 rounded-md overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {['Month', 'GSTR-1 (Due 11th)', 'GSTR-3B (Due 20th)', 'Taxable Value', 'CGST', 'SGST', 'Net Tax Paid'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {RETURNS.map(r => (
                  <tr key={r.month} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-medium text-slate-800 whitespace-nowrap">{r.month}</td>
                    <td className="px-4 py-2.5"><StatusPill filed={r.gstr1Filed} dueDate={r.gstr1Due} /></td>
                    <td className="px-4 py-2.5"><StatusPill filed={r.gstr3bFiled} dueDate={r.gstr3bDue} /></td>
                    <td className="px-4 py-2.5 font-mono text-slate-700">{r.taxable ? inr(r.taxable) : '—'}</td>
                    <td className="px-4 py-2.5 font-mono text-slate-700">{r.cgst ? inr(r.cgst) : '—'}</td>
                    <td className="px-4 py-2.5 font-mono text-slate-700">{r.sgst ? inr(r.sgst) : '—'}</td>
                    <td className="px-4 py-2.5 font-mono font-semibold text-slate-800">{r.toPay ? inr(r.toPay) : '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 bg-slate-50 font-bold">
                  <td colSpan={3} className="px-4 py-2.5 text-sm text-slate-700">Total</td>
                  <td className="px-4 py-2.5 font-mono text-slate-800">{inr(totalTaxable)}</td>
                  <td className="px-4 py-2.5 font-mono text-slate-800">{inr(RETURNS.reduce((s,r)=>s+r.cgst,0))}</td>
                  <td className="px-4 py-2.5 font-mono text-slate-800">{inr(RETURNS.reduce((s,r)=>s+r.sgst,0))}</td>
                  <td className="px-4 py-2.5 font-mono text-slate-800">{inr(totalTax)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {tab === 'ITC Reconciliation' && (
          <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 bg-amber-50">
              <p className="text-xs text-amber-700 font-medium">ITC as per GSTR-2B vs Books — reconcile mismatches before filing GSTR-3B</p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {['Month', 'ITC in Books', 'ITC per GSTR-2B', 'Difference', 'Status'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {ITC.map(r => {
                  const diff = r.claimed - r.available;
                  return (
                    <tr key={r.month} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-medium text-slate-800">{r.month}</td>
                      <td className="px-4 py-2.5 font-mono text-slate-700">{inr(r.claimed)}</td>
                      <td className="px-4 py-2.5 font-mono text-slate-700">{inr(r.available)}</td>
                      <td className={`px-4 py-2.5 font-mono font-semibold ${diff !== 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                        {diff !== 0 ? `(${inr(Math.abs(diff))})` : '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        {diff === 0 ? <span className="text-[10px] px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full font-medium">Matched</span>
                          : diff > 0 ? <span className="text-[10px] px-2 py-0.5 bg-red-50 text-red-700 rounded-full font-medium">Excess claimed</span>
                          : <span className="text-[10px] px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full font-medium">Pending in 2B</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'GST Payments' && (
          <div className="bg-white border border-slate-200 rounded-md p-6 text-center">
            <IndianRupee className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-700 mb-1">GST Payment Challan History</p>
            <p className="text-xs text-slate-400">Track GST payments made via Challan — connect to GST portal API to auto-import</p>
          </div>
        )}
      </div>
    </div>
  );
}
