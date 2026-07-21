// src/pages/qs/VendorQSCertificationPage.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import useAuthStore from '../../store/authStore';

// Only this user may approve a certification and move it to Accounts —
// must match CERT_APPROVER_EMAIL in backend/src/routes/vendor-qs-certification.routes.js
const CERT_APPROVER_EMAIL = 'prithivi@bcim.in';
import {
  vendorQSCertificationAPI,
  projectAPI,
  tqsVendorsAPI,
  tqsBillsAPI,
} from '../../api/client';
import {
  Award,
  FileCheck2,
  FileText,
  IndianRupee,
  Plus,
  RefreshCw,
  Search,
  Send,
  Printer,
  X,
  Pencil,
  Trash2,
} from 'lucide-react';

const inr = (v) => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN') : '-';
const fieldCls = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-400 bg-white';

function statusClass(status) {
  const map = {
    draft: 'bg-slate-100 text-slate-700',
    certified: 'bg-emerald-100 text-emerald-700',
    accounts: 'bg-indigo-100 text-indigo-700',
    paid: 'bg-blue-100 text-blue-700',
    cancelled: 'bg-red-100 text-red-700',
    rejected: 'bg-orange-100 text-orange-700',
  };
  return map[status] || map.draft;
}

function RejectCertModal({ cert, onClose, onConfirm, isPending }) {
  const [remarks, setRemarks] = useState('');
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-900">Reject Certification</h3>
          <p className="text-xs text-slate-500 mt-0.5">{cert.cert_number} · {cert.vendor_name} — sends the linked bills back to QS for correction.</p>
        </div>
        <div className="p-5">
          <label className="block text-xs font-medium text-slate-700 mb-1">Reason (required)</label>
          <textarea rows={3} autoFocus className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-300"
            placeholder="What needs to be corrected?" value={remarks} onChange={e => setRemarks(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600">Cancel</button>
          <button
            onClick={() => remarks.trim() ? onConfirm(remarks.trim()) : toast.error('A reason is required')}
            disabled={isPending}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
          >
            {isPending ? 'Rejecting…' : 'Reject & Send Back'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Suggests the company's own certificate number format:
// P26/PO<last-2-digits-of-PO/WO-number>/XXXX/<vendor-first-3-letters>
// The XXXX sequence is always left as a literal placeholder — the user
// tracks and fills that part in manually (their own physical register).
function suggestCertNumber(vendorName, orderNumber) {
  const ven = (vendorName || '').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase();
  const digits = (orderNumber || '').replace(/\D/g, '');
  const poSuffix = digits ? digits.slice(-2).padStart(2, '0') : '';
  return `P26/PO${poSuffix}/XXXX/${ven}`;
}

function CertificationModal({ onClose, projects, vendors, initialData = {} }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    project_id: '',
    vendor_id: '',
    vendor_name: '',
    order_type: 'po',
    order_number: '',
    cert_number: '',
    qs_received_date: new Date().toISOString().slice(0, 10),
    qs_certified_date: new Date().toISOString().slice(0, 10),
    ra_sequence: 1,
    ra_bill_number: '',
    gst_tax: '',
    tds_rate: '',      // e.g. 0, 1, 2
    tds_amount: '',    // auto-calculated or manual override
    advance_recovered: '',
    retention_amount: '',
    other_deductions: '',
    is_final_bill: false,
    remarks: '',
    ...initialData,   // pre-fill from caller (e.g. vendor_name, order_type, order_number)
  });
  const [selectedBillIds, setSelectedBillIds] = useState([]);
  const [summaryRows, setSummaryRows] = useState([]);
  const [certNumberTouched, setCertNumberTouched] = useState(false);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // Re-suggest the certificate number whenever vendor/PO changes, unless the
  // user has already started editing it themselves.
  useEffect(() => {
    if (certNumberTouched) return;
    if (!form.vendor_name) return;
    set('cert_number', suggestCertNumber(form.vendor_name, form.order_number));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.vendor_name, form.order_number, certNumberTouched]);

  const { data: pos = [] } = useQuery({
    queryKey: ['vendor-cert-pos', form.project_id, form.vendor_id, form.vendor_name],
    queryFn: () => tqsBillsAPI.lookupPOs({
      ...(form.project_id ? { project_id: form.project_id } : {}),
      ...(form.vendor_id ? { vendor_id: form.vendor_id } : form.vendor_name ? { vendor_name: form.vendor_name } : {}),
    }).then(r => r.data?.data ?? []),
    enabled: form.order_type === 'po' && !!form.vendor_name,
  });

  const { data: wos = [] } = useQuery({
    queryKey: ['vendor-cert-wos', form.project_id, form.vendor_id, form.vendor_name],
    queryFn: () => tqsBillsAPI.lookupWOs({
      ...(form.project_id ? { project_id: form.project_id } : {}),
      ...(form.vendor_id ? { vendor_id: form.vendor_id } : form.vendor_name ? { vendor_name: form.vendor_name } : {}),
    }).then(r => r.data?.data ?? []),
    enabled: form.order_type === 'wo' && !!form.vendor_name,
  });

  const { data: invoices = [], isFetching: loadingInvoices } = useQuery({
    queryKey: ['vendor-cert-pending-invoices', form.project_id, form.vendor_id, form.vendor_name, form.order_type, form.order_number],
    queryFn: () => vendorQSCertificationAPI.pendingInvoices({
      project_id: form.project_id || undefined,
      vendor_id: form.vendor_id || undefined,
      vendor_name: form.vendor_name || undefined,
      order_type: form.order_type,
      order_number: form.order_number || undefined,
    }).then(r => r.data?.data ?? []),
    enabled: !!form.project_id && !!form.vendor_name && !!form.order_type,
  });

  const { data: pendingAdvance = {}, isFetching: loadingAdvance } = useQuery({
    queryKey: ['vendor-cert-pending-advance', form.project_id, form.vendor_id, form.vendor_name, form.order_type, form.order_number],
    queryFn: () => tqsBillsAPI.pendingAdvances({
      project_id: form.project_id || undefined,
      vendor_id: form.vendor_id || undefined,
      vendor_name: form.vendor_name || undefined,
      ...(form.order_type === 'wo' && form.order_number ? { wo_number: form.order_number } : {}),
      ...(form.order_type === 'po' && form.order_number ? { po_number: form.order_number } : {}),
    }).then(r => r.data?.data ?? {}),
    enabled: !!form.project_id && !!form.vendor_name,
  });

  const pendingAdvanceBalance = Number(pendingAdvance?.pending_balance || 0);

  useEffect(() => {
    // Always sync advance_recovered to the pending balance when it changes
    // (clears stale value from a previous vendor/WO selection)
    if (pendingAdvanceBalance > 0) {
      set('advance_recovered', pendingAdvanceBalance.toFixed(2));
    } else {
      set('advance_recovered', '');
    }
  }, [pendingAdvanceBalance]);

  const totals = useMemo(() => {
    const selected = invoices.filter(b => selectedBillIds.includes(b.id));
    const gross = summaryRows.reduce((s, r) => s + Number(r.amount || 0), 0);
    const autoTax = summaryRows.reduce((s, r) => s + Number(r.tax_amount || 0), 0);
    const tax = form.gst_tax !== '' ? Number(form.gst_tax || 0) : autoTax;
    const deductions = Number(form.tds_amount || 0) + Number(form.advance_recovered || 0) + Number(form.retention_amount || 0) + Number(form.other_deductions || 0);
    const invoiceTotal = selected.reduce((s, b) => s + Number(b.total_amount || 0), 0);
    return {
      invoiceTotal,
      count: selected.length,
      gross,
      autoTax,
      tax,
      deductions,
      // Net = invoice total (what vendor billed, incl. GST) minus deductions.
      // Do NOT use summaryRows gross here — it is the QS-certified work value
      // (excl. GST), which causes net < invoice when GST is embedded in total_amount.
      net: invoiceTotal - deductions,
    };
  }, [invoices, selectedBillIds, summaryRows, form.gst_tax, form.tds_amount, form.advance_recovered, form.retention_amount, form.other_deductions]);

  const loadSummaryMut = useMutation({
    mutationFn: () => vendorQSCertificationAPI.summaryItems({ bill_ids: selectedBillIds }),
    onSuccess: (res) => {
      const rows = res.data?.data?.items ?? [];
      setSummaryRows(rows);
      toast.success('Summary sheet loaded for editing');
    },
    onError: (err) => toast.error(err?.response?.data?.error || 'Failed to load summary items'),
  });

  const createMut = useMutation({
    mutationFn: () => vendorQSCertificationAPI.create({
      ...form,
      bill_ids: selectedBillIds,
      summary_items: summaryRows,
    }),
    onSuccess: () => {
      toast.success('Vendor QS certification created');
      qc.invalidateQueries({ queryKey: ['vendor-qs-certifications'] });
      onClose();
    },
    onError: (err) => toast.error(err?.response?.data?.error || 'Failed to create certification'),
  });

  const handleVendorChange = (id) => {
    const vendor = vendors.find(v => v.id === id);
    const rate = vendor?.tds_rate != null ? String(vendor.tds_rate) : '0';
    setForm(p => ({
      ...p,
      vendor_id: id,
      vendor_name: vendor?.name || '',
      order_number: '',
      tds_rate: rate,
      tds_amount: '',   // will be recalculated by effect below
    }));
    setSelectedBillIds([]);
    setSummaryRows([]);
  };

  // TDS is deducted on basic amount only (excl. GST) per CBDT Circular 23/2017.
  useEffect(() => {
    const rate = Number(form.tds_rate || 0);
    if (!rate) { set('tds_amount', ''); return; }
    const tdsBase = invoices
      .filter(b => selectedBillIds.includes(b.id))
      .reduce((s, b) => s + Number(b.basic_amount || 0), 0);
    if (!tdsBase) return;
    set('tds_amount', String(Math.round(tdsBase * rate / 100)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.tds_rate, selectedBillIds, invoices]);

  const handleOrderType = (type) => {
    setForm(p => ({ ...p, order_type: type, order_number: '' }));
    setSelectedBillIds([]);
    setSummaryRows([]);
  };

  const orderOptions = form.order_type === 'wo'
    ? wos.map(w => ({ value: w.wo_number, label: `${w.wo_number} - Rs ${inr(w.total_amount)}` }))
    : pos.map(p => ({ value: p.po_number, label: `${p.po_number} - Rs ${inr(p.total_amount)}` }));

  const toggleBill = (id) => {
    setSelectedBillIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    setSummaryRows([]);
  };

  const updateSummaryRow = (idx, key, value) => {
    setSummaryRows(prev => prev.map((row, i) => {
      if (i !== idx) return row;
      const next = { ...row, [key]: value };
      if (['qs_pres_qty', 'qs_prev_qty', 'order_rate', 'inv_pres_qty'].includes(key)) {
        next.amount = Number(next.qs_pres_qty || 0) * Number(next.order_rate || 0);
        next.balance_qty = Math.max(0, Number(next.order_qty || 0) - Number(next.qs_prev_qty || 0) - Number(next.qs_pres_qty || 0));
      }
      return next;
    }));
  };

  return (
    <div className="fixed inset-0 z-50 bg-white flex items-center justify-center">
      <div className="bg-white w-screen h-screen overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-medium text-slate-900">New Vendor QS Certification</h2>
            <p className="text-xs text-slate-900 font-medium mt-0.5">Select invoices, type the RA abstract summary, then print the payment certificate.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg border border-slate-200 text-slate-900 font-medium hover:text-slate-800">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5">
          <div className="grid xl:grid-cols-4 md:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-medium text-slate-900 font-medium uppercase">Project</label>
              <select className={fieldCls} value={form.project_id} onChange={e => { set('project_id', e.target.value); setSelectedBillIds([]); }}>
                <option value="">Select project</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-medium text-slate-900 font-medium uppercase">Vendor</label>
              <select className={fieldCls} value={form.vendor_id} onChange={e => handleVendorChange(e.target.value)}>
                <option value="">Select vendor</option>
                {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-medium text-slate-900 font-medium uppercase">Order Type</label>
              <select className={fieldCls} value={form.order_type} onChange={e => handleOrderType(e.target.value)}>
                <option value="po">Purchase Order</option>
                <option value="wo">Work Order</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] font-medium text-slate-900 font-medium uppercase">PO / WO Number</label>
              <select className={fieldCls} value={form.order_number} onChange={e => { setForm(p => ({ ...p, order_number: e.target.value, advance_recovered: '' })); setSelectedBillIds([]); }}>
                <option value="">All vendor orders</option>
                {orderOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid xl:grid-cols-7 md:grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] font-medium text-slate-900 font-medium uppercase">RA Sequence</label>
              <input type="number" min="1" className={fieldCls} value={form.ra_sequence} onChange={e => set('ra_sequence', e.target.value)} />
            </div>
            <div>
              <label className="text-[11px] font-medium text-slate-900 font-medium uppercase">RA Bill Number</label>
              <input className={fieldCls} placeholder={`RA-${form.ra_sequence}`} value={form.ra_bill_number} onChange={e => set('ra_bill_number', e.target.value)} />
            </div>
            <div>
              <label className="text-[11px] font-medium text-slate-900 uppercase flex items-center gap-1">
                Certificate No.
                <span className="text-[10px] text-slate-400 font-normal normal-case">(edit XXXX)</span>
              </label>
              <input
                className={fieldCls}
                placeholder="P26/PO06/XXXX/VEN"
                value={form.cert_number}
                onChange={e => { setCertNumberTouched(true); set('cert_number', e.target.value); }}
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-slate-900 font-medium uppercase">QS Received Date</label>
              <input type="date" className={fieldCls} value={form.qs_received_date} onChange={e => set('qs_received_date', e.target.value)} />
            </div>
            <div>
              <label className="text-[11px] font-medium text-slate-900 font-medium uppercase">QS Certified Date</label>
              <input type="date" className={fieldCls} value={form.qs_certified_date} onChange={e => set('qs_certified_date', e.target.value)} />
            </div>
            <div>
              <label className="text-[11px] font-medium text-slate-900 uppercase flex items-center gap-1">
                TDS Rate
                <span className="text-[10px] text-slate-400 font-normal normal-case">(auto from vendor type)</span>
              </label>
              <select
                className={fieldCls}
                value={form.tds_rate}
                onChange={e => set('tds_rate', e.target.value)}
              >
                <option value="">No TDS (0%)</option>
                <option value="1">1% — Individual / Labour Contractor (Sec 194C)</option>
                <option value="2">2% — Company / Subcontractor / Service (Sec 194C)</option>
                <option value="10">10% — Professional Services (Sec 194J)</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] font-medium text-slate-900 uppercase flex items-center gap-1">
                TDS Amount
                {form.tds_rate && Number(form.tds_rate) > 0 && (
                  <span className="text-[10px] text-emerald-600 font-normal normal-case">
                    ({form.tds_rate}% of gross — editable)
                  </span>
                )}
              </label>
              <input type="number" className={fieldCls} value={form.tds_amount}
                onChange={e => set('tds_amount', e.target.value)}
                placeholder={form.tds_rate ? `Auto: ${form.tds_rate}% of gross` : '0'} />
            </div>
            <div>
              <label className="text-[11px] font-medium text-slate-900 font-medium uppercase">Advance Recovery</label>
              <input type="number" className={fieldCls} value={form.advance_recovered} onChange={e => set('advance_recovered', e.target.value)} />
              <div className="mt-1 min-h-[18px] text-[11px]">
                {loadingAdvance ? (
                  <span className="text-slate-400">Checking advance...</span>
                ) : pendingAdvanceBalance > 0 ? (
                  <button
                    type="button"
                    onClick={() => set('advance_recovered', pendingAdvanceBalance.toFixed(2))}
                    className="font-medium text-orange-700 hover:underline"
                    title="Click to fill pending advance balance"
                  >
                    Pending advance Rs {inr(pendingAdvanceBalance)}
                  </button>
                ) : (
                  <span className="text-slate-400">No pending advance</span>
                )}
              </div>
            </div>
            <div>
              <label className="text-[11px] font-medium text-slate-900 font-medium uppercase">Retention</label>
              <input type="number" className={fieldCls} value={form.retention_amount} onChange={e => set('retention_amount', e.target.value)} />
            </div>
            <div>
              <label className="text-[11px] font-medium text-slate-900 font-medium uppercase">Other Deductions</label>
              <input type="number" className={fieldCls} value={form.other_deductions} onChange={e => set('other_deductions', e.target.value)} />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-900 cursor-pointer">
                <input type="checkbox" className="accent-emerald-600" checked={form.is_final_bill} onChange={e => set('is_final_bill', e.target.checked)} />
                Final bill
              </label>
            </div>
          </div>

          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-900 uppercase tracking-wide">Pending Vendor Invoices</p>
                <p className="text-[11px] text-slate-400">Invoices already linked to another certification are hidden.</p>
              </div>
              {loadingInvoices && <RefreshCw className="w-4 h-4 text-slate-900 font-medium animate-spin" />}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-800 text-white">
                  <tr>
                    <th className="px-3 py-2 text-left w-10"></th>
                    <th className="px-3 py-2 text-left">SL No</th>
                    <th className="px-3 py-2 text-left">Invoice No</th>
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-left">Order</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                    <th className="px-3 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invoices.map(b => (
                    <tr key={b.id} className={selectedBillIds.includes(b.id) ? 'bg-emerald-50' : 'hover:bg-slate-50'}>
                      <td className="px-3 py-2"><input type="checkbox" className="accent-emerald-600" checked={selectedBillIds.includes(b.id)} onChange={() => toggleBill(b.id)} /></td>
                      <td className="px-3 py-2 font-medium text-indigo-700">{b.sl_number}</td>
                      <td className="px-3 py-2 font-medium text-slate-800">{(b.inv_number || '-').toUpperCase()}</td>
                      <td className="px-3 py-2 text-slate-500">{fmtDate(b.inv_date)}</td>
                      <td className="px-3 py-2 text-slate-500">{b.order_number || '-'}</td>
                      <td className="px-3 py-2 text-right font-bold">Rs {inr(b.total_amount)}</td>
                      <td className="px-3 py-2"><span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-900 font-medium uppercase text-[10px]">{b.workflow_status}</span></td>
                    </tr>
                  ))}
                  {!invoices.length && (
                    <tr><td colSpan={7} className="py-10 text-center text-slate-400">No pending invoices found for the selected filters.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="border border-emerald-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-emerald-50 border-b border-emerald-100 flex flex-wrap gap-3 items-center justify-between">
              <div>
                <p className="text-xs font-medium text-emerald-900 uppercase tracking-wide">RA Abstract Summary Sheet</p>
                <p className="text-[11px] text-emerald-700">This is the editable Excel-style certification page. Type QS present quantity, rate, tax, and remarks here.</p>
              </div>
              <button
                onClick={() => loadSummaryMut.mutate()}
                disabled={selectedBillIds.length === 0 || loadSummaryMut.isPending}
                className="px-3 py-2 bg-emerald-600 text-white rounded-lg text-xs font-medium disabled:opacity-50 flex items-center gap-2"
              >
                {loadSummaryMut.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                Load / Refresh Summary
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px] min-w-[1450px]">
                <thead>
                  <tr className="bg-slate-900 text-white">
                    <th rowSpan={2} className="px-2 py-2 border border-slate-700">Sr</th>
                    <th rowSpan={2} className="px-2 py-2 border border-slate-700">Invoice</th>
                    <th rowSpan={2} className="px-2 py-2 border border-slate-700 min-w-[260px]">Description</th>
                    <th rowSpan={2} className="px-2 py-2 border border-slate-700">Unit</th>
                    <th colSpan={3} className="px-2 py-2 border border-slate-700">As per PO / WO</th>
                    <th colSpan={3} className="px-2 py-2 border border-slate-700">As per Invoice</th>
                    <th rowSpan={2} className="px-2 py-2 border border-slate-700">As per<br/>Weighment</th>
                    <th rowSpan={2} className="px-2 py-2 border border-slate-700">MSB</th>
                    <th rowSpan={2} className="px-2 py-2 border border-slate-700">IGN</th>
                    <th rowSpan={2} className="px-2 py-2 border border-slate-700">GRS</th>
                    <th colSpan={3} className="px-2 py-2 border border-slate-700">As per QS Certified</th>
                    <th colSpan={2} className="px-2 py-2 border border-slate-700">Balance</th>
                    <th rowSpan={2} className="px-2 py-2 border border-slate-700">Remarks</th>
                  </tr>
                  <tr className="bg-slate-800 text-white">
                    {['Qty','Rate','Amount','Prev Qty','Present Qty','Amount','Prev Qty','Present Qty','Amount','Qty','Amount'].map(h => (
                      <th key={h} className="px-2 py-2 border border-slate-700">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {summaryRows.map((row, idx) => {
                    const orderAmount = Number(row.order_qty || 0) * Number(row.order_rate || 0);
                    const invoiceAmount = Number(row.inv_pres_qty || 0) * Number(row.order_rate || 0);
                    const balanceQty = Math.max(0, Number(row.order_qty || 0) - Number(row.qs_prev_qty || 0) - Number(row.qs_pres_qty || 0));
                    const balanceAmt = balanceQty * Number(row.order_rate || 0);
                    return (
                      <tr key={`${row.bill_line_item_id || idx}-${idx}`} className="odd:bg-white even:bg-slate-50">
                        <td className="px-2 py-1 border border-slate-200 text-center font-bold">{idx + 1}</td>
                        <td className="px-2 py-1 border border-slate-200 font-medium text-indigo-700">{row.source_inv_number || '-'}</td>
                        <td className="px-2 py-1 border border-slate-200">
                          <textarea
                            className="w-full bg-transparent outline-none resize-y leading-snug"
                            rows={2}
                            style={{ minHeight: '2.5em' }}
                            value={row.description || ''}
                            onChange={e => updateSummaryRow(idx, 'description', e.target.value)}
                          />
                        </td>
                        <td className="px-2 py-1 border border-slate-200">
                          <input className="w-16 bg-transparent outline-none text-center" value={row.unit || ''} onChange={e => updateSummaryRow(idx, 'unit', e.target.value)} />
                        </td>
                        <td className="px-2 py-1 border border-slate-200 text-right">{Number(row.order_qty || 0)}</td>
                        <td className="px-2 py-1 border border-slate-200">
                          <input type="number" className="w-24 text-right bg-white border border-slate-200 rounded px-1 py-1" value={row.order_rate || 0} onChange={e => updateSummaryRow(idx, 'order_rate', e.target.value)} />
                        </td>
                        <td className="px-2 py-1 border border-slate-200 text-right font-semibold">{inr(orderAmount)}</td>
                        <td className="px-2 py-1 border border-slate-200">
                          <input type="number" className="w-20 text-right bg-white border border-slate-200 rounded px-1 py-1" value={row.inv_prev_qty || 0} onChange={e => updateSummaryRow(idx, 'inv_prev_qty', e.target.value)} />
                        </td>
                        <td className="px-2 py-1 border border-slate-200">
                          <input type="number" className="w-20 text-right bg-white border border-slate-200 rounded px-1 py-1" value={row.inv_pres_qty || 0} onChange={e => updateSummaryRow(idx, 'inv_pres_qty', e.target.value)} />
                        </td>
                        <td className="px-2 py-1 border border-slate-200 text-right">{inr(invoiceAmount)}</td>
                        <td className="px-2 py-1 border border-slate-200">
                          <input type="number" className="w-20 text-right bg-white border border-slate-200 rounded px-1 py-1" value={row.weighment_qty || 0} onChange={e => updateSummaryRow(idx, 'weighment_qty', e.target.value)} />
                        </td>
                        <td className="px-2 py-1 border border-slate-200">
                          <input className="w-20 bg-transparent outline-none text-center" value={row.msb_ref || ''} onChange={e => updateSummaryRow(idx, 'msb_ref', e.target.value)} />
                        </td>
                        <td className="px-2 py-1 border border-slate-200">
                          <input className="w-20 bg-transparent outline-none text-center" value={row.ign_ref || ''} onChange={e => updateSummaryRow(idx, 'ign_ref', e.target.value)} />
                        </td>
                        <td className="px-2 py-1 border border-slate-200">
                          <input className="w-20 bg-transparent outline-none text-center" value={row.grs_ref || ''} onChange={e => updateSummaryRow(idx, 'grs_ref', e.target.value)} />
                        </td>
                        <td className="px-2 py-1 border border-slate-200">
                          <input type="number" className="w-20 text-right bg-white border border-slate-200 rounded px-1 py-1" value={row.qs_prev_qty || 0} onChange={e => updateSummaryRow(idx, 'qs_prev_qty', e.target.value)} />
                        </td>
                        <td className="px-2 py-1 border border-slate-200">
                          <input type="number" className="w-20 text-right bg-emerald-50 border border-emerald-200 rounded px-1 py-1 font-bold" value={row.qs_pres_qty || 0} onChange={e => updateSummaryRow(idx, 'qs_pres_qty', e.target.value)} />
                        </td>
                        <td className="px-2 py-1 border border-slate-200 text-right font-medium text-emerald-700">{inr(row.amount)}</td>
                        <td className="px-2 py-1 border border-slate-200 text-right font-medium text-orange-600">{balanceQty}</td>
                        <td className="px-2 py-1 border border-slate-200 text-right">{inr(balanceAmt)}</td>
                        <td className="px-2 py-1 border border-slate-200">
                          <input className="w-40 bg-transparent outline-none" value={row.remarks || ''} onChange={e => updateSummaryRow(idx, 'remarks', e.target.value)} />
                        </td>
                      </tr>
                    );
                  })}
                  {!summaryRows.length && (
                    <tr><td colSpan={20} className="py-10 text-center text-slate-400">Select invoices and click Load / Refresh Summary to type the certification sheet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="grid md:grid-cols-4 gap-3 bg-slate-50 px-4 py-3 border-t border-slate-200 text-sm">
              <div>
                <span className="text-slate-900 font-medium font-bold">Gross Certified</span>
                <p className="font-medium text-emerald-700">Rs {inr(totals.gross)}</p>
              </div>
              <div>
                <span className="text-slate-900 font-medium font-bold block mb-1">
                  GST / Tax
                  {totals.autoTax > 0 && form.gst_tax === '' && (
                    <span className="ml-2 text-[10px] font-normal text-slate-400">(auto from rows)</span>
                  )}
                </span>
                <input
                  type="number"
                  min="0"
                  className="w-full border border-indigo-200 rounded-lg px-2 py-1 text-sm font-medium text-indigo-700 outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
                  value={form.gst_tax}
                  placeholder={`Auto: ${inr(totals.autoTax)}`}
                  onChange={e => set('gst_tax', e.target.value)}
                />
                <p className="text-[10px] text-slate-400 mt-0.5">Enter 0 for no GST. Leave blank to auto-calc.</p>
              </div>
              <div>
                <span className="text-slate-900 font-medium font-bold">Deductions</span>
                <p className="font-medium text-orange-600">Rs {inr(totals.deductions)}</p>
              </div>
              <div>
                <span className="text-slate-900 font-medium font-bold">Current Net Payment Due</span>
                <p className="font-medium text-slate-900">Rs {inr(totals.net)}</p>
              </div>
            </div>
          </div>

          <textarea className={fieldCls} rows={2} placeholder="QS remarks" value={form.remarks} onChange={e => set('remarks', e.target.value)} />
        </div>

        <div className="px-5 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-6 text-sm">
            <span className="font-medium text-slate-700">{totals.count} invoice(s)</span>
            <span className="font-medium text-emerald-700">Invoice value Rs {inr(totals.invoiceTotal)}</span>
            <span className="font-medium text-slate-900">Net Due Rs {inr(totals.net)}</span>
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-600">Cancel</button>
            <button
              onClick={() => createMut.mutate()}
              disabled={createMut.isPending || selectedBillIds.length === 0 || summaryRows.length === 0}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 flex items-center gap-2"
            >
              {createMut.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FileCheck2 className="w-4 h-4" />}
              Certify & Send to Procurement
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function VendorQSCertificationPage() {
  const [showModal, setShowModal] = useState(false);
  const [modalInitial, setModalInitial] = useState({});
  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [statusTab, setStatusTab] = useState('all');
  const { user } = useAuthStore();
  const canApprove = (user?.email || '').toLowerCase() === CERT_APPROVER_EMAIL;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  // Works from both /qs and /tqs paths
  const basePath = location.pathname.startsWith('/tqs') ? '/tqs/vendor-certifications' : '/qs/vendor-certifications';

  // Auto-open "New Certification" modal when arriving with ?action=new
  // (e.g. from the "Open QS Certification" button on a bill detail page)
  useEffect(() => {
    if (searchParams.get('action') !== 'new') return;
    const vendor_name  = searchParams.get('vendor_name')  || '';
    const order_number = searchParams.get('wo_number') || searchParams.get('po_number') || '';
    const order_type   = searchParams.get('wo_number') ? 'wo' : 'po';
    setModalInitial({ vendor_name, order_type, order_number });
    setShowModal(true);
    // Clean the URL using the native history API so React Router does NOT
    // trigger a re-render (which would reset showModal back to false)
    window.history.replaceState({}, '', basePath);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: projects = [] } = useQuery({
    queryKey: ['projects-list'],
    queryFn: () => projectAPI.list().then(r => {
      const d = r.data;
      return Array.isArray(d) ? d : (d?.projects ?? d?.data ?? []);
    }),
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ['tqs-vendors'],
    queryFn: () => tqsVendorsAPI.list().then(r => Array.isArray(r.data) ? r.data : (r.data?.data ?? [])),
  });

  const { data: certs = [], isLoading } = useQuery({
    queryKey: ['vendor-qs-certifications', projectFilter, search],
    queryFn: () => vendorQSCertificationAPI.list({
      project_id: projectFilter || undefined,
      vendor_name: search || undefined,
    }).then(r => r.data?.data ?? []),
    staleTime: 5 * 60 * 1000,
    refetchOnMount: 'always',
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status, remarks }) => vendorQSCertificationAPI.updateStatus(id, { status, remarks }),
    onSuccess: () => {
      toast.success('Certification status updated');
      qc.invalidateQueries({ queryKey: ['vendor-qs-certifications'] });
    },
    onError: err => toast.error(err?.response?.data?.error || 'Status update failed'),
  });

  const [rejectTarget, setRejectTarget] = useState(null);
  const rejectMut = useMutation({
    mutationFn: ({ id, remarks }) => vendorQSCertificationAPI.updateStatus(id, { status: 'rejected', remarks }),
    onSuccess: () => {
      toast.success('Certification rejected and sent back to QS');
      setRejectTarget(null);
      qc.invalidateQueries({ queryKey: ['vendor-qs-certifications'] });
    },
    onError: err => toast.error(err?.response?.data?.error || 'Failed to reject'),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => vendorQSCertificationAPI.delete(id),
    onSuccess: () => {
      toast.success('Certification deleted');
      qc.invalidateQueries({ queryKey: ['vendor-qs-certifications'] });
    },
    onError: err => toast.error(err?.response?.data?.error || 'Failed to delete'),
  });

  const [selectedIds, setSelectedIds] = useState([]);
  const toggleSelected = (id) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const bulkApproveMut = useMutation({
    mutationFn: async (ids) => {
      const results = await Promise.allSettled(ids.map(id => vendorQSCertificationAPI.updateStatus(id, { status: 'accounts' })));
      const failed = results.filter(r => r.status === 'rejected').length;
      return { total: ids.length, failed };
    },
    onSuccess: ({ total, failed }) => {
      if (failed) toast.error(`${failed} of ${total} failed to approve`);
      else toast.success(`Approved ${total} certification${total === 1 ? '' : 's'}`);
      setSelectedIds([]);
      qc.invalidateQueries({ queryKey: ['vendor-qs-certifications'] });
    },
    onError: () => toast.error('Bulk approve failed'),
  });

  const handleDelete = (e, cert) => {
    e.stopPropagation();
    if (cert.status === 'paid') { toast.error('Cannot delete a paid certification.'); return; }
    if (!window.confirm(`Delete certification ${cert.cert_number}?\n\nThis cannot be undone.`)) return;
    deleteMut.mutate(cert.id);
  };

  const totals = certs.reduce((acc, c) => {
    acc.gross += Number(c.gross_amount || 0);
    acc.net += Number(c.net_payable || 0);
    acc.deductions += Number(c.tds_amount || 0) + Number(c.advance_recovered || 0) + Number(c.retention_amount || 0) + Number(c.other_deductions || 0);
    return acc;
  }, { gross: 0, net: 0, deductions: 0 });

  const STATUS_TABS = [
    { key: 'all',       label: 'All'       },
    { key: 'draft',     label: 'Draft'     },
    { key: 'certified', label: 'Certified' },
    { key: 'accounts',  label: 'Accounts'  },
    { key: 'paid',      label: 'Paid'      },
    { key: 'rejected',  label: 'Rejected'  },
  ];
  const statusCounts = certs.reduce((m, c) => { m[c.status] = (m[c.status] || 0) + 1; return m; }, {});
  const visibleCerts = statusTab === 'all' ? certs : certs.filter(c => c.status === statusTab);
  const STRIPE = {
    draft: '#94A3B8', certified: '#059669', accounts: '#4F46E5',
    paid: '#2563EB', cancelled: '#DC2626', rejected: '#EA580C',
  };

  return (
    <div className="p-5 min-h-full space-y-4" style={{ background: '#EEF1F6', fontFamily: "'Geist Variable','Segoe UI',system-ui,sans-serif" }}>

      {/* ── Hero band: title + CTA + KPIs ── */}
      <div className="rounded-2xl overflow-hidden shadow-md text-white"
        style={{ background: 'linear-gradient(120deg,#064E3B 0%,#065F46 45%,#047857 100%)' }}>
        <div className="px-6 pt-5 pb-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-white/10 border border-white/15 backdrop-blur">
              <Award className="w-5 h-5 text-emerald-200" />
            </div>
            <div>
              <h1 className="text-lg font-extrabold leading-tight tracking-tight">Vendor QS Certification</h1>
              <p className="text-[11px] text-emerald-200/80 mt-0.5 font-medium">RA certification for PO / WO invoice batches</p>
            </div>
          </div>
          <button onClick={() => { setModalInitial({}); setShowModal(true); }}
            className="px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 shadow transition-transform hover:-translate-y-px bg-white text-emerald-800">
            <Plus className="w-4 h-4" /> New Certification
          </button>
        </div>
        {/* KPI strip inside hero */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-white/10 border-t border-white/10">
          {[
            { label: 'Certifications',  value: certs.length,       isCount: true,  Icon: FileCheck2  },
            { label: 'Gross Certified', value: totals.gross,       isCount: false, Icon: IndianRupee },
            { label: 'Deductions',      value: totals.deductions,  isCount: false, Icon: FileText    },
            { label: 'Net Payable',     value: totals.net,         isCount: false, Icon: Award       },
          ].map(k => (
            <div key={k.label} className="px-6 py-3.5" style={{ background: 'rgba(255,255,255,0.04)' }}>
              <div className="flex items-center gap-1.5 mb-1">
                <k.Icon className="w-3 h-3 text-emerald-300/70" />
                <p className="text-[9px] font-bold uppercase tracking-widest text-emerald-200/70">{k.label}</p>
              </div>
              <p className="font-extrabold leading-none text-white" style={{ fontSize: k.isCount ? 24 : 18, fontVariantNumeric: 'tabular-nums' }}>
                {k.isCount ? k.value : <><span className="text-[12px] opacity-60 mr-0.5">₹</span>{inr(k.value)}</>}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div className="bg-white rounded-2xl border border-slate-200 px-4 py-3 flex flex-wrap gap-3 items-center shadow-sm">
        <div className="flex items-center gap-2 border border-slate-200 rounded-xl px-3 py-2 flex-1 min-w-[220px] bg-slate-50 focus-within:bg-white focus-within:border-emerald-300 transition-colors">
          <Search className="w-4 h-4 text-slate-400" />
          <input className="outline-none text-sm flex-1 bg-transparent" placeholder="Search vendor..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white outline-none" value={projectFilter} onChange={e => setProjectFilter(e.target.value)}>
          <option value="">All projects</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {canApprove && (
          <button
            onClick={() => bulkApproveMut.mutate(selectedIds)}
            disabled={selectedIds.length === 0 || bulkApproveMut.isPending}
            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold disabled:opacity-40 flex items-center gap-2 shadow-sm"
          >
            <Send className="w-3.5 h-3.5" />
            {bulkApproveMut.isPending ? 'Approving…' : `Approve Selected (${selectedIds.length})`}
          </button>
        )}
      </div>

      {/* ── Status tabs ── */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {STATUS_TABS.map(t => {
          const count = t.key === 'all' ? certs.length : (statusCounts[t.key] || 0);
          const on = statusTab === t.key;
          return (
            <button key={t.key} onClick={() => setStatusTab(t.key)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 border transition-all ${
                on ? 'bg-emerald-700 text-white border-emerald-700 shadow-sm'
                   : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-300 hover:text-emerald-700'}`}>
              {t.label}
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${on ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}
                style={{ fontVariantNumeric: 'tabular-nums' }}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* ── Card rows ── */}
      <div className="space-y-2.5">
        {isLoading ? (
          <div className="bg-white rounded-2xl border border-slate-200 py-14 text-center text-slate-400 text-sm shadow-sm">Loading certifications...</div>
        ) : visibleCerts.length ? visibleCerts.map(c => {
          const deductions = Number(c.tds_amount || 0) + Number(c.advance_recovered || 0) + Number(c.retention_amount || 0) + Number(c.other_deductions || 0);
          const initials = String(c.vendor_name || '?').split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
          const stripe = STRIPE[c.status] || '#94A3B8';
          return (
            <div
              key={c.id}
              onClick={() => navigate(`${basePath}/${c.id}`)}
              className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-emerald-200 transition-all cursor-pointer overflow-hidden flex items-stretch"
              title="Open certification"
            >
              {/* Status stripe */}
              <div style={{ width: 4, background: stripe, flexShrink: 0 }} />

              <div className="flex-1 px-4 py-3 flex items-center gap-4 flex-wrap min-w-0">
                {canApprove && (
                  <span onClick={e => e.stopPropagation()}>
                    <input type="checkbox" className="accent-indigo-500 w-4 h-4"
                      disabled={c.status !== 'certified'}
                      checked={selectedIds.includes(c.id)}
                      onChange={() => toggleSelected(c.id)} />
                  </span>
                )}

                {/* Avatar */}
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-[11px] font-extrabold flex-shrink-0"
                  style={{ background: `${stripe}18`, color: stripe, border: `1px solid ${stripe}33` }}>
                  {initials}
                </div>

                {/* Identity */}
                <div className="min-w-[190px] flex-1">
                  <p className="text-[13px] font-bold text-slate-900 leading-tight truncate">{c.vendor_name}</p>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <span className="text-[11px] font-semibold text-indigo-700">{c.cert_number}</span>
                    <span className="text-slate-300 text-[10px]">·</span>
                    <span className="text-[11px] font-semibold text-slate-600">{c.ra_bill_number || `RA-${c.ra_sequence}`}</span>
                    <span className="inline-block px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[9px] font-bold">{String(c.order_type || '').toUpperCase()} {c.order_number || '—'}</span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-0.5 truncate">{c.project_name || '—'}</p>
                </div>

                {/* Dates + invoices */}
                <div className="hidden lg:flex flex-col gap-0.5 min-w-[130px]">
                  <p className="text-[10px] text-slate-400"><span className="font-bold text-slate-500 uppercase text-[9px] tracking-wide mr-1">Recd</span>{fmtDate(c.qs_received_date)}</p>
                  <p className="text-[10px] text-slate-400"><span className="font-bold text-slate-500 uppercase text-[9px] tracking-wide mr-1">Cert</span>{fmtDate(c.qs_certified_date)}</p>
                  <p className="text-[10px] text-slate-400"><span className="font-bold text-slate-500 uppercase text-[9px] tracking-wide mr-1">Inv</span>{c.invoice_count}</p>
                </div>

                {/* Amounts */}
                <div className="flex items-center gap-5 ml-auto">
                  {[
                    { label: 'Gross',      val: c.gross_amount, color: '#0F172A' },
                    { label: 'Deductions', val: deductions,     color: '#B45309' },
                    { label: 'Net',        val: c.net_payable,  color: '#059669' },
                  ].map(a => (
                    <div key={a.label} className="text-right min-w-[86px]">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{a.label}</p>
                      <p className="text-[13px] font-extrabold whitespace-nowrap" style={{ color: a.color, fontVariantNumeric: 'tabular-nums' }}>₹{inr(a.val)}</p>
                    </div>
                  ))}
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide ${statusClass(c.status)}`}>{c.status}</span>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                  <Link
                    to={`${basePath}/${c.id}`}
                    className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                    title="Open / Edit"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Link>
                  <Link
                    to={`${basePath}/${c.id}?print=abstract`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2 py-1 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 text-[11px] font-semibold inline-flex items-center gap-1 transition-colors"
                    title="Print Abstract of Measurement (A4 Landscape)"
                  >
                    <Printer className="w-3 h-3" /> Abstract
                  </Link>
                  <Link
                    to={`${basePath}/${c.id}?print=payment`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2 py-1 rounded-lg bg-emerald-50 text-emerald-800 hover:bg-emerald-100 text-[11px] font-semibold inline-flex items-center gap-1 transition-colors"
                    title="Print Payment Certificate (A4 Portrait)"
                  >
                    <Printer className="w-3 h-3" /> Pay Cert
                  </Link>
                  <button
                    onClick={() => statusMut.mutate({ id: c.id, status: 'accounts' })}
                    disabled={c.status !== 'certified' || !canApprove}
                    title={!canApprove ? `Only ${CERT_APPROVER_EMAIL} can approve` : c.status !== 'certified' ? `Cannot approve: status is ${c.status}` : 'Approve and send to Accounts'}
                    className="px-2 py-1 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-[11px] font-semibold disabled:opacity-40 inline-flex items-center gap-1 transition-colors"
                  >
                    <Send className="w-3 h-3" /> {canApprove ? 'Approve' : 'Accounts'}
                  </button>
                  {canApprove && (
                    <button
                      onClick={() => setRejectTarget(c)}
                      disabled={c.status !== 'certified'}
                      title="Reject and send back to QS with a reason"
                      className="p-1.5 rounded-lg bg-orange-50 text-orange-700 hover:bg-orange-100 disabled:opacity-40 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={e => handleDelete(e, c)}
                    disabled={deleteMut.isPending || c.status === 'paid'}
                    className="p-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-40 transition-colors"
                    title={c.status === 'paid' ? 'Paid certifications cannot be deleted' : 'Delete certification'}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        }) : (
          <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center shadow-sm">
            <Award className="w-8 h-8 text-slate-200 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-500">
              {statusTab === 'all' ? 'No certifications yet' : `No ${statusTab} certifications`}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {statusTab === 'all' ? 'Click “New Certification” to certify a vendor invoice batch.' : 'Try a different status tab.'}
            </p>
          </div>
        )}
      </div>

      {showModal && (
        <CertificationModal
          onClose={() => setShowModal(false)}
          projects={projects}
          vendors={vendors}
          initialData={modalInitial}
        />
      )}

      {rejectTarget && (
        <RejectCertModal
          cert={rejectTarget}
          onClose={() => setRejectTarget(null)}
          isPending={rejectMut.isPending}
          onConfirm={(remarks) => rejectMut.mutate({ id: rejectTarget.id, remarks })}
        />
      )}
    </div>
  );
}
