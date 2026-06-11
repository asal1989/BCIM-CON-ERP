// src/pages/subcontractor/SubcontractorHubPage.jsx
import React, { useEffect, useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import {
  Briefcase, Ruler, Receipt, LayoutDashboard,
  Plus, Search, ChevronDown, CheckCircle, XCircle,
  Clock, AlertTriangle, TrendingUp, IndianRupee,
  Users, FileText, ArrowUpRight, X, RefreshCw,
  Eye, Edit2, Check, Ban, Building2, Calendar,
  Download, Printer, Settings, CreditCard, Wallet,
  Calculator, HardHat, ShieldCheck, BarChart3,
  Layers, CheckCircle2, CircleDot, Flag,
} from 'lucide-react';
import { subcontractorAPI, vendorAPI, projectAPI, uploadAPI, planningP6API } from '../../api/client';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';

// ─── helpers ──────────────────────────────────────────────────────────────────
const fmt = (n) =>
  n == null ? '—' : `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtPct = (v, t) => (t > 0 ? ((v / t) * 100).toFixed(1) + '%' : '—');

const STATUS_COLORS = {
  draft:    'bg-slate-100 text-slate-600',
  active:   'bg-emerald-100 text-emerald-700',
  closed:   'bg-blue-100 text-blue-700',
  disputed: 'bg-red-100 text-red-700',
  pending:   'bg-amber-100 text-amber-700',
  approved:  'bg-emerald-100 text-emerald-700',
  paid:      'bg-blue-100 text-blue-700',
  submitted: 'bg-violet-100 text-violet-700',
};

function StatusBadge({ status }) {
  const cls = STATUS_COLORS[status?.toLowerCase()] || 'bg-slate-100 text-slate-600';
  return (
    <span className={clsx('px-2 py-0.5 rounded-full text-[11px] font-medium capitalize', cls)}>
      {status || '—'}
    </span>
  );
}

function ProgressBar({ value, total, colorClass = 'bg-emerald-500' }) {
  const pct = total > 0 ? Math.min(100, (value / total) * 100) : 0;
  return (
    <div className="w-full bg-slate-100 rounded-full h-1.5">
      <div className={clsx('h-1.5 rounded-full', colorClass)} style={{ width: `${pct}%` }} />
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, sub, color = 'text-slate-700', bg = 'bg-white' }) {
  return (
    <div className={clsx('rounded-2xl border border-slate-100 p-5 flex flex-col gap-2', bg)}>
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center">
          <Icon className={clsx('w-4 h-4', color)} />
        </div>
        <span className="text-xs font-medium text-slate-900 font-medium uppercase tracking-wide">{label}</span>
      </div>
      <div className={clsx('text-2xl font-medium', color)}>{value}</div>
      {sub && <div className="text-[11px] text-slate-400">{sub}</div>}
    </div>
  );
}

// ─── Modal shell ──────────────────────────────────────────────────────────────
function Modal({ open, onClose, title, children, width = 'max-w-lg' }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className={clsx('relative bg-white rounded-2xl shadow-2xl w-full flex flex-col max-h-[90vh]', width)}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <h3 className="text-base font-medium text-slate-900">{title}</h3>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-900 font-medium hover:bg-slate-100">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

function FormField({ label, error, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-slate-900 uppercase tracking-wide">{label}</label>
      {children}
      {error && <span className="text-[11px] text-red-500">{error}</span>}
    </div>
  );
}

const inputCls = 'w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

// ─── TAB 1: Dashboard ─────────────────────────────────────────────────────────
function DashboardTab({ projectId }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['sub-dashboard', projectId],
    queryFn: () => subcontractorAPI.getDashboard({ project_id: projectId || undefined }).then(r => r.data),
    retry: 1,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
  });

  const { data: expiring } = useQuery({
    queryKey: ['sub-expiring-30'],
    queryFn: () => subcontractorAPI.listExpiringDocs({ days: 30 }).then(r => r.data),
    retry: 1,
  });

  const kpi = data?.kpi || {};
  const vendors = data?.byVendor || [];
  const expDocs      = expiring?.documents || [];
  const expContracts = expiring?.contracts || [];
  const totalExpiring = expDocs.length + expContracts.length;

  if (isLoading) return (
    <div className="flex flex-col items-center justify-center py-24 gap-3">
      <RefreshCw className="w-6 h-6 text-blue-400 animate-spin" />
      <span className="text-sm text-slate-400">Loading dashboard…</span>
    </div>
  );

  if (isError) return (
    <div className="flex flex-col items-center justify-center py-24 gap-3">
      <AlertTriangle className="w-8 h-8 text-amber-400" />
      <span className="text-sm font-medium text-slate-600">Could not load dashboard</span>
      <span className="text-xs text-slate-400">Ensure the backend server is running and restart it to pick up new routes.</span>
    </div>
  );

  const totalContract = kpi.total_contract_value || 0;
  const totalBilled   = kpi.total_billed || 0;
  const totalPaid     = kpi.total_paid || 0;

  return (
    <div className="space-y-6">
      {/* Expiry alert banner */}
      {totalExpiring > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3">
          <AlertTriangle size={16} className="text-amber-600 flex-shrink-0" />
          <div className="flex-1 text-sm font-medium text-amber-800">
            {totalExpiring} item{totalExpiring > 1 ? 's' : ''} expiring within 30 days
            {expContracts.length > 0 && (
              <span className="text-xs text-amber-700 ml-2">
                ({expContracts.length} contract{expContracts.length > 1 ? 's' : ''}
                {expDocs.length > 0 ? `, ${expDocs.length} document${expDocs.length > 1 ? 's' : ''}` : ''})
              </span>
            )}
          </div>
          <div className="hidden md:flex items-center gap-2 text-[11px] font-semibold">
            {expContracts.slice(0, 3).map(c => (
              <span key={c.vendor_id} className="bg-white border border-amber-300 text-amber-800 rounded-full px-2 py-0.5">
                {c.vendor_name} — {c.days_remaining < 0 ? 'expired' : `${c.days_remaining}d`}
              </span>
            ))}
            {totalExpiring > 3 && <span className="text-amber-700">+{totalExpiring - 3} more</span>}
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KpiCard icon={Briefcase}     label="Work Orders"     value={kpi.total_wo ?? '—'}         color="text-blue-600" />
        <KpiCard icon={CheckCircle}   label="Active WOs"      value={kpi.active_wo ?? '—'}        color="text-emerald-600" />
        <KpiCard icon={IndianRupee}   label="Contract Value"  value={fmt(totalContract)}           color="text-slate-700" />
        <KpiCard icon={Receipt}       label="Total Billed"    value={fmt(totalBilled)}
          sub={fmtPct(totalBilled, totalContract) + ' of contract'}                               color="text-violet-600" />
        <KpiCard icon={TrendingUp}    label="Total Paid"      value={fmt(totalPaid)}
          sub={fmtPct(totalPaid, totalBilled) + ' of billed'}                                     color="text-emerald-600" />
        <KpiCard icon={Clock}         label="Bills Pending"   value={kpi.bills_pending_approval ?? '—'}
          color={kpi.bills_pending_approval > 0 ? 'text-amber-600' : 'text-slate-400'} />
      </div>

      {/* Collection progress */}
      <div className="bg-white rounded-2xl border border-slate-100 p-5">
        <h3 className="text-sm font-medium text-slate-900 mb-4">Overall Progress</h3>
        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-xs text-slate-900 font-medium mb-1">
              <span>Billed vs Contract</span>
              <span>{fmt(totalBilled)} / {fmt(totalContract)}</span>
            </div>
            <ProgressBar value={totalBilled} total={totalContract} colorClass="bg-violet-500" />
          </div>
          <div>
            <div className="flex justify-between text-xs text-slate-900 font-medium mb-1">
              <span>Paid vs Billed</span>
              <span>{fmt(totalPaid)} / {fmt(totalBilled)}</span>
            </div>
            <ProgressBar value={totalPaid} total={totalBilled} colorClass="bg-emerald-500" />
          </div>
          <div>
            <div className="flex justify-between text-xs text-slate-900 font-medium mb-1">
              <span>Outstanding Balance</span>
              <span className="font-medium text-red-500">{fmt(totalBilled - totalPaid)}</span>
            </div>
            <ProgressBar value={totalBilled - totalPaid} total={totalBilled} colorClass="bg-red-400" />
          </div>
        </div>
      </div>

      {/* Per-vendor table */}
      {vendors.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="text-sm font-medium text-slate-700">By Subcontractor</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs font-medium text-slate-900 font-medium uppercase tracking-wide">
                  <th className="px-5 py-3 text-left">Subcontractor</th>
                  <th className="px-4 py-3 text-right">Work Orders</th>
                  <th className="px-4 py-3 text-right">Contract Value</th>
                  <th className="px-4 py-3 text-right">Billed</th>
                  <th className="px-4 py-3 text-right">Paid</th>
                  <th className="px-4 py-3 text-right">Outstanding</th>
                  <th className="px-4 py-3 text-center">Progress</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {vendors.map((v) => (
                  <tr key={v.vendor_name} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-medium text-slate-800">{v.vendor_name}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{v.wo_count}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{fmt(v.contract_value)}</td>
                    <td className="px-4 py-3 text-right text-violet-600 font-semibold">{fmt(v.billed_amount)}</td>
                    <td className="px-4 py-3 text-right text-emerald-600 font-semibold">{fmt(v.paid_amount)}</td>
                    <td className="px-4 py-3 text-right text-red-500 font-semibold">{fmt(v.billed_amount - v.paid_amount)}</td>
                    <td className="px-4 py-3 w-32">
                      <ProgressBar value={v.paid_amount} total={v.billed_amount} colorClass="bg-emerald-500" />
                      <span className="text-[10px] text-slate-400">{fmtPct(v.paid_amount, v.billed_amount)} paid</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── TAB 2: Work Orders ───────────────────────────────────────────────────────
function WorkOrdersTab({ projectId, projects, vendors }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showDetail, setShowDetail] = useState(null);
  const EMPTY_FORM = { vendor_id: '', project_id: '', subject: '', contract_value: '', start_date: '', end_date: '', scope_of_work: '', terms_conditions: '', gst_pct: '18', tds_pct: '2', retention_pct: '5', advance_recovery_pct: '10' };
  const [form, setForm] = useState(EMPTY_FORM);
  const [woLineItems, setWoLineItems] = useState([{ description: '', unit: '', quantity: '', rate: '' }]);
  const [err, setErr] = useState({});

  const itemsTotal = useMemo(
    () => woLineItems.reduce((s, it) => s + (parseFloat(it.quantity || 0) * parseFloat(it.rate || 0)), 0),
    [woLineItems]
  );
  const hasItems = woLineItems.some(it => it.description && parseFloat(it.quantity || 0) > 0 && parseFloat(it.rate || 0) > 0);

  const { data, isLoading } = useQuery({
    queryKey: ['sub-wo', projectId, statusFilter],
    queryFn: () => subcontractorAPI.listWorkOrders({
      project_id: projectId || undefined,
      status: statusFilter || undefined,
    }).then(r => r.data),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
  });

  const createMut = useMutation({
    mutationFn: (d) => subcontractorAPI.createWorkOrder(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sub-wo'] });
      qc.invalidateQueries({ queryKey: ['sub-dashboard'] });
      setShowCreate(false);
      setForm(EMPTY_FORM);
      setWoLineItems([{ description: '', unit: '', quantity: '', rate: '' }]);
    },
  });

  const patchMut = useMutation({
    mutationFn: ({ id, ...d }) => subcontractorAPI.updateWorkOrder(id, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sub-wo'] }); qc.invalidateQueries({ queryKey: ['sub-dashboard'] }); setShowDetail(null); },
  });

  const rows = useMemo(() => {
    const list = (data?.data || data?.work_orders || (Array.isArray(data) ? data : []))
      .filter(r => ['active','approved','draft'].includes(r.status?.toLowerCase()));
    if (!search) return list;
    const q = search.toLowerCase();
    return list.filter(r => r.vendor_name?.toLowerCase().includes(q) || r.wo_number?.toLowerCase().includes(q) || r.subject?.toLowerCase().includes(q) || r.project_name?.toLowerCase().includes(q));
  }, [data, search]);

  function validateCreate() {
    const e = {};
    if (!form.vendor_id) e.vendor_id = 'Required';
    if (!form.project_id) e.project_id = 'Required';
    if (!form.subject) e.subject = 'Required';
    if (!hasItems && (!form.contract_value || isNaN(form.contract_value))) e.contract_value = 'Enter valid amount';
    setErr(e);
    return Object.keys(e).length === 0;
  }

  function handleCreate() {
    if (!validateCreate()) return;
    const itemsToSend = woLineItems
      .filter(it => it.description && parseFloat(it.quantity || 0) > 0 && parseFloat(it.rate || 0) > 0)
      .map(it => ({ description: it.description, unit: it.unit || '', quantity: parseFloat(it.quantity), rate: parseFloat(it.rate) }));
    createMut.mutate({
      ...form,
      contract_value: hasItems ? itemsTotal : parseFloat(form.contract_value),
      items: itemsToSend.length > 0 ? itemsToSend : undefined,
      gst_pct: parseFloat(form.gst_pct || 18),
      tds_pct: parseFloat(form.tds_pct || 2),
      retention_pct: parseFloat(form.retention_pct || 5),
      advance_recovery_pct: parseFloat(form.advance_recovery_pct || 10),
    });
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search work orders…" className="pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-200 w-full focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="active">Active</option>
          <option value="closed">Closed</option>
          <option value="disputed">Disputed</option>
        </select>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors">
          <Plus className="w-4 h-4" /> New Work Order
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        {isLoading ? (
          <div className="py-16 flex justify-center"><RefreshCw className="w-6 h-6 text-slate-300 animate-spin" /></div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-slate-900 font-medium text-sm">No work orders found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs font-medium text-slate-900 font-medium uppercase tracking-wide">
                  <th className="px-5 py-3 text-left">WO No.</th>
                  <th className="px-4 py-3 text-left">Subcontractor</th>
                  <th className="px-4 py-3 text-left">Project</th>
                  <th className="px-4 py-3 text-left">Subject</th>
                  <th className="px-4 py-3 text-right">Contract Value</th>
                  <th className="px-4 py-3 text-right">Billed</th>
                  <th className="px-4 py-3 text-right">Paid</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {rows.map((wo) => (
                  <tr key={wo.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-mono text-xs text-slate-600">{wo.wo_number}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">{wo.vendor_name}</td>
                    <td className="px-4 py-3 text-slate-600">{wo.project_name}</td>
                    <td className="px-4 py-3 text-slate-900 max-w-xs truncate">{wo.subject}</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-800">{fmt(wo.contract_value)}</td>
                    <td className="px-4 py-3 text-right text-violet-600 font-semibold">{fmt(wo.total_billed)}</td>
                    <td className="px-4 py-3 text-right text-emerald-600 font-semibold">{fmt(wo.total_paid)}</td>
                    <td className="px-4 py-3 text-center"><StatusBadge status={wo.status} /></td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => setShowDetail(wo)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-900 font-medium hover:text-blue-600 transition-colors" title="View / Edit">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Work Order" width="max-w-3xl">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Subcontractor *" error={err.vendor_id}>
              <select value={form.vendor_id} onChange={e => setForm(f => ({ ...f, vendor_id: e.target.value }))} className={inputCls}>
                <option value="">Select vendor…</option>
                {(vendors || []).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </FormField>
            <FormField label="Project *" error={err.project_id}>
              <select value={form.project_id} onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))} className={inputCls}>
                <option value="">Select project…</option>
                {(projects || []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </FormField>
            <FormField label="Subject / Description *" error={err.subject}>
              <input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} className={inputCls} placeholder="e.g. Civil works – Phase 1" />
            </FormField>
            {!hasItems && (
              <FormField label="Contract Value (₹) *" error={err.contract_value}>
                <input type="number" value={form.contract_value} onChange={e => setForm(f => ({ ...f, contract_value: e.target.value }))} className={inputCls} placeholder="0" />
              </FormField>
            )}
            <FormField label="Start Date">
              <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} className={inputCls} />
            </FormField>
            <FormField label="End Date">
              <input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} className={inputCls} />
            </FormField>
            <div className="col-span-2">
              <FormField label="Scope of Work">
                <textarea rows={2} value={form.scope_of_work} onChange={e => setForm(f => ({ ...f, scope_of_work: e.target.value }))} className={inputCls} placeholder="Describe the scope…" />
              </FormField>
            </div>
            <div className="col-span-2">
              <FormField label="Terms & Conditions">
                <textarea rows={2} value={form.terms_conditions} onChange={e => setForm(f => ({ ...f, terms_conditions: e.target.value }))} className={inputCls} placeholder="Payment terms, retention, etc." />
              </FormField>
            </div>
          </div>

          {/* BOQ Line Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">BOQ / Scope Line Items</span>
              <button type="button" onClick={() => setWoLineItems(l => [...l, { description: '', unit: '', quantity: '', rate: '' }])} className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
                <Plus className="w-3 h-3" /> Add Row
              </button>
            </div>
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-slate-50">
                  <tr className="text-slate-500 uppercase tracking-wide font-medium">
                    <th className="px-3 py-2 text-left">Description</th>
                    <th className="px-2 py-2 text-left w-16">Unit</th>
                    <th className="px-2 py-2 text-right w-24">Qty</th>
                    <th className="px-2 py-2 text-right w-28">Rate (₹)</th>
                    <th className="px-2 py-2 text-right w-28">Amount</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {woLineItems.map((it, idx) => (
                    <tr key={idx}>
                      <td className="px-1 py-1">
                        <input value={it.description} onChange={e => setWoLineItems(l => l.map((x, i) => i === idx ? { ...x, description: e.target.value } : x))} className={inputCls + ' text-xs'} placeholder="e.g. Brick masonry in CM 1:6" />
                      </td>
                      <td className="px-1 py-1">
                        <input value={it.unit} onChange={e => setWoLineItems(l => l.map((x, i) => i === idx ? { ...x, unit: e.target.value } : x))} className={inputCls + ' text-xs'} placeholder="CUM" />
                      </td>
                      <td className="px-1 py-1">
                        <input type="number" step="any" value={it.quantity} onChange={e => setWoLineItems(l => l.map((x, i) => i === idx ? { ...x, quantity: e.target.value } : x))} className={inputCls + ' text-xs text-right'} placeholder="0" min="0" />
                      </td>
                      <td className="px-1 py-1">
                        <input type="number" step="any" value={it.rate} onChange={e => setWoLineItems(l => l.map((x, i) => i === idx ? { ...x, rate: e.target.value } : x))} className={inputCls + ' text-xs text-right'} placeholder="0" min="0" />
                      </td>
                      <td className="px-2 py-1 text-right font-medium text-slate-700">
                        {parseFloat(it.quantity || 0) * parseFloat(it.rate || 0) > 0 ? fmt(parseFloat(it.quantity) * parseFloat(it.rate)) : '—'}
                      </td>
                      <td className="px-1 py-1 text-center">
                        {woLineItems.length > 1 && (
                          <button type="button" onClick={() => setWoLineItems(l => l.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-600 p-1 text-base leading-none">×</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {hasItems && (
                  <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                    <tr>
                      <td colSpan={4} className="px-3 py-2 text-right text-xs font-semibold text-slate-600">Total Contract Value:</td>
                      <td className="px-2 py-2 text-right font-bold text-slate-800">{fmt(itemsTotal)}</td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            {!hasItems && <p className="text-xs text-slate-400 mt-1">Leave blank for a lump-sum contract; fill items for item-wise billing.</p>}
          </div>

          {/* Deduction Defaults */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Deduction Defaults (pre-filled in RA Bills)</p>
            <div className="grid grid-cols-4 gap-3">
              <FormField label="GST %">
                <input type="number" value={form.gst_pct} onChange={e => setForm(f => ({ ...f, gst_pct: e.target.value }))} className={inputCls} min="0" max="100" />
              </FormField>
              <FormField label="TDS %">
                <input type="number" value={form.tds_pct} onChange={e => setForm(f => ({ ...f, tds_pct: e.target.value }))} className={inputCls} min="0" max="100" />
              </FormField>
              <FormField label="Retention %">
                <input type="number" value={form.retention_pct} onChange={e => setForm(f => ({ ...f, retention_pct: e.target.value }))} className={inputCls} min="0" max="100" />
              </FormField>
              <FormField label="Advance Recovery %">
                <input type="number" value={form.advance_recovery_pct} onChange={e => setForm(f => ({ ...f, advance_recovery_pct: e.target.value }))} className={inputCls} min="0" max="100" />
              </FormField>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100 rounded-xl">Cancel</button>
          <button
            disabled={createMut.isPending}
            onClick={handleCreate}
            className="px-5 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-xl disabled:opacity-60"
          >
            {createMut.isPending ? 'Creating…' : 'Create Work Order'}
          </button>
        </div>
      </Modal>

      {/* Detail / Edit Modal */}
      <Modal open={!!showDetail} onClose={() => setShowDetail(null)} title={`WO — ${showDetail?.wo_number}`} width="max-w-xl">
        {showDetail && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-slate-500">Vendor:</span><p className="font-semibold">{showDetail.vendor_name}</p></div>
              <div><span className="text-slate-500">Project:</span><p className="font-semibold">{showDetail.project_name}</p></div>
              <div><span className="text-slate-500">Contract Value:</span><p className="font-medium text-blue-700">{fmt(showDetail.contract_value)}</p></div>
              <div><span className="text-slate-500">Billed So Far:</span><p className="font-medium text-violet-700">{fmt(showDetail.total_billed)}</p></div>
            </div>
            <FormField label="Status">
              <select defaultValue={showDetail.status} id="wo-status-sel" className={inputCls}>
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="closed">Closed</option>
                <option value="disputed">Disputed</option>
              </select>
            </FormField>
            <FormField label="Terms & Conditions">
              <textarea id="wo-terms-inp" rows={3} defaultValue={showDetail.terms_conditions} className={inputCls} />
            </FormField>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setShowDetail(null)} className="px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100 rounded-xl">Cancel</button>
              <button
                disabled={patchMut.isPending}
                onClick={() => {
                  const status = document.getElementById('wo-status-sel').value;
                  const terms = document.getElementById('wo-terms-inp').value;
                  patchMut.mutate({ id: showDetail.id, status, terms_conditions: terms });
                }}
                className="px-5 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-xl disabled:opacity-60"
              >
                {patchMut.isPending ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ─── TAB 3: Measurement Book ──────────────────────────────────────────────────
function MeasurementsTab({ projectId, projects, vendors }) {
  const qc = useQueryClient();
  const [search, setSearch]       = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [woFilter, setWoFilter]   = useState('');
  const [woDetail, setWoDetail]   = useState(null); // items of selected WO
  const EMPTY_MB = { wo_id: '', wo_item_id: '', mb_date: new Date().toISOString().slice(0,10), tower_block: '', floor_number: '', location_detail: '', drawing_ref: '', description: '', unit: '', executed_qty: '', remarks: '' };
  const [form, setForm] = useState(EMPTY_MB);
  const [err,  setErr]  = useState({});
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const { data: woData } = useQuery({
    queryKey: ['sc-wo-list-mb', projectId],
    queryFn: () => scAPI.listWO({ project_id: projectId || undefined }).then(r => r.data?.data ?? []),
  });
  const workOrders = (Array.isArray(woData) ? woData : [])
    .filter(r => ['active','approved','draft'].includes(r.status?.toLowerCase()));

  // When WO is selected in form, load its items
  const loadWOItems = async (woId) => {
    set('wo_id', woId); set('wo_item_id', ''); setWoDetail(null);
    if (!woId) return;
    try { const r = await scAPI.getWO(woId); setWoDetail(r.data?.data); }
    catch { toast.error('Could not load WO items'); }
  };

  const { data: mbData, isLoading } = useQuery({
    queryKey: ['sc-mb', projectId, woFilter],
    queryFn: () => scAPI.listMB({ project_id: projectId || undefined, wo_id: woFilter || undefined }).then(r => r.data?.data ?? []),
  });
  const allRows = Array.isArray(mbData) ? mbData : [];

  const createMut = useMutation({
    mutationFn: (d) => scAPI.createMB(d),
    onSuccess: () => {
      toast.success('MB entry recorded');
      qc.invalidateQueries({ queryKey: ['sc-mb'] });
      setShowCreate(false); setForm(EMPTY_MB); setWoDetail(null);
    },
    onError: e => toast.error(e?.response?.data?.error || 'Failed'),
  });

  const rows = useMemo(() => {
    if (!search) return allRows;
    const q = search.toLowerCase();
    return allRows.filter(r => r.description?.toLowerCase().includes(q) || r.sc_name?.toLowerCase().includes(q) || r.wo_number?.toLowerCase().includes(q));
  }, [allRows, search]);

  function handleCreate() {
    const e = {};
    if (!form.wo_id)       e.wo_id       = 'Required';
    if (!form.wo_item_id)  e.wo_item_id  = 'Select a BOQ item';
    if (!form.executed_qty || isNaN(form.executed_qty)) e.executed_qty = 'Enter valid qty';
    setErr(e);
    if (Object.keys(e).length) return;
    createMut.mutate({ ...form, executed_qty: parseFloat(form.executed_qty) });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search measurements…" className="pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-200 w-full focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <select value={woFilter} onChange={e => setWoFilter(e.target.value)} className="text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">All Work Orders</option>
          {workOrders.map(wo => <option key={wo.id} value={wo.id}>{wo.wo_number} — {wo.vendor_name}</option>)}
        </select>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors">
          <Plus className="w-4 h-4" /> Record Measurement
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        {isLoading ? (
          <div className="py-16 flex justify-center"><RefreshCw className="w-6 h-6 text-slate-300 animate-spin" /></div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-sm">No MB entries recorded</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs font-medium text-slate-500 uppercase tracking-wide">
                  <th className="px-5 py-3 text-left">MB No.</th>
                  <th className="px-4 py-3 text-left">WO No.</th>
                  <th className="px-4 py-3 text-left">Subcontractor</th>
                  <th className="px-4 py-3 text-left">Description</th>
                  <th className="px-4 py-3 text-right">Exec Qty</th>
                  <th className="px-4 py-3 text-left">Unit</th>
                  <th className="px-4 py-3 text-left">Location</th>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {rows.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-mono text-xs text-slate-600">{m.mb_number || '—'}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{m.wo_number}</td>
                    <td className="px-4 py-3 text-slate-700">{m.sc_name}</td>
                    <td className="px-4 py-3 text-slate-900 font-medium max-w-xs truncate">{m.description || m.item_description}</td>
                    <td className="px-4 py-3 text-right text-slate-700 font-mono">{Number(m.executed_qty || 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-slate-500">{m.unit || '—'}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{[m.tower_block, m.floor_number, m.location_detail].filter(Boolean).join(' / ') || '—'}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{m.mb_date ? new Date(m.mb_date).toLocaleDateString('en-IN') : '—'}</td>
                    <td className="px-4 py-3 text-center"><StatusBadge status={m.status || 'draft'} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create MB Modal */}
      <Modal open={showCreate} onClose={() => { setShowCreate(false); setForm(EMPTY_MB); setWoDetail(null); }} title="New Measurement Book Entry" width="max-w-2xl">
        <div className="grid grid-cols-2 gap-4">
          {/* WO selection */}
          <div className="col-span-2">
            <FormField label="Work Order *" error={err.wo_id}>
              <select value={form.wo_id} onChange={e => loadWOItems(e.target.value)} className={inputCls}>
                <option value="">Select Work Order…</option>
                {workOrders.map(wo => (
                  <option key={wo.id} value={wo.id}>{wo.wo_number} — {wo.sc_name} ({wo.project_name})</option>
                ))}
              </select>
            </FormField>
          </div>
          {/* BOQ item selection */}
          <div className="col-span-2">
            <FormField label="BOQ Item *" error={err.wo_item_id}>
              <select value={form.wo_item_id} onChange={e => {
                const item = (woDetail?.items || []).find(i => i.id === e.target.value);
                set('wo_item_id', e.target.value);
                if (item) { set('description', item.description || ''); set('unit', item.unit || ''); }
              }} className={inputCls} disabled={!form.wo_id}>
                <option value="">{form.wo_id ? 'Select BOQ item…' : 'Select WO first'}</option>
                {(woDetail?.items || []).map(it => (
                  <option key={it.id} value={it.id}>
                    {it.description} — {it.unit} (WO: {Number(it.qty||0).toLocaleString()}, Billed: {Number(it.billed_qty||0).toLocaleString()})
                  </option>
                ))}
              </select>
            </FormField>
          </div>
          {/* Description auto-filled from item, editable */}
          <div className="col-span-2">
            <FormField label="Description">
              <input value={form.description} onChange={e => set('description', e.target.value)} className={inputCls} placeholder="Work description…" />
            </FormField>
          </div>
          <FormField label="Executed Qty *" error={err.executed_qty}>
            <input type="number" min="0" step="0.01" value={form.executed_qty} onChange={e => set('executed_qty', e.target.value)} className={inputCls} placeholder="0.00" />
          </FormField>
          <FormField label="Unit">
            <input value={form.unit} onChange={e => set('unit', e.target.value)} className={inputCls} placeholder="Sqm / Cum / Nos…" />
          </FormField>
          <FormField label="MB Date">
            <input type="date" value={form.mb_date} onChange={e => set('mb_date', e.target.value)} className={inputCls} />
          </FormField>
          <FormField label="Drawing Ref">
            <input value={form.drawing_ref} onChange={e => set('drawing_ref', e.target.value)} className={inputCls} placeholder="DWG-001" />
          </FormField>
          <FormField label="Tower / Block">
            <input value={form.tower_block} onChange={e => set('tower_block', e.target.value)} className={inputCls} placeholder="Tower A / Block 1" />
          </FormField>
          <FormField label="Floor / Level">
            <input value={form.floor_number} onChange={e => set('floor_number', e.target.value)} className={inputCls} placeholder="Ground / 3rd Floor" />
          </FormField>
          <div className="col-span-2">
            <FormField label="Location Detail">
              <input value={form.location_detail} onChange={e => set('location_detail', e.target.value)} className={inputCls} placeholder="Grid A1-A4, Col C3…" />
            </FormField>
          </div>
          <div className="col-span-2">
            <FormField label="Remarks">
              <textarea rows={2} value={form.remarks} onChange={e => set('remarks', e.target.value)} className={inputCls} placeholder="Optional site notes…" />
            </FormField>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => { setShowCreate(false); setForm(EMPTY_MB); setWoDetail(null); }} className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-xl">Cancel</button>
          <button disabled={createMut.isPending} onClick={handleCreate}
            className="px-5 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-xl disabled:opacity-60">
            {createMut.isPending ? 'Saving…' : 'Record Measurement'}
          </button>
        </div>
      </Modal>
    </div>
  );
}

// ─── TAB 4: RA Bills ──────────────────────────────────────────────────────────
function BillsTab({ projectId, vendors }) {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showDetail, setShowDetail] = useState(null);
  const EMPTY_BILL_FORM = {
    work_order_id: '', bill_number: '', bill_date: new Date().toISOString().slice(0,10),
    bill_amount: '', tax_amount: '', retention_percent: '5',
    retention_pct: '5', tds_pct: '2', gst_pct: '18',
    tds_amount: '', gst_amount: '', advance_recovery: '0',
    other_deductions: '0', penalty_amount: '0',
    period_start: '', period_end: '', due_date: '', bill_type: 'ra',
    bill_description: '',
  };
  const [form, setForm] = useState(EMPTY_BILL_FORM);
  const [err, setErr] = useState({});
  const [woItems, setWoItems] = useState([]);
  const [woItemsLoading, setWoItemsLoading] = useState(false);
  const [itemQtys, setItemQtys] = useState({});

  const useLineItems = woItems.length > 0;
  const grossFromItems = useMemo(
    () => woItems.reduce((s, it) => s + (parseFloat(itemQtys[it.id] || 0) * parseFloat(it.rate || 0)), 0),
    [woItems, itemQtys]
  );

  useEffect(() => {
    if (!form.work_order_id) {
      setWoItems([]);
      setItemQtys({});
      return;
    }
    setWoItemsLoading(true);
    Promise.all([
      subcontractorAPI.getWorkOrder(form.work_order_id),
      subcontractorAPI.listAdvances({ wo_id: form.work_order_id }),
    ])
      .then(([woRes, advRes]) => {
        const wo    = woRes.data?.data || woRes.data;
        const items = wo?.items || [];
        setWoItems(items);
        const qtys = {};
        items.forEach(it => { qtys[it.id] = ''; });
        setItemQtys(qtys);

        const advances    = advRes.data?.data || [];
        const outstanding = advances.reduce((s, a) => s + parseFloat(a.outstanding || 0), 0);

        setForm(f => ({
          ...f,
          gst_pct:          wo?.gst_pct       != null ? String(wo.gst_pct)       : f.gst_pct,
          tds_pct:          wo?.tds_pct       != null ? String(wo.tds_pct)       : f.tds_pct,
          retention_pct:    wo?.retention_pct != null ? String(wo.retention_pct) : f.retention_pct,
          advance_recovery: outstanding > 0 ? String(outstanding.toFixed(2)) : f.advance_recovery,
        }));
      })
      .catch(() => {})
      .finally(() => setWoItemsLoading(false));
  }, [form.work_order_id]);

  const calcDeductions = (f, baseOverride = null) => {
    const base = baseOverride !== null ? baseOverride : parseFloat(f.bill_amount || 0);
    const gst  = parseFloat(f.gst_pct || 0);
    const ret  = parseFloat(f.retention_pct || 0);
    const tds  = parseFloat(f.tds_pct || 0);
    const gstAmt = base * gst / 100;
    const gross  = base + gstAmt;
    const retAmt = base * ret / 100;
    const tdsAmt = base * tds / 100;
    const adv    = parseFloat(f.advance_recovery || 0);
    const othr   = parseFloat(f.other_deductions || 0);
    const pen    = parseFloat(f.penalty_amount || 0);
    const net    = gross - retAmt - tdsAmt - adv - othr - pen;
    return { gst_amount: gstAmt.toFixed(2), tds_amount: tdsAmt.toFixed(2), net_payable: net.toFixed(2), gross };
  };

  const { data: woData } = useQuery({
    queryKey: ['sub-wo-list', projectId],
    queryFn: () => subcontractorAPI.listWorkOrders({ project_id: projectId || undefined }).then(r => r.data),
    staleTime: 0, gcTime: 0, refetchOnMount: 'always',
  });
  const workOrders = (woData?.data || woData?.work_orders || (Array.isArray(woData) ? woData : []))
    .filter(r => ['active','approved','draft'].includes(r.status?.toLowerCase()));

  const { data, isLoading } = useQuery({
    queryKey: ['sub-bills', projectId, statusFilter],
    queryFn: () => subcontractorAPI.listBills({
      project_id: projectId || undefined,
      status: statusFilter || undefined,
    }).then(r => r.data),
    staleTime: 0, gcTime: 0, refetchOnMount: 'always',
  });

  const createMut = useMutation({
    mutationFn: (d) => subcontractorAPI.createBill(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sub-bills'] });
      qc.invalidateQueries({ queryKey: ['sub-dashboard'] });
      setShowCreate(false);
      setForm(EMPTY_BILL_FORM);
      setWoItems([]);
      setItemQtys({});
    },
  });

  const bills = data?.data || data?.bills || (Array.isArray(data) ? data : []);

  function validateCreate() {
    const e = {};
    if (!form.work_order_id) e.work_order_id = 'Required';
    if (useLineItems) {
      const hasQty = Object.values(itemQtys).some(q => parseFloat(q || 0) > 0);
      if (!hasQty) e.bill_amount = 'Enter quantity for at least one line item';
    } else {
      if (!form.bill_amount || isNaN(form.bill_amount)) e.bill_amount = 'Enter valid amount';
    }
    setErr(e);
    return Object.keys(e).length === 0;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="submitted">Submitted</option>
          <option value="approved">Approved</option>
          <option value="paid">Paid</option>
        </select>
        <div className="flex-1" />
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors">
          <Plus className="w-4 h-4" /> Raise RA Bill
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        {isLoading ? (
          <div className="py-16 flex justify-center"><RefreshCw className="w-6 h-6 text-slate-300 animate-spin" /></div>
        ) : bills.length === 0 ? (
          <div className="py-16 text-center text-slate-900 font-medium text-sm">No bills found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs font-medium text-slate-900 font-medium uppercase tracking-wide">
                  <th className="px-5 py-3 text-left">Bill No.</th>
                  <th className="px-4 py-3 text-left">WO No.</th>
                  <th className="px-4 py-3 text-left">Vendor</th>
                  <th className="px-4 py-3 text-right">Bill Amt</th>
                  <th className="px-4 py-3 text-right">Tax</th>
                  <th className="px-4 py-3 text-right">Net Payable</th>
                  <th className="px-4 py-3 text-left">Bill Date</th>
                  <th className="px-4 py-3 text-left">Due Date</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {bills.map((b) => {
                  const amt = parseFloat(b.bill_amount || b.gross_amount || 0);
                  const tax = parseFloat(b.tax_amount || 0);
                  const net = parseFloat(b.net_payable) || (amt + tax - amt * (parseFloat(b.retention_percent || 0) / 100));
                  const isOverdue = b.status !== 'paid' && b.due_date && new Date(b.due_date) < new Date();
                  return (
                    <tr key={b.id} className={clsx('hover:bg-slate-50', isOverdue && 'bg-red-50/30')}>
                      <td className="px-5 py-3 font-mono text-xs text-slate-600">
                        <div className="flex items-center gap-1.5">
                          <span>{b.bill_number || '—'}</span>
                          {b.bill_type && b.bill_type !== 'ra' && (
                            <span className={clsx('text-[9px] font-bold uppercase px-1.5 py-0.5 rounded',
                              b.bill_type === 'final'      ? 'bg-emerald-100 text-emerald-700' :
                              b.bill_type === 'advance'    ? 'bg-violet-100 text-violet-700'   :
                              b.bill_type === 'extra_item' ? 'bg-amber-100 text-amber-700'     : 'bg-slate-100 text-slate-600')}>
                              {b.bill_type === 'extra_item' ? 'EXTRA' : b.bill_type.toUpperCase()}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">{b.wo_number || '—'}</td>
                      <td className="px-4 py-3 text-slate-700">{b.vendor_name || '—'}</td>
                      <td className="px-4 py-3 text-right text-slate-900 font-medium font-semibold">{fmt(amt)}</td>
                      <td className="px-4 py-3 text-right text-slate-500">{fmt(tax)}</td>
                      <td className="px-4 py-3 text-right font-medium text-blue-700">{fmt(net)}</td>
                      <td className="px-4 py-3 text-slate-900 font-medium text-xs">{b.bill_date ? new Date(b.bill_date).toLocaleDateString('en-IN') : '—'}</td>
                      <td className="px-4 py-3 text-xs">
                        <span className={isOverdue ? 'text-red-500 font-semibold' : 'text-slate-500'}>
                          {b.due_date ? new Date(b.due_date).toLocaleDateString('en-IN') : '—'}
                        </span>
                        {isOverdue && <span className="ml-1 text-[10px] font-medium text-red-500">OVERDUE</span>}
                      </td>
                      <td className="px-4 py-3 text-center"><StatusBadge status={b.status} /></td>
                      <td className="px-4 py-3 text-center">
                        <button onClick={() => setShowDetail(b)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-900 font-medium hover:text-blue-600 transition-colors" title="Update">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Bill Modal — Full Featured */}
      <Modal open={showCreate} onClose={() => { setShowCreate(false); setErr({}); }} title="Raise Subcontractor Bill" width="max-w-3xl">
        {(() => {
          const calc = calcDeductions(form, useLineItems ? grossFromItems : null);
          const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
          const billBase = useLineItems ? grossFromItems : parseFloat(form.bill_amount || 0);
          return (
            <div className="space-y-4">
              {/* Row 1: WO + Bill Type */}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <FormField label="Work Order *" error={err.work_order_id}>
                    <select value={form.work_order_id} onChange={e => set('work_order_id', e.target.value)} className={inputCls}>
                      <option value="">Select Work Order…</option>
                      {workOrders.map(wo => (
                        <option key={wo.id} value={wo.id}>{wo.wo_number} — {wo.vendor_name} ({fmt(wo.contract_amount)})</option>
                      ))}
                    </select>
                  </FormField>
                </div>
                <FormField label="Bill Type">
                  <select value={form.bill_type} onChange={e => set('bill_type', e.target.value)} className={inputCls}>
                    <option value="ra">RA Bill (Running Account)</option>
                    <option value="final">Final Bill</option>
                    <option value="advance">Advance Bill</option>
                    <option value="extra_item">Extra Item Bill</option>
                    <option value="debit_note">Debit Note</option>
                  </select>
                </FormField>
                <FormField label="Bill Number">
                  <input value={form.bill_number} onChange={e => set('bill_number', e.target.value)} className={inputCls} placeholder="Auto-generated if blank" />
                </FormField>
              </div>

              {/* Row 2: Dates */}
              <div className="grid grid-cols-4 gap-3">
                <FormField label="Bill Date">
                  <input type="date" value={form.bill_date} onChange={e => set('bill_date', e.target.value)} className={inputCls} />
                </FormField>
                <FormField label="Period From">
                  <input type="date" value={form.period_start} onChange={e => set('period_start', e.target.value)} className={inputCls} />
                </FormField>
                <FormField label="Period To">
                  <input type="date" value={form.period_end} onChange={e => set('period_end', e.target.value)} className={inputCls} />
                </FormField>
                <FormField label="Due Date">
                  <input type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)} className={inputCls} />
                </FormField>
              </div>

              {/* Row 3: Description */}
              <FormField label="Bill Description">
                <input value={form.bill_description} onChange={e => set('bill_description', e.target.value)} className={inputCls} placeholder="Work executed during the period…" />
              </FormField>

              {/* Section A: Line Items (when WO has items) or manual amount (lump-sum WO) */}
              {woItemsLoading && (
                <div className="flex items-center gap-2 text-xs text-slate-500 py-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Loading work order items…
                </div>
              )}

              {!woItemsLoading && useLineItems && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Section A — Work Executed This Bill</p>
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50">
                        <tr className="text-slate-500 uppercase tracking-wide font-medium">
                          <th className="px-3 py-2 text-left">Description</th>
                          <th className="px-2 py-2 text-left w-14">Unit</th>
                          <th className="px-2 py-2 text-right w-20">WO Qty</th>
                          <th className="px-2 py-2 text-right w-20">Prev Cert</th>
                          <th className="px-2 py-2 text-right w-28">This Bill ▶</th>
                          <th className="px-2 py-2 text-right w-24">Rate</th>
                          <th className="px-2 py-2 text-right w-28">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {woItems.map(it => {
                          const maxQty = parseFloat(it.remaining_qty || 0);
                          const thisQty = parseFloat(itemQtys[it.id] || 0);
                          const amt = thisQty * parseFloat(it.rate || 0);
                          const overQty = thisQty > 0 && thisQty > maxQty;
                          return (
                            <tr key={it.id} className={overQty ? 'bg-red-50' : ''}>
                              <td className="px-3 py-1.5 text-slate-700">{it.description}</td>
                              <td className="px-2 py-1.5 text-slate-500">{it.unit}</td>
                              <td className="px-2 py-1.5 text-right text-slate-500">{parseFloat(it.quantity || 0).toFixed(2)}</td>
                              <td className="px-2 py-1.5 text-right text-amber-600">{parseFloat(it.billed_qty || 0).toFixed(2)}</td>
                              <td className="px-1 py-1">
                                <input
                                  type="number"
                                  value={itemQtys[it.id] || ''}
                                  onChange={e => setItemQtys(q => ({ ...q, [it.id]: e.target.value }))}
                                  className={inputCls + ' text-xs text-right ' + (overQty ? 'border-red-400 bg-red-50' : '')}
                                  placeholder={`max ${maxQty.toFixed(2)}`}
                                  min="0"
                                  step="0.01"
                                />
                              </td>
                              <td className="px-2 py-1.5 text-right text-slate-600">{fmt(parseFloat(it.rate || 0))}</td>
                              <td className="px-2 py-1.5 text-right font-medium text-slate-800">{thisQty > 0 ? fmt(amt) : '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                        <tr>
                          <td colSpan={6} className="px-3 py-2 text-right text-xs font-semibold text-slate-600">Gross Bill Amount (Section A):</td>
                          <td className="px-2 py-2 text-right font-bold text-slate-900">{fmt(grossFromItems)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  {err.bill_amount && <p className="text-xs text-red-500 mt-1">{err.bill_amount}</p>}
                </div>
              )}

              {!woItemsLoading && !useLineItems && (
                <div className="grid grid-cols-3 gap-3">
                  <FormField label="Bill Amount (₹) *" error={err.bill_amount}>
                    <input type="number" value={form.bill_amount} onChange={e => set('bill_amount', e.target.value)} className={inputCls} placeholder="0.00" />
                  </FormField>
                  <FormField label="GST %">
                    <input type="number" value={form.gst_pct} onChange={e => set('gst_pct', e.target.value)} className={inputCls} placeholder="18" min="0" max="100" />
                  </FormField>
                  <FormField label={`GST Amount = ₹${Number(calc.gst_amount || 0).toLocaleString('en-IN',{maximumFractionDigits:0})}`}>
                    <input type="number" value={form.gst_amount || calc.gst_amount} onChange={e => set('gst_amount', e.target.value)} className={inputCls} />
                  </FormField>
                </div>
              )}

              {!woItemsLoading && useLineItems && (
                <div className="grid grid-cols-3 gap-3">
                  <FormField label="GST %">
                    <input type="number" value={form.gst_pct} onChange={e => set('gst_pct', e.target.value)} className={inputCls} placeholder="18" min="0" max="100" />
                  </FormField>
                  <FormField label={`GST Amount = ₹${Number(calc.gst_amount || 0).toLocaleString('en-IN',{maximumFractionDigits:0})}`}>
                    <input type="number" value={form.gst_amount || calc.gst_amount} onChange={e => set('gst_amount', e.target.value)} className={inputCls} />
                  </FormField>
                </div>
              )}

              {/* Deductions */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Deductions</p>
                <div className="grid grid-cols-3 gap-3">
                  <FormField label="Retention %">
                    <input type="number" value={form.retention_pct} onChange={e => set('retention_pct', e.target.value)} className={inputCls} placeholder="5" min="0" max="100" />
                  </FormField>
                  <FormField label="TDS %">
                    <input type="number" value={form.tds_pct} onChange={e => set('tds_pct', e.target.value)} className={inputCls} placeholder="2" min="0" max="100" />
                  </FormField>
                  <FormField label="Advance Recovery (₹)">
                    <input type="number" value={form.advance_recovery} onChange={e => set('advance_recovery', e.target.value)} className={inputCls} placeholder="0" />
                  </FormField>
                  <FormField label="Material Recovery (₹)">
                    <input type="number" value={form.other_deductions} onChange={e => set('other_deductions', e.target.value)} className={inputCls} placeholder="0" />
                  </FormField>
                  <FormField label="Penalty (₹)">
                    <input type="number" value={form.penalty_amount} onChange={e => set('penalty_amount', e.target.value)} className={inputCls} placeholder="0" />
                  </FormField>
                </div>
              </div>

              {/* Summary */}
              {billBase > 0 && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm">
                  <div className="grid grid-cols-2 gap-1">
                    <div className="flex justify-between text-slate-600"><span>Bill Amount</span><span>{fmt(billBase)}</span></div>
                    <div className="flex justify-between text-slate-600"><span>+ GST ({form.gst_pct}%)</span><span>+ {fmt(parseFloat(calc.gst_amount))}</span></div>
                    <div className="flex justify-between text-slate-600 font-medium"><span>= Gross Amount</span><span>{fmt(calc.gross)}</span></div>
                    <div className="flex justify-between text-red-500"><span>- Retention ({form.retention_pct}%)</span><span>- {fmt(billBase * parseFloat(form.retention_pct || 0) / 100)}</span></div>
                    <div className="flex justify-between text-red-500"><span>- TDS ({form.tds_pct}%)</span><span>- {fmt(parseFloat(calc.tds_amount))}</span></div>
                    {parseFloat(form.advance_recovery || 0) > 0 && <div className="flex justify-between text-red-500"><span>- Advance Recovery</span><span>- {fmt(parseFloat(form.advance_recovery))}</span></div>}
                    {parseFloat(form.other_deductions || 0) > 0 && <div className="flex justify-between text-red-500"><span>- Material Recovery</span><span>- {fmt(parseFloat(form.other_deductions))}</span></div>}
                    {parseFloat(form.penalty_amount || 0) > 0 && <div className="flex justify-between text-red-500"><span>- Penalty</span><span>- {fmt(parseFloat(form.penalty_amount))}</span></div>}
                  </div>
                  <div className="flex justify-between font-bold text-blue-800 border-t border-blue-200 pt-2 mt-2 text-base">
                    <span>Net Payable</span>
                    <span>{fmt(parseFloat(calc.net_payable))}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })()}
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => { setShowCreate(false); setErr({}); }} className="px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100 rounded-xl">Cancel</button>
          <button
            disabled={createMut.isPending}
            onClick={() => {
              if (!validateCreate()) return;
              const calc = calcDeductions(form, useLineItems ? grossFromItems : null);
              const billBase = useLineItems ? grossFromItems : parseFloat(form.bill_amount || 0);
              const billItems = woItems
                .filter(it => parseFloat(itemQtys[it.id] || 0) > 0)
                .map(it => ({
                  wo_item_id: it.id,
                  billed_qty: parseFloat(itemQtys[it.id]),
                  rate: parseFloat(it.rate),
                  measurement_id: null,
                }));
              createMut.mutate({
                work_order_id: form.work_order_id,
                bill_number: form.bill_number,
                bill_date: form.bill_date,
                bill_type: form.bill_type,
                bill_description: form.bill_description,
                period_start: form.period_start,
                period_end: form.period_end,
                due_date: form.due_date,
                bill_amount: billBase,
                items: billItems.length > 0 ? billItems : undefined,
                gst_pct: parseFloat(form.gst_pct || 18),
                gst_amount: parseFloat(form.gst_amount || calc.gst_amount),
                gross_amount: parseFloat(calc.gross),
                retention_pct: parseFloat(form.retention_pct || 5),
                retention_percent: parseFloat(form.retention_pct || 5),
                retention_amount: billBase * parseFloat(form.retention_pct || 0) / 100,
                tds_pct: parseFloat(form.tds_pct || 2),
                tds_amount: parseFloat(calc.tds_amount),
                advance_recovery: parseFloat(form.advance_recovery || 0),
                other_deductions: parseFloat(form.other_deductions || 0),
                penalty_amount: parseFloat(form.penalty_amount || 0),
                net_payable: parseFloat(calc.net_payable),
                tax_amount: parseFloat(form.gst_amount || calc.gst_amount),
              });
            }}
            className="px-5 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-xl disabled:opacity-60"
          >
            {createMut.isPending ? 'Raising…' : 'Raise Bill'}
          </button>
        </div>
      </Modal>

      {/* Update Bill Modal */}
      <BillDetailModal open={!!showDetail} bill={showDetail} onClose={() => setShowDetail(null)} qc={qc} />
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Bill detail modal with approval timeline + approve/reject actions
// ═════════════════════════════════════════════════════════════════════════════
const STAGE_LABELS = {
  site_engineer:   { label: 'Site Engineer',   color: 'bg-slate-100 text-slate-700' },
  project_manager: { label: 'Project Manager', color: 'bg-blue-100 text-blue-700' },
  accounts:        { label: 'Accounts',        color: 'bg-violet-100 text-violet-700' },
  finance_head:    { label: 'Finance Head',    color: 'bg-emerald-100 text-emerald-700' },
  paid:            { label: 'Paid',            color: 'bg-green-100 text-green-700' },
};
const APPROVAL_FLOW = ['site_engineer', 'project_manager', 'accounts', 'finance_head', 'paid'];

function BillDetailModal({ open, bill, onClose, qc }) {
  const [comments, setComments] = useState('');
  const [showReject, setShowReject] = useState(false);

  const { data: history } = useQuery({
    queryKey: ['bill-approvals', bill?.id],
    queryFn: () => subcontractorAPI.getBillApprovals(bill.id).then(r => r.data?.data || []),
    enabled: !!bill?.id && open,
  });

  const approveMut = useMutation({
    mutationFn: () => subcontractorAPI.approveBill(bill.id, { comments }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sub-bills'] });
      qc.invalidateQueries({ queryKey: ['bill-approvals', bill.id] });
      qc.invalidateQueries({ queryKey: ['sub-dashboard'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
      setComments('');
      onClose();
    },
  });

  const rejectMut = useMutation({
    mutationFn: () => subcontractorAPI.rejectBill(bill.id, { comments }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sub-bills'] });
      qc.invalidateQueries({ queryKey: ['bill-approvals', bill.id] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
      setComments('');
      setShowReject(false);
      onClose();
    },
  });

  if (!open || !bill) return null;

  const currentStage = bill.current_stage || 'site_engineer';
  const isPaid = bill.status === 'paid';
  const isRejected = bill.status === 'rejected';
  const currentIdx = APPROVAL_FLOW.indexOf(currentStage);

  return (
    <Modal open={open} onClose={onClose} title={`Bill — ${bill.bill_number || 'Draft'}`} width="max-w-2xl">
      <div className="space-y-5">
        {/* Summary */}
        <div className="grid grid-cols-3 gap-3 text-sm p-3 bg-slate-50 rounded-xl">
          <div><span className="text-xs text-slate-500">WO</span><p className="font-semibold">{bill.wo_number}</p></div>
          <div><span className="text-xs text-slate-500">Vendor</span><p className="font-semibold">{bill.vendor_name}</p></div>
          <div><span className="text-xs text-slate-500">Type</span><p className="font-semibold capitalize">{bill.bill_type || 'ra'}</p></div>
          <div><span className="text-xs text-slate-500">Gross</span><p className="font-semibold text-blue-700">{fmt(bill.bill_amount || bill.gross_amount)}</p></div>
          <div><span className="text-xs text-slate-500">Tax</span><p className="font-semibold">{fmt(bill.tax_amount || 0)}</p></div>
          <div><span className="text-xs text-slate-500">Net Payable</span><p className="font-bold text-emerald-700">{fmt(bill.net_payable || 0)}</p></div>
        </div>

        {/* Approval pipeline */}
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Approval Pipeline</div>
          <div className="flex items-center justify-between gap-1">
            {APPROVAL_FLOW.map((stage, idx) => {
              const done = !isRejected && idx < currentIdx;
              const active = !isRejected && idx === currentIdx;
              const cfg = STAGE_LABELS[stage];
              return (
                <React.Fragment key={stage}>
                  <div className="flex flex-col items-center flex-1 min-w-0">
                    <div className={clsx(
                      'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2',
                      done ? 'bg-emerald-500 border-emerald-500 text-white' :
                      active ? 'bg-blue-600 border-blue-600 text-white animate-pulse' :
                      'bg-white border-slate-200 text-slate-400'
                    )}>
                      {done ? '✓' : idx + 1}
                    </div>
                    <span className="text-[10px] text-slate-600 mt-1 text-center truncate w-full">{cfg.label}</span>
                  </div>
                  {idx < APPROVAL_FLOW.length - 1 && (
                    <div className={clsx('h-0.5 flex-shrink-0 w-4', done ? 'bg-emerald-500' : 'bg-slate-200')} />
                  )}
                </React.Fragment>
              );
            })}
          </div>
          {isRejected && (
            <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-xs font-bold text-red-700 uppercase tracking-wider">Rejected</p>
              <p className="text-sm text-red-800 mt-1">{bill.rejection_reason || 'No reason provided'}</p>
            </div>
          )}
        </div>

        {/* History */}
        {history && history.length > 0 && (
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">History</div>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {history.map(h => (
                <div key={h.id} className="flex gap-3 text-sm border-l-2 border-slate-200 pl-3 py-1">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={clsx('px-1.5 py-0.5 rounded text-[10px] font-bold uppercase',
                        h.action === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                        h.action === 'rejected' ? 'bg-red-100 text-red-700' :
                        h.action === 'paid'     ? 'bg-green-100 text-green-700' :
                        'bg-slate-100 text-slate-700')}>{h.action}</span>
                      <span className="text-xs font-semibold text-slate-700">{h.actor_name}</span>
                      <span className="text-[10px] text-slate-400">{STAGE_LABELS[h.stage]?.label || h.stage}</span>
                    </div>
                    {h.comments && <p className="text-xs text-slate-600 mt-1">{h.comments}</p>}
                    <p className="text-[10px] text-slate-400 mt-0.5">{new Date(h.created_at).toLocaleString('en-IN')}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action buttons */}
        {!isPaid && !isRejected && (
          <>
            <FormField label={showReject ? 'Rejection Reason *' : 'Comments (optional)'}>
              <textarea rows={2} value={comments} onChange={e => setComments(e.target.value)}
                className={inputCls} placeholder={showReject ? 'Why are you rejecting?' : 'Optional notes…'} />
            </FormField>
            <div className="flex justify-end gap-2 pt-1">
              {showReject ? (
                <>
                  <button onClick={() => { setShowReject(false); setComments(''); }}
                    className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl">Cancel</button>
                  <button
                    disabled={rejectMut.isPending || !comments.trim()}
                    onClick={() => rejectMut.mutate()}
                    className="px-5 py-2 text-sm font-medium bg-red-600 hover:bg-red-700 text-white rounded-xl disabled:opacity-50">
                    {rejectMut.isPending ? 'Rejecting…' : 'Confirm Reject'}
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => setShowReject(true)}
                    className="px-4 py-2 text-sm font-medium text-red-600 border border-red-200 hover:bg-red-50 rounded-xl">Reject</button>
                  <button
                    disabled={approveMut.isPending}
                    onClick={() => approveMut.mutate()}
                    className="px-5 py-2 text-sm font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl disabled:opacity-50">
                    {approveMut.isPending ? 'Approving…' :
                      currentStage === 'finance_head' ? 'Mark as Paid' :
                      `Approve → ${STAGE_LABELS[APPROVAL_FLOW[currentIdx + 1]]?.label || 'Next'}`}
                  </button>
                </>
              )}
            </div>
          </>
        )}
        {(isPaid || isRejected) && (
          <div className="flex justify-end pt-1">
            <button onClick={onClose}
              className="px-5 py-2 text-sm font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl">Close</button>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ─── TAB: Advances ────────────────────────────────────────────────────────────
const ADVANCE_TYPES = [
  { value: 'mobilization', label: 'Mobilization Advance' },
  { value: 'material',     label: 'Material Advance' },
  { value: 'equipment',    label: 'Equipment Advance' },
  { value: 'other',        label: 'Other' },
];
const ADVANCE_STATUS_COLOR = {
  pending:            'bg-amber-100 text-amber-700',
  partially_recovered:'bg-blue-100 text-blue-700',
  fully_recovered:    'bg-emerald-100 text-emerald-700',
};

function AdvancesTab({ projectId, projects, vendors }) {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [showRecover, setShowRecover] = useState(null);
  const EMPTY = { wo_id: '', vendor_id: '', project_id: projectId || '', advance_type: 'mobilization', amount: '', advance_date: new Date().toISOString().slice(0, 10), payment_mode: 'bank_transfer', payment_ref: '', notes: '' };
  const [form, setForm] = useState(EMPTY);
  const [recAmt, setRecAmt] = useState('');
  const [err, setErr] = useState({});

  const { data: woData } = useQuery({
    queryKey: ['sc-wo-list-adv', projectId],
    queryFn: () => scAPI.listWO({ project_id: projectId || undefined }).then(r => r.data?.data ?? []),
    staleTime: 0, gcTime: 0, refetchOnMount: 'always',
  });
  const workOrders = (Array.isArray(woData) ? woData : [])
    .filter(r => ['active', 'approved', 'draft'].includes(r.status?.toLowerCase()));

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['sc-advances', projectId],
    queryFn: () => scAPI.listAdvances({ project_id: projectId || undefined }).then(r => r.data?.data ?? []),
    staleTime: 0, gcTime: 0, refetchOnMount: 'always',
  });
  const advances = Array.isArray(data) ? data : [];

  const totalGranted     = advances.reduce((s, a) => s + parseFloat(a.amount || 0), 0);
  const totalRecovered   = advances.reduce((s, a) => s + parseFloat(a.recovered_amount || 0), 0);
  const totalOutstanding = advances.reduce((s, a) => s + parseFloat(a.balance_amount || 0), 0);

  const createMut = useMutation({
    mutationFn: (d) => scAPI.createAdvance(d),
    onSuccess: () => {
      toast.success('Advance recorded');
      qc.invalidateQueries({ queryKey: ['sc-advances'] });
      setShowCreate(false); setForm(EMPTY);
    },
    onError: e => toast.error(e?.response?.data?.error || 'Failed to record advance'),
  });

  function handleCreate() {
    const e = {};
    if (!form.wo_id)    e.wo_id   = 'Required';
    if (!form.amount || isNaN(form.amount)) e.amount = 'Enter valid amount';
    setErr(e);
    if (Object.keys(e).length) return;
    createMut.mutate({
      wo_id:        form.wo_id,
      advance_date: form.advance_date,
      amount:       parseFloat(form.amount),
      payment_mode: form.payment_mode,
      reference_no: form.payment_ref,
      remarks:      form.notes || form.advance_type,
    });
  }

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid md:grid-cols-3 gap-4">
        <KpiCard icon={Wallet}       label="Total Advances Granted"  value={fmt(totalGranted)}     sub={`${advances.length} advances`}           color="text-violet-700" />
        <KpiCard icon={CheckCircle}  label="Total Recovered"         value={fmt(totalRecovered)}   sub="via RA bill deductions"                  color="text-emerald-700" />
        <KpiCard icon={AlertTriangle} label="Outstanding Balance"    value={fmt(totalOutstanding)} sub="to be recovered in future bills"         color="text-amber-700" />
      </div>

      <div className="flex justify-end">
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors">
          <Plus className="w-4 h-4" /> Grant Advance
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        {isLoading ? (
          <div className="py-16 flex justify-center"><RefreshCw className="w-6 h-6 text-slate-300 animate-spin" /></div>
        ) : advances.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-sm">No advances recorded yet</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs font-medium text-slate-500 uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">WO No.</th>
                  <th className="px-4 py-3 text-left">Subcontractor</th>
                  <th className="px-4 py-3 text-left">Type</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3 text-right">Recovered</th>
                  <th className="px-4 py-3 text-right">Outstanding</th>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Ref</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {advances.map(a => {
                  const balance = parseFloat(a.balance_amount || 0);
                  return (
                    <tr key={a.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">{a.wo_number}</td>
                      <td className="px-4 py-3 font-medium text-slate-800">{a.sc_name}</td>
                      <td className="px-4 py-3 text-slate-600 capitalize">{a.remarks || '—'}</td>
                      <td className="px-4 py-3 text-right font-medium text-slate-800">{fmt(a.amount)}</td>
                      <td className="px-4 py-3 text-right text-emerald-600">{fmt(a.recovered_amount)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-amber-600">{fmt(balance)}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{a.advance_date ? new Date(a.advance_date).toLocaleDateString('en-IN') : '—'}</td>
                      <td className="px-4 py-3 text-xs text-slate-500 font-mono">{a.reference_no || '—'}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={clsx('text-[11px] font-semibold px-2 py-0.5 rounded-full', ADVANCE_STATUS_COLOR[a.recovery_status] || 'bg-slate-100 text-slate-600')}>
                          {a.recovery_status === 'fully_recovered' ? 'Recovered' : a.recovery_status === 'partially_recovered' ? 'Partial' : 'Open'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-[10px] text-slate-400">via RA Bill</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Grant Advance Modal */}
      <Modal open={showCreate} onClose={() => { setShowCreate(false); setErr({}); }} title="Grant Advance" width="max-w-lg">
        <div className="space-y-4">
          <FormField label="Work Order *" error={err.wo_id}>
            <select value={form.wo_id} onChange={e => {
              const wo = workOrders.find(w => w.id === e.target.value);
              setForm(f => ({ ...f, wo_id: e.target.value, vendor_id: wo?.vendor_id || f.vendor_id, project_id: wo?.project_id || f.project_id || projectId || '' }));
            }} className={inputCls}>
              <option value="">Select Work Order…</option>
              {workOrders.map(wo => (
                <option key={wo.id} value={wo.id}>{wo.wo_number} — {wo.vendor_name}</option>
              ))}
            </select>
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Advance Type">
              <select value={form.advance_type} onChange={e => setForm(f => ({ ...f, advance_type: e.target.value }))} className={inputCls}>
                {ADVANCE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </FormField>
            <FormField label="Amount (₹) *" error={err.amount}>
              <input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} className={inputCls} placeholder="0.00" min="0" />
            </FormField>
            <FormField label="Date">
              <input type="date" value={form.advance_date} onChange={e => setForm(f => ({ ...f, advance_date: e.target.value }))} className={inputCls} />
            </FormField>
            <FormField label="Payment Mode">
              <select value={form.payment_mode} onChange={e => setForm(f => ({ ...f, payment_mode: e.target.value }))} className={inputCls}>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="neft">NEFT</option>
                <option value="rtgs">RTGS</option>
                <option value="cheque">Cheque</option>
                <option value="cash">Cash</option>
              </select>
            </FormField>
          </div>
          <FormField label="Bank Ref / UTR / Cheque No.">
            <input value={form.payment_ref} onChange={e => setForm(f => ({ ...f, payment_ref: e.target.value }))} className={inputCls} placeholder="Optional" />
          </FormField>
          <FormField label="Notes">
            <textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className={inputCls} placeholder="Purpose / remarks…" />
          </FormField>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => { setShowCreate(false); setErr({}); }} className="px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100 rounded-xl">Cancel</button>
          <button disabled={createMut.isPending} onClick={handleCreate} className="px-5 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-xl disabled:opacity-60">
            {createMut.isPending ? 'Saving…' : 'Grant Advance'}
          </button>
        </div>
      </Modal>

      {/* Recovery info — recovery is auto-tracked via RA Bill advance_recovery deductions */}
      <Modal open={!!showRecover} onClose={() => setShowRecover(null)} title="Advance Recovery" width="max-w-sm">
        {showRecover && (
          <div className="space-y-3">
            <div className="rounded-xl bg-slate-50 p-3 text-sm space-y-1">
              <div className="flex justify-between"><span className="text-slate-500">Subcontractor</span><strong>{showRecover.sc_name}</strong></div>
              <div className="flex justify-between"><span className="text-slate-500">Advance Granted</span><strong>{fmt(showRecover.amount)}</strong></div>
              <div className="flex justify-between"><span className="text-slate-500">Recovered via Bills</span><strong className="text-emerald-600">{fmt(showRecover.recovered_amount)}</strong></div>
              <div className="flex justify-between border-t border-slate-200 pt-1 mt-1"><span className="text-slate-500">Balance</span><strong className="text-amber-600">{fmt(showRecover.balance_amount)}</strong></div>
            </div>
            <div className="rounded-xl bg-blue-50 border border-blue-200 p-3 text-xs text-blue-700">
              ℹ️ Advance recovery is auto-calculated from the <strong>Advance Recovery (₹)</strong> deduction field on each RA Bill. No manual entry needed here.
            </div>
            <div className="flex justify-end mt-2">
              <button onClick={() => setShowRecover(null)} className="px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100 rounded-xl">Close</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ─── Building Phases Tab ──────────────────────────────────────────────────────
const PHASE_STATUS = {
  not_started: { cls: 'bg-slate-100 text-slate-600',   label: 'Not Started', dot: '#94a3b8' },
  in_progress:  { cls: 'bg-blue-100 text-blue-700',    label: 'In Progress', dot: '#2563eb' },
  completed:    { cls: 'bg-emerald-100 text-emerald-700', label: 'Completed', dot: '#059669' },
  on_hold:      { cls: 'bg-amber-100 text-amber-700',  label: 'On Hold',     dot: '#d97706' },
};
const fmtDate = d => d ? dayjs(d).format('DD MMM YYYY') : '—';

function PhasesTab({ projectId, projects }) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null); // phase being edited
  const emptyForm = { project_id: projectId || '', phase_code: '', phase_name: '', description: '', planned_start: '', planned_end: '', sequence_no: 1 };
  const [form, setForm] = useState(emptyForm);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const { data: phases = [], isLoading } = useQuery({
    queryKey: ['sc-phases', projectId],
    queryFn: () => planningP6API.listPhases(projectId ? { project_id: projectId } : {}).then(r => r.data?.data ?? []),
    staleTime: 30000,
  });

  const completeMut = useMutation({
    mutationFn: ({ id, currentStatus }) => planningP6API.updatePhase(id, {
      status: currentStatus === 'completed' ? 'in_progress' : 'completed',
      actual_end: currentStatus === 'completed' ? null : dayjs().format('YYYY-MM-DD'),
    }),
    onSuccess: () => { toast.success('Phase status updated'); qc.invalidateQueries({ queryKey: ['sc-phases'] }); },
    onError: e => toast.error(e?.response?.data?.error || 'Failed'),
  });

  const startMut = useMutation({
    mutationFn: (id) => planningP6API.updatePhase(id, { status: 'in_progress', actual_start: dayjs().format('YYYY-MM-DD') }),
    onSuccess: () => { toast.success('Phase started'); qc.invalidateQueries({ queryKey: ['sc-phases'] }); },
    onError: e => toast.error(e?.response?.data?.error || 'Failed'),
  });

  const createMut = useMutation({
    mutationFn: d => editing ? planningP6API.updatePhase(editing.id, d) : planningP6API.createPhase(d),
    onSuccess: () => {
      toast.success(editing ? 'Phase updated' : 'Phase created');
      qc.invalidateQueries({ queryKey: ['sc-phases'] });
      setShowForm(false); setEditing(null); setForm(emptyForm);
    },
    onError: e => toast.error(e?.response?.data?.error || 'Failed'),
  });

  const deleteMut = useMutation({
    mutationFn: id => planningP6API.deletePhase(id),
    onSuccess: () => { toast.success('Phase deleted'); qc.invalidateQueries({ queryKey: ['sc-phases'] }); },
    onError: e => toast.error(e?.response?.data?.error || 'Failed'),
  });

  const openEdit = (ph) => {
    setEditing(ph);
    setForm({ project_id: ph.project_id, phase_code: ph.phase_code, phase_name: ph.phase_name, description: ph.description || '', planned_start: ph.planned_start?.slice(0,10) || '', planned_end: ph.planned_end?.slice(0,10) || '', sequence_no: ph.sequence_no || 1 });
    setShowForm(true);
  };

  const handleSave = () => {
    if (!form.project_id) return toast.error('Select a project');
    if (!form.phase_code.trim()) return toast.error('Phase code is required');
    if (!form.phase_name.trim()) return toast.error('Phase name is required');
    createMut.mutate(form);
  };

  const total = phases.length;
  const notStarted = phases.filter(p => p.status === 'not_started').length;
  const inProgress = phases.filter(p => p.status === 'in_progress').length;
  const completed  = phases.filter(p => p.status === 'completed').length;
  const onHold     = phases.filter(p => p.status === 'on_hold').length;

  const inp = 'w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400';

  return (
    <div className="space-y-5">
      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Total Phases',  value: total,      bg: 'bg-slate-50',   txt: 'text-slate-700',   bdr: 'border-slate-200' },
          { label: 'Not Started',   value: notStarted, bg: 'bg-slate-50',   txt: 'text-slate-600',   bdr: 'border-slate-200' },
          { label: 'In Progress',   value: inProgress, bg: 'bg-blue-50',    txt: 'text-blue-700',    bdr: 'border-blue-200' },
          { label: 'Completed',     value: completed,  bg: 'bg-emerald-50', txt: 'text-emerald-700', bdr: 'border-emerald-200' },
          { label: 'On Hold',       value: onHold,     bg: 'bg-amber-50',   txt: 'text-amber-700',   bdr: 'border-amber-200' },
        ].map(({ label, value, bg, txt, bdr }) => (
          <div key={label} className={`rounded-2xl border p-4 text-center ${bg} ${bdr}`}>
            <p className={`text-2xl font-bold ${txt}`}>{value}</p>
            <p className="text-xs text-slate-500 font-semibold mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Header row */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
          <Layers className="w-5 h-5 text-blue-600" /> Building Phases
        </h2>
        <button
          onClick={() => { setEditing(null); setForm({ ...emptyForm, project_id: projectId || '' }); setShowForm(true); }}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-colors">
          <Plus className="w-4 h-4" /> Add Phase
        </button>
      </div>

      {/* Phases list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1,2,3].map(n => <div key={n} className="h-20 bg-slate-100 rounded-2xl animate-pulse" />)}
        </div>
      ) : phases.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-slate-100">
          <Layers className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-500">No building phases yet</p>
          <p className="text-xs text-slate-400 mt-1">Add phases to track construction progress</p>
        </div>
      ) : (
        <div className="space-y-3">
          {phases.map((ph, idx) => {
            const sm = PHASE_STATUS[ph.status] || PHASE_STATUS.not_started;
            const isPending = completeMut.isPending || startMut.isPending;
            const isOverdue = ph.planned_end && ph.status !== 'completed' && dayjs(ph.planned_end).isBefore(dayjs(), 'day');
            const dueSoon   = ph.planned_end && ph.status !== 'completed' && dayjs(ph.planned_end).diff(dayjs(), 'day') <= 1 && !isOverdue;
            return (
              <div key={ph.id} className={`bg-white rounded-2xl border p-5 flex flex-col md:flex-row md:items-center gap-4 ${isOverdue ? 'border-red-300' : dueSoon ? 'border-amber-300' : 'border-slate-100'}`}>
                {/* Step number */}
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0"
                  style={{ background: `${sm.dot}20`, color: sm.dot }}>
                  {ph.sequence_no || idx + 1}
                </div>

                {/* Phase info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-slate-800">{ph.phase_name}</span>
                    <span className="text-[10px] font-bold text-slate-400 font-mono bg-slate-50 px-1.5 py-0.5 rounded">{ph.phase_code}</span>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${sm.cls}`}>{sm.label}</span>
                    {isOverdue && <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-red-100 text-red-700">⚠ Overdue</span>}
                    {dueSoon   && <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-amber-100 text-amber-700">⏰ Due Tomorrow</span>}
                  </div>
                  {ph.description && <p className="text-xs text-slate-500 mt-1">{ph.description}</p>}
                  <div className="flex flex-wrap gap-3 mt-1.5 text-[11px] text-slate-500">
                    <span>📅 Planned: <strong>{fmtDate(ph.planned_start)}</strong> → <strong>{fmtDate(ph.planned_end)}</strong></span>
                    {(ph.actual_start || ph.actual_end) && (
                      <span>✅ Actual: <strong>{fmtDate(ph.actual_start)}</strong> → <strong>{fmtDate(ph.actual_end)}</strong></span>
                    )}
                    {ph.activity_count > 0 && <span>📋 {ph.activity_count} activities</span>}
                    {ph.project_name && <span>🏗 {ph.project_name}</span>}
                  </div>
                </div>

                {/* Progress bar */}
                <div className="w-full md:w-32 flex-shrink-0">
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{
                      width: ph.status === 'completed' ? '100%' : ph.status === 'in_progress' ? '50%' : ph.status === 'on_hold' ? '30%' : '0%',
                      background: sm.dot,
                    }} />
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1 text-right font-semibold">
                    {ph.status === 'completed' ? '100%' : ph.status === 'in_progress' ? '~50%' : ph.status === 'on_hold' ? '~30%' : '0%'}
                  </p>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                  {ph.status === 'not_started' && (
                    <button onClick={() => startMut.mutate(ph.id)} disabled={isPending}
                      className="flex items-center gap-1 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-semibold border border-blue-200 transition-colors disabled:opacity-50">
                      <CircleDot className="w-3.5 h-3.5" /> Start
                    </button>
                  )}
                  {ph.status !== 'completed' && (
                    <button onClick={() => completeMut.mutate({ id: ph.id, currentStatus: ph.status })} disabled={isPending}
                      className="flex items-center gap-1 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-xs font-semibold border border-emerald-200 transition-colors disabled:opacity-50">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Complete
                    </button>
                  )}
                  {ph.status === 'completed' && (
                    <button onClick={() => completeMut.mutate({ id: ph.id, currentStatus: ph.status })} disabled={isPending}
                      className="flex items-center gap-1 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-lg text-xs font-semibold border border-slate-200 transition-colors disabled:opacity-50">
                      <X className="w-3.5 h-3.5" /> Reopen
                    </button>
                  )}
                  <button onClick={() => openEdit(ph)}
                    className="p-1.5 bg-slate-50 hover:bg-slate-100 text-slate-500 rounded-lg border border-slate-200 transition-colors">
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => { if (window.confirm('Delete this phase?')) deleteMut.mutate(ph.id); }}
                    className="p-1.5 bg-red-50 hover:bg-red-100 text-red-500 rounded-lg border border-red-200 transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <Layers className="w-5 h-5 text-blue-600" />
                {editing ? 'Edit Phase' : 'New Building Phase'}
              </h3>
              <button onClick={() => { setShowForm(false); setEditing(null); setForm(emptyForm); }}
                className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Project *</label>
                <select value={form.project_id} onChange={e => set('project_id', e.target.value)} className={inp}>
                  <option value="">— Select Project —</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Phase Code *</label>
                  <input value={form.phase_code} onChange={e => set('phase_code', e.target.value)} className={inp} placeholder="e.g. P1, CIVIL-01" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Sequence No.</label>
                  <input type="number" min={1} value={form.sequence_no} onChange={e => set('sequence_no', parseInt(e.target.value)||1)} className={inp} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Phase Name *</label>
                <input value={form.phase_name} onChange={e => set('phase_name', e.target.value)} className={inp} placeholder="e.g. Foundation & Substructure" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Description</label>
                <textarea rows={2} value={form.description} onChange={e => set('description', e.target.value)} className={inp} placeholder="Scope of work for this phase…" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Planned Start</label>
                  <input type="date" value={form.planned_start} onChange={e => set('planned_start', e.target.value)} className={inp} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Planned End</label>
                  <input type="date" value={form.planned_end} onChange={e => set('planned_end', e.target.value)} className={inp} />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => { setShowForm(false); setEditing(null); setForm(emptyForm); }}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                  Cancel
                </button>
                <button onClick={handleSave} disabled={createMut.isPending}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors disabled:opacity-60">
                  {createMut.isPending ? 'Saving…' : editing ? 'Update Phase' : 'Create Phase'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'dashboard',      label: 'Dashboard',              icon: LayoutDashboard },
  { id: 'subcontractors', label: 'Subcontractor Master',    icon: Users },
  { id: 'phases',         label: 'Building Phases',         icon: Layers },
  { id: 'work-orders',    label: 'Work Orders',             icon: Briefcase },
  { id: 'advances',       label: 'Advances',                icon: Wallet },
  { id: 'labour',         label: 'Labour Attendance',       icon: HardHat },
  { id: 'measurements',   label: 'Work Progress Entry',     icon: Ruler },
  { id: 'bills',          label: 'Bill Preparation',        icon: Receipt },
  { id: 'approval',       label: 'Bill Approval',           icon: ShieldCheck },
  { id: 'payments',       label: 'Payment Tracking',        icon: CreditCard },
  { id: 'deductions',     label: 'Retention / Deductions',  icon: Calculator },
  { id: 'documents',      label: 'Documents',               icon: FileText },
  { id: 'reports',        label: 'Reports',                 icon: BarChart3 },
  { id: 'settings',       label: 'Settings',                icon: Settings },
];

