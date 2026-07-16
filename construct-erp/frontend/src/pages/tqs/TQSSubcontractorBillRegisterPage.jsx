import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { tqsBillsAPI, projectAPI } from '../../api/client';
import * as XLSX from 'xlsx';
import { Download, Search, ExternalLink } from 'lucide-react';
import dayjs from 'dayjs';

const inr = (v) => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt = (d) => d ? dayjs(d).format('DD-MM-YYYY') : '—';

const STATUS_COLORS = {
  pending:  'bg-amber-100 text-amber-700',
  qs:       'bg-blue-100 text-blue-700',
  accounts: 'bg-purple-100 text-purple-700',
  paid:     'bg-emerald-100 text-emerald-700',
};

function StatusBadge({ status }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide ${STATUS_COLORS[status] || 'bg-slate-100 text-slate-600'}`}>
      {status || '—'}
    </span>
  );
}

function KPICard({ label, value, color = 'text-slate-800' }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
      <p className="text-xs font-medium text-slate-900 font-medium uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-xl font-medium ${color}`}>₹{inr(value)}</p>
    </div>
  );
}

const STATUS_TABS = ['all', 'pending', 'qs', 'accounts', 'paid'];

export default function TQSSubcontractorBillRegisterPage() {
  const navigate = useNavigate();
  const [projectId, setProjectId] = useState('');
  const [search, setSearch] = useState('');
  const [statusTab, setStatusTab] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const { data: projects = [] } = useQuery({
    queryKey: ['projects-list'],
    queryFn: () => projectAPI.list().then(r => { const d = r.data; return Array.isArray(d) ? d : (d?.data ?? d?.projects ?? []); }),
  });

  const { data: bills = [], isLoading } = useQuery({
    queryKey: ['subcontractor-bill-register', projectId, fromDate, toDate],
    queryFn: () => tqsBillsAPI.list({
      project_id: projectId || undefined,
      from_date: fromDate || undefined,
      to_date: toDate || undefined,
      bill_type: 'wo',
      limit: 1000,
    }).then(r => {
      const all = r.data?.data ?? r.data?.bills ?? [];
      // Also include po_number starting with WOTQS
      return all.filter(b => b.bill_type === 'wo' || /^WOTQS/i.test(b.po_number || '') || /^WOTQS/i.test(b.wo_number || ''));
    }),
    staleTime: 60000,
  });

  const filtered = useMemo(() => {
    let list = bills;
    if (statusTab !== 'all') list = list.filter(b => b.workflow_status === statusTab);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(b =>
        b.sl_number?.toLowerCase().includes(q) ||
        b.vendor_name?.toLowerCase().includes(q) ||
        b.po_number?.toLowerCase().includes(q) ||
        b.inv_number?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [bills, statusTab, search]);

  const kpis = useMemo(() => filtered.reduce((acc, b) => ({
    gross: acc.gross + parseFloat(b.basic_amount || 0),
    gst:   acc.gst   + parseFloat(b.gst_amount || 0),
    total: acc.total + parseFloat(b.total_amount || 0),
    paid:  acc.paid  + (b.workflow_status === 'paid' ? parseFloat(b.total_amount || 0) : 0),
  }), { gross: 0, gst: 0, total: 0, paid: 0 }), [filtered]);

  const exportExcel = () => {
    const headers = [
      'Sl No', 'Bill Date', 'WO Number', 'Vendor', 'Invoice No', 'Invoice Date',
      'Basic Amount', 'GST', 'Total Amount', 'Status', 'Remarks',
    ];
    const ws = XLSX.utils.aoa_to_sheet([
      headers,
      ...filtered.map(b => [
        b.sl_number, fmt(b.inv_date),
        b.po_number || b.wo_number || '—', b.vendor_name,
        b.inv_number, fmt(b.inv_date),
        parseFloat(b.basic_amount || 0), parseFloat(b.gst_amount || 0), parseFloat(b.total_amount || 0),
        b.workflow_status, b.remarks || '',
      ]),
      [],
      ['TOTALS', '', '', '', '', '', kpis.gross, kpis.gst, kpis.total],
    ]);
    ws['!cols'] = headers.map((_, i) => ({ wch: i === 3 ? 30 : 16 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'WO Bill Register');
    XLSX.writeFile(wb, `WO_Bill_Register_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const tabCounts = useMemo(() => STATUS_TABS.reduce((acc, s) => ({
    ...acc,
    [s]: s === 'all' ? bills.length : bills.filter(b => b.workflow_status === s).length,
  }), {}), [bills]);

  return (
    <div className="p-6 space-y-5 max-w-screen-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-medium text-slate-900">Subcontractor Bill Register</h1>
          <p className="text-sm text-slate-900 font-medium mt-0.5">All RA bills for WOTQS subcontractor work orders</p>
        </div>
        <button onClick={exportExcel} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2 rounded-xl">
          <Download className="w-4 h-4" /> Export Excel
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KPICard label="Gross Billed"  value={kpis.gross} />
        <KPICard label="GST"           value={kpis.gst}   color="text-orange-600" />
        <KPICard label="Total Amount"  value={kpis.total} color="text-blue-700" />
        <KPICard label="Paid"          value={kpis.paid}  color="text-emerald-600" />
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-100 p-4 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-48 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search WO, vendor, invoice…"
            className="pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-200 w-full focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>
        <select value={projectId} onChange={e => setProjectId(e.target.value)}
          className="text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400">
          <option value="">All Projects</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
          className="text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400" />
        <span className="text-slate-900 font-medium text-xs">to</span>
        <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
          className="text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400" />
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {STATUS_TABS.map(s => (
          <button key={s} onClick={() => setStatusTab(s)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg capitalize transition-colors ${statusTab === s ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-900 font-medium hover:text-slate-700'}`}>
            {s === 'all' ? 'All' : s} <span className="ml-1 text-[10px] text-slate-400">({tabCounts[s]})</span>
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="py-16 text-center text-slate-900 font-medium text-sm animate-pulse">Loading bills…</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-slate-900 font-medium text-sm">No bills found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-800 text-white text-[11px] font-medium uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">Sl No</th>
                  <th className="px-4 py-3 text-left">WO Number</th>
                  <th className="px-4 py-3 text-left">Vendor</th>
                  <th className="px-4 py-3 text-left">Invoice No</th>
                  <th className="px-4 py-3 text-left">Inv Date</th>
                  <th className="px-4 py-3 text-right">Basic</th>
                  <th className="px-4 py-3 text-right">GST</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-center">View</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((b, i) => (
                  <tr key={b.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-2.5 font-mono text-slate-500">{b.sl_number}</td>
                    <td className="px-4 py-2.5 font-mono font-medium text-indigo-700">{b.po_number || b.wo_number || '—'}</td>
                    <td className="px-4 py-2.5 font-medium text-slate-900 font-medium max-w-[180px] truncate" title={(b.vendor_name || '').toUpperCase()}>{(b.vendor_name || '').toUpperCase()}</td>
                    <td className="px-4 py-2.5 text-slate-600">{b.inv_number || '—'}</td>
                    <td className="px-4 py-2.5 text-slate-900 font-medium whitespace-nowrap">{fmt(b.inv_date)}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-slate-700">₹{inr(b.basic_amount)}</td>
                    <td className="px-4 py-2.5 text-right text-orange-600">₹{inr(b.gst_amount)}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-slate-800">₹{inr(b.total_amount)}</td>
                    <td className="px-4 py-2.5 text-center"><StatusBadge status={b.workflow_status} /></td>
                    <td className="px-4 py-2.5 text-center">
                      <button onClick={() => navigate(`/tqs/bills/${b.id}`)}
                        className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-900 font-medium hover:text-blue-600 transition-colors">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-800 text-white font-medium text-[11px]">
                  <td colSpan={5} className="px-4 py-2.5 text-left">TOTAL ({filtered.length} bills)</td>
                  <td className="px-4 py-2.5 text-right">₹{inr(kpis.gross)}</td>
                  <td className="px-4 py-2.5 text-right text-orange-300">₹{inr(kpis.gst)}</td>
                  <td className="px-4 py-2.5 text-right">₹{inr(kpis.total)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
