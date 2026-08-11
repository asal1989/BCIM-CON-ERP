// src/pages/accounts/EWayBillsPage.jsx — E-Way Bill tracking
import React, { useState, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useReactToPrint } from 'react-to-print';
import {
  Truck, Plus, Search, X, Printer, Ban, ChevronDown, ChevronUp,
  FileText, MapPin, Package, AlertCircle
} from 'lucide-react';
import dayjs from 'dayjs';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import { ewayBillAPI, projectAPI } from '../../api/client';
import EWayBillPrintTemplate from './EWayBillPrintTemplate';

dayjs.extend(isSameOrBefore);

const TODAY = dayjs().format('YYYY-MM-DD');

const inr = v => `₹${(Number(v) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Effective status: if DB says active but validity expired, show as expired
const effectiveStatus = row => {
  if (row.status !== 'active') return row.status;
  return dayjs(row.valid_until).isSameOrBefore(TODAY, 'day') ? 'expired' : 'active';
};

const STATUS_META = {
  active:    { label: 'Active',    cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  expired:   { label: 'Expired',   cls: 'bg-amber-50 text-amber-600 border-amber-200' },
  cancelled: { label: 'Cancelled', cls: 'bg-red-50 text-red-600 border-red-200' },
};

const TRANSACTION_TYPES = ['Stock Transfer', 'Outward Supply', 'Inward Supply', 'Job Work', 'Sales Return'];
const SUB_TYPES = ['Branch Transfer', 'SKD/CKD', 'Line Sales', 'Recipient Not Known', 'Others'];
const DOC_TYPES = ['Delivery Challan', 'Tax Invoice', 'Bill of Entry', 'Credit Note', 'Bill of Supply'];
const TRANSPORT_MODES = ['Road', 'Rail', 'Air', 'Ship'];
const UNITS = ['NOS', 'KG', 'MT', 'LTR', 'BOX', 'BAG', 'ROLL', 'SET', 'SQM', 'RMT', 'CUM'];
const TAX_RATES = [0, 5, 12, 18, 28];

const STATES = [
  'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat',
  'Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh',
  'Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab',
  'Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh',
  'Uttarakhand','West Bengal','Delhi','Jammu & Kashmir','Ladakh',
];

const inputCls = 'w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 transition-all placeholder:text-slate-400';
const labelCls = 'block text-xs font-medium text-slate-500 mb-1';

function Field({ label, children }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  );
}

function SectionTitle({ icon, title }) {
  return (
    <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-100">
      {icon}
      <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">{title}</span>
    </div>
  );
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────

function DetailPanel({ id, onClose, onCancel }) {
  const printRef = useRef(null);
  const handlePrint = useReactToPrint({ contentRef: printRef });

  const { data, isLoading } = useQuery({
    queryKey: ['ewb-detail', id],
    queryFn: () => ewayBillAPI.get(id).then(r => r.data?.data),
    enabled: !!id,
  });

  if (isLoading || !data) return (
    <div className="fixed inset-0 bg-black/30 z-40 flex items-center justify-center">
      <div className="bg-white rounded-xl p-8 text-sm text-slate-500">Loading…</div>
    </div>
  );

  const items = Array.isArray(data.items) ? data.items : JSON.parse(data.items || '[]');
  const eff = effectiveStatus(data);
  const sm = STATUS_META[eff] || STATUS_META.active;

  return (
    <div className="fixed inset-0 bg-black/40 z-40 flex">
      <div className="ml-auto w-full max-w-3xl bg-white h-full flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-3">
              <span className="text-lg font-semibold text-black font-mono">{data.ewb_no}</span>
              <span className={clsx('text-[11px] px-2.5 py-0.5 rounded-full border font-medium', sm.cls)}>{sm.label}</span>
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              {dayjs(data.ewb_date).format('DD MMM YYYY')} · Valid until {dayjs(data.valid_until).format('DD MMM YYYY')}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
              <Printer className="w-3.5 h-3.5" /> Print
            </button>
            {eff !== 'cancelled' && (
              <button onClick={() => onCancel(data.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors">
                <Ban className="w-3.5 h-3.5" /> Cancel
              </button>
            )}
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors">
              <X className="w-4 h-4 text-slate-500" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Transaction */}
          <div>
            <SectionTitle icon={<FileText className="w-3.5 h-3.5 text-indigo-500" />} title="Transaction Details" />
            <div className="grid grid-cols-3 gap-4 text-xs">
              <div><div className="text-slate-400 mb-1">Type</div><div className="font-medium text-black">{data.transaction_type}</div></div>
              <div><div className="text-slate-400 mb-1">Sub-Type</div><div className="font-medium text-black">{data.sub_type}</div></div>
              <div><div className="text-slate-400 mb-1">Doc Type</div><div className="font-medium text-black">{data.doc_type}</div></div>
              <div><div className="text-slate-400 mb-1">Doc No</div><div className="font-medium text-black font-mono">{data.doc_no || '—'}</div></div>
              <div><div className="text-slate-400 mb-1">Doc Date</div><div className="font-medium text-black">{data.doc_date ? dayjs(data.doc_date).format('DD MMM YYYY') : '—'}</div></div>
              <div><div className="text-slate-400 mb-1">Project</div><div className="font-medium text-black">{data.project_name || '—'}</div></div>
            </div>
          </div>

          {/* From / To */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
              <div className="text-[10px] font-semibold text-blue-700 uppercase tracking-wider mb-3">From (Dispatch)</div>
              <div className="space-y-2 text-xs">
                <div><span className="text-slate-400">GSTIN: </span><span className="font-mono font-medium">{data.from_gstin || '—'}</span></div>
                <div><span className="text-slate-400">Name: </span><span className="font-medium">{data.from_name || '—'}</span></div>
                <div><span className="text-slate-400">Address: </span><span>{[data.from_address, data.from_city, data.from_state, data.from_pincode].filter(Boolean).join(', ') || '—'}</span></div>
              </div>
            </div>
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
              <div className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wider mb-3">To (Ship To)</div>
              <div className="space-y-2 text-xs">
                <div><span className="text-slate-400">GSTIN: </span><span className="font-mono font-medium">{data.to_gstin || '—'}</span></div>
                <div><span className="text-slate-400">Name: </span><span className="font-medium">{data.to_name || '—'}</span></div>
                <div><span className="text-slate-400">Address: </span><span>{[data.to_address, data.to_city, data.to_state, data.to_pincode].filter(Boolean).join(', ') || '—'}</span></div>
              </div>
            </div>
          </div>

          {/* Transport */}
          <div>
            <SectionTitle icon={<Truck className="w-3.5 h-3.5 text-amber-500" />} title="Transport Details" />
            <div className="grid grid-cols-5 gap-4 text-xs">
              {[
                ['Mode', data.transport_mode],
                ['Vehicle No', data.vehicle_no],
                ['Transporter', data.transporter_name],
                ['Transporter GSTIN', data.transporter_gstin],
                ['Distance', data.distance_km ? `${data.distance_km} km` : null],
              ].map(([label, value]) => (
                <div key={label}><div className="text-slate-400 mb-1">{label}</div><div className="font-medium text-black">{value || '—'}</div></div>
              ))}
            </div>
          </div>

          {/* Items */}
          <div>
            <SectionTitle icon={<Package className="w-3.5 h-3.5 text-purple-500" />} title="Items" />
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  {['Sl','Description','HSN','Qty','Unit','Taxable Value','Tax %','IGST'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-slate-500 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {items.map((item, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2 text-slate-500">{i + 1}</td>
                    <td className="px-3 py-2 font-medium text-black">{item.description}</td>
                    <td className="px-3 py-2 font-mono text-slate-600">{item.hsn_code}</td>
                    <td className="px-3 py-2 text-slate-700">{item.quantity}</td>
                    <td className="px-3 py-2 text-slate-600">{item.unit}</td>
                    <td className="px-3 py-2 font-mono text-black">{inr(item.taxable_value)}</td>
                    <td className="px-3 py-2 text-slate-600">{item.tax_rate}%</td>
                    <td className="px-3 py-2 font-mono text-black">{inr(item.igst_amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                  <td colSpan={5} className="px-3 py-2 text-right text-slate-600">Total</td>
                  <td className="px-3 py-2 font-mono text-slate-900">{inr(data.total_taxable_value)}</td>
                  <td></td>
                  <td className="px-3 py-2 font-mono text-slate-900">{inr(data.total_igst)}</td>
                </tr>
                <tr className="bg-emerald-50 font-bold">
                  <td colSpan={7} className="px-3 py-2 text-right text-emerald-800">Total Value (incl. IGST)</td>
                  <td className="px-3 py-2 font-mono text-emerald-900">{inr(data.total_value)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {data.remarks && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700">
              <div className="text-slate-400 text-[10px] font-medium uppercase tracking-wider mb-1">Remarks</div>
              {data.remarks}
            </div>
          )}
        </div>

        {/* Hidden print template */}
        <div style={{ display: 'none' }}>
          <EWayBillPrintTemplate ref={printRef} data={data} />
        </div>
      </div>
    </div>
  );
}

// ─── Entry Form ───────────────────────────────────────────────────────────────

const EMPTY_ITEM = () => ({ description: '', hsn_code: '', quantity: '', unit: 'NOS', taxable_value: '', tax_rate: 18, igst_amount: 0 });

function EntryForm({ projects, onClose, onSaved }) {
  const [form, setForm] = useState({
    ewb_no: '', ewb_date: TODAY, valid_until: '',
    transaction_type: 'Stock Transfer', sub_type: 'Branch Transfer',
    doc_type: 'Delivery Challan', doc_no: '', doc_date: TODAY,
    project_id: '',
    from_gstin: '', from_name: '', from_address: '', from_city: 'Hyderabad', from_state: 'Telangana', from_pincode: '',
    to_gstin: '', to_name: '', to_address: '', to_city: 'Bengaluru', to_state: 'Karnataka', to_pincode: '',
    transport_mode: 'Road', vehicle_no: '', transporter_name: '', transporter_gstin: '', distance_km: '',
    remarks: '',
  });
  const [items, setItems] = useState([EMPTY_ITEM()]);
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const updateItem = (i, k, v) => {
    setItems(prev => {
      const next = prev.map((r, idx) => idx === i ? { ...r, [k]: v } : r);
      if (k === 'taxable_value' || k === 'tax_rate') {
        const row = next[i];
        next[i] = { ...row, igst_amount: Math.round((Number(row.taxable_value) || 0) * (Number(row.tax_rate) || 0) / 100 * 100) / 100 };
      }
      return next;
    });
  };

  const totals = useMemo(() => ({
    taxable: items.reduce((s, r) => s + (Number(r.taxable_value) || 0), 0),
    igst:    items.reduce((s, r) => s + (Number(r.igst_amount)   || 0), 0),
  }), [items]);

  const createMut = useMutation({
    mutationFn: d => ewayBillAPI.create(d),
    onSuccess: () => { toast.success('E-Way Bill recorded'); onSaved(); },
    onError: e => toast.error(e?.response?.data?.error || 'Save failed'),
  });

  const handleSubmit = async e => {
    e.preventDefault();
    if (!form.ewb_no.trim()) return toast.error('EWB No. is required');
    if (!/^\d{12}$/.test(form.ewb_no.trim())) return toast.error('EWB No. must be exactly 12 digits');
    if (!form.valid_until) return toast.error('Valid Until date is required');
    const validItems = items.filter(r => r.description.trim());
    if (!validItems.length) return toast.error('Add at least one item');
    createMut.mutate({ ...form, items: validItems });
  };

  return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
        <div>
          <h2 className="text-lg font-semibold text-black">Record E-Way Bill</h2>
          <p className="text-xs text-slate-400 mt-0.5">Enter the government-issued EWB number and details</p>
        </div>
        <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-md border border-slate-300 text-slate-500 hover:bg-slate-50">
          <X className="w-4 h-4" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-5xl mx-auto space-y-8">

          {/* Section 1 — E-Way Bill Info */}
          <div>
            <SectionTitle icon={<FileText className="w-3.5 h-3.5 text-indigo-500" />} title="E-Way Bill Info" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="col-span-2 md:col-span-1">
                <Field label="EWB No. * (12 digits)">
                  <input value={form.ewb_no} onChange={e => set('ewb_no', e.target.value)} className={inputCls} placeholder="120803456789" maxLength={12} />
                </Field>
              </div>
              <Field label="Date *">
                <input type="date" value={form.ewb_date} onChange={e => set('ewb_date', e.target.value)} className={inputCls} />
              </Field>
              <Field label="Valid Until *">
                <input type="date" value={form.valid_until} onChange={e => set('valid_until', e.target.value)} className={inputCls} />
              </Field>
              <Field label="Project">
                <select value={form.project_id} onChange={e => set('project_id', e.target.value)} className={inputCls}>
                  <option value="">— None —</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name || p.project_name}</option>)}
                </select>
              </Field>
            </div>
          </div>

          {/* Section 2 — Transaction */}
          <div>
            <SectionTitle icon={<FileText className="w-3.5 h-3.5 text-blue-500" />} title="Transaction Details" />
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Field label="Transaction Type">
                <select value={form.transaction_type} onChange={e => set('transaction_type', e.target.value)} className={inputCls}>
                  {TRANSACTION_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Sub-Type">
                <select value={form.sub_type} onChange={e => set('sub_type', e.target.value)} className={inputCls}>
                  {SUB_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Document Type">
                <select value={form.doc_type} onChange={e => set('doc_type', e.target.value)} className={inputCls}>
                  {DOC_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Document No.">
                <input value={form.doc_no} onChange={e => set('doc_no', e.target.value)} className={inputCls} placeholder="DC/2025-26/001" />
              </Field>
              <Field label="Document Date">
                <input type="date" value={form.doc_date} onChange={e => set('doc_date', e.target.value)} className={inputCls} />
              </Field>
            </div>
          </div>

          {/* Section 3 — From */}
          <div>
            <SectionTitle icon={<MapPin className="w-3.5 h-3.5 text-blue-600" />} title="From — Dispatch Address (Hyderabad)" />
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Field label="GSTIN">
                <input value={form.from_gstin} onChange={e => set('from_gstin', e.target.value.toUpperCase())} className={inputCls} placeholder="36AABCB1234A1Z5" maxLength={15} />
              </Field>
              <div className="col-span-2">
                <Field label="Name / Trade Name">
                  <input value={form.from_name} onChange={e => set('from_name', e.target.value)} className={inputCls} placeholder="BCIM Engineering Pvt Ltd" />
                </Field>
              </div>
              <div className="col-span-2 md:col-span-3">
                <Field label="Address">
                  <input value={form.from_address} onChange={e => set('from_address', e.target.value)} className={inputCls} placeholder="Building / Street" />
                </Field>
              </div>
              <Field label="City">
                <input value={form.from_city} onChange={e => set('from_city', e.target.value)} className={inputCls} placeholder="Hyderabad" />
              </Field>
              <Field label="State">
                <select value={form.from_state} onChange={e => set('from_state', e.target.value)} className={inputCls}>
                  {STATES.map(s => <option key={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Pincode">
                <input value={form.from_pincode} onChange={e => set('from_pincode', e.target.value)} className={inputCls} placeholder="500001" maxLength={6} />
              </Field>
            </div>
          </div>

          {/* Section 4 — To */}
          <div>
            <SectionTitle icon={<MapPin className="w-3.5 h-3.5 text-emerald-600" />} title="To — Ship To Address (Bengaluru)" />
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Field label="GSTIN">
                <input value={form.to_gstin} onChange={e => set('to_gstin', e.target.value.toUpperCase())} className={inputCls} placeholder="29AABCB1234A1Z7" maxLength={15} />
              </Field>
              <div className="col-span-2">
                <Field label="Name / Trade Name">
                  <input value={form.to_name} onChange={e => set('to_name', e.target.value)} className={inputCls} placeholder="BCIM Engineering Pvt Ltd — Bengaluru" />
                </Field>
              </div>
              <div className="col-span-2 md:col-span-3">
                <Field label="Address">
                  <input value={form.to_address} onChange={e => set('to_address', e.target.value)} className={inputCls} placeholder="Building / Street" />
                </Field>
              </div>
              <Field label="City">
                <input value={form.to_city} onChange={e => set('to_city', e.target.value)} className={inputCls} placeholder="Bengaluru" />
              </Field>
              <Field label="State">
                <select value={form.to_state} onChange={e => set('to_state', e.target.value)} className={inputCls}>
                  {STATES.map(s => <option key={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Pincode">
                <input value={form.to_pincode} onChange={e => set('to_pincode', e.target.value)} className={inputCls} placeholder="560001" maxLength={6} />
              </Field>
            </div>
          </div>

          {/* Section 5 — Transport */}
          <div>
            <SectionTitle icon={<Truck className="w-3.5 h-3.5 text-amber-500" />} title="Transport Details" />
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <Field label="Mode">
                <select value={form.transport_mode} onChange={e => set('transport_mode', e.target.value)} className={inputCls}>
                  {TRANSPORT_MODES.map(m => <option key={m}>{m}</option>)}
                </select>
              </Field>
              <Field label="Vehicle No.">
                <input value={form.vehicle_no} onChange={e => set('vehicle_no', e.target.value.toUpperCase())} className={inputCls} placeholder="TS 09 AB 1234" />
              </Field>
              <Field label="Transporter Name">
                <input value={form.transporter_name} onChange={e => set('transporter_name', e.target.value)} className={inputCls} placeholder="Fast Freight Co" />
              </Field>
              <Field label="Transporter GSTIN">
                <input value={form.transporter_gstin} onChange={e => set('transporter_gstin', e.target.value.toUpperCase())} className={inputCls} placeholder="36AABCF0000A1Z0" maxLength={15} />
              </Field>
              <Field label="Distance (km)">
                <input type="number" value={form.distance_km} onChange={e => set('distance_km', e.target.value)} className={inputCls} placeholder="560" min={1} />
              </Field>
            </div>
          </div>

          {/* Section 6 — Items */}
          <div>
            <SectionTitle icon={<Package className="w-3.5 h-3.5 text-purple-500" />} title="Items" />
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    {['Description *','HSN Code','Qty','Unit','Taxable Value (₹)','Tax Rate %','IGST (auto)',''].map(h => (
                      <th key={h} className="px-3 py-2.5 text-left text-slate-500 font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {items.map((row, i) => (
                    <tr key={i}>
                      <td className="px-2 py-1.5">
                        <input value={row.description} onChange={e => updateItem(i, 'description', e.target.value)}
                          className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded text-xs outline-none focus:border-indigo-400 min-w-[160px]"
                          placeholder="Material description" />
                      </td>
                      <td className="px-2 py-1.5">
                        <input value={row.hsn_code} onChange={e => updateItem(i, 'hsn_code', e.target.value)}
                          className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded text-xs outline-none focus:border-indigo-400 font-mono w-20"
                          placeholder="7213" />
                      </td>
                      <td className="px-2 py-1.5">
                        <input type="number" value={row.quantity} onChange={e => updateItem(i, 'quantity', e.target.value)}
                          className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded text-xs outline-none focus:border-indigo-400 w-16"
                          placeholder="0" min={0} />
                      </td>
                      <td className="px-2 py-1.5">
                        <select value={row.unit} onChange={e => updateItem(i, 'unit', e.target.value)}
                          className="px-2 py-1.5 bg-slate-50 border border-slate-200 rounded text-xs outline-none focus:border-indigo-400">
                          {UNITS.map(u => <option key={u}>{u}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-1.5">
                        <input type="number" value={row.taxable_value} onChange={e => updateItem(i, 'taxable_value', e.target.value)}
                          className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded text-xs outline-none focus:border-indigo-400 font-mono w-28"
                          placeholder="0.00" min={0} step="0.01" />
                      </td>
                      <td className="px-2 py-1.5">
                        <select value={row.tax_rate} onChange={e => updateItem(i, 'tax_rate', Number(e.target.value))}
                          className="px-2 py-1.5 bg-slate-50 border border-slate-200 rounded text-xs outline-none focus:border-indigo-400">
                          {TAX_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-1.5">
                        <div className="px-2 py-1.5 bg-emerald-50 border border-emerald-200 rounded text-xs font-mono text-emerald-800 min-w-[90px] text-right">
                          {inr(row.igst_amount)}
                        </div>
                      </td>
                      <td className="px-2 py-1.5">
                        {items.length > 1 && (
                          <button type="button" onClick={() => setItems(p => p.filter((_, idx) => idx !== i))}
                            className="w-6 h-6 flex items-center justify-center text-red-400 hover:text-red-600 rounded">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-xs">
                    <td colSpan={4} className="px-3 py-2">
                      <button type="button" onClick={() => setItems(p => [...p, EMPTY_ITEM()])}
                        className="flex items-center gap-1.5 text-indigo-600 hover:text-indigo-800 font-medium">
                        <Plus className="w-3.5 h-3.5" /> Add Row
                      </button>
                    </td>
                    <td className="px-3 py-2 font-mono text-black">{inr(totals.taxable)}</td>
                    <td></td>
                    <td className="px-3 py-2 font-mono text-emerald-800">{inr(totals.igst)}</td>
                    <td></td>
                  </tr>
                  <tr className="border-t border-slate-200 bg-emerald-50 font-bold text-xs">
                    <td colSpan={6} className="px-3 py-2 text-right text-emerald-800">Total Value (Taxable + IGST)</td>
                    <td className="px-3 py-2 font-mono text-emerald-900">{inr(totals.taxable + totals.igst)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Remarks */}
          <div>
            <label className={labelCls}>Remarks (optional)</label>
            <textarea value={form.remarks} onChange={e => set('remarks', e.target.value)} rows={2}
              className={inputCls} placeholder="Any notes about this transfer…" />
          </div>

        </div>
      </form>

      <div className="border-t border-slate-200 bg-white px-6 py-4 flex justify-end gap-3">
        <button type="button" onClick={onClose}
          className="px-5 py-2.5 border border-slate-300 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors">
          Cancel
        </button>
        <button onClick={handleSubmit} disabled={saving || createMut.isPending}
          className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60">
          {createMut.isPending ? 'Saving…' : 'Save E-Way Bill'}
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function EWayBillsPage() {
  const [showForm, setShowForm]       = useState(false);
  const [selectedId, setSelectedId]   = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [projectFilter, setProjectFilter] = useState('');
  const [search, setSearch]           = useState('');
  const [fromDate, setFromDate]       = useState('');
  const [toDate, setToDate]           = useState('');
  const qc = useQueryClient();

  const { data: projectsData } = useQuery({
    queryKey: ['projects-all'],
    queryFn: () => projectAPI.list({ status: 'active' }).then(r => r.data?.data || r.data || []).catch(() => []),
  });
  const projects = projectsData || [];

  const queryParams = useMemo(() => ({
    ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
    ...(projectFilter ? { project_id: projectFilter } : {}),
    ...(fromDate ? { from_date: fromDate } : {}),
    ...(toDate   ? { to_date: toDate }     : {}),
    ...(search   ? { search }              : {}),
  }), [statusFilter, projectFilter, fromDate, toDate, search]);

  const { data: listData, isLoading } = useQuery({
    queryKey: ['eway-bills', queryParams],
    queryFn: () => ewayBillAPI.list(queryParams).then(r => r.data?.data || []).catch(() => []),
  });
  const rows = listData || [];

  const cancelMut = useMutation({
    mutationFn: id => ewayBillAPI.cancel(id),
    onSuccess: () => {
      toast.success('E-Way Bill cancelled');
      qc.invalidateQueries({ queryKey: ['eway-bills'] });
      qc.invalidateQueries({ queryKey: ['ewb-detail', selectedId] });
    },
    onError: e => toast.error(e?.response?.data?.error || 'Cancel failed'),
  });

  const allRows = listData || [];
  const kpi = useMemo(() => ({
    total:     allRows.length,
    active:    allRows.filter(r => effectiveStatus(r) === 'active').length,
    expired:   allRows.filter(r => effectiveStatus(r) === 'expired').length,
    cancelled: allRows.filter(r => r.status === 'cancelled').length,
  }), [allRows]);

  return (
    <div className="min-h-screen bg-[#f4f6f9] p-6 md:p-8">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 font-medium mb-1">
            <Truck className="w-3.5 h-3.5" /> Accounts · Taxes
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">E-Way Bills</h1>
          <p className="text-sm text-slate-500 mt-0.5">GST e-Way Bills for inter-state goods movement</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 shadow-sm transition-colors">
          <Plus className="w-4 h-4" /> Add E-Way Bill
        </button>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total',     val: kpi.total,     color: 'text-slate-900' },
          { label: 'Active',    val: kpi.active,    color: 'text-emerald-700' },
          { label: 'Expired',   val: kpi.expired,   color: 'text-amber-600' },
          { label: 'Cancelled', val: kpi.cancelled, color: 'text-red-600' },
        ].map(k => (
          <div key={k.label} className="bg-white border border-slate-200 rounded-xl p-4 text-center shadow-sm">
            <div className={clsx('text-2xl font-semibold font-mono', k.color)}>{k.val}</div>
            <div className="text-xs text-slate-500 font-medium mt-0.5">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 mb-5 flex flex-wrap items-center gap-3 shadow-sm">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search EWB no., vehicle, party…"
            className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-4 py-2 text-sm outline-none focus:border-indigo-400 transition-all" />
        </div>
        <div className="flex items-center gap-1.5">
          {['all','active','expired','cancelled'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={clsx('px-3 py-1.5 rounded-lg text-xs font-medium border transition-all capitalize',
                statusFilter === s ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
              )}>
              {s === 'all' ? 'All' : s}
            </button>
          ))}
        </div>
        <select value={projectFilter} onChange={e => setProjectFilter(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 bg-white text-slate-700 outline-none focus:border-indigo-400">
          <option value="">All Projects</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name || p.project_name}</option>)}
        </select>
        <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 bg-white outline-none focus:border-indigo-400" />
        <span className="text-xs text-slate-400">to</span>
        <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 bg-white outline-none focus:border-indigo-400" />
        {(fromDate || toDate) && (
          <button onClick={() => { setFromDate(''); setToDate(''); }} className="text-xs text-slate-400 hover:text-slate-600">Clear dates</button>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">{[1,2,3,4].map(n => <div key={n} className="h-14 bg-slate-200 animate-pulse rounded-xl" />)}</div>
      ) : rows.length === 0 ? (
        <div className="py-24 text-center border-2 border-dashed border-slate-200 rounded-xl bg-white">
          <Truck className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-500">No e-way bills found</p>
          <p className="text-xs text-slate-400 mt-1">Add a bill using the button above</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="grid grid-cols-12 gap-2 px-4 py-3 border-b border-slate-100 bg-slate-50 text-[11px] font-medium text-slate-500 uppercase tracking-wider">
            <div className="col-span-2">EWB No.</div>
            <div className="col-span-1">Date</div>
            <div className="col-span-3">From → To</div>
            <div className="col-span-2">Vehicle</div>
            <div className="col-span-1 text-right">Value</div>
            <div className="col-span-1">Valid Until</div>
            <div className="col-span-1">Status</div>
            <div className="col-span-1"></div>
          </div>
          <div className="divide-y divide-slate-50">
            {rows.map(r => {
              const eff = effectiveStatus(r);
              const sm = STATUS_META[eff] || STATUS_META.active;
              const isExpiring = eff === 'active' && dayjs(r.valid_until).diff(TODAY, 'day') <= 1;
              return (
                <div key={r.id}
                  className="grid grid-cols-12 gap-2 px-4 py-3.5 items-center hover:bg-slate-50 cursor-pointer transition-colors"
                  onClick={() => setSelectedId(r.id)}>
                  <div className="col-span-2 font-mono text-sm text-blue-700 font-semibold">{r.ewb_no}</div>
                  <div className="col-span-1 text-xs text-slate-600 whitespace-nowrap">{dayjs(r.ewb_date).format('DD MMM YY')}</div>
                  <div className="col-span-3 text-xs text-slate-600">
                    <span className="font-medium text-black">{r.from_city || r.from_state || '—'}</span>
                    <span className="text-slate-400 mx-1">→</span>
                    <span className="font-medium text-black">{r.to_city || r.to_state || '—'}</span>
                    {r.project_name && <div className="text-slate-400 text-[10px]">{r.project_name}</div>}
                  </div>
                  <div className="col-span-2 text-xs font-mono text-slate-600">{r.vehicle_no || '—'}</div>
                  <div className="col-span-1 text-xs font-mono text-right text-black">{inr(r.total_value)}</div>
                  <div className={clsx('col-span-1 text-xs whitespace-nowrap', isExpiring ? 'text-amber-600 font-semibold' : 'text-slate-600')}>
                    {dayjs(r.valid_until).format('DD MMM YY')}
                    {isExpiring && <div className="text-[10px]">Expiring soon!</div>}
                  </div>
                  <div className="col-span-1">
                    <span className={clsx('text-[11px] px-2 py-0.5 rounded-full border font-medium capitalize', sm.cls)}>{sm.label}</span>
                  </div>
                  <div className="col-span-1 flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                    {eff !== 'cancelled' && (
                      <button onClick={() => cancelMut.mutate(r.id)}
                        title="Cancel EWB"
                        className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:border-red-300 hover:text-red-500 transition-all">
                        <Ban className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50 text-xs text-slate-400">
            {rows.length} record{rows.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}

      {/* Detail Panel */}
      {selectedId && (
        <DetailPanel
          id={selectedId}
          onClose={() => setSelectedId(null)}
          onCancel={id => {
            cancelMut.mutate(id);
            setSelectedId(null);
          }}
        />
      )}

      {/* Entry Form */}
      {showForm && (
        <EntryForm
          projects={projects}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            qc.invalidateQueries({ queryKey: ['eway-bills'] });
          }}
        />
      )}
    </div>
  );
}
