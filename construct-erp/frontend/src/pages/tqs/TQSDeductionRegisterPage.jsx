import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { tqsBillsAPI, projectAPI } from '../../api/client';
import * as XLSX from 'xlsx';
import { Download, Filter, Search } from 'lucide-react';
import dayjs from 'dayjs';

const inr = (v) => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt = (d) => d ? dayjs(d).format('DD-MM-YYYY') : '—';

function KPICard({ label, value, sub, color = 'text-slate-800' }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
      <p className="text-xs font-medium text-slate-900 font-medium uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-xl font-medium ${color}`}>₹{inr(value)}</p>
      {sub && <p className="text-xs text-slate-900 font-medium mt-0.5">{sub}</p>}
    </div>
  );
}

export default function TQSDeductionRegisterPage() {
  const [projectId, setProjectId] = useState('');
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const { data: projects = [] } = useQuery({
    queryKey: ['projects-list'],
    queryFn: () => projectAPI.list().then(r => { const d = r.data; return Array.isArray(d) ? d : (d?.data ?? d?.projects ?? []); }),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['deduction-register', projectId, fromDate, toDate],
    queryFn: () => tqsBillsAPI.deductionRegister({
      project_id: projectId || undefined,
      from_date: fromDate || undefined,
      to_date: toDate || undefined,
    }).then(r => r.data),
    staleTime: 60000,
  });

  const rows = useMemo(() => {
    const list = data?.data ?? [];
    if (!search) return list;
    const q = search.toLowerCase();
    return list.filter(r =>
      r.vendor_name?.toLowerCase().includes(q) ||
      r.wo_number?.toLowerCase().includes(q) ||
      r.project_name?.toLowerCase().includes(q)
    );
  }, [data, search]);

  const summary = data?.summary ?? {};

  const exportExcel = () => {
    const headers = [
      'WO Number', 'Vendor', 'Project', 'Bills',
      'Gross Billed', 'GST', 'Total Amount',
      'Retention Held', 'Advance Recovered', 'TDS Deducted',
      'Credit Notes', 'Other Deductions', 'Total Deductions',
      'Net Payable', 'Total Paid', 'Outstanding',
      'First Bill', 'Last Bill',
    ];
    const wsData = [
      headers,
      ...rows.map(r => [
        r.wo_number || '—', r.vendor_name, r.project_name || '—', r.bill_count,
        parseFloat(r.gross_billed || 0), parseFloat(r.gst_amount || 0), parseFloat(r.total_amount || 0),
        parseFloat(r.retention_held || 0), parseFloat(r.advance_recovered || 0), parseFloat(r.tds_deducted || 0),
        parseFloat(r.credit_notes || 0), parseFloat(r.other_deductions || 0), parseFloat(r.total_deductions || 0),
        parseFloat(r.net_payable || 0), parseFloat(r.total_paid || 0),
        parseFloat(r.net_payable || 0) - parseFloat(r.total_paid || 0),
        fmt(r.first_bill_date), fmt(r.last_bill_date),
      ]),
      [],
      ['TOTALS', '', '', '',
        parseFloat(summary.total_gross || 0), '', '',
        parseFloat(summary.total_retention || 0), parseFloat(summary.total_advance || 0), parseFloat(summary.total_tds || 0),
        '', '', parseFloat(summary.total_deductions || 0),
        parseFloat(summary.total_net || 0), parseFloat(summary.total_paid || 0),
        parseFloat(summary.total_net || 0) - parseFloat(summary.total_paid || 0),
      ],
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = headers.map((h, i) => ({ wch: i < 2 ? 24 : i === 2 ? 28 : 14 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Deduction Register');
    XLSX.writeFile(wb, `DQS_Deduction_Register_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  return (
    <div className="p-6 space-y-5 max-w-screen-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-medium text-slate-900">Deduction Register</h1>
          <p className="text-sm text-slate-900 font-medium mt-0.5">Retention, advance recovery, TDS &amp; deductions per subcontractor WO</p>
        </div>
        <button
          onClick={exportExcel}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2 rounded-xl"
        >
          <Download className="w-4 h-4" /> Export Excel
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <KPICard label="Gross Billed"       value={summary.total_gross}      color="text-slate-800" />
        <KPICard label="Retention Held"     value={summary.total_retention}  color="text-amber-600" />
        <KPICard label="Advance Recovered"  value={summary.total_advance}    color="text-orange-600" />
        <KPICard label="TDS Deducted"       value={summary.total_tds}        color="text-red-600" />
        <KPICard label="Total Deductions"   value={summary.total_deductions} color="text-rose-700" />
        <KPICard label="Net Payable"        value={summary.total_net}        color="text-blue-700" />
        <KPICard label="Total Paid"         value={summary.total_paid}       color="text-emerald-600"
          sub={`Outstanding: ₹${inr((summary.total_net||0) - (summary.total_paid||0))}`} />
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-100 p-4 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-48 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search WO, vendor, project…"
            className="pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-200 w-full focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
        <select
          value={projectId} onChange={e => setProjectId(e.target.value)}
          className="text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          <option value="">All Projects</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
            className="text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400" />
          <span className="text-slate-900 font-medium text-xs">to</span>
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
            className="text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="py-16 text-center text-slate-900 font-medium text-sm animate-pulse">Loading deduction data…</div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-slate-900 font-medium text-sm">No records found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-800 text-white text-[11px] font-medium uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">WO Number</th>
                  <th className="px-4 py-3 text-left">Vendor</th>
                  <th className="px-4 py-3 text-center">Bills</th>
                  <th className="px-4 py-3 text-right">Gross Billed</th>
                  <th className="px-4 py-3 text-right bg-amber-900/40">Retention</th>
                  <th className="px-4 py-3 text-right bg-orange-900/40">Adv. Recovered</th>
                  <th className="px-4 py-3 text-right bg-red-900/40">TDS</th>
                  <th className="px-4 py-3 text-right bg-rose-900/40">Other Ded.</th>
                  <th className="px-4 py-3 text-right bg-rose-900/60">Total Ded.</th>
                  <th className="px-4 py-3 text-right bg-blue-900/40">Net Payable</th>
                  <th className="px-4 py-3 text-right bg-emerald-900/40">Paid</th>
                  <th className="px-4 py-3 text-right bg-red-900/40">Outstanding</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {rows.map((r, i) => {
                  const outstanding = parseFloat(r.net_payable || 0) - parseFloat(r.total_paid || 0);
                  return (
                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-2.5 font-mono font-medium text-indigo-700 whitespace-nowrap">{r.wo_number || '—'}</td>
                      <td className="px-4 py-2.5 font-medium text-slate-900 font-medium max-w-[180px] truncate" title={r.vendor_name}>{r.vendor_name}</td>
                      <td className="px-4 py-2.5 text-center text-slate-500">{r.bill_count}</td>
                      <td className="px-4 py-2.5 text-right font-medium text-slate-800">₹{inr(r.gross_billed)}</td>
                      <td className="px-4 py-2.5 text-right text-amber-700 font-medium bg-amber-50/40">
                        {parseFloat(r.retention_held) > 0 ? `₹${inr(r.retention_held)}` : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right text-orange-700 font-medium bg-orange-50/40">
                        {parseFloat(r.advance_recovered) > 0 ? `₹${inr(r.advance_recovered)}` : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right text-red-600 font-medium bg-red-50/40">
                        {parseFloat(r.tds_deducted) > 0 ? `₹${inr(r.tds_deducted)}` : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right text-rose-600 bg-rose-50/30">
                        {parseFloat(r.other_deductions) + parseFloat(r.credit_notes || 0) > 0
                          ? `₹${inr(parseFloat(r.other_deductions) + parseFloat(r.credit_notes || 0))}`
                          : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right text-rose-700 font-medium bg-rose-50/50">
                        {parseFloat(r.total_deductions) > 0 ? `₹${inr(r.total_deductions)}` : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right text-blue-700 font-medium bg-blue-50/40">₹{inr(r.net_payable)}</td>
                      <td className="px-4 py-2.5 text-right text-emerald-700 font-medium bg-emerald-50/40">₹{inr(r.total_paid)}</td>
                      <td className={`px-4 py-2.5 text-right font-medium ${outstanding > 0 ? 'text-red-600 bg-red-50/50' : 'text-emerald-600 bg-emerald-50/30'}`}>
                        {outstanding > 0 ? `₹${inr(outstanding)}` : '✓ Cleared'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {/* Totals row */}
              <tfoot>
                <tr className="bg-slate-800 text-white font-medium text-[11px]">
                  <td colSpan={3} className="px-4 py-2.5 text-left">TOTAL ({rows.length} WOs)</td>
                  <td className="px-4 py-2.5 text-right">₹{inr(rows.reduce((s,r)=>s+parseFloat(r.gross_billed||0),0))}</td>
                  <td className="px-4 py-2.5 text-right text-amber-300">₹{inr(rows.reduce((s,r)=>s+parseFloat(r.retention_held||0),0))}</td>
                  <td className="px-4 py-2.5 text-right text-orange-300">₹{inr(rows.reduce((s,r)=>s+parseFloat(r.advance_recovered||0),0))}</td>
                  <td className="px-4 py-2.5 text-right text-red-300">₹{inr(rows.reduce((s,r)=>s+parseFloat(r.tds_deducted||0),0))}</td>
                  <td className="px-4 py-2.5 text-right text-rose-300">₹{inr(rows.reduce((s,r)=>s+parseFloat(r.other_deductions||0)+parseFloat(r.credit_notes||0),0))}</td>
                  <td className="px-4 py-2.5 text-right text-rose-200">₹{inr(rows.reduce((s,r)=>s+parseFloat(r.total_deductions||0),0))}</td>
                  <td className="px-4 py-2.5 text-right text-blue-200">₹{inr(rows.reduce((s,r)=>s+parseFloat(r.net_payable||0),0))}</td>
                  <td className="px-4 py-2.5 text-right text-emerald-300">₹{inr(rows.reduce((s,r)=>s+parseFloat(r.total_paid||0),0))}</td>
                  <td className="px-4 py-2.5 text-right text-red-300">
                    ₹{inr(rows.reduce((s,r)=>s+parseFloat(r.net_payable||0)-parseFloat(r.total_paid||0),0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