export default function SubcontractorHubPage({ defaultTab = 'dashboard' }) {
  const [activeTab, setActiveTab] = useState(defaultTab);
  // Initialize filter from global session project (top-bar selector) so it stays in sync
  const [projectFilter, setProjectFilter] = useState(
    () => sessionStorage.getItem('selectedProjectId') || ''
  );

  useEffect(() => {
    setActiveTab(defaultTab);
  }, [defaultTab]);

  // Keep local filter in sync when global project changes (browser storage event)
  useEffect(() => {
    const onStorage = () => {
      const globalProj = sessionStorage.getItem('selectedProjectId') || '';
      setProjectFilter(prev => prev === '' ? globalProj : prev);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const { data: projects = [] } = useQuery({
    queryKey: ['projects-list'],
    queryFn: () => projectAPI.list().then(r => {
      const d = r.data;
      return Array.isArray(d) ? d : (d?.projects ?? d?.data ?? []);
    }),
    staleTime: 5 * 60 * 1000 * 60 * 5,
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors-sub'],
    queryFn: () => vendorAPI.list().then(r => {
      const d = r.data;
      const all = Array.isArray(d) ? d : (d?.vendors ?? d?.data ?? []);
      // Only show Sub-contractors and Labour Contractors — not material suppliers
      return all.filter(v => ['Sub-contractor', 'Labour Contractor'].includes(v.vendor_type));
    }),
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Page Header */}
      <div className="bg-white border-b border-slate-100 px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-medium text-slate-900 flex items-center gap-2">
              <Building2 className="w-6 h-6 text-blue-600" />
              Subcontractor Management
            </h1>
            <p className="text-sm text-slate-900 font-medium mt-0.5">Master, work orders, labour, progress, billing, approvals and payments</p>
          </div>
          {/* Project filter — colored when active to show filtering is on */}
          <div className="flex items-center gap-2">
            {projectFilter && (
              <span className="text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-1 rounded-lg">
                Filtered
              </span>
            )}
            <select
              value={projectFilter}
              onChange={e => setProjectFilter(e.target.value)}
              className={clsx(
                'text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-48 font-medium',
                projectFilter
                  ? 'border-2 border-blue-500 text-blue-700 bg-blue-50'
                  : 'border border-slate-200 text-slate-700'
              )}
            >
              <option value="">— All Projects —</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-5 overflow-x-auto pb-1">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={clsx(
                'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap',
                activeTab === id
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-900 font-medium hover:bg-slate-100 hover:text-slate-700'
              )}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content — key={projectFilter} forces remount on project change, clearing stale cache */}
      <div className="p-6">
        {activeTab === 'dashboard'      && <DashboardTab      key={`dash-${projectFilter}`}    projectId={projectFilter} />}
        {activeTab === 'subcontractors' && <SubcontractorsTab key={`sub-${projectFilter}`} projectId={projectFilter} />}
        {activeTab === 'phases'         && <PhasesTab          key={`ph-${projectFilter}`}     projectId={projectFilter} projects={projects} />}
        {activeTab === 'work-orders'    && <WorkOrdersTab     key={`wo-${projectFilter}`}     projectId={projectFilter} projects={projects} vendors={vendors} />}
        {activeTab === 'advances'       && <AdvancesTab       key={`adv-${projectFilter}`}    projectId={projectFilter} projects={projects} vendors={vendors} />}
        {activeTab === 'labour'         && <LabourAttendanceTab key={`lab-${projectFilter}`}  projectId={projectFilter} projects={projects} vendors={vendors} />}
        {activeTab === 'measurements'   && <MeasurementsTab   key={`meas-${projectFilter}`}   projectId={projectFilter} projects={projects} vendors={vendors} />}
        {activeTab === 'bills'          && <BillsTab          key={`bills-${projectFilter}`}  projectId={projectFilter} vendors={vendors} />}
        {activeTab === 'approval'       && <BillApprovalTab   key={`appr-${projectFilter}`}   projectId={projectFilter} vendors={vendors} />}
        {activeTab === 'payments'       && <PaymentTrackingTab key={`pay-${projectFilter}`}   projectId={projectFilter} vendors={vendors} />}
        {activeTab === 'deductions'     && <DeductionsTab     key={`ded-${projectFilter}`}    projectId={projectFilter} />}
        {activeTab === 'documents'      && <DocumentsTab      vendors={vendors} />}
        {activeTab === 'reports'        && <SubcontractorReportsTab key={`rpt-${projectFilter}`} projectId={projectFilter} />}
        {activeTab === 'settings'       && <SettingsTab />}
      </div>
    </div>
  );
}

