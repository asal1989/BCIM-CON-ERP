// src/pages/stores/GRNPage.jsx  — Unified GRN (Create · View · Verify · Approve · Print)
import RecordAttachments from '../../components/shared/RecordAttachments';
import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  PackageCheck, Plus, X, Search, Download, Printer,
  Truck, CheckCircle2, Clock, AlertTriangle, Package,
  ChevronRight, FileText, Calendar, Hash, TrendingUp,
  ShieldCheck, CheckCheck, RefreshCw, ClipboardList,
  Eye, Building2
} from 'lucide-react';
import { clsx } from 'clsx';
import dayjs from 'dayjs';
import { grnAPI, projectAPI, vendorAPI, poAPI } from '../../api/client';
import toast from 'react-hot-toast';
import { useReactToPrint } from 'react-to-print';
import GRNPrintTemplate from './GRNPrintTemplate';
import { PageHeader, KpiCard as ThemeKpiCard, Theme } from '../../theme';

import { CONSTRUCTION_UNITS as UNITS } from '../../constants/units';

const STATUS_CONFIG = {
  pending:         { label: 'Pending',        short: 'Pending',      color: 'bg-amber-50 text-amber-700 border-amber-200',    dot: 'bg-amber-500',   icon: Clock },
  verified_stores: { label: 'Stores Verified', short: 'Stores OK',   color: 'bg-blue-50 text-blue-700 border-blue-200',       dot: 'bg-blue-500',    icon: ShieldCheck },
  approved:        { label: 'Approved',        short: 'Approved',    color: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500', icon: CheckCircle2 },
  rejected:        { label: 'Rejected',        short: 'Rejected',    color: 'bg-red-50 text-red-700 border-red-200',           dot: 'bg-red-500',     icon: AlertTriangle },
  partial:         { label: 'Partial',         short: 'Partial',     color: 'bg-orange-50 text-orange-700 border-orange-200',  dot: 'bg-orange-500',  icon: AlertTriangle },
};

const inr = n => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const Icon = cfg.icon;
  return (
    <span className={clsx('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border whitespace-nowrap', cfg.color)}>
      <Icon size={11} strokeWidth={2.5} />
      {cfg.short}
    </span>
  );
}

/* ── Workflow stepper ─────────────────────────────────────────── */
const STEPS = [
  { key: 'created',        label: 'GRN Created',       desc: 'Material received at site' },
  { key: 'verified_stores',label: 'Stores Verified',   desc: 'Stores team confirmed quantities' },
  { key: 'approved',       label: 'QC Approved',       desc: 'Quality check done, posted to stock' },
];

