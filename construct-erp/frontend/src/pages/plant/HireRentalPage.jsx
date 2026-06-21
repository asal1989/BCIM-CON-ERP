// src/pages/plant/HireRentalPage.jsx — Hire & Rental (unified)
// Commercial back-half for hired plant: Vendor Invoice Entry → QS Certification
// → Approvals → Payment Status, plus Dashboard & Reports. Operational tabs
// (Allocation, Daily Log, Settings) deep-link to the existing Plant pages.
import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  LayoutDashboard, FileText, ShieldCheck, CheckCircle2, CreditCard,
  BarChart3, Plus, Trash2, X, IndianRupee, Clock, AlertTriangle, Truck,
} from 'lucide-react';
import { hireRentalAPI } from '../../api/client';
import { PageHeader, KpiCard as ThemeKpiCard, Theme } from '../../theme';
import dayjs from 'dayjs';
import { clsx } from 'clsx';

const fmt = (n) =>
  n == null || isNaN(n) ? '₹0.00'
  : `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const crore = (n) => {
  const v = Number(n || 0);
  if (Math.abs(v) >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
  if (Math.abs(v) >= 1e5) return `₹${(v / 1e5).toFixed(2)} L`;
  return `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
};

const STATUS_BADGE = {
  draft:     'bg-slate-100 text-slate-600',
  certified: 'bg-blue-100 text-blue-700',
  approved:  'bg-amber-100 text-amber-700',
  paid:      'bg-green-100 text-green-700',
  rejected:  'bg-red-100 text-red-600',
};

const TABS = [
  { key: 'dashboard', label: 'Dashboard',           icon: LayoutDashboard },
  { key: 'invoices',  label: 'Vendor Invoice Entry', icon: FileText },
  { key: 'certify',   label: 'QS Certification',     icon: ShieldCheck },
  { key: 'approvals', label: 'Approvals',            icon: CheckCircle2 },
  { key: 'payments',  label: 'Payment Status',       icon: CreditCard },
  { key: 'reports',   label: 'Reports',              icon: BarChart3 },
];

const inp = 'w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none';

export default function HireRentalPage({ defaultTab = 'dashboard' }) {
  const [tab, setTab] = useState(defaultTab);
  const qc = useQueryClient();

  return (
    <div style={{ background: Theme.pageBg, minHeight: '100vh' }}>
      <PageHeader
        title="Hire & Rental"
        subtitle="Hired-plant invoices, certification, approvals & payments"
        breadcrumbs={[{ label: 'Plant & Machinery' }, { label: 'Hire & Rental' }]}
      />
      <div className="p-4 md:p-6 max-w-[1400px] mx-auto">
        {/* Tab bar */}
        <div className="flex gap-1 overflow-x-auto mb-5 bg-white rounded-xl border border-slate-200 p-1 shadow-sm">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={clsx('flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-lg whitespace-nowrap transition',
                tab === t.key ? 'bg-blue-600 text-white shadow' : 'text-slate-500 hover:bg-slate-100')}>
              <t.icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          ))}
        </div>

        {tab === 'dashboard' && <DashboardTab />}
        {tab === 'invoices'  && <InvoicesTab qc={qc} />}
        {tab === 'certify'   && <CertifyTab qc={qc} />}
        {tab === 'approvals' && <ApprovalsTab qc={qc} />}
        {tab === 'payments'  && <PaymentsTab qc={qc} />}
        {tab === 'reports'   && <ReportsTab />}
      </div>
    </div>
  );
}

// ── Dashboard ────────────────────────────────────────────────────────────────
function DashboardTab() {
  const { data = {} } = useQuery({ queryKey: ['hr-dashboard'], queryFn: () => hireRentalAPI.dashboard().then(r => r.data?.data || {}) });
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
      <ThemeKpiCard icon={Truck}         label="Active Hire Orders" value={data.active_orders ?? 0}              color="blue"   sub="On rent" />
      <ThemeKpiCard icon={Clock}         label="Pending Invoices"   value={crore(data.pending_value)}           color="amber"  sub={`${data.pending_count ?? 0} draft/certified`} />
      <ThemeKpiCard icon={CheckCircle2}  label="Approved Unpaid"    value={crore(data.approved_unpaid)}         color="violet" sub="Awaiting payment" />
      <ThemeKpiCard icon={IndianRupee}   label="Paid"               value={crore(data.paid_value)}              color="green"  sub="Settled" />
      <ThemeKpiCard icon={ShieldCheck}   label="Certification Savings" value={crore(data.certification_savings)} color="emerald" sub="Invoiced − certified" />
    </div>
  );
}

