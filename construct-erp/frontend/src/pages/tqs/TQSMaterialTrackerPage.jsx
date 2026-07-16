import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tqsTrackerAPI, projectAPI, poAPI } from '../../api/client';
import toast from 'react-hot-toast';
import {
  Package, Plus, Search, X, Edit3, Trash2, ChevronRight, Layers,
  Activity, ClipboardList, RefreshCw, AlertCircle, CheckCircle2,
  Clock, Truck, FileCheck, IndianRupee, ExternalLink, Filter, Link2,
} from 'lucide-react';
import dayjs from 'dayjs';

const inr  = (v) => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt  = (d) => d ? dayjs(d).format('DD-MM-YYYY') : '—';

/* ─── Lifecycle stage config ────────────────────────────────────────────────── */
const LIFECYCLE_STAGES = {
  mr_pending:          { roman: 'I',   label: 'MR Pending',       dot: 'bg-slate-300',   badge: 'bg-slate-100 text-slate-900 border-slate-200',   icon: Clock },
  mr_approved:         { roman: 'I',   label: 'MR Approved',      dot: 'bg-green-400',   badge: 'bg-green-50 text-green-700 border-green-200',     icon: CheckCircle2 },
  po_pending:          { roman: 'II',  label: 'PO Pending',       dot: 'bg-blue-300',    badge: 'bg-blue-50 text-blue-600 border-blue-200',        icon: Clock },
  po_approved:         { roman: 'II',  label: 'PO Approved',      dot: 'bg-blue-500',    badge: 'bg-blue-100 text-blue-700 border-blue-200',       icon: CheckCircle2 },
  grn_pending:         { roman: 'III', label: 'GRN — QC Pending', dot: 'bg-amber-400',   badge: 'bg-amber-50 text-amber-700 border-amber-200',     icon: Truck },
  grn_approved:        { roman: 'III', label: 'Material Rcvd',    dot: 'bg-amber-500',   badge: 'bg-amber-100 text-amber-800 border-amber-200',    icon: CheckCircle2 },
  invoiced:            { roman: 'IV',  label: 'Invoice Submitted', dot: 'bg-purple-400', badge: 'bg-purple-50 text-purple-700 border-purple-200',  icon: FileCheck },
  invoice_authorized:  { roman: 'IV',  label: 'QS Certified',     dot: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
};

const PIPE_STEPS = [
  { key: 'mr',      label: 'MR',      activeOn: ['mr_approved', 'mr_pending'] },
  { key: 'po',      label: 'PO',      activeOn: ['po_pending', 'po_approved'] },
  { key: 'grn',     label: 'Receipt', activeOn: ['grn_pending', 'grn_approved'] },
  { key: 'cert',    label: 'QS Cert', activeOn: ['invoiced', 'invoice_authorized'] },
];

function stepState(stage, activeOn) {
  const order = ['mr_pending','mr_approved','po_pending','po_approved','grn_pending','grn_approved','invoiced','invoice_authorized'];
  const cur = order.indexOf(stage);
  const first = Math.min(...activeOn.map(s => order.indexOf(s)));
  const last  = Math.max(...activeOn.map(s => order.indexOf(s)));
  if (cur >= last + 1) return 'done';
  if (cur >= first) return 'active';
  return 'pending';
}

function PipelineMini({ stage }) {
  return (
    <div className="flex items-center gap-0.5">
      {PIPE_STEPS.map((step, idx) => {
        const state = stepState(stage, step.activeOn);
        return (
          <React.Fragment key={step.key}>
            <div className={`h-1.5 w-8 rounded-full transition-colors ${
              state === 'done' ? 'bg-emerald-400' :
              state === 'active' ? 'bg-blue-500' :
              'bg-slate-200'
            }`} title={step.label} />
            {idx < PIPE_STEPS.length - 1 && (
              <div className={`h-0.5 w-1 ${state === 'done' ? 'bg-emerald-300' : 'bg-slate-200'}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

/* ─── Manual tracker stages ─────────────────────────────────────────────────── */
const STAGES = [
  { key: 'I',   label: 'MR',       color: 'bg-green-500',  light: 'bg-green-50 text-green-700 border-green-200' },
  { key: 'II',  label: 'PO',       color: 'bg-blue-500',   light: 'bg-blue-50 text-blue-700 border-blue-200' },
  { key: 'III', label: 'Receipt',  color: 'bg-amber-500',  light: 'bg-amber-50 text-amber-700 border-amber-200' },
  { key: 'IV',  label: 'QS Cert.', color: 'bg-purple-500', light: 'bg-purple-50 text-purple-700 border-purple-200' },
];

const EMPTY = {
  project_id: '', mr_date: '', material_head: '', material_description: '', unit: '', required_qty: '',
  pm_certification_date: '', qs_certification_date: '',
  vendor_name: '', po_number: '', po_date: '', ordered_qty: '', unit_price: '',
  basic_value: '', gst_amount: '0', total_po_value: '',
  supplier_invoice_no: '', supplier_invoice_date: '', supplier_invoice_qty: '',
  material_received_qty: '', invoice_forwarded_ho_date: '',
  invoice_received_qs_date: '', qty_certified_qs: '', basic_certified_amount: '',
  mob_advance: '0', tds_deduction: '0', retention: '0', total_certified_amount: '',
  certified_to_accounts_date: '', current_stage: 'I', remarks: '',
};

function FldL({ label, children, span }) {
  return (
    <div className={span === 2 ? 'col-span-2' : ''}>
      <label className="block text-xs font-medium text-slate-900 font-medium mb-1">{label}</label>
      {children}
    </div>
  );
}
function Inp({ value, onChange, type = 'text', ...rest }) {
  return (
    <input type={type} value={value ?? ''} onChange={onChange}
      step={type === 'number' ? '0.01' : undefined}
      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400"
      {...rest} />
  );
}

function TrackerModal({ initial, onClose, projects }) {
  const qc = useQueryClient();
  const isEdit = !!initial?.id;
  const [activeTab, setActiveTab] = useState(0);
  const [form, setForm] = useState(initial ? {
    ...EMPTY,
    project_id: initial.project_id || '',
    mr_date: initial.mr_date?.slice(0,10) || '',
    material_head: initial.material_head || '',
    material_description: initial.material_description || '',
    unit: initial.unit || '',
    required_qty: initial.required_qty || '',
    pm_certification_date: initial.pm_certification_date?.slice(0,10) || '',
    qs_certification_date: initial.qs_certification_date?.slice(0,10) || '',
    vendor_name: initial.vendor_name || '',
    po_number: initial.po_number || '',
    po_date: initial.po_date?.slice(0,10) || '',
    ordered_qty: initial.ordered_qty || '',
    unit_price: initial.unit_price || '',
    basic_value: initial.basic_value || '',
    gst_amount: initial.gst_amount || '0',
    total_po_value: initial.total_po_value || '',
    supplier_invoice_no: initial.supplier_invoice_no || '',
    supplier_invoice_date: initial.supplier_invoice_date?.slice(0,10) || '',
    supplier_invoice_qty: initial.supplier_invoice_qty || '',
    material_received_qty: initial.material_received_qty || '',
    invoice_forwarded_ho_date: initial.invoice_forwarded_ho_date?.slice(0,10) || '',
    invoice_received_qs_date: initial.invoice_received_qs_date?.slice(0,10) || '',
    qty_certified_qs: initial.qty_certified_qs || '',
    basic_certified_amount: initial.basic_certified_amount || '',
    mob_advance: initial.mob_advance || '0',
    tds_deduction: initial.tds_deduction || '0',
    retention: initial.retention || '0',
    total_certified_amount: initial.total_certified_amount || '',
    certified_to_accounts_date: initial.certified_to_accounts_date?.slice(0,10) || '',
    current_stage: initial.current_stage || 'I',
    remarks: initial.remarks || '',
  } : EMPTY);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const inp = (k, type) => <Inp type={type} value={form[k]} onChange={e => set(k, e.target.value)} />;

  const mutation = useMutation({
    mutationFn: (data) => isEdit ? tqsTrackerAPI.update(initial.id, data) : tqsTrackerAPI.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['dqs-tracker-manual'] }); toast.success(isEdit ? 'Updated' : 'Created'); onClose(); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });

  const tabs = [
    {
      label: 'I — MR', content: (
        <div className="grid grid-cols-2 gap-4">
          <FldL label="Project" span={2}>
            <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400"
              value={form.project_id} onChange={e => set('project_id', e.target.value)}>
              <option value="">Select project…</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </FldL>
          <FldL label="Date of MR">{inp('mr_date', 'date')}</FldL>
          <FldL label="Material Head">{inp('material_head')}</FldL>
          <FldL label="Material Description" span={2}>{inp('material_description')}</FldL>
          <FldL label="Unit">{inp('unit')}</FldL>
          <FldL label="Required Qty">{inp('required_qty', 'number')}</FldL>
          <FldL label="PM Certification Date">{inp('pm_certification_date', 'date')}</FldL>
          <FldL label="QS Certification Date">{inp('qs_certification_date', 'date')}</FldL>
        </div>
      )
    },
    {
      label: 'II — PO', content: (
        <div className="grid grid-cols-2 gap-4">
          <FldL label="Supplier / Vendor Name" span={2}>{inp('vendor_name')}</FldL>
          <FldL label="PO Number">{inp('po_number')}</FldL>
          <FldL label="PO Date">{inp('po_date', 'date')}</FldL>
          <FldL label="Ordered Qty">{inp('ordered_qty', 'number')}</FldL>
          <FldL label="Unit Price (₹)">{inp('unit_price', 'number')}</FldL>
          <FldL label="Basic Value (₹)">{inp('basic_value', 'number')}</FldL>
          <FldL label="GST Amount (₹)">{inp('gst_amount', 'number')}</FldL>
          <FldL label="Total PO Value (₹)" span={2}>{inp('total_po_value', 'number')}</FldL>
        </div>
      )
    },
    {
      label: 'III — Receipt', content: (
        <div className="grid grid-cols-2 gap-4">
          <FldL label="Supplier Invoice No.">{inp('supplier_invoice_no')}</FldL>
          <FldL label="Supplier Invoice Date">{inp('supplier_invoice_date', 'date')}</FldL>
          <FldL label="Supplier Invoice Qty">{inp('supplier_invoice_qty', 'number')}</FldL>
          <FldL label="Material Received Qty">{inp('material_received_qty', 'number')}</FldL>
          <FldL label="Balance to Receive" span={2}>
            <div className="w-full border border-slate-100 rounded-lg px-3 py-2 text-sm bg-slate-50 text-slate-600">
              {form.ordered_qty && form.material_received_qty
                ? `${(parseFloat(form.ordered_qty) - parseFloat(form.material_received_qty || 0)).toFixed(3)} ${form.unit}`
                : '—'}
            </div>
          </FldL>
          <FldL label="Invoice Forwarded to HO Date" span={2}>{inp('invoice_forwarded_ho_date', 'date')}</FldL>
        </div>
      )
    },
    {
      label: 'IV — QS Cert.', content: (
        <div className="grid grid-cols-2 gap-4">
          <FldL label="Invoice Received Date (QS)">{inp('invoice_received_qs_date', 'date')}</FldL>
          <FldL label="Qty Certified by QS">{inp('qty_certified_qs', 'number')}</FldL>
          <FldL label="Basic Certified Amount (₹)" span={2}>{inp('basic_certified_amount', 'number')}</FldL>
          <FldL label="Mob. Advance Deduction (₹)">{inp('mob_advance', 'number')}</FldL>
          <FldL label="TDS Deduction (₹)">{inp('tds_deduction', 'number')}</FldL>
          <FldL label="Retention (₹)">{inp('retention', 'number')}</FldL>
          <FldL label="Total Certified Amt incl. GST (₹)">{inp('total_certified_amount', 'number')}</FldL>
          <FldL label="Certified Invoice to Accounts Date" span={2}>{inp('certified_to_accounts_date', 'date')}</FldL>
        </div>
      )
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden max-h-[92vh]">
        <div className="px-6 py-4 bg-blue-600 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Package className="w-5 h-5 text-white" />
            <h2 className="text-base font-medium text-white">{isEdit ? 'Edit Manual Entry' : 'New Manual Tracker Entry'}</h2>
          </div>
          <button onClick={onClose} className="text-blue-200 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex border-b border-slate-200 bg-slate-50">
          {tabs.map((t, idx) => (
            <button key={idx} onClick={() => setActiveTab(idx)}
              className={`flex-1 py-3 text-xs font-medium transition-colors ${activeTab === idx ? 'border-b-2 border-blue-600 text-blue-600 bg-white' : 'text-slate-900 font-medium hover:text-slate-700'}`}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-6">{tabs[activeTab].content}</div>
        <div className="px-6 py-4 border-t bg-slate-50 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-900 font-medium font-medium">Current Stage:</span>
            <div className="flex gap-1">
              {STAGES.map(s => (
                <button key={s.key} onClick={() => set('current_stage', s.key)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${form.current_stage === s.key ? s.light + ' border' : 'bg-white text-slate-900 font-medium border-slate-200'}`}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm text-slate-900 hover:text-slate-800">Cancel</button>
            <button onClick={() => mutation.mutate(form)} disabled={mutation.isPending}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50">
              {mutation.isPending ? 'Saving…' : isEdit ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Link PO Modal ─────────────────────────────────────────────────────────── */
// Can be used two ways:
//   1. From a lifecycle row (row prop supplied) — MR number pre-filled, type PO number
//   2. Standalone (row = null) — type both MR number and PO number manually
function LinkPOModal({ row, onClose }) {
  const qc = useQueryClient();
  const [mrsNumber, setMrsNumber] = useState(row?.mr_number || '');
  const [poNumber, setPoNumber]   = useState('');

  const mutation = useMutation({
    mutationFn: () => tqsTrackerAPI.linkPO({ mrs_number: mrsNumber.trim(), po_number: poNumber.trim() }),
    onSuccess: (res) => {
      const d = res.data || {};
      toast.success(`Linked ${d.mr_number || mrsNumber} → ${d.po_number || poNumber} (${d.linked_items || 0} items matched)`);
      qc.invalidateQueries({ queryKey: ['dqs-tracker-lifecycle'] });
      onClose();
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Link failed'),
  });

  const INP = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-blue-400';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <Link2 className="w-4 h-4 text-blue-600" /> Link MR → PO / WO
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4" /></button>
        </div>

        <div className="space-y-3 mb-5">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">MR Number</label>
            <input
              className={INP}
              value={mrsNumber}
              onChange={e => setMrsNumber(e.target.value)}
              placeholder="e.g. BCIM-TQS-BLR-MR-019"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">PO or WO Number</label>
            <input
              className={INP}
              value={poNumber}
              onChange={e => setPoNumber(e.target.value)}
              placeholder="e.g. POTQS010 or WOTQS010-A1"
            />
          </div>
          <p className="text-xs text-slate-400">
            Enter PO or WO reference. Numbers starting with "WO" are linked as Work Orders.
          </p>
        </div>

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-slate-200 hover:bg-slate-50">Cancel</button>
          <button
            disabled={!mrsNumber.trim() || !poNumber.trim() || mutation.isPending}
            onClick={() => mutation.mutate()}
            className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5"
          >
            <Link2 className="w-3.5 h-3.5" />
            {mutation.isPending ? 'Linking…' : 'Link'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Live Lifecycle Table ───────────────────────────────────────────────────── */
function LiveTrackerTab({ projectFilter, search }) {
  const [linkRow, setLinkRow] = useState(null);

  const { data: rows = [], isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['dqs-tracker-lifecycle', { projectFilter, search }],
    queryFn: () => tqsTrackerAPI.lifecycle({
      project_id: projectFilter || undefined,
      search: search || undefined,
    }).then(r => Array.isArray(r.data) ? r.data : (r.data?.data ?? [])),
    refetchOnWindowFocus: false,
  });

  // KPIs derived from lifecycle data
  const kpis = [
    { label: 'MR Stage',      sub: 'Indent raised',    color: 'text-green-700',  bg: 'bg-green-50  border-green-200',  count: rows.filter(r => ['mr_pending','mr_approved'].includes(r.lifecycle_stage)).length },
    { label: 'PO Stage',      sub: 'Orders placed',    color: 'text-blue-700',   bg: 'bg-blue-50   border-blue-200',   count: rows.filter(r => ['po_pending','po_approved'].includes(r.lifecycle_stage)).length },
    { label: 'Receipt Stage', sub: 'Material at site', color: 'text-amber-700',  bg: 'bg-amber-50  border-amber-200',  count: rows.filter(r => ['grn_pending','grn_approved'].includes(r.lifecycle_stage)).length },
    { label: 'QS Cert Stage', sub: 'Invoice certified',color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200', count: rows.filter(r => ['invoiced','invoice_authorized'].includes(r.lifecycle_stage)).length },
  ];

  if (isLoading) return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-4">
        {[0,1,2,3].map(i => <div key={i} className="bg-white rounded-xl border border-slate-100 p-4 h-20 animate-pulse bg-slate-50" />)}
      </div>
      <div className="bg-white rounded-xl border border-slate-100 p-8 text-center text-slate-900 font-medium animate-pulse">Loading workflow data…</div>
    </div>
  );

  if (isError) return (
    <div className="bg-white rounded-xl border border-red-100 p-8 text-center">
      <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
      <p className="text-sm text-red-600 font-medium">Failed to load lifecycle data</p>
      <button onClick={() => refetch()} className="mt-3 px-4 py-1.5 bg-red-50 text-red-600 text-xs rounded-lg hover:bg-red-100">Retry</button>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* KPI row */}
      <div className="grid grid-cols-4 gap-4">
        {kpis.map(k => (
          <div key={k.label} className={`rounded-xl border p-4 ${k.bg}`}>
            <p className={`text-2xl font-medium ${k.color}`}>{k.count}</p>
            <p className={`text-xs font-medium mt-0.5 ${k.color}`}>{k.label}</p>
            <p className="text-xs text-slate-900 font-medium mt-0.5">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Info banner */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-blue-50 border border-blue-100 rounded-xl text-xs text-indigo-700">
        <Activity className="w-3.5 h-3.5 flex-shrink-0" />
        <span>Live data pulled from Material Requisitions → Purchase Orders → GRN → Invoices. Updates automatically when workflow progresses.</span>
        <button onClick={() => refetch()} disabled={isFetching}
          className="ml-auto flex items-center gap-1 px-2.5 py-1 bg-blue-100 hover:bg-indigo-200 rounded-md font-medium transition-colors disabled:opacity-50">
          <RefreshCw className={`w-3 h-3 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Manual link button */}
      <div className="flex justify-end">
        <button
          onClick={() => setLinkRow({})}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
        >
          <Link2 className="w-3.5 h-3.5" /> Manual MR → PO / WO Link
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#f8f9fc] border-b border-slate-100">
                {['MR #', 'MR Date', 'Material', 'MR Qty', 'PO #', 'Vendor', 'Ordered', 'Received', 'Balance', 'PO Value (₹)', 'GRN', 'Invoice', 'Pipeline', 'Stage'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-900 font-medium uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={14} className="px-4 py-16 text-center">
                    <Activity className="w-10 h-10 mx-auto mb-3 text-slate-200" />
                    <p className="text-sm font-medium text-slate-400">No workflow data found</p>
                    <p className="text-xs text-slate-900 font-medium mt-1">
                      {projectFilter ? 'No material requisitions for the selected project.' : 'Create material requisitions and raise POs to see the tracker populate.'}
                    </p>
                  </td>
                </tr>
              ) : rows.map((row, idx) => {
                const stg = LIFECYCLE_STAGES[row.lifecycle_stage] || LIFECYCLE_STAGES.mr_pending;
                const StgIcon = stg.icon;
                return (
                  <tr key={`${row.mrs_id}-${row.item_id}-${idx}`} className="hover:bg-slate-50 transition-colors">
                    {/* MR # */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-mono text-xs font-medium text-blue-600">{row.mr_number || '—'}</span>
                      {row.priority === 'urgent' && (
                        <span className="ml-1 text-[10px] px-1.5 py-0.5 bg-red-100 text-red-600 rounded font-semibold">Urgent</span>
                      )}
                    </td>
                    {/* MR Date */}
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                      {row.mr_date ? fmt(row.mr_date) : '—'}
                    </td>
                    {/* Material */}
                    <td className="px-4 py-3 max-w-[160px]">
                      <div className="text-xs font-medium text-slate-900 truncate">{row.material_name || '—'}</div>
                      {row.purpose && <div className="text-xs text-slate-500 truncate">{row.purpose}</div>}
                    </td>
                    {/* MR Qty */}
                    <td className="px-4 py-3 text-xs text-slate-900 whitespace-nowrap">
                      {row.mr_qty ? `${row.mr_qty} ${row.unit || ''}` : '—'}
                    </td>
                    {/* PO / WO # */}
                    <td className="px-4 py-3 font-mono text-xs text-slate-900 whitespace-nowrap">
                      {row.po_number ? (
                        <span className="flex items-center gap-1">
                          {row.order_type === 'wo' && (
                            <span className="px-1 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-700 border border-orange-200">WO</span>
                          )}
                          {row.po_number}
                        </span>
                      ) : (
                        <button
                          onClick={() => setLinkRow(row)}
                          className="flex items-center gap-1 text-blue-500 hover:text-blue-700 text-xs font-medium"
                          title="Link this MR to an existing PO or WO"
                        >
                          <Link2 className="w-3 h-3" /> Link PO/WO
                        </button>
                      )}
                    </td>
                    {/* Vendor */}
                    <td className="px-4 py-3 text-xs text-slate-900 max-w-[110px] truncate">
                      {row.vendor_name ? (row.vendor_name).toUpperCase() : <span className="text-slate-300">—</span>}
                    </td>
                    {/* Ordered Qty */}
                    <td className="px-4 py-3 text-xs text-slate-900 whitespace-nowrap">
                      {row.ordered_qty != null ? `${Number(row.ordered_qty).toLocaleString('en-IN', { maximumFractionDigits: 3 })} ${row.unit || ''}` : <span className="text-slate-300">—</span>}
                    </td>
                    {/* Received Qty */}
                    <td className="px-4 py-3 text-xs whitespace-nowrap">
                      {row.received_qty != null ? (
                        <span className={Number(row.received_qty) > 0 ? 'text-emerald-700 font-medium' : 'text-slate-400'}>
                          {Number(row.received_qty).toLocaleString('en-IN', { maximumFractionDigits: 3 })} {row.unit || ''}
                        </span>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    {/* Balance Qty */}
                    <td className="px-4 py-3 text-xs whitespace-nowrap">
                      {row.balance_qty != null ? (
                        <span className={Number(row.balance_qty) > 0 ? 'text-amber-700 font-medium' : 'text-slate-400'}>
                          {Number(row.balance_qty).toLocaleString('en-IN', { maximumFractionDigits: 3 })} {row.unit || ''}
                        </span>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    {/* PO Value */}
                    <td className="px-4 py-3 text-xs font-medium text-slate-900 whitespace-nowrap">
                      {row.po_value ? `₹${inr(row.po_value)}` : <span className="text-slate-300">—</span>}
                    </td>
                    {/* GRN */}
                    <td className="px-4 py-3 text-xs whitespace-nowrap">
                      {row.grn_number ? (
                        <div>
                          <span className="font-mono text-slate-600">{row.grn_number}</span>
                          <span className={`ml-1 text-[10px] px-1 py-0.5 rounded font-medium ${row.grn_status === 'approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                            {row.grn_status === 'approved' ? 'QC OK' : 'Pending QC'}
                          </span>
                        </div>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    {/* Invoice / DQS Bill */}
                    <td className="px-4 py-3 text-xs whitespace-nowrap">
                      {row.invoice_number ? (
                        <div>
                          <span className="font-mono text-slate-600">{row.invoice_number}</span>
                          {row.invoice_amount && <div className="text-slate-500">₹{inr(row.invoice_amount)}</div>}
                          <span className={`text-[10px] px-1 py-0.5 rounded font-medium ${['qs','procurement','accounts','paid'].includes(row.invoice_status) ? 'bg-emerald-100 text-emerald-700' : 'bg-purple-100 text-purple-700'}`}>
                            {['qs','procurement','accounts','paid'].includes(row.invoice_status) ? 'QS Certified' : 'Bill Received'}
                          </span>
                        </div>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    {/* Pipeline visual */}
                    <td className="px-4 py-3">
                      <PipelineMini stage={row.lifecycle_stage} />
                      <div className="text-[10px] text-slate-900 font-medium mt-1">
                        {PIPE_STEPS.map((s, i) => (
                          <span key={s.key} className={`${stepState(row.lifecycle_stage, s.activeOn) === 'done' ? 'text-emerald-500' : stepState(row.lifecycle_stage, s.activeOn) === 'active' ? 'text-blue-600 font-semibold' : 'text-slate-300'}`}>
                            {s.label}{i < PIPE_STEPS.length - 1 ? ' · ' : ''}
                          </span>
                        ))}
                      </div>
                    </td>
                    {/* Stage badge */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium border ${stg.badge}`}>
                        <StgIcon className="w-3 h-3" />
                        {stg.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {rows.length > 0 && (
          <div className="px-4 py-2 border-t border-slate-100 bg-slate-50 text-xs text-slate-400">
            {rows.length} material line{rows.length !== 1 ? 's' : ''} tracked across workflow
          </div>
        )}
      </div>
      {linkRow && <LinkPOModal row={linkRow} onClose={() => setLinkRow(null)} />}
    </div>
  );
}

/* ─── Manual Tracker Tab ─────────────────────────────────────────────────────── */
function ManualTrackerTab({ projectFilter, search, projects }) {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['dqs-tracker-manual', { search, projectFilter }],
    queryFn: () => tqsTrackerAPI.list({
      search: search || undefined,
      project_id: projectFilter || undefined,
    }).then(r => Array.isArray(r.data) ? r.data : (r.data?.data ?? [])),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => tqsTrackerAPI.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['dqs-tracker-manual'] }); toast.success('Deleted'); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });

  const kpis = STAGES.map(s => ({ ...s, count: items.filter(i => i.current_stage === s.key).length }));

  return (
    <div className="space-y-4">
      {/* KPI row */}
      <div className="grid grid-cols-4 gap-4">
        {kpis.map(s => (
          <div key={s.key} className="bg-white rounded-xl border border-slate-100 p-4">
            <div className="flex items-center justify-between mb-1">
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${s.light}`}>Stage {s.key}</span>
              <span className="text-2xl font-medium text-slate-800">{s.count}</span>
            </div>
            <p className="text-xs text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">Manually tracked entries — fill in when workflow data is incomplete or for older records.</p>
        <button onClick={() => { setEditItem(null); setShowModal(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg">
          <Plus className="w-4 h-4" /> New Entry
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#f8f9fc] border-b border-slate-100">
                {['Tracker #', 'Project', 'Material', 'MR Date', 'PO Number', 'Vendor', 'Total PO (₹)', 'Rcvd Qty', 'Certified Amt (₹)', 'Stage', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-900 font-medium uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i}>{Array.from({ length: 11 }).map((__, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 bg-slate-100 rounded animate-pulse" /></td>
                  ))}</tr>
                ))
              ) : items.length === 0 ? (
                <tr><td colSpan={11} className="px-4 py-14 text-center text-slate-400">
                  <ClipboardList className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm font-medium">No manual entries</p>
                  <p className="text-xs mt-1">Use "New Entry" to add records not captured by the live workflow tracker</p>
                </td></tr>
              ) : items.map(it => {
                const stageCfg = STAGES.find(s => s.key === it.current_stage) || STAGES[0];
                const balance = it.ordered_qty && it.material_received_qty
                  ? (parseFloat(it.ordered_qty) - parseFloat(it.material_received_qty)).toFixed(2)
                  : null;
                return (
                  <tr key={it.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-blue-600 font-medium whitespace-nowrap">{it.tracker_no}</td>
                    <td className="px-4 py-3 text-xs text-slate-900 font-medium max-w-[100px] truncate">{it.project_name || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900 font-medium text-xs max-w-[140px] truncate">{it.material_description || '—'}</div>
                      {it.material_head && <div className="text-xs text-slate-400">{it.material_head}</div>}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-900 whitespace-nowrap">{fmt(it.mr_date)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{it.po_number || '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-900 max-w-[100px] truncate">{(it.vendor_name || '').toUpperCase() || '—'}</td>
                    <td className="px-4 py-3 text-xs font-medium text-slate-700">{it.total_po_value ? `₹${inr(it.total_po_value)}` : '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {it.material_received_qty ? (
                        <span>
                          {it.material_received_qty} {it.unit}
                          {balance !== null && <span className={`ml-1 text-xs ${parseFloat(balance) > 0 ? 'text-amber-500' : 'text-emerald-600'}`}>(Bal: {balance})</span>}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs font-medium text-slate-700">{it.total_certified_amount ? `₹${inr(it.total_certified_amount)}` : '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium border ${stageCfg.light}`}>
                        Stage {it.current_stage} · {stageCfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => { setEditItem(it); setShowModal(true); }} className="text-slate-900 font-medium hover:text-blue-600"><Edit3 className="w-4 h-4" /></button>
                        <button onClick={() => { if (window.confirm('Delete this entry?')) deleteMutation.mutate(it.id); }} className="text-slate-900 font-medium hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {items.length > 0 && (
          <div className="px-4 py-2 border-t border-slate-100 bg-slate-50 text-xs text-slate-400">
            {items.length} entr{items.length !== 1 ? 'ies' : 'y'}
          </div>
        )}
      </div>

      {showModal && (
        <TrackerModal initial={editItem} onClose={() => { setShowModal(false); setEditItem(null); }} projects={projects} />
      )}
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────────── */
export default function TQSMaterialTrackerPage() {
  const [activeTab, setActiveTab] = useState('live');
  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState('');

  const { data: projects = [] } = useQuery({
    queryKey: ['projects-list'],
    queryFn: () => projectAPI.list().then(r => { const d = r.data; return Array.isArray(d) ? d : (d?.projects ?? d?.data ?? []); }),
  });

  const tabs = [
    { key: 'live',   label: 'Live Workflow Tracker', icon: Activity,       desc: 'Auto-synced from MRS → PO → GRN → Invoice' },
    { key: 'manual', label: 'Manual Entries',         icon: ClipboardList,  desc: 'Manually entered tracker records' },
  ];

  return (
    <div className="p-6 space-y-5 bg-[#f4f6f9] min-h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center">
            <Layers className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-medium text-slate-800">Material Tracker</h1>
            <p className="text-xs text-slate-500">MR → PO → Store Receipt → QS Certification</p>
          </div>
        </div>
      </div>

      {/* Tab nav + filters row */}
      <div className="bg-white rounded-xl border border-[#e2e6ec] p-1 flex items-center gap-1">
        {tabs.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={`flex-1 flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${activeTab === t.key ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-900 font-medium hover:text-slate-900 hover:bg-slate-50'}`}>
              <Icon className="w-4 h-4" />
              <span>{t.label}</span>
              {activeTab === t.key && <span className="ml-auto text-[10px] text-blue-200 hidden lg:block">{t.desc}</span>}
            </button>
          );
        })}
      </div>

      {/* Global filters */}
      <div className="bg-white rounded-xl border border-slate-100 p-3 flex gap-3 items-center flex-wrap">
        <Filter className="w-4 h-4 text-slate-900 font-medium flex-shrink-0" />
        <div className="flex items-center gap-2 flex-1 min-w-48 border border-slate-200 rounded-lg px-3 py-2">
          <Search className="w-4 h-4 text-slate-400" />
          <input className="flex-1 text-sm outline-none bg-transparent"
            placeholder={activeTab === 'live' ? 'Search material, MR#, PO#, vendor…' : 'Search material, vendor, PO…'}
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 outline-none"
          value={projectFilter} onChange={e => setProjectFilter(e.target.value)}>
          <option value="">All Projects</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {(search || projectFilter) && (
          <button onClick={() => { setSearch(''); setProjectFilter(''); }}
            className="text-xs text-slate-900 font-medium hover:text-slate-900 flex items-center gap-1">
            <X className="w-3.5 h-3.5" /> Clear
          </button>
        )}
      </div>

      {/* Tab content */}
      {activeTab === 'live'
        ? <LiveTrackerTab projectFilter={projectFilter} search={search} />
        : <ManualTrackerTab projectFilter={projectFilter} search={search} projects={projects} />
      }
    </div>
  );
}
