// src/pages/finance/VendorInvoicePage.jsx
import RecordAttachments from '../../components/shared/RecordAttachments';
import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FileText, Search, CheckCircle2, Clock, ShieldCheck,
  ExternalLink, Printer, IndianRupee, Building2,
  AlertTriangle, TrendingUp, Receipt, ArrowRight,
  ChevronDown, X, Filter
} from 'lucide-react';
import { clsx } from 'clsx';
import dayjs from 'dayjs';
import { invoiceAPI, projectAPI, tqsBillsAPI, default as api } from '../../api/client';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { PageHeader, KpiCard as ThemeKpiCard, Theme } from '../../theme';

const inr = v => `₹${parseFloat(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS = {
  pending:    { label: 'Pending Audit',     dot: 'bg-amber-400',   pill: 'bg-amber-50 text-amber-700 border-amber-200',   icon: Clock },
  verified:   { label: 'Audit Verified',    dot: 'bg-blue-500',    pill: 'bg-blue-50 text-blue-700 border-blue-200',       icon: ShieldCheck },
  authorized: { label: 'Ready for Payment', dot: 'bg-emerald-500', pill: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  paid:       { label: 'Paid',              dot: 'bg-slate-400',   pill: 'bg-slate-100 text-slate-900 font-medium border-slate-200',   icon: IndianRupee },
};

export default function VendorInvoicePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [filterProject, setFilterProject] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterSource, setFilterSource] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const [expandedId, setExpandedId] = useState(null); // invoice id with attachments expanded

  const { data: invoices = [], isLoading: loadInv } = useQuery({
    queryKey: ['vendor-invoices'],
    queryFn: () => invoiceAPI.list().then(r => r.data?.data).catch(() => []),
  });

  const { data: tqsBillsRaw = [], isLoading: loadTqs } = useQuery({
    queryKey: ['tqs-bills-finance'],
    queryFn: () => tqsBillsAPI.list({ limit: 500 }).then(r => {
      const rows = Array.isArray(r.data) ? r.data : (r.data?.data ?? []);
      return rows.map(b => ({
        id: b.id,
        _source: 'tqs',
        invoice_number: b.inv_number || b.sl_number,
        invoice_date: b.inv_date || b.created_at,
        vendor_name: b.vendor_name,
        project_name: b.project_name,
        project_id: b.project_id,
        net_amount: b.total_amount || 0,
        taxable_amount: b.basic_amount || 0,
        due_date: null,
        po_number: b.po_number,
        tqs_sl: b.sl_number,
        bill_type: b.bill_type,
        payment_status: b.payment_status,
        status: (() => {
          const ws = b.workflow_status;
          if (ws === 'paid') return 'paid';
          if (ws === 'procurement' || ws === 'accounts') return 'authorized';
          if (ws === 'qs') return 'verified';
          return 'pending';
        })(),
        verified_by_name: null,
        authorized_by_name: null,
      }));
    }).catch(() => []),
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectAPI.list().then(r => r.data?.data || []).catch(() => []),
  });

  const verifyMut = useMutation({
    mutationFn: (id) => invoiceAPI.verify(id),
    onSuccess: () => { toast.success('Bill verified'); qc.invalidateQueries({ queryKey: ['vendor-invoices'] }); },
    onError: () => toast.error('Verification failed'),
  });
  const authMut = useMutation({
    mutationFn: (id) => invoiceAPI.authorize(id),
    onSuccess: () => { toast.success('Bill authorized for payment'); qc.invalidateQueries({ queryKey: ['vendor-invoices'] }); },
    onError: () => toast.error('Authorization failed'),
  });
  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/invoices/${id}`),
    onSuccess: () => { toast.success('Invoice removed'); qc.invalidateQueries({ queryKey: ['vendor-invoices'] }); },
    onError: () => toast.error('Delete failed'),
  });

  const STATUS_TABS = ['all', 'pending', 'verified', 'authorized', 'paid'];
  const STATUS_LABEL = { all: 'All', pending: 'Pending Audit', verified: 'Verified', authorized: 'Ready to Pay', paid: 'Paid' };

  const allInvoices = useMemo(() => [
    ...(invoices || []).map(i => ({ ...i, _source: 'direct' })),
    ...(tqsBillsRaw || []),
  ], [invoices, tqsBillsRaw]);

  const tabCounts = useMemo(() => STATUS_TABS.reduce((acc, s) => ({
    ...acc,
    [s]: s === 'all' ? allInvoices.length : allInvoices.filter(r => r.status === s).length,
  }), {}), [allInvoices]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => allInvoices.filter(inv => {
    if (filterProject !== 'all' && inv.project_id !== filterProject) return false;
    if (filterStatus !== 'all' && inv.status !== filterStatus) return false;
    if (filterSource !== 'all' && inv._source !== filterSource) return false;
    if (search) {
      const q = search.toLowerCase();
      return (inv.vendor_name || '').toLowerCase().includes(q) ||
             (inv.invoice_number || '').toLowerCase().includes(q) ||
             (inv.po_number || '').toLowerCase().includes(q) ||
             (inv.tqs_sl || '').toLowerCase().includes(q);
    }
    return true;
  }), [allInvoices, filterProject, filterStatus, filterSource, search]);

  // KPI calculations
  const pendingAudit   = allInvoices.filter(i => i.status === 'pending');
  const readyForPay    = allInvoices.filter(i => i.status === 'authorized');
  const totalOutstanding = allInvoices.filter(i => i.status !== 'paid').reduce((s, i) => s + parseFloat(i.net_amount || 0), 0);
  const totalPaid      = allInvoices.filter(i => i.status === 'paid').reduce((s, i) => s + parseFloat(i.net_amount || 0), 0);
  const isLoading = loadInv || loadTqs;

  const activeFilters = [filterProject !== 'all', filterSource !== 'all'].filter(Boolean).length;

  return (
    <div className="min-h-screen" style={{ background: Theme.pageBg }}>

      <PageHeader
        title="Vendor Payables"
        subtitle={`${allInvoices.length} bills · Direct + Bill Tracker unified view`}
        breadcrumbs={[{ label: 'Finance', href: '/finance' }, { label: 'Vendor Invoices' }]}
        actions={
          <button
            onClick={() => navigate('/finance/invoices/booking')}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors shadow-sm"
            style={{ background: '#fff', color: Theme.navyDark, border: '1px solid rgba(255,255,255,0.4)' }}
          >
            <FileText className="w-4 h-4" /> Book Vendor Bill
          </button>
        }
      />

      <div className="max-w-7xl mx-auto px-6 md:px-8 py-6 space-y-5">

        {/* ── KPI Cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <ThemeKpiCard
            label="Pending Audit"
            value={pendingAudit.length}
            sub={pendingAudit.length > 0 ? `${inr(pendingAudit.reduce((s,i)=>s+parseFloat(i.net_amount||0),0))} exposure` : 'All clear'}
            icon={AlertTriangle}
            color="amber"
            onClick={() => setFilterStatus('pending')}
            active={filterStatus === 'pending'}
          />
          <ThemeKpiCard
            label="Ready for Payment"
            value={readyForPay.length}
            sub={readyForPay.length > 0 ? inr(readyForPay.reduce((s,i)=>s+parseFloat(i.net_amount||0),0)) : 'None queued'}
            icon={CheckCircle2}
            color="emerald"
            onClick={() => setFilterStatus('authorized')}
            active={filterStatus === 'authorized'}
          />
          <ThemeKpiCard
            label="Total Outstanding"
            value={inr(totalOutstanding)}
            sub="Unpaid liabilities"
            icon={TrendingUp}
            color="blue"
          />
          <ThemeKpiCard
            label="Paid This Period"
            value={inr(totalPaid)}
            sub={`${allInvoices.filter(i=>i.status==='paid').length} invoices settled`}
            icon={IndianRupee}
            color="slate"
          />
        </div>

        {/* ── Search + Filters ── */}
        <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-sm flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search vendor, invoice no, PO number..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 placeholder:text-slate-900 font-medium outline-none focus:border-indigo-400 transition-all"
            />
            {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-900 font-medium hover:text-slate-600"><X className="w-3.5 h-3.5" /></button>}
          </div>
          <button
            onClick={() => setShowFilters(v => !v)}
            className={clsx('flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all',
              showFilters || activeFilters > 0
                ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                : 'bg-slate-50 border-slate-200 text-slate-900 hover:border-slate-300'
            )}
          >
            <Filter className="w-4 h-4" />
            Filters
            {activeFilters > 0 && <span className="w-5 h-5 bg-indigo-600 text-white text-[10px] font-medium rounded-full flex items-center justify-center">{activeFilters}</span>}
            <ChevronDown className={clsx('w-3.5 h-3.5 transition-transform', showFilters && 'rotate-180')} />
          </button>
          <button
            onClick={() => {
              const csv = [
                ['Invoice No', 'Vendor', 'Date', 'PO Number', 'Net Amount', 'Status', 'Source'].join(','),
                ...filtered.map(i => [
                  i.invoice_number, `"${i.vendor_name}"`,
                  i.invoice_date ? dayjs(i.invoice_date).format('DD-MM-YYYY') : '',
                  i.po_number || '', i.net_amount, i.status, i._source,
                ].join(',')),
              ].join('\n');
              const a = document.createElement('a');
              a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
              a.download = `Vendor_Payables_${dayjs().format('YYYY-MM-DD')}.csv`;
              a.click();
            }}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border border-slate-200 text-slate-900 hover:border-slate-300 rounded-xl text-sm font-medium transition-all"
          >
            Export CSV
          </button>
        </div>

        {/* Filter Panel */}
        {showFilters && (
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-wrap gap-4 items-end">
            <div className="space-y-1.5">
              <label className="text-[9px] font-medium text-slate-900 font-medium uppercase tracking-widest">Project</label>
              <select value={filterProject} onChange={e => setFilterProject(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 outline-none focus:border-indigo-400 min-w-[160px]">
                <option value="all">All Projects</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[9px] font-medium text-slate-900 font-medium uppercase tracking-widest">Source</label>
              <select value={filterSource} onChange={e => setFilterSource(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 outline-none focus:border-indigo-400 min-w-[140px]">
                <option value="all">All Sources</option>
                <option value="direct">Direct (Bill Booking)</option>
                <option value="tqs">Bill Tracker</option>
              </select>
            </div>
            {activeFilters > 0 && (
              <button onClick={() => { setFilterProject('all'); setFilterStatus('all'); setFilterSource('all'); }}
                className="px-4 py-2 text-xs font-medium text-red-500 hover:text-red-700 uppercase tracking-widest transition-all">
                Clear All
              </button>
            )}
          </div>
        )}

        {/* ── Status Tabs (Zoho Books style) ── */}
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
          {STATUS_TABS.map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                filterStatus === s ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-900 font-medium hover:text-slate-700'
              }`}>
              {STATUS_LABEL[s]}
              <span className="ml-1.5 text-[10px] text-slate-400">({tabCounts[s] ?? 0})</span>
            </button>
          ))}
        </div>

        {/* ── Table ── */}
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">

          {/* Table header row with count */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/60">
            <span className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest">
              {filtered.length} {filtered.length === 1 ? 'bill' : 'bills'}
              {filtered.length !== allInvoices.length && ` of ${allInvoices.length}`}
            </span>
            <div className="flex items-center gap-4 text-[9px] font-medium uppercase tracking-widest">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />Pending</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />Verified</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />Authorized</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-slate-400 inline-block" />Paid</span>
            </div>
          </div>

          {isLoading ? (
            <div className="py-20 text-center text-sm text-slate-900 font-medium uppercase tracking-widest">Loading bills…</div>
          ) : filtered.length === 0 ? (
            <div className="py-20 text-center space-y-3">
              <div className="w-14 h-14 bg-slate-100 rounded-2xl mx-auto flex items-center justify-center">
                <FileText className="w-7 h-7 text-slate-300" />
              </div>
              <p className="text-sm font-medium text-slate-900 font-medium uppercase tracking-widest">No bills found</p>
              <p className="text-xs text-slate-400">Adjust filters or book a new vendor bill</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="py-3 px-5 text-[9px] font-medium text-slate-900 font-medium uppercase tracking-widest text-left">Vendor / Invoice</th>
                    <th className="py-3 px-5 text-[9px] font-medium text-slate-900 font-medium uppercase tracking-widest text-left">Project</th>
                    <th className="py-3 px-5 text-[9px] font-medium text-slate-900 font-medium uppercase tracking-widest text-left">References</th>
                    <th className="py-3 px-5 text-[9px] font-medium text-slate-900 font-medium uppercase tracking-widest text-right">Amount</th>
                    <th className="py-3 px-5 text-[9px] font-medium text-slate-900 font-medium uppercase tracking-widest text-center">Status</th>
                    <th className="py-3 px-5 text-[9px] font-medium text-slate-900 font-medium uppercase tracking-widest text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filtered.map(inv => {
                    const cfg = STATUS[inv.status] || STATUS.pending;
                    const Icon = cfg.icon;
                    return (
                      <React.Fragment key={`${inv._source}-${inv.id}`}>
                      <tr className="hover:bg-slate-50/60 transition-colors group">

                        {/* Vendor / Invoice */}
                        <td className="py-4 px-5">
                          <div className="flex items-center gap-3">
                            <div className={clsx('w-2 h-2 rounded-full flex-shrink-0', cfg.dot)} />
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-slate-900 text-xs uppercase tracking-tight truncate max-w-[180px]">{inv.vendor_name}</span>
                                {inv._source === 'tqs' && (
                                  <span className="text-[8px] font-medium uppercase tracking-wider bg-violet-100 text-violet-600 border border-violet-200 px-1.5 py-0.5 rounded-md flex-shrink-0">DQS</span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-[10px] font-mono font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">{inv.invoice_number || '—'}</span>
                                {inv.invoice_date && <span className="text-[9px] text-slate-900 font-medium font-bold">{dayjs(inv.invoice_date).format('D MMM YY')}</span>}
                              </div>
                              {inv._source === 'tqs' && inv.tqs_sl && (
                                <div className="text-[9px] text-slate-900 font-medium mt-0.5">SL: {inv.tqs_sl} · {inv.bill_type === 'wo' ? 'Work Order' : 'PO'}</div>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Project */}
                        <td className="py-4 px-5">
                          <div className="flex items-center gap-2">
                            <Building2 className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" />
                            <span className="text-xs font-medium text-slate-900 truncate max-w-[140px]">{inv.project_name || '—'}</span>
                          </div>
                        </td>

                        {/* References */}
                        <td className="py-4 px-5">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-[9px] font-medium text-slate-900 font-medium uppercase w-7">PO</span>
                              <span className="text-[10px] font-mono font-medium text-slate-900 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-md">{inv.po_number || '—'}</span>
                            </div>
                            {inv.grn_number && (
                              <div className="flex items-center gap-2">
                                <span className="text-[9px] font-medium text-slate-900 font-medium uppercase w-7">GRN</span>
                                <span className="text-[10px] font-mono font-medium text-slate-900 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-md">{inv.grn_number}</span>
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Amount */}
                        <td className="py-4 px-5 text-right">
                          <div className="font-medium font-mono text-slate-900 text-base">{inr(inv.net_amount)}</div>
                          {inv.due_date && dayjs(inv.due_date).isValid() && (
                            <div className={clsx('text-[9px] font-medium mt-0.5',
                              dayjs(inv.due_date).isBefore(dayjs()) && (inv.status || '') !== 'paid'
                                ? 'text-red-500' : 'text-slate-400'
                            )}>
                              Due {dayjs(inv.due_date).format('D MMM')}
                            </div>
                          )}
                        </td>

                        {/* Status */}
                        <td className="py-4 px-5">
                          <div className="flex justify-center">
                            <span className={clsx('flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[9px] font-medium uppercase tracking-widest border', cfg.pill)}>
                              <Icon className="w-3 h-3" /> {cfg.label}
                            </span>
                          </div>
                          {(inv.verified_by_name || inv.authorized_by_name) && (
                            <div className="text-[9px] text-slate-900 font-medium text-center mt-1">
                              {inv.status === 'verified' ? inv.verified_by_name : inv.authorized_by_name}
                            </div>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-4 px-5">
                          <div className="flex items-center justify-end gap-2">
                            {inv._source !== 'tqs' && inv.status === 'pending' && (
                              <button
                                onClick={() => verifyMut.mutate(inv.id)}
                                disabled={verifyMut.isPending}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-[9px] font-medium uppercase tracking-widest rounded-xl transition-all shadow-sm"
                              >
                                Verify
                              </button>
                            )}
                            {inv._source !== 'tqs' && inv.status === 'verified' && (
                              <button
                                onClick={() => authMut.mutate(inv.id)}
                                disabled={authMut.isPending}
                                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-[9px] font-medium uppercase tracking-widest rounded-xl transition-all shadow-sm"
                              >
                                Authorize
                              </button>
                            )}
                            {inv._source === 'tqs' && (
                              <button
                                onClick={() => navigate(`/tqs/bills/${inv.id}`)}
                                className="flex items-center gap-1.5 px-3 py-2 bg-violet-50 hover:bg-violet-100 text-violet-600 border border-violet-200 text-[9px] font-medium uppercase tracking-widest rounded-xl transition-all"
                              >
                                <ExternalLink className="w-3 h-3" /> DQS</button>
                            )}
                            {inv._source !== 'tqs' && (
                              <>
                                <button className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-50 border border-slate-200 text-slate-900 font-medium hover:border-slate-300 transition-all">
                                  <Printer className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setExpandedId(expandedId === inv.id ? null : inv.id); }}
                                  title="Attachments"
                                  className="w-8 h-8 flex items-center justify-center rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-500 hover:bg-indigo-100 transition-all"
                                >
                                  <FileText className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => { if (confirm('Delete this invoice?')) deleteMut.mutate(inv.id); }}
                                  className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-50 border border-slate-200 text-slate-900 font-medium hover:border-red-200 hover:text-red-500 hover:bg-red-50 transition-all"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                      {expandedId === inv.id && (
                        <tr>
                          <td colSpan={10} className="px-6 pb-4 bg-indigo-50/30 border-b border-indigo-100">
                            <RecordAttachments
                              module="invoice"
                              recordId={inv.id}
                              projectId={inv.project_id}
                              label="Invoice Attachments — Tax Invoice, Receipt, Bank Advice"
                              compact
                            />
                          </td>
                        </tr>
                      )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Footer totals */}
          {filtered.length > 0 && (
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between">
              <span className="text-[9px] font-medium text-slate-900 font-medium uppercase tracking-widest">
                {filtered.filter(i => i._source === 'tqs').length} DQS ?· {filtered.filter(i => i._source !== 'tqs').length} Direct
              </span>
              <div className="flex items-center gap-6">
                <div className="text-right">
                  <div className="text-[9px] font-medium text-slate-900 font-medium uppercase tracking-widest">Outstanding</div>
                  <div className="font-medium font-mono text-indigo-600 text-sm">{inr(filtered.filter(i=>i.status!=='paid').reduce((s,i)=>s+parseFloat(i.net_amount||0),0))}</div>
                </div>
                <div className="text-right">
                  <div className="text-[9px] font-medium text-slate-900 font-medium uppercase tracking-widest">Total Value</div>
                  <div className="font-medium font-mono text-slate-900 text-sm">{inr(filtered.reduce((s,i)=>s+parseFloat(i.net_amount||0),0))}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, sub, icon, accent, onClick }) {
  const accents = {
    amber:   'bg-amber-50 border-amber-100',
    emerald: 'bg-emerald-50 border-emerald-100',
    indigo:  'bg-indigo-50 border-indigo-100',
    slate:   'bg-white border-slate-200',
  };
  return (
    <div
      onClick={onClick}
      className={clsx('border rounded-2xl p-5 shadow-sm transition-all',
        accents[accent],
        onClick && 'cursor-pointer hover:shadow-md hover:-translate-y-0.5'
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <span className="text-[9px] font-medium text-slate-900 font-medium uppercase tracking-widest">{label}</span>
        {icon}
      </div>
      <div className="font-medium text-slate-900 text-2xl font-mono tracking-tight">{value}</div>
      <div className="text-[9px] font-medium text-slate-900 font-medium uppercase tracking-widest mt-1.5">{sub}</div>
      {onClick && <div className="flex items-center gap-1 text-[9px] font-medium text-slate-900 font-medium mt-2"><ArrowRight className="w-3 h-3" /> Click to filter</div>}
    </div>
  );
}