function WorkflowStepper({ status }) {
  const active = status === 'approved' ? 2 : status === 'verified_stores' ? 1 : 0;
  return (
    <div className="flex items-center gap-0">
      {STEPS.map((s, i) => (
        <React.Fragment key={s.key}>
          <div className="flex flex-col items-center gap-1 min-w-0">
            <div className={clsx(
              'w-8 h-8 rounded-full flex items-center justify-center border-2 text-xs font-medium transition-all',
              i < active  ? 'bg-emerald-500 border-emerald-500 text-white' :
              i === active ? 'bg-indigo-600 border-indigo-600 text-white' :
                             'bg-white border-slate-300 text-slate-900 font-semibold'
            )}>
              {i < active ? <CheckCircle2 size={14} /> : i + 1}
            </div>
            <div className="text-center">
              <div className={clsx('text-[10px] font-medium leading-tight',
                i <= active ? 'text-white' : 'text-slate-400'
              )}>{s.label}</div>
              <div className="text-[9px] text-slate-400 leading-tight max-w-[80px]">{s.desc}</div>
            </div>
          </div>
          {i < STEPS.length - 1 && (
            <div className={clsx('flex-1 h-0.5 mx-1 mb-5', i < active ? 'bg-emerald-400' : 'bg-slate-200')} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

/* ── Detail / Approval Panel ──────────────────────────────────── */
function GRNDetailPanel({ grn, onClose, onVerify, onApprove, verifyLoading, approveLoading, printRef }) {
  if (!grn) return null;
  const status = grn.quality_status || grn.status || 'pending';
  const items  = grn.items || [];
  const totalValue = items.reduce((s, it) =>
    s + parseFloat(it.quantity_received || 0) * parseFloat(it.rate || 0), 0
  );

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="w-full max-w-2xl bg-white shadow-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="bg-slate-900 px-6 py-4 flex items-start justify-between flex-shrink-0">
          <div>
            <div className="text-[10px] text-slate-400 font-medium uppercase tracking-widest mb-1">Goods Receipt Note</div>
            <h2 className="text-xl font-medium text-white font-mono">{grn.grn_number}</h2>
            <p className="text-sm text-slate-300 font-medium mt-0.5">{grn.project_name}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <StatusBadge status={status} />
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-slate-300 hover:text-white transition"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Workflow stepper */}
        <div className="bg-slate-800 px-6 py-4 flex-shrink-0">
          <WorkflowStepper status={status} />
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-slate-50">

          {/* Meta grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              ['Supplier',      grn.vendor_name || grn.supplier_name || '—'],
              ['GRN Date',      grn.grn_date ? dayjs(grn.grn_date).format('DD MMM YYYY') : '—'],
              ['Challan No.',   grn.challan_number || '—'],
              ['Invoice No.',   grn.invoice_number || '—'],
              ['Vehicle No.',   grn.vehicle_number || '—'],
              ['Gate Pass',     grn.gate_pass_no   || '—'],
              ['Site Location', grn.site_location  || '—'],
              ['WB Slip No.',   grn.wb_slip_no     || '—'],
              ['Received By',   grn.received_by_name || '—'],
            ].map(([lbl, val]) => (
              <div key={lbl} className="bg-white border border-slate-200 rounded-lg px-3 py-2.5">
                <div className="text-[10px] text-slate-900 font-medium uppercase tracking-wider mb-0.5">{lbl}</div>
                <div className="text-sm font-medium text-slate-900 font-medium truncate">{val}</div>
              </div>
            ))}
          </div>

          {/* IGN bracket — only if any of the three fields has content */}
          {(grn.issues_notes || grn.remarks || grn.inspection_notes) && (
            <div className="border-2 border-slate-300 rounded-xl overflow-hidden">
              <div className="bg-slate-800 px-4 py-2 flex items-center gap-3">
                <span className="text-xs font-black text-white uppercase tracking-widest">IGN</span>
                <span className="text-[10px] text-slate-400 font-medium">Issues · General · Inspection Notes</span>
              </div>
              <div className="grid grid-cols-3 divide-x-2 divide-slate-300">
                {[
                  { key: 'issues_notes',     label: 'I — Issues Found',     val: grn.issues_notes,     bg: 'bg-red-50',   text: 'text-red-700',   circle: 'bg-red-100 border-red-300 text-red-600' },
                  { key: 'remarks',          label: 'G — General Remarks',  val: grn.remarks,          bg: 'bg-white',     text: 'text-slate-700', circle: 'bg-slate-100 border-slate-300 text-slate-600' },
                  { key: 'inspection_notes', label: 'N — Inspection Notes', val: grn.inspection_notes, bg: 'bg-blue-50',  text: 'text-blue-700',  circle: 'bg-blue-100 border-blue-300 text-blue-600' },
                ].map(({ key, label, val, bg, text, circle }) => (
                  <div key={key} className={`p-3 ${bg}`}>
                    <div className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1">{label}</div>
                    <div className={`text-xs font-medium ${text} leading-relaxed min-h-[28px]`}>{val || <span className="text-slate-300 italic">—</span>}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Items table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <span className="text-xs font-medium text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <Package size={13} /> Material Items Received
              </span>
              <span className="text-xs font-medium text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">
                {items.length} items
              </span>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100">
                  {['#','Material','Unit','Qty Received','Rate','Amount'].map(h => (
                    <th key={h} className={clsx(
                      'px-3 py-2 text-xs font-medium text-slate-900 font-medium uppercase tracking-wider bg-slate-50',
                      ['Qty Received','Rate','Amount'].includes(h) ? 'text-right' : 'text-left'
                    )}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {items.map((it, i) => {
                  const amount = parseFloat(it.quantity_received || 0) * parseFloat(it.rate || 0);
                  return (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-3 py-2.5 text-slate-900 font-medium font-mono">{i + 1}</td>
                      <td className="px-3 py-2.5 font-medium text-slate-900 font-medium">{it.material_name}</td>
                      <td className="px-3 py-2.5">
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-900 border border-slate-200 font-medium uppercase text-[10px]">{it.unit}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-medium text-emerald-600 font-mono">{it.quantity_received}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-slate-600">
                        {parseFloat(it.rate) > 0 ? `₹${inr(it.rate)}` : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right font-medium text-indigo-600 font-mono">
                        {amount > 0 ? `₹${inr(amount)}` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {totalValue > 0 && (
                <tfoot>
                  <tr className="bg-slate-50 border-t border-slate-200">
                    <td colSpan={5} className="px-3 py-2 text-right text-xs font-medium text-slate-900 font-medium uppercase">Total Value</td>
                    <td className="px-3 py-2 text-right font-medium text-indigo-700 font-mono text-sm">₹{inr(totalValue)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* Approval chain */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200">
              <span className="text-xs font-medium text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <ShieldCheck size={13} /> Approval Chain
              </span>
            </div>
            <div className="p-4 space-y-2">
              {[
                { step: 'GRN Created',     done: true,
                  name: grn.received_by_name, time: grn.grn_date,     icon: PackageCheck },
                { step: 'Stores Verified', done: status === 'verified_stores' || status === 'approved',
                  name: grn.verified_stores_name, time: grn.verified_stores_at, icon: ShieldCheck },
                { step: 'QC Approved',     done: status === 'approved',
                  name: grn.approved_qc_name,  time: grn.approved_qc_at,     icon: CheckCheck },
              ].map((s, i) => {
                const Icon = s.icon;
                return (
                  <div key={i} className={clsx('flex items-center gap-3 px-3 py-2.5 rounded-lg border text-xs transition',
                    s.done ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200 opacity-60'
                  )}>
                    <div className={clsx('w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0',
                      s.done ? 'bg-emerald-500' : 'bg-slate-300'
                    )}>
                      <Icon size={13} className="text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-slate-800">{s.step}</span>
                      {s.name && <span className="text-slate-500 ml-2">by {s.name}</span>}
                      {s.time && <span className="text-slate-400 ml-2">· {dayjs(s.time).format('DD MMM YYYY')}</span>}
                    </div>
                    {s.done && <CheckCircle2 size={14} className="text-emerald-500 flex-shrink-0" />}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Attachments */}
        <div className="px-6 py-3 border-t border-slate-100">
          <RecordAttachments
            module="grn"
            recordId={grn.id}
            projectId={grn.project_id}
            label="GRN Attachments"
            compact
            docTypeOptions={[
              { value: 'vendor_bill', label: 'Invoice' },
              { value: 'challan',     label: 'DC / Challan' },
              { value: 'general',     label: 'Other' },
            ]}
          />
        </div>

        {/* Action footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-white flex-shrink-0 space-y-2">
          {/* Step 1: Pending → Stores Verified */}
          {status === 'pending' && (
            <button
              onClick={onVerify}
              disabled={verifyLoading}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium py-3 rounded-xl text-sm transition shadow-sm"
            >
              <ShieldCheck size={16} />
              {verifyLoading ? 'Processing…' : 'Step 1 — Mark as Stores Verified'}
            </button>
          )}

          {/* Step 2: Stores Verified → QC Approved */}
          {status === 'verified_stores' && (
            <button
              onClick={onApprove}
              disabled={approveLoading}
              className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-medium py-3 rounded-xl text-sm transition shadow-sm"
            >
              <CheckCheck size={16} />
              {approveLoading ? 'Posting to Inventory…' : 'Step 2 — Approve & Post to Stock Ledger'}
            </button>
          )}

          {/* Approved */}
          {status === 'approved' && (
            <div className="flex items-center gap-2 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl px-4 py-3 text-sm font-bold">
              <CheckCircle2 size={16} className="text-emerald-600" />
              Fully Approved — Stock posted to inventory ledger
            </div>
          )}

          {/* Print + Close */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => { /* trigger print from parent */ document.dispatchEvent(new CustomEvent('grn-print')); }}
              className="flex-1 flex items-center justify-center gap-2 border border-slate-200 hover:border-slate-300 text-slate-900 font-medium py-2.5 rounded-xl text-sm transition"
            >
              <Printer size={15} /> Print GRN
            </button>
            <button
              onClick={onClose}
              className="flex-1 py-2.5 text-slate-900 font-medium text-sm font-medium hover:text-slate-900 border border-slate-200 rounded-xl hover:bg-slate-50 transition"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Main Page ────────────────────────────────────────────────── */
export default function GRNPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm]         = useState(false);
  const [selectedId, setSelectedId]     = useState(null);
  const [search, setSearch]             = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [projectFilter, setProjectFilter] = useState('');
  const printRef = useRef(null);

  const handlePrint = useReactToPrint({ contentRef: printRef });
  const printFnRef  = useRef(handlePrint);
  React.useEffect(() => { printFnRef.current = handlePrint; });

  // Listen for print trigger dispatched from inside the detail panel
  React.useEffect(() => {
    const handler = () => printFnRef.current?.();
    document.addEventListener('grn-print', handler);
    return () => document.removeEventListener('grn-print', handler);
  }, []);

  const { data: grnList = [], isLoading, refetch } = useQuery({
    queryKey: ['grn-list', projectFilter],
    queryFn: () => grnAPI.list(projectFilter ? { project_id: projectFilter } : {}).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectAPI.list().then(r => r.data?.data ?? r.data ?? []).catch(() => []),
  });

  const { data: detailedGRN } = useQuery({
    queryKey: ['grn', selectedId],
    queryFn: () => grnAPI.get(selectedId).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    enabled: !!selectedId,
  });

  const verifyMutation = useMutation({
    mutationFn: (id) => grnAPI.approve(id, 'verify-stores'),
    onSuccess: () => {
      toast.success('Stores verification complete');
      qc.invalidateQueries({ queryKey: ['grn-list'] });
      qc.invalidateQueries({ queryKey: ['grn', selectedId] });
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Verification failed'),
  });

  const approveMutation = useMutation({
    mutationFn: (id) => grnAPI.approve(id, 'approve-qc'),
    onSuccess: () => {
      toast.success('GRN approved — stock posted to ledger!');
      qc.invalidateQueries({ queryKey: ['grn-list'] });
      qc.invalidateQueries({ queryKey: ['grn', selectedId] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Approval failed'),
  });

  // Counts
  const counts = {
    pending:         grnList.filter(g => (g.status || g.quality_status) === 'pending').length,
    verified_stores: grnList.filter(g => (g.status || g.quality_status) === 'verified_stores').length,
    approved:        grnList.filter(g => (g.status || g.quality_status) === 'approved').length,
  };

  const filtered = grnList.filter(g => {
    const s = g.status || g.quality_status || 'pending';
    if (statusFilter !== 'all' && s !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!g.grn_number?.toLowerCase().includes(q) &&
          !g.project_name?.toLowerCase().includes(q) &&
          !g.vendor_name?.toLowerCase().includes(q) &&
          !g.supplier_name?.toLowerCase().includes(q) &&
          !g.challan_number?.toLowerCase().includes(q) &&
          !g.invoice_number?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const exportCSV = () => {
    const headers = ['GRN Number','Date','Project','Supplier','Challan No','Status'];
    const rows = filtered.map(g => [
      g.grn_number,
      dayjs(g.grn_date).format('DD/MM/YYYY'),
      g.project_name,
      g.supplier_name || g.vendor_name || '',
      g.challan_number || '',
      g.status || g.quality_status || '',
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `GRN_${dayjs().format('YYYY-MM-DD')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exported');
  };

  const STATUS_FILTERS = [
    { key: 'all',             label: 'All',            count: grnList.length },
    { key: 'pending',         label: 'Pending',        count: counts.pending,         color: 'bg-amber-500' },
    { key: 'verified_stores', label: 'Stores Verified',count: counts.verified_stores, color: 'bg-blue-500' },
    { key: 'approved',        label: 'Approved',       count: counts.approved,        color: 'bg-emerald-500' },
  ];

  return (
    <div style={{ background: Theme.pageBg, minHeight: '100vh' }}>

      <PageHeader
        title="Goods Receipt Notes"
        subtitle="Receive · Verify · Approve · Post to inventory — all in one place"
        breadcrumbs={[{ label: 'Stores' }, { label: 'GRN' }]}
        actions={
          <>
            <button onClick={() => refetch()}
              className="w-9 h-9 flex items-center justify-center rounded-lg transition"
              style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.20)', color: '#fff' }}>
              <RefreshCw size={14} />
            </button>
            <button onClick={exportCSV}
              className="flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg transition"
              style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.20)', color: '#fff' }}>
              <Download size={14} /> Export
            </button>
            <button onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition shadow-sm"
              style={{ background: '#fff', color: Theme.navyDark, border: '1px solid rgba(255,255,255,0.4)' }}>
              <Plus size={14} /> New GRN
            </button>
          </>
        }
      />

      <div className="p-6 md:p-8 max-w-full mx-auto">

      {/* ── KPI Cards ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <ThemeKpiCard icon={FileText}     label="Total GRNs"      value={grnList.length}            color="slate"   />
        <ThemeKpiCard icon={Clock}        label="Pending Review"  value={counts.pending}            color="amber"   />
        <ThemeKpiCard icon={ShieldCheck}  label="Stores Verified" value={counts.verified_stores}    color="blue"    />
        <ThemeKpiCard icon={CheckCircle2} label="Approved"        value={counts.approved}           color="emerald" />
      </div>

      {/* ── Workflow banner (if pending) ─────────────────────────── */}
      {counts.pending > 0 && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3">
          <Clock size={16} className="text-amber-600 flex-shrink-0" />
          <span className="text-sm font-medium text-amber-800">
            {counts.pending} GRN{counts.pending > 1 ? 's' : ''} waiting for stores verification
          </span>
          <button onClick={() => setStatusFilter('pending')} className="ml-auto text-xs font-medium text-amber-700 underline">
            Review now →
          </button>
        </div>
      )}
      {counts.verified_stores > 0 && (
        <div className="mb-4 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-center gap-3">
          <ShieldCheck size={16} className="text-blue-600 flex-shrink-0" />
          <span className="text-sm font-medium text-blue-800">
            {counts.verified_stores} GRN{counts.verified_stores > 1 ? 's' : ''} stores-verified — pending QC approval to post stock
          </span>
          <button onClick={() => setStatusFilter('verified_stores')} className="ml-auto text-xs font-medium text-blue-700 underline">
            Approve now →
          </button>
        </div>
      )}

      {/* ── Filters ─────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 mb-5 flex flex-wrap items-center gap-3 shadow-sm">
        {/* Status pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {STATUS_FILTERS.map(f => (
            <button key={f.key} onClick={() => setStatusFilter(f.key)}
              className={clsx('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
                statusFilter === f.key
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-900 font-medium border-slate-200 hover:border-slate-400'
              )}>
              {f.color && <span className={clsx('w-1.5 h-1.5 rounded-full', f.color)} />}
              {f.label}
              <span className={clsx('px-1.5 py-0.5 rounded text-[10px] font-medium',
                statusFilter === f.key ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
              )}>{f.count}</span>
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Project filter */}
        <select value={projectFilter} onChange={e => setProjectFilter(e.target.value)}
          className="h-9 bg-slate-50 border border-slate-200 rounded-lg px-3 text-sm text-slate-900 outline-none focus:border-indigo-400">
          <option value="">All Projects</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>

        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search GRN, supplier, challan…"
            className="h-9 pl-9 pr-4 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 outline-none focus:border-indigo-400 transition w-56" />
        </div>

        <span className="text-xs text-slate-500">{filtered.length} of {grnList.length}</span>
      </div>

      {/* ── GRN Table ───────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {['GRN Number','Date','Project','Supplier','Challan No.','Invoice No.','Site','Items','Status',''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-900 font-medium uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i}>
                    <td colSpan={9} className="px-4 py-3">
                      <div className="h-5 bg-slate-100 animate-pulse rounded w-full" />
                    </td>
                  </tr>
                ))
              ) : filtered.map(grn => {
                const status = grn.status || grn.quality_status || 'pending';
                return (
                  <tr key={grn.id} onClick={() => setSelectedId(grn.id)}
                    className="cursor-pointer hover:bg-indigo-50/30 transition-colors group">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center flex-shrink-0">
                          <PackageCheck className="w-3.5 h-3.5 text-emerald-600" />
                        </div>
                        <span className="text-xs font-medium font-mono text-indigo-700 group-hover:underline">{grn.grn_number}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-500">
                      {grn.grn_date ? dayjs(grn.grn_date).format('DD MMM YYYY') : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-xs font-medium text-slate-900 font-medium max-w-[140px] truncate">{grn.project_name}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Truck className="w-3 h-3 text-slate-400 shrink-0" />
                        <span className="text-xs text-slate-600 max-w-[130px] truncate">{grn.supplier_name || grn.vendor_name || '—'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-xs font-mono text-slate-900 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded">
                        {grn.challan_number || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {grn.invoice_number ? (
                        <span className="text-xs font-mono text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded flex items-center gap-1">
                          <FileText className="w-3 h-3" />{grn.invoice_number}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-600">{grn.site_location || '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-900 border border-slate-200">
                        {grn.total_quantity || '—'} units
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap"><StatusBadge status={status} /></td>
                    <td className="px-4 py-3 text-right">
                      <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-500 transition-colors" />
                    </td>
                  </tr>
                );
              })}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-16 text-center">
                    <ClipboardList className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                    <p className="text-sm font-medium text-slate-700">No GRNs found</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {statusFilter === 'pending' ? 'All caught up — no pending GRNs.' : 'Adjust filters or create a new GRN.'}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50 text-xs text-slate-500">
          Showing {filtered.length} of {grnList.length} receipt notes
        </div>
      </div>

      {/* ── Detail / Verification Panel ─────────────────────────── */}
      {selectedId && detailedGRN && (
        <GRNDetailPanel
          grn={detailedGRN}
          onClose={() => setSelectedId(null)}
          onVerify={() => verifyMutation.mutate(selectedId)}
          onApprove={() => approveMutation.mutate(selectedId)}
          verifyLoading={verifyMutation.isPending}
          approveLoading={approveMutation.isPending}
        />
      )}

      {/* ── New GRN Form ────────────────────────────────────────── */}
      {showForm && (
        <GRNForm onClose={() => setShowForm(false)} projects={projects} qc={qc} />
      )}

      {/* Hidden print area */}
      <div className="hidden">
        <div ref={printRef}>
          {detailedGRN && <GRNPrintTemplate data={detailedGRN} />}
        </div>
      </div>
      </div>
    </div>
  );
}

/* ── GRN Create Form ─────────────────────────────────────────── */
function GRNForm({ onClose, projects, qc }) {
  const emptyItem = () => ({
    material_name: '', unit: 'Nos', quantity_received: '', rate: '',
    batch_number: '', expiry_date: '', quality_remarks: '',
    use_thumb_rule: false, physical_qty: '', physical_unit: 'Nos', conversion_factor: '',
    po_item_id: null, _po_qty: null,
  });

  const [form, setForm] = useState({
    project_id: '', vendor_id: '', grn_date: dayjs().format('YYYY-MM-DD'),
    po_id: '', po_number: '', vehicle_number: '', driver_name: '',
    challan_number: '', invoice_number: '',
    site_location: '', gate_pass_no: '', wb_slip_no: '',
    issues_notes: '', remarks: '', inspection_notes: '',
  });
  const [items, setItems] = useState([emptyItem()]);
  const [createBill, setCreateBill] = useState(false);
  const [billForm, setBillForm] = useState({
    inv_date: '', tax_mode: 'intrastate', gst_pct: '18',
    transport_charges: '', transport_gst_pct: '18', transport_desc: '',
    other_charges: '', other_charges_desc: '',
  });
  const [itemGstOverrides, setItemGstOverrides] = useState({});

  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors'],
    queryFn: () => vendorAPI.list().then(r => r.data?.data ?? r.data ?? []).catch(() => []),
  });

  // Released (approved) POs for selected project
  const { data: releasedPOs = [], isFetching: posFetching } = useQuery({
    queryKey: ['po-released-grn', form.project_id],
    queryFn: () => poAPI.list({ project_id: form.project_id, status: 'approved' }, { skipProjectInject: true })
      .then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    enabled: !!form.project_id,
  });

  // Full PO detail (with items) when a PO is selected
  const { data: selectedPODetail } = useQuery({
    queryKey: ['po-detail-grn', form.po_id],
    queryFn: () => poAPI.get(form.po_id).then(r => r.data?.data ?? r.data),
    enabled: !!form.po_id,
  });

  // Pre-populate items when PO detail loads
  useEffect(() => {
    if (!selectedPODetail?.items?.length) return;
    setItems(selectedPODetail.items.map(it => ({
      ...emptyItem(),
      material_name: it.material_name || '',
      unit: it.unit || 'Nos',
      rate: it.rate ? String(it.rate) : '',
      po_item_id: it.id || null,
      _po_qty: it.quantity ?? null,
    })));
  }, [selectedPODetail?.id]);

  // Handle PO selection from dropdown
  function handlePOSelect(poId) {
    if (!poId) {
      setForm(p => ({ ...p, po_id: '', po_number: '' }));
      setItems([emptyItem()]);
      return;
    }
    const po = releasedPOs.find(p => p.id === poId);
    setForm(prev => ({
      ...prev,
      po_id: poId,
      po_number: po?.po_number || '',
      vendor_id: po?.vendor_id || prev.vendor_id,
    }));
  }

  const createMutation = useMutation({
    mutationFn: (d) => grnAPI.create(d),
    onSuccess: (response) => {
      const bill = response?.data?.bill;
      const msg = bill
        ? `GRN created · Bill ${bill.sl_number} added to tracker`
        : 'GRN created — pending verification!';
      toast.success(msg);
      qc.invalidateQueries({ queryKey: ['grn-list'] });
      onClose();
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed to create GRN'),
  });

  const setField = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const updateItem = (idx, k, v) => setItems(p => p.map((it, i) => i === idx ? { ...it, [k]: v } : it));
  const addRow    = () => setItems(p => [...p, emptyItem()]);
  const removeRow = (idx) => { if (items.length > 1) setItems(p => p.filter((_, i) => i !== idx)); };

  const convertedQty = (it) =>
    it.use_thumb_rule && it.physical_qty && it.conversion_factor
      ? (parseFloat(it.physical_qty) * parseFloat(it.conversion_factor)).toFixed(3)
      : null;

  const submit = () => {
    if (!form.project_id) return toast.error('Select a project');
    if (!form.grn_date)   return toast.error('GRN date is required');
    const validItems = items.filter(i => i.material_name?.trim() && (i.quantity_received || (i.use_thumb_rule && i.physical_qty)));
    if (!validItems.length) return toast.error('Add at least one item with quantity');
    if (createBill && !billForm.inv_date) return toast.error('Invoice Date is required for Bill entry');

    const payload = {
      ...form,
      vendor_id: form.vendor_id || null,
      po_id:     form.po_id     || null,
      items: validItems.map(it => ({
        material_name:     it.material_name,
        unit:              it.unit,
        quantity_received: it.use_thumb_rule && it.physical_qty && it.conversion_factor
          ? parseFloat(it.physical_qty) * parseFloat(it.conversion_factor)
          : parseFloat(it.quantity_received || 0),
        rate:              it.rate ? parseFloat(it.rate) : 0,
        batch_number:      it.batch_number || null,
        expiry_date:       it.expiry_date   || null,
        quality_remarks:   it.quality_remarks || null,
        physical_qty:      it.use_thumb_rule && it.physical_qty ? parseFloat(it.physical_qty) : null,
        physical_unit:     it.use_thumb_rule ? it.physical_unit : null,
        conversion_factor: it.use_thumb_rule && it.conversion_factor ? parseFloat(it.conversion_factor) : null,
        po_item_id:        it.po_item_id || null,
      })),
    };

    if (createBill) {
      payload.bill = {
        inv_date:            billForm.inv_date,
        tax_mode:            billForm.tax_mode,
        gst_pct:             parseFloat(billForm.gst_pct) || 18,
        item_gst_overrides:  itemGstOverrides,
        transport_charges:   parseFloat(billForm.transport_charges) || 0,
        transport_gst_pct:   parseFloat(billForm.transport_gst_pct) || 18,
        transport_desc:      billForm.transport_desc,
        other_charges:       parseFloat(billForm.other_charges) || 0,
        other_charges_desc:  billForm.other_charges_desc,
      };
    }

    createMutation.mutate(payload);
  };

  const inp = 'w-full h-9 bg-slate-50 border border-slate-200 rounded-lg px-3 text-sm outline-none focus:border-indigo-400 transition-all';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white w-full max-w-5xl rounded-2xl flex flex-col max-h-[94vh] shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="bg-slate-900 px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <PackageCheck size={16} className="text-emerald-400" /> New Goods Receipt Note
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">Record inward material — challan, vehicle, batch & thumb rule</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-slate-300 hover:text-white transition">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* Section 1: Receipt details */}
          <div className="border border-slate-200 rounded-xl p-5">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Receipt Details</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="col-span-2 space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Project *</label>
                <select value={form.project_id} onChange={e => {
                  setField('project_id', e.target.value);
                  // reset PO when project changes
                  setForm(p => ({ ...p, project_id: e.target.value, po_id: '', po_number: '', vendor_id: '' }));
                  setItems([emptyItem()]);
                }} className={inp}>
                  <option value="">Select project…</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">GRN Date *</label>
                <input type="date" value={form.grn_date} onChange={e => setField('grn_date', e.target.value)} className={inp} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Vendor / Supplier</label>
                <select value={form.vendor_id} onChange={e => setField('vendor_id', e.target.value)} className={inp}>
                  <option value="">Select vendor…</option>
                  {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-2">
                  Link to Released PO
                  {posFetching && <span className="text-[10px] font-normal text-slate-400 animate-pulse">loading…</span>}
                  {!posFetching && form.project_id && releasedPOs.length === 0 && (
                    <span className="text-[10px] font-normal text-amber-500">no released POs for this project</span>
                  )}
                </label>
                <select
                  value={form.po_id}
                  onChange={e => handlePOSelect(e.target.value)}
                  className={inp}
                  disabled={!form.project_id || posFetching}
                >
                  <option value="">— Select PO (optional) —</option>
                  {releasedPOs.map(po => (
                    <option key={po.id} value={po.id}>
                      {po.po_number} — {po.vendor_name}
                    </option>
                  ))}
                </select>
                {form.po_id && (
                  <p className="text-[10px] text-emerald-600 font-medium flex items-center gap-1 mt-0.5">
                    <CheckCircle2 size={10} /> PO items pre-loaded — enter actual received quantities below
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Challan Number</label>
                <input type="text" value={form.challan_number} onChange={e => setField('challan_number', e.target.value)}
                  placeholder="e.g. CH-2026-001" className={inp} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Invoice Number</label>
                <input type="text" value={form.invoice_number} onChange={e => setField('invoice_number', e.target.value)}
                  placeholder="Vendor invoice ref." className={inp} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Vehicle Number</label>
                <input type="text" value={form.vehicle_number} onChange={e => setField('vehicle_number', e.target.value.toUpperCase())}
                  placeholder="e.g. KA01AB1234" className={inp} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Driver Name</label>
                <input type="text" value={form.driver_name} onChange={e => setField('driver_name', e.target.value)}
                  placeholder="Driver name" className={inp} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Site Location</label>
                <input type="text" value={form.site_location} onChange={e => setField('site_location', e.target.value)}
                  placeholder="e.g. Main Store" className={inp} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Gate Pass No.</label>
                <input type="text" value={form.gate_pass_no} onChange={e => setField('gate_pass_no', e.target.value)}
                  placeholder="Gate pass number" className={inp} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">WB Slip No.</label>
                <input type="text" value={form.wb_slip_no} onChange={e => setField('wb_slip_no', e.target.value)}
                  placeholder="Weighbridge slip" className={inp} />
              </div>
            </div>
          </div>

          {/* Section 2: Items */}
          <div className="border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Material Items Received</h3>
                {form.po_id && (
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Pre-filled from PO · edit quantities to match actual delivery · add rows for extra items
                  </p>
                )}
              </div>
              <button onClick={addRow}
                className="flex items-center gap-1.5 px-3 h-7 rounded-lg text-xs font-semibold text-indigo-600 bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 transition">
                <Plus size={12} /> Add Row
              </button>
            </div>

            <div className="space-y-4">
              {items.map((it, idx) => {
                const conv = convertedQty(it);
                return (
                  <div key={idx} className="border border-slate-200 rounded-xl p-4 space-y-3 bg-white">

                    {/* Row 1: Core fields */}
                    <div className="grid grid-cols-12 gap-2 items-end">
                      <div className="col-span-3 space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-2">
                          Material *
                          {it._po_qty != null && (
                            <span className="text-[9px] font-semibold bg-indigo-50 text-indigo-600 border border-indigo-200 rounded px-1.5 py-0.5">
                              PO qty: {it._po_qty}
                            </span>
                          )}
                        </label>
                        <input placeholder="Material name" value={it.material_name}
                          onChange={e => updateItem(idx, 'material_name', e.target.value)}
                          className="w-full h-9 bg-slate-50 border border-slate-200 rounded-lg px-3 text-sm outline-none focus:border-indigo-400" />
                      </div>
                      <div className="col-span-1 space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Unit</label>
                        <select value={it.unit} onChange={e => updateItem(idx, 'unit', e.target.value)}
                          className="w-full h-9 bg-slate-50 border border-slate-200 rounded-lg px-2 text-sm outline-none focus:border-indigo-400">
                          {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </div>
                      <div className="col-span-2 space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">
                          {it.use_thumb_rule ? `Qty (${it.unit}) — auto` : 'Qty Received *'}
                        </label>
                        <input type="number" placeholder="0"
                          value={it.use_thumb_rule ? (conv ?? '') : it.quantity_received}
                          readOnly={it.use_thumb_rule}
                          onChange={e => !it.use_thumb_rule && updateItem(idx, 'quantity_received', e.target.value)}
                          className={clsx('w-full h-9 border rounded-lg px-3 text-sm text-right font-mono outline-none',
                            it.use_thumb_rule
                              ? 'bg-indigo-50 border-indigo-200 text-indigo-700 cursor-not-allowed'
                              : 'bg-emerald-50 border-emerald-200 text-emerald-700 focus:border-emerald-400'
                          )} />
                      </div>
                      <div className="col-span-2 space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Rate (₹/Unit)</label>
                        <input type="number" placeholder="0.00" value={it.rate}
                          onChange={e => updateItem(idx, 'rate', e.target.value)}
                          className="w-full h-9 bg-amber-50 border border-amber-200 rounded-lg px-3 text-sm text-right font-mono outline-none focus:border-amber-400" />
                      </div>
                      <div className="col-span-3 space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Quality Remarks</label>
                        <input placeholder="Inspection / rejection notes" value={it.quality_remarks}
                          onChange={e => updateItem(idx, 'quality_remarks', e.target.value)}
                          className="w-full h-9 bg-slate-50 border border-slate-200 rounded-lg px-3 text-sm outline-none focus:border-indigo-400" />
                      </div>
                      <div className="col-span-1 flex items-end justify-end pb-0.5">
                        <button onClick={() => removeRow(idx)} disabled={items.length === 1}
                          className="w-9 h-9 rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 hover:text-red-500 hover:border-red-200 hover:bg-red-50 disabled:opacity-30 transition">
                          <X size={13} />
                        </button>
                      </div>
                    </div>

                    {/* Row 2: Batch + Expiry + Thumb Rule toggle */}
                    <div className="grid grid-cols-3 gap-3 pt-1 border-t border-slate-100">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Batch Number</label>
                        <input placeholder="Auto-generated if blank" value={it.batch_number}
                          onChange={e => updateItem(idx, 'batch_number', e.target.value)}
                          className="w-full h-8 bg-slate-50 border border-slate-200 rounded-lg px-3 text-xs outline-none focus:border-indigo-400" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Expiry Date</label>
                        <input type="date" value={it.expiry_date}
                          onChange={e => updateItem(idx, 'expiry_date', e.target.value)}
                          className="w-full h-8 bg-slate-50 border border-slate-200 rounded-lg px-3 text-xs outline-none focus:border-indigo-400" />
                      </div>
                      <div className="flex items-end pb-1">
                        <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-600 select-none">
                          <input type="checkbox" checked={it.use_thumb_rule}
                            onChange={e => updateItem(idx, 'use_thumb_rule', e.target.checked)}
                            className="w-4 h-4 rounded border-slate-300 accent-indigo-600" />
                          Unit differs from PO? (Thumb Rule)
                        </label>
                      </div>
                    </div>

                    {/* Thumb rule expansion */}
                    {it.use_thumb_rule && (
                      <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 space-y-3">
                        <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">
                          Thumb Rule — Stores counted in a different unit
                        </p>
                        <div className="grid grid-cols-3 gap-3">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-indigo-600 uppercase">Physical Qty (what stores counted)</label>
                            <input type="number" placeholder="e.g. 1000" value={it.physical_qty}
                              onChange={e => updateItem(idx, 'physical_qty', e.target.value)}
                              className="w-full h-8 bg-white border border-indigo-200 rounded-lg px-3 text-xs font-mono text-right outline-none focus:border-indigo-400" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-indigo-600 uppercase">Physical Unit</label>
                            <select value={it.physical_unit} onChange={e => updateItem(idx, 'physical_unit', e.target.value)}
                              className="w-full h-8 bg-white border border-indigo-200 rounded-lg px-2 text-xs outline-none focus:border-indigo-400">
                              {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-indigo-600 uppercase">
                              Factor: 1 {it.physical_unit} = ? {it.unit}
                            </label>
                            <input type="number" step="0.0001" placeholder="e.g. 0.05" value={it.conversion_factor}
                              onChange={e => updateItem(idx, 'conversion_factor', e.target.value)}
                              className="w-full h-8 bg-white border border-indigo-200 rounded-lg px-3 text-xs font-mono text-right outline-none focus:border-indigo-400" />
                          </div>
                        </div>
                        {conv && (
                          <div className="bg-white rounded-lg px-3 py-2 border border-indigo-200 text-xs text-indigo-700 font-semibold">
                            → {it.physical_qty} {it.physical_unit} × {it.conversion_factor} = <strong>{conv} {it.unit}</strong> will be recorded in inventory
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* IGN — Issues / General / Notes bracket */}
          <div className="border-2 border-slate-300 rounded-xl overflow-hidden">
            {/* Header strip */}
            <div className="bg-slate-800 px-5 py-2 flex items-center gap-3">
              <span className="text-xs font-black text-white uppercase tracking-widest">IGN</span>
              <span className="text-[10px] text-slate-400 font-medium">Issues · General Remarks · Inspection Notes</span>
            </div>
            {/* Three bracket columns */}
            <div className="grid grid-cols-3 divide-x-2 divide-slate-300">
              <div className="p-4 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-red-100 border-2 border-red-300 text-red-600 text-xs font-black flex items-center justify-center flex-shrink-0">I</span>
                  <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Issues Found</label>
                </div>
                <textarea rows={3} placeholder="Any problems, shortages or damaged materials…"
                  value={form.issues_notes}
                  onChange={e => setField('issues_notes', e.target.value)}
                  className="w-full bg-red-50 border border-red-200 rounded-lg p-2.5 text-xs outline-none focus:border-red-400 resize-none" />
              </div>
              <div className="p-4 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-slate-100 border-2 border-slate-300 text-slate-600 text-xs font-black flex items-center justify-center flex-shrink-0">G</span>
                  <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">General Remarks</label>
                </div>
                <textarea rows={3} placeholder="General notes about this delivery…"
                  value={form.remarks}
                  onChange={e => setField('remarks', e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs outline-none focus:border-slate-400 resize-none" />
              </div>
              <div className="p-4 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-blue-100 border-2 border-blue-300 text-blue-600 text-xs font-black flex items-center justify-center flex-shrink-0">N</span>
                  <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Inspection Notes</label>
                </div>
                <textarea rows={3} placeholder="Notes for QC / stores verification team…"
                  value={form.inspection_notes}
                  onChange={e => setField('inspection_notes', e.target.value)}
                  className="w-full bg-blue-50 border border-blue-200 rounded-lg p-2.5 text-xs outline-none focus:border-blue-400 resize-none" />
              </div>
            </div>
          </div>

          {/* Bill Entry Toggle */}
          <div className="border border-blue-200 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 bg-blue-50">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input type="checkbox" checked={createBill} onChange={e => setCreateBill(e.target.checked)}
                    className="w-4 h-4 rounded border-blue-300 accent-blue-600" />
                  <span className="text-sm font-semibold text-blue-800">
                    Also create Bill Tracker entry
                    {form.invoice_number && <span className="font-mono ml-1">· {form.invoice_number}</span>}
                  </span>
                </label>
                <span className="text-xs text-blue-500 font-medium">Saves re-entry</span>
              </div>

              {createBill && (
                <div className="p-5 space-y-4 bg-white">

                  {/* Invoice date + tax mode + GST */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700">Invoice Date *</label>
                      <input type="date" value={billForm.inv_date}
                        onChange={e => setBillForm(p => ({ ...p, inv_date: e.target.value }))}
                        className={inp} />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700">Tax Type</label>
                      <div className="flex items-center gap-4 h-9 px-1">
                        {['intrastate', 'interstate'].map(t => (
                          <label key={t} className="flex items-center gap-1.5 text-sm cursor-pointer capitalize">
                            <input type="radio" name="grn_bill_tax_mode" value={t}
                              checked={billForm.tax_mode === t}
                              onChange={() => setBillForm(p => ({ ...p, tax_mode: t }))}
                              className="accent-indigo-600" />
                            {t}
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700">GST % (all items)</label>
                      <select value={billForm.gst_pct}
                        onChange={e => setBillForm(p => ({ ...p, gst_pct: e.target.value }))}
                        className={inp}>
                        {['5','12','18','28'].map(v => <option key={v} value={v}>{v}%</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Per-item GST override table */}
                  {items.some(it => it.material_name?.trim()) && (
                    <div>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                        Per-Item GST Override <span className="font-normal normal-case text-slate-400">(optional — leave default to apply {billForm.gst_pct}% to all)</span>
                      </p>
                      <div className="border border-slate-200 rounded-lg overflow-hidden">
                        <table className="w-full text-xs">
                          <thead className="bg-slate-50">
                            <tr>
                              <th className="text-left px-3 py-2 font-semibold text-slate-600">Material</th>
                              <th className="text-right px-3 py-2 font-semibold text-slate-600">Qty</th>
                              <th className="text-right px-3 py-2 font-semibold text-slate-600">Rate</th>
                              <th className="px-3 py-2 font-semibold text-slate-600 w-24">GST %</th>
                            </tr>
                          </thead>
                          <tbody>
                            {items.map((it, idx) => {
                              if (!it.material_name?.trim()) return null;
                              const effQty = it.use_thumb_rule && it.physical_qty && it.conversion_factor
                                ? (parseFloat(it.physical_qty) * parseFloat(it.conversion_factor)).toFixed(3)
                                : it.quantity_received || '—';
                              const gstVal = itemGstOverrides[String(idx)] ?? billForm.gst_pct;
                              return (
                                <tr key={idx} className="border-t border-slate-100">
                                  <td className="px-3 py-1.5 text-slate-700">{it.material_name}</td>
                                  <td className="px-3 py-1.5 text-right font-mono text-slate-600">{effQty}</td>
                                  <td className="px-3 py-1.5 text-right font-mono text-slate-600">₹{it.rate || '0'}</td>
                                  <td className="px-3 py-1.5">
                                    <select value={gstVal}
                                      onChange={e => setItemGstOverrides(p => ({ ...p, [String(idx)]: e.target.value }))}
                                      className="w-full h-7 bg-slate-50 border border-slate-200 rounded px-2 text-xs outline-none focus:border-indigo-400">
                                      {['5','12','18','28'].map(v => <option key={v} value={v}>{v}%</option>)}
                                    </select>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Transport + Other charges */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 border-t border-slate-100 pt-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700">Transport Charges</label>
                      <input type="number" placeholder="0.00" value={billForm.transport_charges}
                        onChange={e => setBillForm(p => ({ ...p, transport_charges: e.target.value }))}
                        className={inp} />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700">Transport GST %</label>
                      <select value={billForm.transport_gst_pct}
                        onChange={e => setBillForm(p => ({ ...p, transport_gst_pct: e.target.value }))}
                        className={inp}>
                        {['0','5','12','18'].map(v => <option key={v} value={v}>{v}%</option>)}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700">Transport Description</label>
                      <input type="text" placeholder="e.g. Freight charges" value={billForm.transport_desc}
                        onChange={e => setBillForm(p => ({ ...p, transport_desc: e.target.value }))}
                        className={inp} />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700">Other Charges</label>
                      <input type="number" placeholder="0.00" value={billForm.other_charges}
                        onChange={e => setBillForm(p => ({ ...p, other_charges: e.target.value }))}
                        className={inp} />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700">Other Description</label>
                      <input type="text" placeholder="e.g. Loading/unloading" value={billForm.other_charges_desc}
                        onChange={e => setBillForm(p => ({ ...p, other_charges_desc: e.target.value }))}
                        className={inp} />
                    </div>
                  </div>

                  {/* Running total preview */}
                  {(() => {
                    const gstPct = parseFloat(billForm.gst_pct) || 18;
                    const basicTotal = items
                      .filter(it => it.material_name?.trim())
                      .reduce((s, it, idx) => {
                        const qty = it.use_thumb_rule && it.physical_qty && it.conversion_factor
                          ? parseFloat(it.physical_qty) * parseFloat(it.conversion_factor)
                          : parseFloat(it.quantity_received || 0);
                        const itemGst = parseFloat(itemGstOverrides[String(idx)] ?? billForm.gst_pct) / 100;
                        return s + qty * parseFloat(it.rate || 0);
                      }, 0);
                    const gstTotal = items.filter(it => it.material_name?.trim()).reduce((s, it, idx) => {
                      const qty = it.use_thumb_rule && it.physical_qty && it.conversion_factor
                        ? parseFloat(it.physical_qty) * parseFloat(it.conversion_factor)
                        : parseFloat(it.quantity_received || 0);
                      const itemGst = parseFloat(itemGstOverrides[String(idx)] ?? billForm.gst_pct);
                      return s + qty * parseFloat(it.rate || 0) * itemGst / 100;
                    }, 0);
                    const transport = parseFloat(billForm.transport_charges) || 0;
                    const transportGst = transport * (parseFloat(billForm.transport_gst_pct) || 0) / 100;
                    const other = parseFloat(billForm.other_charges) || 0;
                    const total = basicTotal + gstTotal + transport + transportGst + other;
                    if (!basicTotal) return null;
                    return (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-xs space-y-1">
                        <div className="flex justify-between text-slate-600">
                          <span>Basic Amount</span><span className="font-mono">₹{inr(basicTotal)}</span>
                        </div>
                        <div className="flex justify-between text-slate-600">
                          <span>GST</span><span className="font-mono">₹{inr(gstTotal)}</span>
                        </div>
                        {(transport + transportGst) > 0 && (
                          <div className="flex justify-between text-slate-600">
                            <span>Transport + GST</span><span className="font-mono">₹{inr(transport + transportGst)}</span>
                          </div>
                        )}
                        {other > 0 && (
                          <div className="flex justify-between text-slate-600">
                            <span>Other Charges</span><span className="font-mono">₹{inr(other)}</span>
                          </div>
                        )}
                        <div className="flex justify-between font-bold text-slate-800 border-t border-blue-200 pt-1">
                          <span>Bill Total</span><span className="font-mono">₹{inr(total)}</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50 flex-shrink-0">
          <span className="text-xs text-slate-500 font-semibold">
            {items.filter(i => i.material_name && (i.quantity_received || (i.use_thumb_rule && i.physical_qty))).length} item(s) ready
          </span>
          <div className="flex items-center gap-2">
            <button onClick={onClose}
              className="px-5 h-9 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-white transition">
              Cancel
            </button>
            <button onClick={submit} disabled={createMutation.isPending}
              className="px-6 h-9 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition disabled:opacity-50 shadow-sm">
              {createMutation.isPending ? 'Creating…' : createBill ? 'Create GRN + Bill →' : 'Create GRN →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