// ── Vendor Invoice Entry ─────────────────────────────────────────────────────
function InvoicesTab({ qc }) {
  const [showForm, setShowForm] = useState(false);
  const { data: invoices = [], isLoading } = useQuery({ queryKey: ['hr-invoices'], queryFn: () => hireRentalAPI.listInvoices().then(r => r.data?.data || []) });

  const del = useMutation({
    mutationFn: (id) => hireRentalAPI.deleteInvoice(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hr-invoices'] }),
  });

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <h2 className="text-sm font-bold text-slate-700">All Vendor Invoices</h2>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-lg bg-blue-600 text-white shadow-sm hover:bg-blue-700">
          <Plus className="w-3.5 h-3.5" /> New Invoice
        </button>
      </div>
      <InvoiceTable invoices={invoices} isLoading={isLoading}
        actions={(inv) => inv.status === 'draft' || inv.status === 'rejected'
          ? <button onClick={() => del.mutate(inv.id)} className="text-red-500 hover:text-red-700"><Trash2 className="w-3.5 h-3.5" /></button>
          : null} />
      {showForm && <InvoiceFormModal qc={qc} onClose={() => setShowForm(false)} />}
    </div>
  );
}

function InvoiceTable({ invoices, isLoading, actions }) {
  if (isLoading) return <div className="space-y-2">{[1,2,3].map(n => <div key={n} className="h-10 bg-slate-100 rounded-lg animate-pulse" />)}</div>;
  if (!invoices.length) return <div className="py-12 text-center text-xs text-slate-400 bg-white rounded-xl border border-slate-200">No invoices</div>;
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-100">
            {['Invoice No', 'Vendor', 'Equipment', 'Date', 'Invoiced', 'Certified', 'Total', 'Status', ''].map(h => (
              <th key={h} className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {invoices.map(inv => (
            <tr key={inv.id} className="hover:bg-slate-50">
              <td className="px-3 py-2.5 text-xs font-bold text-slate-700">{inv.invoice_no || '—'}<div className="text-[10px] font-normal text-slate-400">{inv.order_no}</div></td>
              <td className="px-3 py-2.5 text-xs text-slate-600">{inv.vendor_name || '—'}</td>
              <td className="px-3 py-2.5 text-xs text-slate-600">{inv.equipment_desc || '—'}</td>
              <td className="px-3 py-2.5 text-xs text-slate-500">{inv.invoice_date ? dayjs(inv.invoice_date).format('DD MMM YY') : '—'}</td>
              <td className="px-3 py-2.5 text-xs text-slate-700">{fmt(inv.gross_amount)}</td>
              <td className="px-3 py-2.5 text-xs font-semibold text-blue-700">{inv.certified_amount > 0 ? fmt(inv.certified_amount) : '—'}</td>
              <td className="px-3 py-2.5 text-xs font-bold text-slate-800">{fmt(inv.total_amount)}</td>
              <td className="px-3 py-2.5"><span className={clsx('px-2 py-0.5 rounded-full text-[9px] font-bold uppercase', STATUS_BADGE[inv.status])}>{inv.status}</span></td>
              <td className="px-3 py-2.5">{actions ? actions(inv) : null}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InvoiceFormModal({ qc, onClose }) {
  const { data: orders = [] } = useQuery({ queryKey: ['hr-orders'], queryFn: () => hireRentalAPI.orders().then(r => r.data?.data || []) });
  const [form, setForm] = useState({ hire_order_id: '', invoice_no: '', invoice_date: dayjs().format('YYYY-MM-DD'), period_from: '', period_to: '', gst_rate: 18, tcs_amount: 0, remarks: '' });
  const [lines, setLines] = useState([{ description: '', usage_category: '', invoiced_qty: '', rate: '' }]);
  const selectedOrder = orders.find(o => o.id === form.hire_order_id);

  const create = useMutation({
    mutationFn: (payload) => hireRentalAPI.createInvoice(payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-invoices'] }); qc.invalidateQueries({ queryKey: ['hr-dashboard'] }); onClose(); },
  });

  const setLine = (i, k, v) => setLines(ls => ls.map((l, idx) => idx === i ? { ...l, [k]: v } : l));
  const addLine = () => setLines(ls => [...ls, { description: '', usage_category: '', invoiced_qty: '', rate: '' }]);
  const rmLine = (i) => setLines(ls => ls.filter((_, idx) => idx !== i));
  const gross = lines.reduce((s, l) => s + (Number(l.invoiced_qty || 0) * Number(l.rate || 0)), 0);
  const gst = gross * Number(form.gst_rate || 0) / 100;
  const total = gross + gst + Number(form.tcs_amount || 0);

  const submit = () => {
    if (!form.hire_order_id) return alert('Select a hire order');
    create.mutate({ ...form, lines: lines.filter(l => Number(l.invoiced_qty) || Number(l.rate) || l.description) });
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center px-5 py-3.5 border-b border-slate-100 sticky top-0 bg-white">
          <h2 className="font-bold text-slate-800 text-sm">New Vendor Invoice</h2>
          <button onClick={onClose}><X className="w-4 h-4 text-slate-400" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="md:col-span-3">
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Hire Work Order *</label>
              <select className={inp} value={form.hire_order_id} onChange={e => setForm(f => ({ ...f, hire_order_id: e.target.value }))}>
                <option value="">Select hire order…</option>
                {orders.map(o => <option key={o.id} value={o.id}>{o.order_no} — {o.vendor_name || o.equipment_desc} ({o.rate_type} @ ₹{o.hire_rate})</option>)}
              </select>
            </div>
            <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Invoice No</label><input className={inp} value={form.invoice_no} onChange={e => setForm(f => ({ ...f, invoice_no: e.target.value }))} /></div>
            <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Invoice Date</label><input type="date" className={inp} value={form.invoice_date} onChange={e => setForm(f => ({ ...f, invoice_date: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Period From</label><input type="date" className={inp} value={form.period_from} onChange={e => setForm(f => ({ ...f, period_from: e.target.value }))} /></div>
              <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">To</label><input type="date" className={inp} value={form.period_to} onChange={e => setForm(f => ({ ...f, period_to: e.target.value }))} /></div>
            </div>
          </div>
          {selectedOrder && <div className="text-[11px] text-slate-500 bg-slate-50 rounded-lg px-3 py-2">Project: <b>{selectedOrder.project_name || '—'}</b> · Rate: {selectedOrder.rate_type} @ ₹{selectedOrder.hire_rate}</div>}

          {/* Lines */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase">Invoice Lines (as billed by vendor)</label>
              <button onClick={addLine} className="text-[11px] font-bold text-blue-600 flex items-center gap-1"><Plus className="w-3 h-3" /> Add Line</button>
            </div>
            <div className="space-y-1.5">
              {lines.map((l, i) => (
                <div key={i} className="grid grid-cols-12 gap-1.5 items-center">
                  <input className={clsx(inp, 'col-span-4')} placeholder="Description" value={l.description} onChange={e => setLine(i, 'description', e.target.value)} />
                  <input className={clsx(inp, 'col-span-3')} placeholder="Category (e.g. Upto 3 Hrs)" value={l.usage_category} onChange={e => setLine(i, 'usage_category', e.target.value)} />
                  <input className={clsx(inp, 'col-span-2 text-right')} type="number" placeholder="Qty" value={l.invoiced_qty} onChange={e => setLine(i, 'invoiced_qty', e.target.value)} />
                  <input className={clsx(inp, 'col-span-2 text-right')} type="number" placeholder="Rate" value={l.rate} onChange={e => setLine(i, 'rate', e.target.value)} />
                  <button onClick={() => rmLine(i)} className="col-span-1 text-red-400 hover:text-red-600 flex justify-center"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">GST %</label><input type="number" className={inp} value={form.gst_rate} onChange={e => setForm(f => ({ ...f, gst_rate: e.target.value }))} /></div>
            <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">TCS Amount</label><input type="number" className={inp} value={form.tcs_amount} onChange={e => setForm(f => ({ ...f, tcs_amount: e.target.value }))} /></div>
          </div>

          <div className="flex justify-end gap-5 text-xs border-t border-slate-100 pt-3">
            <span className="text-slate-500">Gross: <b className="text-slate-700">{fmt(gross)}</b></span>
            <span className="text-slate-500">GST: <b className="text-slate-700">{fmt(gst)}</b></span>
            <span className="text-slate-500">Total: <b className="text-slate-900">{fmt(total)}</b></span>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-slate-100 sticky bottom-0 bg-white">
          <button onClick={onClose} className="px-4 py-2 text-xs font-bold text-slate-500 rounded-lg hover:bg-slate-100">Cancel</button>
          <button onClick={submit} disabled={create.isPending} className="px-4 py-2 text-xs font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">{create.isPending ? 'Saving…' : 'Save Draft'}</button>
        </div>
      </div>
    </div>
  );
}

// ── QS Certification ─────────────────────────────────────────────────────────
function CertifyTab({ qc }) {
  const [active, setActive] = useState(null);
  const { data: invoices = [], isLoading } = useQuery({ queryKey: ['hr-invoices'], queryFn: () => hireRentalAPI.listInvoices().then(r => r.data?.data || []) });
  const drafts = invoices.filter(i => i.status === 'draft');
  return (
    <div>
      <h2 className="text-sm font-bold text-slate-700 mb-3">Awaiting Certification ({drafts.length})</h2>
      <InvoiceTable invoices={drafts} isLoading={isLoading}
        actions={(inv) => <button onClick={() => setActive(inv.id)} className="text-[11px] font-bold text-blue-600 hover:text-blue-800">Certify →</button>} />
      {active && <CertifyModal id={active} qc={qc} onClose={() => setActive(null)} />}
    </div>
  );
}

function CertifyModal({ id, qc, onClose }) {
  const { data: inv } = useQuery({ queryKey: ['hr-invoice', id], queryFn: () => hireRentalAPI.getInvoice(id).then(r => r.data?.data) });
  const [certQty, setCertQty] = useState({});
  React.useEffect(() => { if (inv?.lines) setCertQty(Object.fromEntries(inv.lines.map(l => [l.id, l.certified_qty > 0 ? l.certified_qty : l.invoiced_qty]))); }, [inv]);

  const certify = useMutation({
    mutationFn: () => hireRentalAPI.certify(id, { lines: Object.entries(certQty).map(([lid, q]) => ({ id: lid, certified_qty: q })) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-invoices'] }); qc.invalidateQueries({ queryKey: ['hr-dashboard'] }); onClose(); },
  });
  const reject = useMutation({
    mutationFn: () => hireRentalAPI.reject(id, { remarks: 'Rejected at certification' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-invoices'] }); onClose(); },
  });

  if (!inv) return null;
  const certTotal = (inv.lines || []).reduce((s, l) => s + (Number(certQty[l.id] || 0) * Number(l.rate || 0)), 0);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center px-5 py-3.5 border-b border-slate-100">
          <div><h2 className="font-bold text-slate-800 text-sm">QS Certification — {inv.invoice_no || inv.order_no}</h2>
            <p className="text-[11px] text-slate-400">{inv.vendor_name} · {inv.equipment_desc}</p></div>
          <button onClick={onClose}><X className="w-4 h-4 text-slate-400" /></button>
        </div>
        <div className="p-5">
          <p className="text-[11px] text-slate-500 mb-3 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> Certify the quantity actually used (per the log sheet). Reduce where the invoice over-claims.</p>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-100 text-[10px] uppercase text-slate-400">
              <th className="text-left py-1.5">Description</th><th className="text-right">Invoiced Qty</th><th className="text-right">Rate</th><th className="text-right w-28">Certified Qty</th><th className="text-right">Cert. Amount</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-50">
              {(inv.lines || []).map(l => (
                <tr key={l.id}>
                  <td className="py-2 text-xs text-slate-600">{l.description || l.usage_category || '—'}</td>
                  <td className="py-2 text-xs text-right text-slate-500">{Number(l.invoiced_qty)}</td>
                  <td className="py-2 text-xs text-right text-slate-500">{fmt(l.rate)}</td>
                  <td className="py-2 text-right"><input type="number" className={clsx(inp, 'text-right w-24 ml-auto')} value={certQty[l.id] ?? ''} onChange={e => setCertQty(q => ({ ...q, [l.id]: e.target.value }))} /></td>
                  <td className="py-2 text-xs text-right font-semibold text-blue-700">{fmt(Number(certQty[l.id] || 0) * Number(l.rate || 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-end mt-3 text-xs"><span className="text-slate-500">Certified Basic: <b className="text-slate-900">{fmt(certTotal)}</b></span></div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-slate-100">
          <button onClick={() => reject.mutate()} className="px-4 py-2 text-xs font-bold text-red-600 rounded-lg hover:bg-red-50">Reject</button>
          <button onClick={() => certify.mutate()} disabled={certify.isPending} className="px-4 py-2 text-xs font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">{certify.isPending ? 'Certifying…' : 'Certify'}</button>
        </div>
      </div>
    </div>
  );
}

// ── Approvals ────────────────────────────────────────────────────────────────
function ApprovalsTab({ qc }) {
  const { data: invoices = [], isLoading } = useQuery({ queryKey: ['hr-invoices'], queryFn: () => hireRentalAPI.listInvoices().then(r => r.data?.data || []) });
  const certified = invoices.filter(i => i.status === 'certified');
  const approve = useMutation({ mutationFn: (id) => hireRentalAPI.approve(id), onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-invoices'] }); qc.invalidateQueries({ queryKey: ['hr-dashboard'] }); } });
  const reject  = useMutation({ mutationFn: (id) => hireRentalAPI.reject(id, { remarks: 'Rejected at approval' }), onSuccess: () => qc.invalidateQueries({ queryKey: ['hr-invoices'] }) });
  return (
    <div>
      <h2 className="text-sm font-bold text-slate-700 mb-3">Awaiting Approval ({certified.length})</h2>
      <InvoiceTable invoices={certified} isLoading={isLoading}
        actions={(inv) => (
          <div className="flex gap-2">
            <button onClick={() => approve.mutate(inv.id)} className="text-[11px] font-bold text-green-600 hover:text-green-800">Approve</button>
            <button onClick={() => reject.mutate(inv.id)} className="text-[11px] font-bold text-red-500 hover:text-red-700">Reject</button>
          </div>
        )} />
    </div>
  );
}

// ── Payment Status ───────────────────────────────────────────────────────────
function PaymentsTab({ qc }) {
  const [payFor, setPayFor] = useState(null);
  const { data: invoices = [], isLoading } = useQuery({ queryKey: ['hr-invoices'], queryFn: () => hireRentalAPI.listInvoices().then(r => r.data?.data || []) });
  const approved = invoices.filter(i => i.status === 'approved');
  const paid = invoices.filter(i => i.status === 'paid');
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-bold text-slate-700 mb-3">Approved — Awaiting Payment ({approved.length})</h2>
        <InvoiceTable invoices={approved} isLoading={isLoading}
          actions={(inv) => <button onClick={() => setPayFor(inv)} className="text-[11px] font-bold text-green-600 hover:text-green-800">Record Payment →</button>} />
      </div>
      <div>
        <h2 className="text-sm font-bold text-slate-700 mb-3">Paid ({paid.length})</h2>
        <InvoiceTable invoices={paid} isLoading={isLoading} actions={null} />
      </div>
      {payFor && <PayModal inv={payFor} qc={qc} onClose={() => setPayFor(null)} />}
    </div>
  );
}

function PayModal({ inv, qc, onClose }) {
  const [form, setForm] = useState({ payment_date: dayjs().format('YYYY-MM-DD'), payment_mode: 'NEFT', payment_ref: '', amount_paid: inv.total_amount });
  const pay = useMutation({
    mutationFn: () => hireRentalAPI.pay(inv.id, form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-invoices'] }); qc.invalidateQueries({ queryKey: ['hr-dashboard'] }); onClose(); },
  });
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center px-5 py-3.5 border-b border-slate-100">
          <h2 className="font-bold text-slate-800 text-sm">Record Payment — {inv.invoice_no || inv.order_no}</h2>
          <button onClick={onClose}><X className="w-4 h-4 text-slate-400" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div className="text-xs text-slate-500">Payable Total: <b className="text-slate-900">{fmt(inv.total_amount)}</b></div>
          <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Payment Date *</label><input type="date" className={inp} value={form.payment_date} onChange={e => setForm(f => ({ ...f, payment_date: e.target.value }))} /></div>
          <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Mode *</label>
            <select className={inp} value={form.payment_mode} onChange={e => setForm(f => ({ ...f, payment_mode: e.target.value }))}>
              {['NEFT', 'RTGS', 'Cheque', 'UPI', 'Cash'].map(m => <option key={m}>{m}</option>)}
            </select></div>
          <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Reference</label><input className={inp} value={form.payment_ref} onChange={e => setForm(f => ({ ...f, payment_ref: e.target.value }))} /></div>
          <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Amount Paid</label><input type="number" className={inp} value={form.amount_paid} onChange={e => setForm(f => ({ ...f, amount_paid: e.target.value }))} /></div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 text-xs font-bold text-slate-500 rounded-lg hover:bg-slate-100">Cancel</button>
          <button onClick={() => pay.mutate()} disabled={pay.isPending} className="px-4 py-2 text-xs font-bold text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50">{pay.isPending ? 'Saving…' : 'Mark Paid'}</button>
        </div>
      </div>
    </div>
  );
}

// ── Reports ──────────────────────────────────────────────────────────────────
function ReportsTab() {
  const { data: rows = [], isLoading } = useQuery({ queryKey: ['hr-report-orders'], queryFn: () => hireRentalAPI.reportOrders().then(r => r.data?.data || []) });
  const tot = useMemo(() => rows.reduce((a, r) => ({
    invoiced: a.invoiced + Number(r.invoiced_value || 0),
    certified: a.certified + Number(r.certified_value || 0),
    payable: a.payable + Number(r.payable_value || 0),
    paid: a.paid + Number(r.paid_value || 0),
  }), { invoiced: 0, certified: 0, payable: 0, paid: 0 }), [rows]);
  if (isLoading) return <div className="space-y-2">{[1,2,3].map(n => <div key={n} className="h-10 bg-slate-100 rounded-lg animate-pulse" />)}</div>;
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto shadow-sm">
      <table className="w-full text-sm">
        <thead><tr className="bg-slate-50 border-b border-slate-100 text-[10px] uppercase tracking-wider text-slate-400">
          {['Order No', 'Vendor', 'Equipment', 'Project', 'Invoices', 'Invoiced', 'Certified', 'Payable', 'Paid'].map(h => <th key={h} className="px-3 py-2.5 text-left">{h}</th>)}
        </tr></thead>
        <tbody className="divide-y divide-slate-50">
          {rows.map((r, i) => (
            <tr key={i} className="hover:bg-slate-50">
              <td className="px-3 py-2.5 text-xs font-bold text-slate-700">{r.order_no}</td>
              <td className="px-3 py-2.5 text-xs text-slate-600">{r.vendor_name || '—'}</td>
              <td className="px-3 py-2.5 text-xs text-slate-600">{r.equipment_desc || '—'}</td>
              <td className="px-3 py-2.5 text-xs text-slate-500">{r.project_name || '—'}</td>
              <td className="px-3 py-2.5 text-xs text-center text-slate-500">{r.invoice_count}</td>
              <td className="px-3 py-2.5 text-xs text-slate-700">{fmt(r.invoiced_value)}</td>
              <td className="px-3 py-2.5 text-xs font-semibold text-blue-700">{fmt(r.certified_value)}</td>
              <td className="px-3 py-2.5 text-xs font-semibold text-amber-700">{fmt(r.payable_value)}</td>
              <td className="px-3 py-2.5 text-xs font-bold text-green-700">{fmt(r.paid_value)}</td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={9} className="py-12 text-center text-xs text-slate-400">No hire orders</td></tr>}
        </tbody>
        {rows.length > 0 && (
          <tfoot><tr className="bg-slate-800 text-white font-bold text-xs">
            <td className="px-3 py-2.5" colSpan={5}>TOTAL</td>
            <td className="px-3 py-2.5">{fmt(tot.invoiced)}</td>
            <td className="px-3 py-2.5 text-blue-300">{fmt(tot.certified)}</td>
            <td className="px-3 py-2.5 text-amber-300">{fmt(tot.payable)}</td>
            <td className="px-3 py-2.5 text-green-300">{fmt(tot.paid)}</td>
          </tr></tfoot>
        )}
      </table>
    </div>
  );
}
