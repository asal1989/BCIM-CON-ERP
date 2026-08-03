// src/pages/qs/RABillPage.jsx
import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Receipt, CheckCircle2, ShieldCheck, TrendingUp, Building2,
  Calendar, FileText, Download, Eye, XCircle, Wallet2,
  BarChart3, Plus, Search, Clock, Banknote, AlertCircle,
  Filter, ArrowUpRight, RefreshCw, Trash2,
} from 'lucide-react';
import { raBillAPI, projectAPI } from '../../api/client';
import useAuthStore from '../../store/authStore';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import dayjs from 'dayjs';
import { Link, useNavigate } from 'react-router-dom';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Theme, PageHeader, KpiCard } from '../../theme';

const inr = v => `₹${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const inrC = v => {
  const n = Number(v || 0);
  return inr(n);
};

const STATUS = {
  draft:     { label: 'Draft',      bg: 'bg-slate-100',   text: 'text-slate-500',   border: 'border-slate-200',   dot: 'bg-slate-400',   Icon: FileText },
  submitted: { label: 'Submitted',  bg: 'bg-amber-50',    text: 'text-amber-600',   border: 'border-amber-200',   dot: 'bg-amber-400',   Icon: Clock },
  verified:  { label: 'Verified',   bg: 'bg-blue-50',     text: 'text-blue-600',    border: 'border-blue-200',    dot: 'bg-blue-500',    Icon: ShieldCheck },
  certified: { label: 'Certified',  bg: 'bg-emerald-50',  text: 'text-emerald-600', border: 'border-emerald-200', dot: 'bg-emerald-500', Icon: CheckCircle2 },
  rejected:  { label: 'Rejected',   bg: 'bg-red-50',      text: 'text-red-500',     border: 'border-red-200',     dot: 'bg-red-400',     Icon: XCircle },
  paid:      { label: 'Paid',       bg: 'bg-teal-50',     text: 'text-teal-600',    border: 'border-teal-200',    dot: 'bg-teal-500',    Icon: Banknote },
};

const TABS = [
  { key: 'all',       label: 'All' },
  { key: 'draft',     label: 'Draft' },
  { key: 'submitted', label: 'Pending Verify' },
  { key: 'verified',  label: 'Pending Certify' },
  { key: 'certified', label: 'Certified' },
  { key: 'paid',      label: 'Paid' },
  { key: 'rejected',  label: 'Rejected' },
];

const CAN_VERIFY  = ['qs_engineer', 'admin', 'super_admin'];
const CAN_CERTIFY = ['project_manager', 'admin', 'super_admin'];

export default function RABillPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const role = user?.role || '';
  const [activeTab, setActiveTab]         = useState('all');
  const [filterProject, setFilterProject] = useState('all');
  const [search, setSearch]               = useState('');
  const [sort, setSort]                   = useState({ key: null, dir: 'asc' });

  const { data: bills = [], isLoading, refetch } = useQuery({
    queryKey: ['ra-bills', filterProject],
    queryFn: () =>
      raBillAPI.list(filterProject !== 'all' ? { project_id: filterProject } : {})
        .then(r => r.data?.data || [])
        .catch(() => []),
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectAPI.list().then(r => r.data?.data || []).catch(() => []),
  });

  const verifyMut = useMutation({
    mutationFn: id => raBillAPI.verify(id),
    onSuccess: () => { toast.success('Bill verified'); qc.invalidateQueries({ queryKey: ['ra-bills'] }); },
    onError: e => toast.error(e?.response?.data?.error || 'Verification failed'),
  });

  const deleteMut = useMutation({
    mutationFn: id => raBillAPI.delete(id),
    onSuccess: () => { toast.success('Bill deleted'); qc.invalidateQueries({ queryKey: ['ra-bills'] }); },
    onError: e => toast.error(e?.response?.data?.error || 'Cannot delete — check status'),
  });

  const toggleSort = (key) => setSort(s => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    const rows = bills.filter(b => {
      const matchTab  = activeTab === 'all' || b.status === activeTab;
      const matchSrch = !term ||
        b.bill_number?.toLowerCase().includes(term) ||
        b.project_name?.toLowerCase().includes(term) ||
        b.contractor_name?.toLowerCase().includes(term);
      return matchTab && matchSrch;
    });
    if (!sort.key) return rows;
    const dir = sort.dir === 'asc' ? 1 : -1;
    const accessors = {
      bill_number:  b => (b.bill_number || '').toLowerCase(),
      bill_date:    b => (b.bill_date ? new Date(b.bill_date).getTime() : 0),
      gross_amount: b => parseFloat(b.gross_amount) || 0,
      total_deductions: b => parseFloat(b.total_deductions) || 0,
      net_payable:  b => parseFloat(b.net_payable) || 0,
      status:       b => (b.status || '').toLowerCase(),
    };
    const acc = accessors[sort.key];
    return acc ? [...rows].sort((a, b) => (acc(a) > acc(b) ? 1 : acc(a) < acc(b) ? -1 : 0) * dir) : rows;
  }, [bills, activeTab, search, sort]);

  // KPIs
  const kpis = useMemo(() => ({
    total:     bills.reduce((s, b) => s + parseFloat(b.gross_amount || 0), 0),
    certified: bills.filter(b => ['certified','paid'].includes(b.status)).reduce((s, b) => s + parseFloat(b.net_payable || 0), 0),
    retention: bills.reduce((s, b) => s + parseFloat(b.retention_amount || 0), 0),
    pending:   bills.filter(b => ['submitted','verified'].includes(b.status)).length,
  }), [bills]);

  const tabCounts = useMemo(() => {
    const c = {};
    TABS.forEach(t => {
      c[t.key] = t.key === 'all' ? bills.length : bills.filter(b => b.status === t.key).length;
    });
    return c;
  }, [bills]);

  const handleDownloadPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(14);
    doc.text('RA Bills Register', 14, 14);
    doc.setFontSize(9);
    doc.text(`Generated: ${dayjs().format('DD MMM YYYY HH:mm')}`, 14, 20);
    autoTable(doc, {
      startY: 26,
      head: [['Bill No', 'Project', 'Date', 'Gross', 'Retention', 'Net Payable', 'Status']],
      body: filtered.map(b => [
        b.bill_number,
        b.project_name,
        dayjs(b.bill_date).format('DD/MM/YYYY'),
        inr(b.gross_amount),
        inr(b.retention_amount),
        inr(b.net_payable),
        STATUS[b.status]?.label || b.status,
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [0, 103, 255] },
    });
    doc.save(`RA_Bills_${dayjs().format('YYYYMMDD')}.pdf`);
  };

  const handleDownloadCSV = () => {
    const header = ['Bill No', 'Project', 'Contractor', 'Date', 'Gross', 'Deductions', 'Net Payable', 'Status'];
    const csvRows = [header, ...filtered.map(b => [
      b.bill_number, b.project_name, b.contractor_name, dayjs(b.bill_date).format('DD/MM/YYYY'),
      Number(b.gross_amount || 0).toFixed(2), Number(b.total_deductions || 0).toFixed(2),
      Number(b.net_payable || 0).toFixed(2), STATUS[b.status]?.label || b.status,
    ])];
    const csv = csvRows.map(row => row.map(cell => {
      const s = String(cell ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `RA_Bills_${dayjs().format('YYYYMMDD')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen font-sans" style={{ background: Theme.pageBg }}>

      <PageHeader
        title="Client Billing (RA Bills)"
        subtitle="Running Account Bills · Progress Certification"
        breadcrumbs={[{ label: 'QS & Billing' }, { label: 'RA Bills' }]}
        actions={
          <>
            <button
              onClick={() => navigate('/qs/ra-bills/summary')}
              className="h-9 px-3 flex items-center gap-1.5 rounded-xl text-[11px] font-medium transition-colors"
              style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.20)', color: '#fff' }}
            >
              <BarChart3 className="w-3.5 h-3.5" /> Summary
            </button>
            <button
              onClick={handleDownloadCSV}
              className="h-9 px-3 flex items-center gap-1.5 rounded-xl text-[11px] font-medium transition-colors"
              style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.20)', color: '#fff' }}
            >
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
            <button
              onClick={handleDownloadPDF}
              className="h-9 px-3 flex items-center gap-1.5 rounded-xl text-[11px] font-medium transition-colors"
              style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.20)', color: '#fff' }}
            >
              <Download className="w-3.5 h-3.5" /> PDF
            </button>
            <button
              onClick={() => refetch()}
              className="h-9 w-9 flex items-center justify-center rounded-xl transition-colors"
              style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.20)', color: '#fff' }}
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={() => navigate('/qs/ra-bills/new')}
              className="h-9 px-4 flex items-center gap-2 rounded-xl text-[11px] font-medium uppercase tracking-wide transition-colors"
              style={{ background: Theme.gold, color: Theme.navyDark }}
            >
              <Plus className="w-4 h-4" /> New RA Bill
            </button>
          </>
        }
      />

      <div className="px-6 py-5 space-y-5">

        {/* ── KPI strip ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="Total Billed" value={inrC(kpis.total)} sub="gross contract value" icon={TrendingUp} color="indigo" />
          <KpiCard label="Certified & Paid" value={inrC(kpis.certified)} sub="net payable" icon={CheckCircle2} color="emerald" />
          <KpiCard label="Retention Held" value={inrC(kpis.retention)} sub="cumulative" icon={Wallet2} color="amber" />
          <KpiCard label="Awaiting Action" value={kpis.pending} sub="submitted + verified" icon={AlertCircle} color="red" />
        </div>

        {/* ── Filters row ── */}
        <div className="flex flex-wrap items-center gap-3 justify-between">
          {/* Status tabs */}
          <div className="flex gap-1 p-1 bg-white border rounded-xl shadow-sm overflow-x-auto" style={{ borderColor: Theme.border }}>
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={clsx(
                  'px-3 py-1.5 rounded-lg text-[11px] font-medium whitespace-nowrap transition-all flex items-center gap-1',
                  activeTab !== tab.key && 'hover:bg-slate-50'
                )}
                style={activeTab === tab.key
                  ? { background: `linear-gradient(135deg, ${Theme.navy}, ${Theme.navyDark})`, color: '#fff' }
                  : { color: Theme.textMuted }}
              >
                {tab.label}
                {tabCounts[tab.key] > 0 && (
                  <span
                    className="text-[9px] font-medium px-1 py-0.5 rounded min-w-[16px] text-center"
                    style={activeTab === tab.key
                      ? { background: 'rgba(255,255,255,0.20)', color: '#fff' }
                      : { background: Theme.cardAlt, color: Theme.textMuted }}
                  >
                    {tabCounts[tab.key]}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: Theme.textFaint }} />
              <input
                className="h-9 pl-8 pr-3 w-52 border rounded-xl bg-white text-[12px] outline-none placeholder:text-[#b0b5c3] transition-colors"
                style={{ borderColor: Theme.border, color: Theme.textDark }}
                placeholder="Search bills…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            {/* Project filter */}
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: Theme.textFaint }} />
              <select
                className="h-9 pl-8 pr-6 border rounded-xl bg-white text-[12px] outline-none transition-colors appearance-none w-52"
                style={{ borderColor: Theme.border, color: Theme.textDark }}
                value={filterProject}
                onChange={e => setFilterProject(e.target.value)}
              >
                <option value="all">All Projects</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* ── Table ── */}
        <div className="bg-white rounded-2xl border overflow-hidden shadow-sm" style={{ borderColor: Theme.border }}>
          <div className="overflow-x-auto">
          <table className="w-full text-left border-separate border-spacing-y-1 min-w-[900px]">
            <thead>
              <tr style={{ background: `linear-gradient(90deg, ${Theme.navy} 0%, ${Theme.navyDark} 100%)` }}>
                <SortTh label="Bill / Project" sortKey="bill_number" sort={sort} onSort={toggleSort} />
                <SortTh label="Period" sortKey="bill_date" sort={sort} onSort={toggleSort} />
                <SortTh label="Gross Value" sortKey="gross_amount" sort={sort} onSort={toggleSort} right />
                <SortTh label="Deductions" sortKey="total_deductions" sort={sort} onSort={toggleSort} right />
                <SortTh label="Net Payable" sortKey="net_payable" sort={sort} onSort={toggleSort} right />
                <SortTh label="Status" sortKey="status" sort={sort} onSort={toggleSort} center />
                <th className="px-5 py-3 text-[11px] font-medium text-white uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={7} className="py-20 text-center text-xs text-[#8e94a3]">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-indigo-300" />
                    Loading bills…
                  </td>
                </tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-20 text-center">
                    <Receipt className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                    <p className="text-xs text-[#8e94a3] font-medium">No bills found</p>
                    <p className="text-[10px] text-[#b0b5c3] mt-1">Try changing the filter or create a new RA Bill</p>
                  </td>
                </tr>
              )}
              {filtered.map(bill => {
                const cfg = STATUS[bill.status] || STATUS.submitted;
                const Icon = cfg.Icon;
                const totalDed = parseFloat(bill.total_deductions || 0);
                const hasAdvRec = parseFloat(bill.mobilization_advance_recovery || 0) > 0;
                const canDelete = ['draft', 'rejected'].includes(bill.status);

                return (
                  <tr key={bill.id} className="hover:bg-[#f8fafc] transition-colors group">

                    {/* Bill / Project */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className={clsx(
                          'w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 border transition-colors',
                          cfg.bg, cfg.border
                        )}>
                          <Icon className={clsx('w-4 h-4', cfg.text)} />
                        </div>
                        <div>
                          <div className="text-[13px] font-medium text-[#1a1c21] font-mono uppercase tracking-tight">
                            {bill.bill_number}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <Building2 className="w-3 h-3 text-[#8e94a3]" />
                            <span className="text-[10px] text-[#8e94a3]">{bill.project_name}</span>
                          </div>
                          <div className="text-[9px] text-[#b0b5c3] font-medium mt-0.5 uppercase">
                            {bill.contractor_name}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Period */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1.5 text-[11px] text-[#6a6f7d]">
                        <Calendar className="w-3 h-3 text-[#8e94a3]" />
                        {bill.bill_period_from && bill.bill_period_to
                          ? `${dayjs(bill.bill_period_from).format('DD MMM')} – ${dayjs(bill.bill_period_to).format('DD MMM YYYY')}`
                          : dayjs(bill.bill_date).format('DD MMM YYYY')}
                      </div>
                      <div className="text-[9px] text-[#b0b5c3] mt-0.5">
                        Bill date: {dayjs(bill.bill_date).format('DD/MM/YY')}
                      </div>
                    </td>

                    {/* Gross */}
                    <td className="px-5 py-4 text-right">
                      <div className="text-[13px] font-medium text-[#1a1c21] font-mono">{inr(bill.gross_amount)}</div>
                      <div className="text-[9px] text-[#8e94a3] mt-0.5">+ GST {inr(bill.gst_amount)}</div>
                    </td>

                    {/* Deductions */}
                    <td className="px-5 py-4 text-right">
                      <div className="text-[12px] font-medium text-red-500 font-mono">− {inr(totalDed)}</div>
                      <div className="text-[9px] text-[#8e94a3] mt-0.5">
                        Ret {bill.retention_percent}%
                        {hasAdvRec && ' · Adv. rec.'}
                      </div>
                    </td>

                    {/* Net payable */}
                    <td className="px-5 py-4 text-right">
                      <div className="text-[15px] font-medium text-emerald-600 font-mono">{inr(bill.net_payable)}</div>
                      <div className="text-[9px] text-[#8e94a3] mt-0.5">incl. taxes</div>
                    </td>

                    {/* Status */}
                    <td className="px-5 py-4">
                      <div className="flex flex-col items-center gap-1">
                        <span className={clsx(
                          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium border',
                          cfg.bg, cfg.text, cfg.border
                        )}>
                          <span className={clsx('w-1.5 h-1.5 rounded-full', cfg.dot)} />
                          {cfg.label}
                        </span>
                        {bill.status === 'verified' && bill.verified_by_name && (
                          <span className="text-[9px] text-[#8e94a3]">by {bill.verified_by_name}</span>
                        )}
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-1.5">
                        {bill.status === 'submitted' && CAN_VERIFY.includes(role) && (
                          <button
                            onClick={() => verifyMut.mutate(bill.id)}
                            disabled={verifyMut.isPending}
                            className="px-3 py-1.5 bg-blue-600 text-white text-[10px] font-medium rounded-lg hover:bg-blue-500 transition-colors disabled:opacity-50 flex items-center gap-1"
                          >
                            <ShieldCheck className="w-3 h-3" /> Verify
                          </button>
                        )}
                        {bill.status === 'verified' && CAN_CERTIFY.includes(role) && (
                          <Link
                            to={`/qs/ra-bills/${bill.id}`}
                            className="px-3 py-1.5 bg-emerald-600 text-white text-[10px] font-medium rounded-lg hover:bg-emerald-500 transition-colors flex items-center gap-1"
                          >
                            <CheckCircle2 className="w-3 h-3" /> Certify
                          </Link>
                        )}
                        <Link
                          to={`/qs/ra-bills/${bill.id}`}
                          className="w-8 h-8 flex items-center justify-center rounded-xl border border-[#e2e6ec] text-[#6a6f7d] hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50 transition-all"
                          title="View detail"
                        >
                          <Eye className="w-4 h-4" />
                        </Link>
                        <Link
                          to={`/qs/ra-bills/${bill.id}`}
                          className="w-8 h-8 flex items-center justify-center rounded-xl border border-[#e2e6ec] text-[#6a6f7d] hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50 transition-all"
                          title="Open bill"
                        >
                          <ArrowUpRight className="w-4 h-4" />
                        </Link>
                        {canDelete && (
                          <button
                            onClick={() => {
                              if (window.confirm(`Delete bill ${bill.bill_number}?`)) deleteMut.mutate(bill.id);
                            }}
                            className="w-8 h-8 flex items-center justify-center rounded-xl border border-[#e2e6ec] text-[#6a6f7d] hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>

          {/* Table footer */}
          {filtered.length > 0 && (
            <div className="border-t border-[#e2e6ec] bg-[#f8fafc] px-5 py-3 flex items-center justify-between">
              <span className="text-[11px] text-[#8e94a3]">
                {filtered.length} bill{filtered.length !== 1 ? 's' : ''} shown
              </span>
              <div className="flex items-center gap-6 text-[11px]">
                <span className="text-[#6a6f7d]">
                  Gross: <span className="font-medium text-[#1a1c21] font-mono">
                    {inr(filtered.reduce((s, b) => s + parseFloat(b.gross_amount || 0), 0))}
                  </span>
                </span>
                <span className="text-[#6a6f7d]">
                  Net payable: <span className="font-medium text-emerald-600 font-mono">
                    {inr(filtered.reduce((s, b) => s + parseFloat(b.net_payable || 0), 0))}
                  </span>
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SortTh({ label, sortKey, sort, onSort, right, center }) {
  const active = sort.key === sortKey;
  return (
    <th
      className={clsx(
        'px-5 py-3 text-[11px] font-medium text-white uppercase tracking-wider cursor-pointer select-none transition',
        right ? 'text-right' : center ? 'text-center' : 'text-left'
      )}
      style={{ opacity: active ? 1 : 0.85 }}
      onClick={() => onSort(sortKey)}
    >
      <span className={clsx('inline-flex items-center gap-1', right && 'justify-end', center && 'justify-center')}>
        {label}
        <span className="text-[9px]" style={{ color: Theme.gold, opacity: active ? 1 : 0.35 }}>
          {active && sort.dir === 'desc' ? '▼' : '▲'}
        </span>
      </span>
    </th>
  );
}

