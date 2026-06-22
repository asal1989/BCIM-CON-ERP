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

  const filtered = useMemo(() => {
    return bills.filter(b => {
      const matchTab  = activeTab === 'all' || b.status === activeTab;
      const matchSrch = !search ||
        b.bill_number?.toLowerCase().includes(search.toLowerCase()) ||
        b.project_name?.toLowerCase().includes(search.toLowerCase()) ||
        b.contractor_name?.toLowerCase().includes(search.toLowerCase());
      return matchTab && matchSrch;
    });
  }, [bills, activeTab, search]);

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
        dayjs(b.bill_date).isValid() ? dayjs(b.bill_date).format('DD/MM/YYYY') : '—',
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

  return (
    <div className="min-h-screen bg-[#f4f6f9] font-sans">

      {/* ── Sticky header ── */}
      <div className="sticky top-0 z-30 bg-white border-b border-[#e2e6ec] shadow-sm">
        <div className="px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center shadow">
              <Receipt className="w-4.5 h-4.5 text-white w-5 h-5" />
            </div>
            <div>
              <h1 className="text-[15px] font-medium text-[#1a1c21] leading-none">Client Billing (RA Bills)</h1>
              <p className="text-[10px] text-[#8e94a3] font-medium uppercase tracking-wider mt-0.5">
                Running Account Bills · Progress Certification
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadPDF}
              className="h-9 px-3 flex items-center gap-1.5 rounded-xl border border-[#e2e6ec] bg-white text-[#6a6f7d] text-[11px] font-medium hover:bg-[#f4f6f9] transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> PDF
            </button>
            <button
              onClick={() => refetch()}
              className="h-9 w-9 flex items-center justify-center rounded-xl border border-[#e2e6ec] bg-white text-[#6a6f7d] hover:bg-[#f4f6f9] transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={() => navigate('/qs/ra-bills/new')}
              className="h-9 px-4 flex items-center gap-2 rounded-xl bg-indigo-600 text-white text-[11px] font-medium uppercase tracking-wide hover:bg-indigo-500 transition-colors shadow-sm shadow-indigo-600/20"
            >
              <Plus className="w-4 h-4" /> New RA Bill
            </button>
          </div>
        </div>
      </div>

      <div className="px-6 py-5 space-y-5">

        {/* ── KPI strip ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard label="Total Billed" value={inrC(kpis.total)} sub="gross contract value" icon={TrendingUp} color="indigo" />
          <KPICard label="Certified & Paid" value={inrC(kpis.certified)} sub="net payable" icon={CheckCircle2} color="emerald" />
          <KPICard label="Retention Held" value={inrC(kpis.retention)} sub="cumulative" icon={Wallet2} color="amber" />
          <KPICard label="Awaiting Action" value={kpis.pending} sub="submitted + verified" icon={AlertCircle} color="red" />
        </div>

        {/* ── Filters row ── */}
        <div className="flex flex-wrap items-center gap-3 justify-between">
          {/* Status tabs */}
          <div className="flex gap-1 p-1 bg-white border border-[#e2e6ec] rounded-xl shadow-sm overflow-x-auto">
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={clsx(
                  'px-3 py-1.5 rounded-lg text-[11px] font-medium whitespace-nowrap transition-all flex items-center gap-1',
                  activeTab === tab.key
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-[#6a6f7d] hover:bg-[#f4f6f9]'
                )}
              >
                {tab.label}
                {tabCounts[tab.key] > 0 && (
                  <span className={clsx(
                    'text-[9px] font-medium px-1 py-0.5 rounded min-w-[16px] text-center',
                    activeTab === tab.key ? 'bg-white/20 text-white' : 'bg-[#f4f6f9] text-[#6a6f7d]'
                  )}>
                    {tabCounts[tab.key]}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#8e94a3]" />
              <input
                className="h-9 pl-8 pr-3 w-52 border border-[#e2e6ec] rounded-xl bg-white text-[12px] text-[#1a1c21] outline-none focus:border-indigo-400 placeholder:text-[#b0b5c3] transition-colors"
                placeholder="Search bills…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            {/* Project filter */}
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#8e94a3]" />
              <select
                className="h-9 pl-8 pr-6 border border-[#e2e6ec] rounded-xl bg-white text-[12px] text-[#1a1c21] outline-none focus:border-indigo-400 transition-colors appearance-none w-52"
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
        <div className="bg-white rounded-2xl border border-[#e2e6ec] overflow-hidden shadow-sm">
          <table className="w-full text-left border-separate border-spacing-y-1">
            <thead>
              <tr className="border-b border-[#e2e6ec] bg-[#f8fafc]">
                <th className="px-5 py-3 text-[11px] font-medium text-black uppercase tracking-wider">Bill / Project</th>
                <th className="px-5 py-3 text-[11px] font-medium text-black uppercase tracking-wider">Period</th>
                <th className="px-5 py-3 text-[11px] font-medium text-black uppercase tracking-wider text-right">Gross Value</th>
                <th className="px-5 py-3 text-[11px] font-medium text-black uppercase tracking-wider text-right">Deductions</th>
                <th className="px-5 py-3 text-[11px] font-medium text-black uppercase tracking-wider text-right">Net Payable</th>
                <th className="px-5 py-3 text-[11px] font-medium text-black uppercase tracking-wider text-center">Status</th>
                <th className="px-5 py-3 text-[11px] font-medium text-black uppercase tracking-wider text-right">Actions</th>
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
                  <tr key={bill.id} className="hover:bg-[#f8fafc] transition-colors group" style={{ outline: '1.5px solid #ef4444', outlineOffset: '-1px' }}>

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

function KPICard({ label, value, sub, icon: Icon, color }) {
  const colors = {
    indigo:  { bg: 'bg-indigo-50',  text: 'text-indigo-600',  bar: 'bg-indigo-500',  border: 'border-indigo-100' },
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600', bar: 'bg-emerald-500', border: 'border-emerald-100' },
    amber:   { bg: 'bg-amber-50',   text: 'text-amber-600',   bar: 'bg-amber-500',   border: 'border-amber-100' },
    red:     { bg: 'bg-red-50',     text: 'text-red-600',     bar: 'bg-red-500',     border: 'border-red-100' },
  };
  const c = colors[color] || colors.indigo;
  return (
    <div className={clsx('bg-white rounded-2xl border shadow-sm p-5 relative overflow-hidden', c.border)}>
      <div className={clsx('absolute top-0 left-0 w-1 h-full', c.bar)} />
      <div className="flex items-center justify-between mb-3">
        <span className="text-[9px] font-medium text-[#8e94a3] uppercase tracking-widest">{label}</span>
        <div className={clsx('w-7 h-7 rounded-lg flex items-center justify-center', c.bg)}>
          <Icon className={clsx('w-3.5 h-3.5', c.text)} />
        </div>
      </div>
      <div className={clsx('text-[22px] font-medium font-mono leading-none', c.text)}>{value}</div>
      <div className="text-[9px] text-[#b0b5c3] font-medium uppercase tracking-wide mt-1.5">{sub}</div>
    </div>
  );
}