function WorkflowInfoTab({ icon: Icon, title, subtitle, cards, validations = [] }) {
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-100 bg-white p-5">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center">
            <Icon className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
            <p className="text-sm text-slate-600 mt-1">{subtitle}</p>
          </div>
        </div>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        {cards.map(([heading, body]) => (
          <div key={heading} className="rounded-2xl border border-slate-100 bg-white p-5">
            <h3 className="text-sm font-semibold text-slate-950">{heading}</h3>
            <p className="text-sm text-slate-600 mt-2 leading-6">{body}</p>
          </div>
        ))}
      </div>
      {validations.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <h3 className="text-sm font-semibold text-amber-900">Required Validations</h3>
          <div className="grid md:grid-cols-2 gap-2 mt-3">
            {validations.map(v => (
              <div key={v} className="flex items-start gap-2 text-sm text-amber-800">
                <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BillApprovalTab({ projectId, vendors }) {
  return (
    <div className="space-y-5">
      <WorkflowInfoTab
        icon={ShieldCheck}
        title="Bill Approval Workflow"
        subtitle="Prepared by site engineer, checked by PM, verified by QS/Billing, approved by Accounts/Management."
        cards={[
          ['Stage Tracking', 'Every bill carries approval status, actor, date and remarks.'],
          ['Reject & Revise', 'Rejected bills require remarks and retain revision history.'],
          ['Approval Control', 'Only approved bills can move to payment tracking.'],
        ]}
        validations={['Work order must be approved before billing.', 'Duplicate bill number is not allowed.', 'Rejected bills should not be payable until revised and approved.']}
      />
      <BillsTab projectId={projectId} vendors={vendors} />
    </div>
  );
}

function LabourAttendanceTab({ projectId, projects, vendors }) {
  const qc = useQueryClient();
  const [showWorker, setShowWorker] = useState(false);
  const [showAttendance, setShowAttendance] = useState(false);
  const [workerForm, setWorkerForm] = useState({ vendor_id: '', project_id: projectId || '', worker_code: '', worker_name: '', skill_type: '', daily_rate: '', mobile: '', status: 'active' });
  const [attendanceForm, setAttendanceForm] = useState({ worker_id: '', vendor_id: '', project_id: projectId || '', wo_id: '', attendance_date: new Date().toISOString().slice(0, 10), attendance_status: 'present', overtime_hours: '', wage_amount: '', remarks: '' });

  useEffect(() => {
    setWorkerForm(f => ({ ...f, project_id: projectId || f.project_id || '' }));
    setAttendanceForm(f => ({ ...f, project_id: projectId || f.project_id || '' }));
  }, [projectId]);

  const { data: workerData, isLoading: workersLoading } = useQuery({
    queryKey: ['sub-workers', projectId],
    queryFn: () => subcontractorAPI.listWorkers({ project_id: projectId || undefined }).then(r => r.data),
  });
  const workers = workerData?.data || [];

  const { data: attendanceData, isLoading: attendanceLoading } = useQuery({
    queryKey: ['sub-labour-attendance', projectId],
    queryFn: () => subcontractorAPI.listLabourAttendance({ project_id: projectId || undefined }).then(r => r.data),
  });
  const attendance = attendanceData?.data || [];

  const { data: woData } = useQuery({
    queryKey: ['sub-wo-list', projectId],
    queryFn: () => subcontractorAPI.listWorkOrders({ project_id: projectId || undefined }).then(r => r.data),
  });
  const workOrders = (woData?.data || []).filter(r => ['active','approved','draft'].includes(r.status?.toLowerCase()));

  const createWorkerMut = useMutation({
    mutationFn: (d) => subcontractorAPI.createWorker(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sub-workers'] });
      setShowWorker(false);
      setWorkerForm({ vendor_id: '', project_id: projectId || '', worker_code: '', worker_name: '', skill_type: '', daily_rate: '', mobile: '', status: 'active' });
    },
  });
  const createAttendanceMut = useMutation({
    mutationFn: (d) => subcontractorAPI.createLabourAttendance(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sub-labour-attendance'] });
      setShowAttendance(false);
      setAttendanceForm({ worker_id: '', vendor_id: '', project_id: projectId || '', wo_id: '', attendance_date: new Date().toISOString().slice(0, 10), attendance_status: 'present', overtime_hours: '', wage_amount: '', remarks: '' });
    },
  });

  const presentCount = attendance.filter(a => a.attendance_status === 'present').length;
  const totalWages = attendance.reduce((sum, a) => sum + Number(a.wage_amount || 0), 0);

  return (
    <div className="space-y-5">
      <div className="grid md:grid-cols-3 gap-4">
        <KpiCard icon={Users} label="Workers" value={workers.length} sub="Subcontract labour master" color="text-blue-700" />
        <KpiCard icon={CheckCircle} label="Attendance Entries" value={attendance.length} sub={`${presentCount} present`} color="text-emerald-700" />
        <KpiCard icon={IndianRupee} label="Wage Amount" value={fmt(totalWages)} sub="From attendance entries" color="text-violet-700" />
      </div>
      <div className="flex flex-wrap gap-3">
        <button onClick={() => setShowWorker(true)} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-xl">
          <Plus className="w-4 h-4" /> Add Worker
        </button>
        <button onClick={() => setShowAttendance(true)} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2 rounded-xl">
          <Plus className="w-4 h-4" /> Mark Attendance
        </button>
      </div>
      <div className="grid xl:grid-cols-2 gap-5">
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 font-semibold text-slate-950">Worker Master</div>
          {workersLoading ? <div className="py-12 flex justify-center"><RefreshCw className="w-5 h-5 animate-spin text-slate-300" /></div> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr><th className="px-4 py-3 text-left">Worker</th><th className="px-4 py-3 text-left">Subcontractor</th><th className="px-4 py-3 text-left">Skill</th><th className="px-4 py-3 text-right">Rate</th><th className="px-4 py-3">Status</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {workers.map(w => (
                    <tr key={w.id}>
                      <td className="px-4 py-3"><div className="font-semibold text-slate-950">{w.worker_name}</div><div className="text-xs text-slate-500">{w.worker_code || w.mobile || '-'}</div></td>
                      <td className="px-4 py-3">{w.vendor_name || '-'}</td>
                      <td className="px-4 py-3">{w.skill_type || '-'}</td>
                      <td className="px-4 py-3 text-right">{fmt(w.daily_rate || 0)}</td>
                      <td className="px-4 py-3 text-center"><StatusBadge status={w.status} /></td>
                    </tr>
                  ))}
                  {!workers.length && <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400">No workers added</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 font-semibold text-slate-950">Attendance Register</div>
          {attendanceLoading ? <div className="py-12 flex justify-center"><RefreshCw className="w-5 h-5 animate-spin text-slate-300" /></div> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr><th className="px-4 py-3 text-left">Date</th><th className="px-4 py-3 text-left">Worker</th><th className="px-4 py-3 text-left">WO</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Wage</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {attendance.map(a => (
                    <tr key={a.id}>
                      <td className="px-4 py-3">{a.attendance_date ? new Date(a.attendance_date).toLocaleDateString('en-IN') : '-'}</td>
                      <td className="px-4 py-3"><div className="font-semibold text-slate-950">{a.worker_name}</div><div className="text-xs text-slate-500">{a.vendor_name}</div></td>
                      <td className="px-4 py-3 font-mono text-xs">{a.wo_number || '-'}</td>
                      <td className="px-4 py-3 text-center"><StatusBadge status={a.attendance_status} /></td>
                      <td className="px-4 py-3 text-right">{fmt(a.wage_amount || 0)}</td>
                    </tr>
                  ))}
                  {!attendance.length && <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400">No attendance marked</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <Modal open={showWorker} onClose={() => setShowWorker(false)} title="Add Subcontractor Worker" width="max-w-xl">
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Subcontractor *"><select className={inputCls} value={workerForm.vendor_id} onChange={e => setWorkerForm(f => ({ ...f, vendor_id: e.target.value }))}><option value="">Select...</option>{vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></FormField>
          <FormField label="Project / Site"><select className={inputCls} value={workerForm.project_id} onChange={e => setWorkerForm(f => ({ ...f, project_id: e.target.value }))}><option value="">No project</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></FormField>
          <FormField label="Worker Name *"><input className={inputCls} value={workerForm.worker_name} onChange={e => setWorkerForm(f => ({ ...f, worker_name: e.target.value }))} /></FormField>
          <FormField label="Worker ID"><input className={inputCls} value={workerForm.worker_code} onChange={e => setWorkerForm(f => ({ ...f, worker_code: e.target.value }))} /></FormField>
          <FormField label="Skill Type"><input className={inputCls} value={workerForm.skill_type} onChange={e => setWorkerForm(f => ({ ...f, skill_type: e.target.value }))} /></FormField>
          <FormField label="Daily Rate"><input type="number" className={inputCls} value={workerForm.daily_rate} onChange={e => setWorkerForm(f => ({ ...f, daily_rate: e.target.value }))} /></FormField>
          <FormField label="Mobile"><input className={inputCls} value={workerForm.mobile} onChange={e => setWorkerForm(f => ({ ...f, mobile: e.target.value }))} /></FormField>
          <FormField label="Status"><select className={inputCls} value={workerForm.status} onChange={e => setWorkerForm(f => ({ ...f, status: e.target.value }))}><option value="active">Active</option><option value="inactive">Inactive</option></select></FormField>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => setShowWorker(false)} className="px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100 rounded-xl">Cancel</button>
          <button disabled={createWorkerMut.isPending || !workerForm.vendor_id || !workerForm.worker_name} onClick={() => createWorkerMut.mutate(workerForm)} className="px-5 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-xl disabled:opacity-60">Save Worker</button>
        </div>
      </Modal>

      <Modal open={showAttendance} onClose={() => setShowAttendance(false)} title="Mark Labour Attendance" width="max-w-xl">
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Worker *"><select className={inputCls} value={attendanceForm.worker_id} onChange={e => {
            const w = workers.find(x => x.id === e.target.value);
            setAttendanceForm(f => ({ ...f, worker_id: e.target.value, vendor_id: w?.vendor_id || '', project_id: w?.project_id || projectId || '', wage_amount: w?.daily_rate || '' }));
          }}><option value="">Select worker...</option>{workers.map(w => <option key={w.id} value={w.id}>{w.worker_name} - {w.vendor_name}</option>)}</select></FormField>
          <FormField label="Date *"><input type="date" className={inputCls} value={attendanceForm.attendance_date} onChange={e => setAttendanceForm(f => ({ ...f, attendance_date: e.target.value }))} /></FormField>
          <FormField label="Work Order"><select className={inputCls} value={attendanceForm.wo_id} onChange={e => setAttendanceForm(f => ({ ...f, wo_id: e.target.value }))}><option value="">No WO link</option>{workOrders.filter(wo => !attendanceForm.vendor_id || wo.vendor_id === attendanceForm.vendor_id).map(wo => <option key={wo.id} value={wo.id}>{wo.wo_number} - {wo.vendor_name}</option>)}</select></FormField>
          <FormField label="Status"><select className={inputCls} value={attendanceForm.attendance_status} onChange={e => setAttendanceForm(f => ({ ...f, attendance_status: e.target.value }))}><option value="present">Present</option><option value="absent">Absent</option><option value="half_day">Half Day</option></select></FormField>
          <FormField label="Overtime Hours"><input type="number" className={inputCls} value={attendanceForm.overtime_hours} onChange={e => setAttendanceForm(f => ({ ...f, overtime_hours: e.target.value }))} /></FormField>
          <FormField label="Wage Amount"><input type="number" className={inputCls} value={attendanceForm.wage_amount} onChange={e => setAttendanceForm(f => ({ ...f, wage_amount: e.target.value }))} /></FormField>
          <div className="col-span-2"><FormField label="Remarks"><textarea rows={2} className={inputCls} value={attendanceForm.remarks} onChange={e => setAttendanceForm(f => ({ ...f, remarks: e.target.value }))} /></FormField></div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => setShowAttendance(false)} className="px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100 rounded-xl">Cancel</button>
          <button disabled={createAttendanceMut.isPending || !attendanceForm.worker_id || !attendanceForm.attendance_date} onClick={() => createAttendanceMut.mutate(attendanceForm)} className="px-5 py-2 text-sm font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl disabled:opacity-60">Save Attendance</button>
        </div>
      </Modal>
    </div>
  );
}

function PaymentTrackingTab({ projectId, vendors }) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState(null);
  const [payForm, setPayForm] = useState({ payment_date: new Date().toISOString().slice(0, 10), payment_mode: 'bank_transfer', payment_ref: '', amount: '' });
  const { data, isLoading } = useQuery({
    queryKey: ['sc-payment-bills', projectId],
    queryFn: () => scAPI.listBills({ project_id: projectId || undefined }).then(r => r.data?.data ?? []),
  });
  const bills   = Array.isArray(data) ? data : [];
  const payable = bills.filter(b => b.status === 'approved');
  const paid    = bills.filter(b => b.status === 'paid');
  const recordMut = useMutation({
    mutationFn: (d) => scAPI.recordPayment(d),
    onSuccess: () => {
      toast.success('Payment recorded');
      qc.invalidateQueries({ queryKey: ['sc-payment-bills'] });
      qc.invalidateQueries({ queryKey: ['sc-bills'] });
      setSelected(null);
    },
    onError: e => toast.error(e?.response?.data?.error || 'Payment failed'),
  });
  return (
    <div className="space-y-5">
      <div className="grid md:grid-cols-3 gap-4">
        <KpiCard icon={Wallet} label="Payable Bills" value={payable.length} sub={fmt(payable.reduce((s, b) => s + Number(b.net_payable || 0), 0))} color="text-blue-700" />
        <KpiCard icon={CheckCircle} label="Paid Bills" value={paid.length} sub={fmt(paid.reduce((s, b) => s + Number(b.net_payable || 0), 0))} color="text-emerald-700" />
        <KpiCard icon={Clock} label="Pending Value" value={fmt(payable.reduce((s, b) => s + Number(b.net_payable || 0), 0))} sub="Awaiting payment entry" color="text-amber-700" />
      </div>
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        {isLoading ? <div className="py-16 flex justify-center"><RefreshCw className="w-6 h-6 text-slate-300 animate-spin" /></div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr><th className="px-4 py-3 text-left">Bill</th><th className="px-4 py-3 text-left">Subcontractor</th><th className="px-4 py-3 text-left">WO</th><th className="px-4 py-3 text-right">Net Payable</th><th className="px-4 py-3 text-left">Payment</th><th className="px-4 py-3 text-center">Status</th><th className="px-4 py-3 text-center">Action</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[...payable, ...paid].map(b => (
                  <tr key={b.id} className={b.status === 'paid' ? 'opacity-60' : ''}>
                    <td className="px-4 py-3 font-mono text-xs">{b.bill_number || '—'}</td>
                    <td className="px-4 py-3 font-semibold text-slate-950">{b.sc_name || b.vendor_name || '—'}</td>
                    <td className="px-4 py-3 font-mono text-xs">{b.wo_number || '—'}</td>
                    <td className="px-4 py-3 text-right font-semibold text-blue-700">{fmt(b.net_payable || 0)}</td>
                    <td className="px-4 py-3 text-xs">{b.payment_date ? `${new Date(b.payment_date).toLocaleDateString('en-IN')} / ${b.payment_ref || '—'}` : '—'}</td>
                    <td className="px-4 py-3 text-center"><StatusBadge status={b.status} /></td>
                    <td className="px-4 py-3 text-center">
                      {b.status === 'approved' && (
                        <button onClick={() => { setSelected(b); setPayForm({ payment_date: new Date().toISOString().slice(0,10), payment_mode: 'bank_transfer', payment_ref: '', amount: String(b.net_payable || '') }); }}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold">Pay</button>
                      )}
                    </td>
                  </tr>
                ))}
                {!payable.length && !paid.length && <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">No approved bills awaiting payment</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <Modal open={!!selected} onClose={() => setSelected(null)} title={`Record Payment — ${selected?.bill_number || ''}`} width="max-w-md">
        <div className="space-y-4">
          <div className="rounded-xl bg-slate-50 p-3 text-sm space-y-1">
            <div className="flex justify-between"><span className="text-slate-500">Subcontractor</span><strong>{selected?.sc_name || selected?.vendor_name}</strong></div>
            <div className="flex justify-between"><span className="text-slate-500">WO No.</span><strong>{selected?.wo_number}</strong></div>
            <div className="flex justify-between"><span className="text-slate-500">Net Payable</span><strong className="text-blue-700">{fmt(selected?.net_payable || 0)}</strong></div>
            {selected?.paid_amount > 0 && <div className="flex justify-between"><span className="text-slate-500">Already Paid</span><strong className="text-emerald-600">{fmt(selected.paid_amount)}</strong></div>}
          </div>
          <FormField label="Amount (₹) *">
            <input type="number" min="0" step="0.01" className={inputCls} value={payForm.amount} onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))} placeholder={String(selected?.net_payable || '')} />
          </FormField>
          <FormField label="Payment Date">
            <input type="date" className={inputCls} value={payForm.payment_date} onChange={e => setPayForm(f => ({ ...f, payment_date: e.target.value }))} />
          </FormField>
          <FormField label="Payment Mode">
            <select className={inputCls} value={payForm.payment_mode} onChange={e => setPayForm(f => ({ ...f, payment_mode: e.target.value }))}>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="neft">NEFT</option>
              <option value="rtgs">RTGS</option>
              <option value="cheque">Cheque</option>
              <option value="cash">Cash</option>
            </select>
          </FormField>
          <FormField label="UTR / Bank Ref / Cheque No. *">
            <input className={inputCls} value={payForm.payment_ref} onChange={e => setPayForm(f => ({ ...f, payment_ref: e.target.value }))} placeholder="UTR number or reference" />
          </FormField>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => setSelected(null)} className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-xl">Cancel</button>
          <button
            disabled={recordMut.isPending || !payForm.payment_date || !payForm.amount}
            onClick={() => recordMut.mutate({ bill_id: selected.id, payment_date: payForm.payment_date, amount: parseFloat(payForm.amount), payment_mode: payForm.payment_mode, reference_no: payForm.payment_ref })}
            className="px-5 py-2 text-sm font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl disabled:opacity-60">
            {recordMut.isPending ? 'Saving…' : 'Record Payment'}
          </button>
        </div>
      </Modal>
    </div>
  );
}

function DeductionsTab({ projectId }) {
  const qc = useQueryClient();
  const [showRelease, setShowRelease] = useState(null);
  const EMPTY_REL = { amount: '', release_date: new Date().toISOString().slice(0, 10), notes: '' };
  const [relForm, setRelForm] = useState(EMPTY_REL);

  const { data, isLoading } = useQuery({
    queryKey: ['sub-deduction-summary', projectId],
    queryFn: () => scAPI.reportSummary({ project_id: projectId || undefined }).then(r => r.data),
  });
  const { data: retData } = useQuery({
    queryKey: ['sub-retention-summary', projectId],
    queryFn: () => scAPI.retentionSummary({ project_id: projectId || undefined }).then(r => r.data),
    staleTime: 0, gcTime: 0, refetchOnMount: 'always',
  });

  const rows    = data?.data || [];
  const retRows = retData?.data || [];

  const total = rows.reduce((acc, r) => ({
    gross:     acc.gross     + Number(r.gross_total || 0),
    tds:       acc.tds       + Number(r.tds_total || 0),
    retention: acc.retention + Number(r.retention_total || 0),
    advance:   acc.advance   + Number(r.advance_recovery_total || 0),
    other:     acc.other     + Number(r.other_deductions_total || 0),
    net:       acc.net       + Number(r.net_payable_total || 0),
  }), { gross: 0, tds: 0, retention: 0, advance: 0, other: 0, net: 0 });

  const totalRetReleased = retRows.reduce((s, r) => s + Number(r.retention_released || 0), 0);
  const totalNetLocked   = retRows.reduce((s, r) => s + Number(r.net_locked || 0), 0);

  const releaseMut = useMutation({
    mutationFn: (d) => scAPI.createRetentionRel(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sub-retention-summary'] });
      setShowRelease(null);
      setRelForm(EMPTY_REL);
    },
  });

  return (
    <div className="space-y-5">
      <div className="grid md:grid-cols-4 gap-4">
        <KpiCard icon={Calculator}   label="TDS Deducted"       value={fmt(total.tds)}         color="text-blue-700" />
        <KpiCard icon={Wallet}       label="Retention Held"     value={fmt(total.retention)}   color="text-violet-700" />
        <KpiCard icon={CheckCircle}  label="Retention Released" value={fmt(totalRetReleased)}  color="text-emerald-700" />
        <KpiCard icon={AlertTriangle} label="Net Retention Locked" value={fmt(totalNetLocked)} color="text-amber-700" />
      </div>

      {/* Deduction summary table */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-700">Deduction Summary by Subcontractor</h3>
        </div>
        {isLoading ? <div className="py-16 flex justify-center"><RefreshCw className="w-6 h-6 text-slate-300 animate-spin" /></div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr><th className="px-4 py-3 text-left">Subcontractor</th><th className="px-4 py-3 text-right">Bills</th><th className="px-4 py-3 text-right">Gross</th><th className="px-4 py-3 text-right">TDS</th><th className="px-4 py-3 text-right">Retention</th><th className="px-4 py-3 text-right">Advance</th><th className="px-4 py-3 text-right">Other</th><th className="px-4 py-3 text-right">Net</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map(r => (
                  <tr key={r.vendor_id}>
                    <td className="px-4 py-3 font-semibold text-slate-950">{r.vendor_name}</td>
                    <td className="px-4 py-3 text-right">{r.bill_count}</td>
                    <td className="px-4 py-3 text-right">{fmt(r.gross_total)}</td>
                    <td className="px-4 py-3 text-right">{fmt(r.tds_total)}</td>
                    <td className="px-4 py-3 text-right">{fmt(r.retention_total)}</td>
                    <td className="px-4 py-3 text-right">{fmt(r.advance_recovery_total)}</td>
                    <td className="px-4 py-3 text-right">{fmt(r.other_deductions_total)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-700">{fmt(r.net_payable_total)}</td>
                  </tr>
                ))}
                {!rows.length && <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">No deduction data found</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Retention release table */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">Retention Tracking</h3>
          <p className="text-xs text-slate-400">Click Release to disburse locked retention to a subcontractor</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">Subcontractor</th>
                <th className="px-4 py-3 text-right">Retention Held</th>
                <th className="px-4 py-3 text-right">Released</th>
                <th className="px-4 py-3 text-right">Net Locked</th>
                <th className="px-4 py-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {retRows.map(r => (
                <tr key={r.vendor_id}>
                  <td className="px-4 py-3 font-semibold text-slate-950">{r.vendor_name}</td>
                  <td className="px-4 py-3 text-right">{fmt(r.retention_held)}</td>
                  <td className="px-4 py-3 text-right text-emerald-600 font-medium">{fmt(r.retention_released)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-amber-600">{fmt(r.net_locked)}</td>
                  <td className="px-4 py-3 text-center">
                    {parseFloat(r.net_locked || 0) > 0 && (
                      <button
                        onClick={() => { setShowRelease(r); setRelForm(EMPTY_REL); }}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-violet-50 text-violet-700 hover:bg-violet-100 border border-violet-200"
                      >
                        Release
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!retRows.length && <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400">No retention data found</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Release Retention Modal */}
      <Modal open={!!showRelease} onClose={() => setShowRelease(null)} title="Release Retention" width="max-w-sm">
        {showRelease && (
          <div className="space-y-4">
            <div className="rounded-xl bg-slate-50 p-3 text-sm space-y-1">
              <div className="flex justify-between"><span className="text-slate-500">Subcontractor</span><strong>{showRelease.vendor_name}</strong></div>
              <div className="flex justify-between"><span className="text-slate-500">Total Held</span><strong>{fmt(showRelease.retention_held)}</strong></div>
              <div className="flex justify-between"><span className="text-slate-500">Already Released</span><strong className="text-emerald-600">{fmt(showRelease.retention_released)}</strong></div>
              <div className="flex justify-between border-t border-slate-200 pt-1 mt-1"><span className="text-slate-500">Locked Balance</span><strong className="text-amber-600">{fmt(showRelease.net_locked)}</strong></div>
            </div>
            <FormField label="Release Amount (₹) *">
              <input type="number" value={relForm.amount} onChange={e => setRelForm(f => ({ ...f, amount: e.target.value }))} className={inputCls} placeholder="0.00" min="0" max={showRelease.net_locked} />
            </FormField>
            <FormField label="Release Date">
              <input type="date" value={relForm.release_date} onChange={e => setRelForm(f => ({ ...f, release_date: e.target.value }))} className={inputCls} />
            </FormField>
            <FormField label="Notes">
              <textarea rows={2} value={relForm.notes} onChange={e => setRelForm(f => ({ ...f, notes: e.target.value }))} className={inputCls} placeholder="DLP completed / Final account settled…" />
            </FormField>
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => setShowRelease(null)} className="px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100 rounded-xl">Cancel</button>
              <button
                disabled={releaseMut.isPending || !relForm.amount || isNaN(relForm.amount)}
                onClick={() => releaseMut.mutate({
                  vendor_id:    showRelease.vendor_id,
                  project_id:   projectId,
                  amount:       parseFloat(relForm.amount),
                  release_date: relForm.release_date,
                  notes:        relForm.notes,
                })}
                className="px-5 py-2 text-sm font-medium bg-violet-600 hover:bg-violet-700 text-white rounded-xl disabled:opacity-60"
              >
                {releaseMut.isPending ? 'Saving…' : 'Confirm Release'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function SubcontractorReportsTab({ projectId }) {
  const [view, setView] = useState('ledger');
  const { data: ledger } = useQuery({
    queryKey: ['sub-report-ledger', projectId],
    queryFn: () => subcontractorAPI.reportLedger({ project_id: projectId || undefined }).then(r => r.data),
    retry: 1,
  });
  const { data: deduction } = useQuery({
    queryKey: ['sub-report-deductions', projectId],
    queryFn: () => scAPI.reportSummary({ project_id: projectId || undefined }).then(r => r.data),
    retry: 1,
  });
  const { data: utilization } = useQuery({
    queryKey: ['sub-report-wo-utilization', projectId],
    queryFn: () => subcontractorAPI.reportWOUtilization({ project_id: projectId || undefined }).then(r => r.data),
    retry: 1,
  });
  const { data: labour } = useQuery({
    queryKey: ['sub-report-labour', projectId],
    queryFn: () => subcontractorAPI.listLabourAttendance({ project_id: projectId || undefined }).then(r => r.data),
    retry: 1,
  });
  const allLedgerRows = ledger?.rows || ledger?.data || [];
  const reportTabs = [
    { id: 'ledger', label: 'Account Ledger', count: allLedgerRows.length },
    { id: 'wo', label: 'WO Balance', count: (utilization?.data || []).length },
    { id: 'deductions', label: 'Deductions', count: (deduction?.data || []).length },
    { id: 'labour', label: 'Labour Attendance', count: (labour?.data || []).length },
  ];
  const rows = allLedgerRows;
  const woRows = utilization?.data || [];
  const deductionRows = deduction?.data || [];
  const labourRows = labour?.data || [];
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {reportTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setView(tab.id)}
            className={clsx(
              'px-4 py-2 rounded-xl text-sm font-semibold border',
              view === tab.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-200 hover:border-blue-300'
            )}
          >
            {tab.label} <span className={clsx('ml-1 text-xs', view === tab.id ? 'text-blue-100' : 'text-slate-400')}>{tab.count}</span>
          </button>
        ))}
      </div>
      {view === 'ledger' && <div className="rounded-2xl border border-slate-100 bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-950">Account Statement Ledger</h3>
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-blue-100 border border-blue-300 inline-block" />Bill</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber-100 border border-amber-300 inline-block" />Advance</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-left">Subcontractor</th>
                <th className="px-4 py-3 text-left">Reference</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3 text-right">Net / Debit</th>
                <th className="px-4 py-3 text-left">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r, i) => {
                const isAdvance = r.entry_type === 'advance';
                return (
                  <tr key={r.id || i} className={isAdvance ? 'bg-amber-50/40' : ''}>
                    <td className="px-4 py-3 text-slate-600">{r.bill_date || r.created_at?.slice(0, 10) || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={clsx(
                        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold',
                        isAdvance ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                      )}>
                        {isAdvance ? 'Advance' : 'Bill'}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-950">{r.vendor_name || r.subcontractor_name || '-'}</td>
                    <td className="px-4 py-3 font-mono text-xs">{isAdvance ? (r.payment_ref || r.advance_type || '-') : (r.bill_no || r.bill_number || '-')}</td>
                    <td className="px-4 py-3 text-right">
                      {isAdvance
                        ? <span className="text-amber-700 font-medium">{fmt(r.advance_amount || r.amount)}</span>
                        : fmt(r.bill_amount || r.gross_amount)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">
                      {isAdvance
                        ? <span className="text-amber-700">{fmt(r.advance_amount || r.amount)}</span>
                        : <span className="text-emerald-700">{fmt(r.net_payable)}</span>}
                    </td>
                    <td className="px-4 py-3">{isAdvance ? <StatusBadge status={r.recovery_status || 'pending'} /> : <StatusBadge status={r.status} />}</td>
                  </tr>
                );
              })}
              {!rows.length && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">No ledger data found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>}
      {view === 'wo' && <div className="rounded-2xl border border-slate-100 bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-950">Work Order Balance / Utilization</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr><th className="px-4 py-3 text-left">WO</th><th className="px-4 py-3 text-left">Subcontractor</th><th className="px-4 py-3 text-left">Project</th><th className="px-4 py-3 text-right">Contract</th><th className="px-4 py-3 text-right">Billed</th><th className="px-4 py-3 text-right">Paid</th><th className="px-4 py-3 text-right">Balance</th><th className="px-4 py-3 text-right">Utilization</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {woRows.map(r => (
                <tr key={r.id}>
                  <td className="px-4 py-3 font-mono text-xs">{r.wo_number}</td>
                  <td className="px-4 py-3 font-semibold text-slate-950">{r.vendor_name}</td>
                  <td className="px-4 py-3">{r.project_name}</td>
                  <td className="px-4 py-3 text-right">{fmt(r.contract_value)}</td>
                  <td className="px-4 py-3 text-right">{fmt(r.billed_amount)}</td>
                  <td className="px-4 py-3 text-right">{fmt(r.paid_amount)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-blue-700">{fmt(Number(r.contract_value || 0) - Number(r.billed_amount || 0))}</td>
                  <td className="px-4 py-3 text-right">{r.utilization_pct || 0}%</td>
                </tr>
              ))}
              {!woRows.length && <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">No work order report data</td></tr>}
            </tbody>
          </table>
        </div>
      </div>}
      {view === 'deductions' && <div className="rounded-2xl border border-slate-100 bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-950">Retention / Advance / Deduction Report</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr><th className="px-4 py-3 text-left">Subcontractor</th><th className="px-4 py-3 text-right">Bills</th><th className="px-4 py-3 text-right">TDS</th><th className="px-4 py-3 text-right">Retention</th><th className="px-4 py-3 text-right">Security</th><th className="px-4 py-3 text-right">Advance</th><th className="px-4 py-3 text-right">Other</th><th className="px-4 py-3 text-right">Net</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {deductionRows.map(r => (
                <tr key={r.vendor_id}>
                  <td className="px-4 py-3 font-semibold text-slate-950">{r.vendor_name}</td>
                  <td className="px-4 py-3 text-right">{r.bill_count}</td>
                  <td className="px-4 py-3 text-right">{fmt(r.tds_total)}</td>
                  <td className="px-4 py-3 text-right">{fmt(r.retention_total)}</td>
                  <td className="px-4 py-3 text-right">{fmt(r.security_total)}</td>
                  <td className="px-4 py-3 text-right">{fmt(r.advance_recovery_total)}</td>
                  <td className="px-4 py-3 text-right">{fmt(r.other_deductions_total)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-emerald-700">{fmt(r.net_payable_total)}</td>
                </tr>
              ))}
              {!deductionRows.length && <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">No deduction report data</td></tr>}
            </tbody>
          </table>
        </div>
      </div>}
      {view === 'labour' && <div className="rounded-2xl border border-slate-100 bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-950">Labour Attendance Report</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr><th className="px-4 py-3 text-left">Date</th><th className="px-4 py-3 text-left">Worker</th><th className="px-4 py-3 text-left">Subcontractor</th><th className="px-4 py-3 text-left">Project</th><th className="px-4 py-3 text-left">WO</th><th className="px-4 py-3 text-center">Status</th><th className="px-4 py-3 text-right">OT</th><th className="px-4 py-3 text-right">Wage</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {labourRows.map(r => (
                <tr key={r.id}>
                  <td className="px-4 py-3">{r.attendance_date ? new Date(r.attendance_date).toLocaleDateString('en-IN') : '-'}</td>
                  <td className="px-4 py-3 font-semibold text-slate-950">{r.worker_name}</td>
                  <td className="px-4 py-3">{r.vendor_name}</td>
                  <td className="px-4 py-3">{r.project_name || '-'}</td>
                  <td className="px-4 py-3 font-mono text-xs">{r.wo_number || '-'}</td>
                  <td className="px-4 py-3 text-center"><StatusBadge status={r.attendance_status} /></td>
                  <td className="px-4 py-3 text-right">{r.overtime_hours || 0}</td>
                  <td className="px-4 py-3 text-right">{fmt(r.wage_amount || 0)}</td>
                </tr>
              ))}
              {!labourRows.length && <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">No labour attendance data</td></tr>}
            </tbody>
          </table>
        </div>
      </div>}
    </div>
  );
}

function SettingsTab() {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    default_gst_pct: 18,
    default_tds_pct: 1,
    default_retention_pct: 5,
    default_security_pct: 0,
    require_approved_wo: true,
    block_overbilling: true,
    approval_flow: ['site_engineer', 'project_manager', 'qs_billing', 'accounts_management'],
  });
  const { data, isLoading } = useQuery({
    queryKey: ['sub-settings'],
    queryFn: () => subcontractorAPI.getSettings().then(r => r.data?.data),
  });
  useEffect(() => {
    if (data) {
      setForm({
        default_gst_pct: data.default_gst_pct ?? 18,
        default_tds_pct: data.default_tds_pct ?? 1,
        default_retention_pct: data.default_retention_pct ?? 5,
        default_security_pct: data.default_security_pct ?? 0,
        require_approved_wo: data.require_approved_wo !== false,
        block_overbilling: data.block_overbilling !== false,
        approval_flow: Array.isArray(data.approval_flow) ? data.approval_flow : ['site_engineer', 'project_manager', 'qs_billing', 'accounts_management'],
      });
    }
  }, [data]);
  const saveMut = useMutation({
    mutationFn: (d) => subcontractorAPI.updateSettings(d),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sub-settings'] }),
  });
  const flowOptions = [
    ['site_engineer', 'Site Engineer'],
    ['project_manager', 'Project Manager'],
    ['qs_billing', 'QS / Billing'],
    ['accounts_management', 'Accounts / Management'],
    ['finance_head', 'Finance Head'],
  ];
  const toggleStage = (stage) => {
    setForm(f => ({
      ...f,
      approval_flow: f.approval_flow.includes(stage)
        ? f.approval_flow.filter(s => s !== stage)
        : [...f.approval_flow, stage],
    }));
  };
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-100 bg-white p-5">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center">
            <Settings className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Subcontractor Settings</h2>
            <p className="text-sm text-slate-600 mt-1">Configure deduction defaults, approval stages and billing controls.</p>
          </div>
        </div>
      </div>
      {isLoading ? (
        <div className="py-16 flex justify-center"><RefreshCw className="w-6 h-6 text-slate-300 animate-spin" /></div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-5">
          <div className="rounded-2xl border border-slate-100 bg-white p-5">
            <h3 className="text-sm font-semibold text-slate-950 mb-4">Deduction Defaults</h3>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="GST %"><input type="number" className={inputCls} value={form.default_gst_pct} onChange={e => setForm(f => ({ ...f, default_gst_pct: e.target.value }))} /></FormField>
              <FormField label="TDS %"><input type="number" className={inputCls} value={form.default_tds_pct} onChange={e => setForm(f => ({ ...f, default_tds_pct: e.target.value }))} /></FormField>
              <FormField label="Retention %"><input type="number" className={inputCls} value={form.default_retention_pct} onChange={e => setForm(f => ({ ...f, default_retention_pct: e.target.value }))} /></FormField>
              <FormField label="Security %"><input type="number" className={inputCls} value={form.default_security_pct} onChange={e => setForm(f => ({ ...f, default_security_pct: e.target.value }))} /></FormField>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-white p-5">
            <h3 className="text-sm font-semibold text-slate-950 mb-4">Billing Controls</h3>
            <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 mb-3">
              <span className="text-sm font-semibold text-slate-800">Require approved WO before billing</span>
              <input type="checkbox" checked={form.require_approved_wo} onChange={e => setForm(f => ({ ...f, require_approved_wo: e.target.checked }))} />
            </label>
            <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
              <span className="text-sm font-semibold text-slate-800">Block bill quantity above WO balance</span>
              <input type="checkbox" checked={form.block_overbilling} onChange={e => setForm(f => ({ ...f, block_overbilling: e.target.checked }))} />
            </label>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-white p-5 lg:col-span-2">
            <h3 className="text-sm font-semibold text-slate-950 mb-4">Approval Flow</h3>
            <div className="flex flex-wrap gap-2">
              {flowOptions.map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleStage(key)}
                  className={clsx(
                    'px-4 py-2 rounded-xl text-sm font-semibold border',
                    form.approval_flow.includes(key)
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-slate-700 border-slate-200'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      <div className="flex justify-end">
        <button
          disabled={saveMut.isPending}
          onClick={() => saveMut.mutate(form)}
          className="px-5 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-xl disabled:opacity-60"
        >
          {saveMut.isPending ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// TAB: Subcontractors master grid
// ═════════════════════════════════════════════════════════════════════════════
const STATUS_PILL = {
  active:       'bg-emerald-100 text-emerald-700',
  inactive:     'bg-slate-100 text-slate-600',
  blacklisted:  'bg-red-100 text-red-700',
};
const HEALTH_PILL = {
  ok:            'bg-emerald-50 text-emerald-700 border-emerald-200',
  expiring_soon: 'bg-amber-50 text-amber-700 border-amber-200',
  expired:       'bg-red-50 text-red-700 border-red-200',
};

function SubcontractorsTab({ projectId }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [tradeFilter, setTradeFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const emptyForm = {
    name: '', vendor_type: 'Sub-contractor', contact_person: '', phone: '', email: '',
    gstin: '', pan: '', address: '', city: '', state: '', pincode: '',
    bank_name: '', account_number: '', ifsc_code: '', bank_branch: '',
    trade_category: '', contract_start_date: '', contract_end_date: '',
    subcontractor_status: 'active', notes: '',
  };
  const [form, setForm] = useState(emptyForm);

  // Fetch ALL subcontractors (company-wide) — client-side project filtering below
  const { data, isLoading } = useQuery({
    queryKey: ['sub-list-all', statusFilter, tradeFilter],
    queryFn: () => subcontractorAPI.listSubcontractors({
      status: statusFilter || undefined,
      trade_category: tradeFilter || undefined,
    }).then(r => r.data),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
  });

  // Fetch work orders for selected project to know which vendors are active here
  const { data: projectWOs } = useQuery({
    queryKey: ['sub-wo-for-filter', projectId],
    queryFn: () => projectId
      ? subcontractorAPI.listWorkOrders({ project_id: projectId }).then(r => {
          const arr = r.data?.data || r.data?.work_orders || (Array.isArray(r.data) ? r.data : []);
          return new Set(arr.map(wo => wo.vendor_id).filter(Boolean));
        })
      : Promise.resolve(null), // null = no filter
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
  });

  const rows = useMemo(() => {
    let list = data?.data || [];

    // Client-side project filter: only show vendors with WOs in selected project
    // projectWOs = Set of vendor_ids with WOs in the project, or null = show all
    if (projectId && projectWOs instanceof Set && projectWOs.size >= 0) {
      list = list.filter(v => projectWOs.has(v.id));
    }

    if (!search) return list;
    const q = search.toLowerCase();
    return list.filter(v =>
      v.name?.toLowerCase().includes(q) ||
      v.contact_person?.toLowerCase().includes(q) ||
      v.trade_category?.toLowerCase().includes(q) ||
      v.gstin?.toLowerCase().includes(q)
    );
  }, [data, projectWOs, projectId, search]);

  const allTrades = useMemo(() => {
    const set = new Set();
    (data?.data || []).forEach(v => v.trade_category && set.add(v.trade_category));
    return [...set].sort();
  }, [data]);

  const createMut = useMutation({
    mutationFn: (payload) => vendorAPI.create(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sub-list'] });
      qc.invalidateQueries({ queryKey: ['vendors-sub'] });
      setShowCreate(false);
      setForm(emptyForm);
    },
  });

  const canSave = form.name.trim() && ['Sub-contractor', 'Labour Contractor'].includes(form.vendor_type);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search subcontractors…"
            className="pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-200 w-full focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="blacklisted">Blacklisted</option>
        </select>
        <select value={tradeFilter} onChange={e => setTradeFilter(e.target.value)}
          className="text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">All Trades</option>
          {allTrades.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-xl">
          <Plus className="w-4 h-4" /> Add Subcontractor
        </button>
        <div className="text-xs text-slate-500 font-semibold ml-auto flex items-center gap-2">
          {projectId && (
            <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg font-semibold">
              Project filtered
            </span>
          )}
          {rows.length} subcontractor{rows.length !== 1 ? 's' : ''}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        {isLoading ? (
          <div className="py-16 flex justify-center"><RefreshCw className="w-6 h-6 text-slate-300 animate-spin" /></div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-500">
            {projectId
              ? 'No subcontractors have work orders in this project.'
              : 'No subcontractors found. Add one via the Vendors page with type "Sub-contractor" or "Labour Contractor".'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wide">
                  <th className="px-5 py-3 text-left">Subcontractor</th>
                  <th className="px-4 py-3 text-left">Trade</th>
                  <th className="px-4 py-3 text-left">Contract</th>
                  <th className="px-4 py-3 text-right">WOs</th>
                  <th className="px-4 py-3 text-right">Contract Value</th>
                  <th className="px-4 py-3 text-right">Billed</th>
                  <th className="px-4 py-3 text-right">Paid</th>
                  <th className="px-4 py-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {rows.map(v => {
                  const endDate = v.contract_end_date ? new Date(v.contract_end_date).toLocaleDateString('en-IN') : null;
                  return (
                    <tr key={v.id} className="hover:bg-slate-50">
                      <td className="px-5 py-3">
                        <div className="font-semibold text-slate-800">{v.name}</div>
                        <div className="text-[11px] text-slate-500">
                          {v.contact_person || '—'} {v.phone && `· ${v.phone}`}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{v.trade_category || <span className="text-slate-300">—</span>}</td>
                      <td className="px-4 py-3">
                        {endDate ? (
                          <span className={clsx('inline-block px-2 py-0.5 rounded-md border text-[11px] font-semibold', HEALTH_PILL[v.contract_health] || HEALTH_PILL.ok)}>
                            {v.contract_health === 'expired' ? `Expired ${endDate}` :
                             v.contract_health === 'expiring_soon' ? `Expires ${endDate}` :
                             `Until ${endDate}`}
                          </span>
                        ) : <span className="text-slate-300 text-xs">No end date</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-700">{v.wo_count}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{fmt(v.contract_value)}</td>
                      <td className="px-4 py-3 text-right text-violet-700 font-semibold">{fmt(v.billed_amount)}</td>
                      <td className="px-4 py-3 text-right text-emerald-700 font-semibold">{fmt(v.paid_amount)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={clsx('inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize',
                          STATUS_PILL[v.subcontractor_status] || STATUS_PILL.active)}>
                          {v.subcontractor_status || 'active'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Add Subcontractor" width="max-w-3xl">
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Name / Company Name *">
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inputCls} />
          </FormField>
          <FormField label="Type *">
            <select value={form.vendor_type} onChange={e => setForm(f => ({ ...f, vendor_type: e.target.value }))} className={inputCls}>
              <option value="Sub-contractor">Sub-contractor</option>
              <option value="Labour Contractor">Labour Contractor</option>
            </select>
          </FormField>
          <FormField label="Contact Person">
            <input value={form.contact_person} onChange={e => setForm(f => ({ ...f, contact_person: e.target.value }))} className={inputCls} />
          </FormField>
          <FormField label="Mobile Number">
            <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className={inputCls} />
          </FormField>
          <FormField label="Email">
            <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className={inputCls} />
          </FormField>
          <FormField label="Trade / Work Type">
            <input value={form.trade_category} onChange={e => setForm(f => ({ ...f, trade_category: e.target.value }))} className={inputCls} placeholder="Civil, Plumbing, Electrical..." />
          </FormField>
          <FormField label="GST Number">
            <input value={form.gstin} onChange={e => setForm(f => ({ ...f, gstin: e.target.value.toUpperCase() }))} className={inputCls} />
          </FormField>
          <FormField label="PAN Number">
            <input value={form.pan} onChange={e => setForm(f => ({ ...f, pan: e.target.value.toUpperCase() }))} className={inputCls} />
          </FormField>
          <div className="col-span-2">
            <FormField label="Address">
              <textarea rows={2} value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} className={inputCls} />
            </FormField>
          </div>
          <FormField label="City">
            <input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} className={inputCls} />
          </FormField>
          <FormField label="State">
            <input value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} className={inputCls} />
          </FormField>
          <FormField label="Bank Name">
            <input value={form.bank_name} onChange={e => setForm(f => ({ ...f, bank_name: e.target.value }))} className={inputCls} />
          </FormField>
          <FormField label="Account Number">
            <input value={form.account_number} onChange={e => setForm(f => ({ ...f, account_number: e.target.value }))} className={inputCls} />
          </FormField>
          <FormField label="IFSC Code">
            <input value={form.ifsc_code} onChange={e => setForm(f => ({ ...f, ifsc_code: e.target.value.toUpperCase() }))} className={inputCls} />
          </FormField>
          <FormField label="Bank Branch">
            <input value={form.bank_branch} onChange={e => setForm(f => ({ ...f, bank_branch: e.target.value }))} className={inputCls} />
          </FormField>
          <FormField label="Contract Start Date">
            <input type="date" value={form.contract_start_date} onChange={e => setForm(f => ({ ...f, contract_start_date: e.target.value }))} className={inputCls} />
          </FormField>
          <FormField label="Contract End Date">
            <input type="date" value={form.contract_end_date} onChange={e => setForm(f => ({ ...f, contract_end_date: e.target.value }))} className={inputCls} />
          </FormField>
          <FormField label="Status">
            <select value={form.subcontractor_status} onChange={e => setForm(f => ({ ...f, subcontractor_status: e.target.value }))} className={inputCls}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="blacklisted">Blacklisted</option>
            </select>
          </FormField>
          <FormField label="Pincode">
            <input value={form.pincode} onChange={e => setForm(f => ({ ...f, pincode: e.target.value }))} className={inputCls} />
          </FormField>
          <div className="col-span-2">
            <FormField label="Remarks / Notes">
              <textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className={inputCls} />
            </FormField>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100 rounded-xl">Cancel</button>
          <button
            disabled={createMut.isPending || !canSave}
            onClick={() => createMut.mutate(form)}
            className="px-5 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-xl disabled:opacity-60"
          >
            {createMut.isPending ? 'Saving...' : 'Save Subcontractor'}
          </button>
        </div>
      </Modal>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// TAB: Documents — per-vendor upload/list/delete with expiry badges
// ═════════════════════════════════════════════════════════════════════════════
const DOC_TYPES = [
  { key: 'agreement',       label: 'Agreement / Contract' },
  { key: 'insurance',       label: 'Insurance Policy' },
  { key: 'gst_cert',        label: 'GST Certificate' },
  { key: 'pf_cert',         label: 'PF / ESIC Registration' },
  { key: 'safety_cert',     label: 'Safety Certification' },
  { key: 'work_completion', label: 'Work Completion Certificate' },
  { key: 'other',           label: 'Other' },
];

const EXPIRY_PILL = {
  valid:         'bg-emerald-100 text-emerald-700',
  expiring_soon: 'bg-amber-100 text-amber-700',
  expired:       'bg-red-100 text-red-700',
  no_expiry:     'bg-slate-100 text-slate-600',
};

function DocumentsTab() {
  const qc = useQueryClient();
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadForm, setUploadForm] = useState({ doc_type: 'agreement', title: '', issued_date: '', expiry_date: '', notes: '', file_url: '', file_name: '', file_size: 0 });
  const [uploading, setUploading] = useState(false);

  const { data: subData } = useQuery({
    queryKey: ['sub-list-docs'],
    queryFn: () => subcontractorAPI.listSubcontractors().then(r => r.data),
  });
  const subcontractors = subData?.data || [];

  const { data: docsData, isLoading } = useQuery({
    queryKey: ['sub-docs', selectedVendor?.id],
    queryFn: () => subcontractorAPI.listDocuments(selectedVendor.id).then(r => r.data),
    enabled: !!selectedVendor,
  });
  const docs = docsData?.data || [];

  const uploadMut = useMutation({
    mutationFn: (d) => subcontractorAPI.uploadDocument(selectedVendor.id, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sub-docs', selectedVendor.id] });
      qc.invalidateQueries({ queryKey: ['sub-expiring-30'] });
      setShowUpload(false);
      setUploadForm({ doc_type: 'agreement', title: '', issued_date: '', expiry_date: '', notes: '', file_url: '', file_name: '', file_size: 0 });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (docId) => subcontractorAPI.deleteDocument(selectedVendor.id, docId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sub-docs', selectedVendor.id] });
      qc.invalidateQueries({ queryKey: ['sub-expiring-30'] });
    },
  });

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const res = await uploadAPI.uploadSingle(file);
      setUploadForm(f => ({ ...f, file_url: res.data.url, file_name: file.name, file_size: file.size }));
    } catch (err) {
      alert('Upload failed: ' + (err?.response?.data?.error || err.message));
    } finally {
      setUploading(false);
    }
  }

  // Vendor list view
  if (!selectedVendor) {
    return (
      <div className="space-y-4">
        <div className="text-sm text-slate-600">
          Select a subcontractor to manage their documents:
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {subcontractors.length === 0 ? (
            <div className="col-span-full py-16 text-center text-sm text-slate-500">
              No subcontractors found.
            </div>
          ) : subcontractors.map(v => (
            <button key={v.id} onClick={() => setSelectedVendor(v)}
              className="text-left p-4 bg-white border border-slate-200 rounded-xl hover:border-blue-400 hover:shadow-md transition-all">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold text-slate-800 truncate">{v.name}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{v.trade_category || '—'}</div>
                </div>
                <span className={clsx('text-[10px] font-bold uppercase px-2 py-0.5 rounded-full flex-shrink-0',
                  STATUS_PILL[v.subcontractor_status] || STATUS_PILL.active)}>
                  {v.subcontractor_status || 'active'}
                </span>
              </div>
              {v.contract_end_date && (
                <div className="mt-2 text-[11px] text-slate-600">
                  Contract ends {new Date(v.contract_end_date).toLocaleDateString('en-IN')}
                </div>
              )}
              <div className="mt-3 text-xs text-blue-600 font-semibold flex items-center gap-1">
                <FileText className="w-3 h-3" /> Manage Documents
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Documents for selected vendor
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => setSelectedVendor(null)}
            className="text-sm font-semibold text-slate-600 hover:text-slate-900">← Back</button>
          <div>
            <h2 className="text-lg font-bold text-slate-800">{selectedVendor.name}</h2>
            <p className="text-xs text-slate-500">{selectedVendor.trade_category || '—'} · {docs.length} document{docs.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <button onClick={() => setShowUpload(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-xl">
          <Plus className="w-4 h-4" /> Upload Document
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        {isLoading ? (
          <div className="py-16 flex justify-center"><RefreshCw className="w-6 h-6 text-slate-300 animate-spin" /></div>
        ) : docs.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-500">No documents yet — click "Upload Document" to add one.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wide">
                  <th className="px-5 py-3 text-left">Document</th>
                  <th className="px-4 py-3 text-left">Type</th>
                  <th className="px-4 py-3 text-left">Issued</th>
                  <th className="px-4 py-3 text-left">Expires</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {docs.map(d => {
                  const typeLabel = DOC_TYPES.find(t => t.key === d.doc_type)?.label || d.doc_type;
                  return (
                    <tr key={d.id} className="hover:bg-slate-50">
                      <td className="px-5 py-3">
                        <a href={d.file_url} target="_blank" rel="noreferrer"
                          className="font-semibold text-blue-600 hover:underline">
                          {d.title || d.file_name || 'Untitled'}
                        </a>
                        {d.notes && <div className="text-[11px] text-slate-500 mt-0.5">{d.notes}</div>}
                      </td>
                      <td className="px-4 py-3 text-slate-700 text-xs">{typeLabel}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs">
                        {d.issued_date ? new Date(d.issued_date).toLocaleDateString('en-IN') : '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">
                        {d.expiry_date ? new Date(d.expiry_date).toLocaleDateString('en-IN') : '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={clsx('inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize',
                          EXPIRY_PILL[d.expiry_status] || EXPIRY_PILL.no_expiry)}>
                          {d.expiry_status === 'no_expiry' ? 'No Expiry' :
                           d.expiry_status === 'expiring_soon' ? 'Expiring Soon' :
                           d.expiry_status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => { if (window.confirm(`Delete "${d.title || d.file_name}"?`)) deleteMut.mutate(d.id); }}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors" title="Delete">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Upload modal */}
      <Modal open={showUpload} onClose={() => setShowUpload(false)} title="Upload Document" width="max-w-lg">
        <div className="space-y-4">
          <FormField label="Document Type *">
            <select value={uploadForm.doc_type} onChange={e => setUploadForm(f => ({ ...f, doc_type: e.target.value }))} className={inputCls}>
              {DOC_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </FormField>
          <FormField label="Title">
            <input value={uploadForm.title} onChange={e => setUploadForm(f => ({ ...f, title: e.target.value }))}
              className={inputCls} placeholder="e.g. Workmen Compensation Policy 2025" />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Issued Date">
              <input type="date" value={uploadForm.issued_date} onChange={e => setUploadForm(f => ({ ...f, issued_date: e.target.value }))} className={inputCls} />
            </FormField>
            <FormField label="Expiry Date">
              <input type="date" value={uploadForm.expiry_date} onChange={e => setUploadForm(f => ({ ...f, expiry_date: e.target.value }))} className={inputCls} />
            </FormField>
          </div>
          <FormField label="Notes">
            <textarea rows={2} value={uploadForm.notes} onChange={e => setUploadForm(f => ({ ...f, notes: e.target.value }))} className={inputCls} placeholder="Optional notes…" />
          </FormField>
          <FormField label="File *">
            <div className="flex items-center gap-2">
              <input type="file" onChange={handleFileChange} disabled={uploading}
                accept="image/*,application/pdf,.docx,.xlsx"
                className="flex-1 text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
              {uploading && <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />}
            </div>
            {uploadForm.file_url && (
              <p className="text-[11px] text-emerald-700 mt-1">✓ {uploadForm.file_name} uploaded</p>
            )}
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setShowUpload(false)}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl">Cancel</button>
            <button
              disabled={!uploadForm.file_url || uploadMut.isPending}
              onClick={() => uploadMut.mutate(uploadForm)}
              className="px-5 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-xl disabled:opacity-50">
              {uploadMut.isPending ? 'Saving…' : 'Save Document'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
