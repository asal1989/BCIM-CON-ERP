// src/pages/finance/BillBookingPage.jsx
import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, FileText, ShoppingCart, ClipboardCheck,
  Save, Box, Building2, Receipt, Calendar, Link2, AlertCircle,
} from 'lucide-react';
import { clsx } from 'clsx';
import { invoiceAPI, projectAPI, vendorAPI, poAPI, ignAPI } from '../../api/client';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';

const inr = (v) => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const LABEL = 'block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5';
const INPUT = 'w-full bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all';

export default function BillBookingPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [formData, setFormData] = useState({
    project_id: '', vendor_id: '', po_id: '', ign_id: '',
    invoice_number: '', invoice_date: dayjs().format('YYYY-MM-DD'),
    due_date: dayjs().add(30, 'day').format('YYYY-MM-DD'),
    remarks: '', tds_percent: 0,
  });

  const [items, setItems] = useState([]);

  // Data Fetchers
  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: () => projectAPI.list().then(r => r.data?.data ?? r.data ?? []).catch(() => []) });
  const { data: vendors = []  } = useQuery({ queryKey: ['vendors'],  queryFn: () => vendorAPI.list().then(r => r.data?.data ?? r.data ?? []).catch(() => []) });

  const { data: pos = [] } = useQuery({
    queryKey: ['po-list', formData.vendor_id],
    queryFn: () => poAPI.list({ vendor_id: formData.vendor_id }).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    enabled: !!formData.vendor_id,
  });

  // IGN (Inward Goods Note) records for the selected PO
  const { data: igns = [] } = useQuery({
    queryKey: ['ign-list', formData.po_id],
    queryFn: () => ignAPI.list({ po_id: formData.po_id }).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    enabled: !!formData.po_id,
  });

  const { data: ignDetail } = useQuery({
    queryKey: ['ign-detail', formData.ign_id],
    queryFn: () => ignAPI.get(formData.ign_id).then(r => r.data?.data ?? r.data ?? null).catch(() => null),
    enabled: !!formData.ign_id,
  });

  // Effect: When an IGN is selected, pull its inspected items
  useEffect(() => {
    if (ignDetail?.items) {
      setItems(ignDetail.items.map(it => {
        // IGN accepted qty = inspected (fallback to as-per-DC) minus rejected
        const acceptedQty = Number(it.qty_inspected ?? it.qty_as_per_dc ?? 0);
        const rate = Number(it.rate ?? 0);
        return {
          material_name: it.material_name,
          unit: it.unit,
          quantity_on_ign: acceptedQty,
          quantity_invoiced: acceptedQty,
          rate_on_po: rate,
          rate_invoiced: rate,
          tax_percent: 18,
        };
      }));
    } else {
      setItems([]);
    }
  }, [ignDetail]);

  const setItem = (idx, patch) => setItems(p => p.map((x, i) => i === idx ? { ...x, ...patch } : x));

  const totals = items.reduce((acc, it) => {
    const sub = (Number(it.quantity_invoiced) || 0) * (Number(it.rate_invoiced) || 0);
    const tax = sub * (Number(it.tax_percent) || 0) / 100;
    return { subtotal: acc.subtotal + sub, tax: acc.tax + tax, gross: acc.gross + sub + tax };
  }, { subtotal: 0, tax: 0, gross: 0 });

  const tdsAmount = totals.subtotal * (Number(formData.tds_percent) || 0) / 100;
  const finalPayable = totals.gross - tdsAmount;

  const selectedVendor = vendors.find(v => v.id === formData.vendor_id);
  const selectedIgn = igns.find(g => g.id === formData.ign_id);

  const createMut = useMutation({
    mutationFn: (d) => invoiceAPI.create(d),
    onSuccess: () => {
      toast.success('Bill booked successfully');
      qc.invalidateQueries({ queryKey: ['vendor-invoices'] });
      navigate('/accounts/purchases/bills');
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Booking failed'),
  });

  const canBook = formData.project_id && formData.vendor_id && formData.invoice_number && items.length > 0;

  const handleBooking = () => {
    if (!canBook) { toast.error('Select project, vendor, invoice no. and an IGN with items'); return; }
    const payload = {
      project_id: formData.project_id,
      vendor_id: formData.vendor_id,
      po_id: formData.po_id || null,
      grn_id: formData.ign_id || null, // invoices.grn_id holds the IGN reference (GRN merged into IGN)
      invoice_number: formData.invoice_number,
      invoice_date: formData.invoice_date,
      due_date: formData.due_date,
      remarks: formData.remarks,
      total_amount: totals.subtotal,
      tax_amount: totals.tax,
      net_amount: finalPayable,
      tax_details: { tds_percent: Number(formData.tds_percent) || 0, tds_amount: tdsAmount, gross_total: totals.gross },
      items: items.map(it => {
        const sub = (Number(it.quantity_invoiced) || 0) * (Number(it.rate_invoiced) || 0);
        return {
          material_name: it.material_name,
          unit: it.unit,
          quantity_on_grn: it.quantity_on_ign, // column name kept for backend compatibility
          quantity_invoiced: it.quantity_invoiced,
          rate_on_po: it.rate_on_po,
          rate_invoiced: it.rate_invoiced,
          tax_percent: it.tax_percent,
          tax_amount: sub * (Number(it.tax_percent) || 0) / 100,
          net_amount: sub * (1 + (Number(it.tax_percent) || 0) / 100),
        };
      }),
    };
    createMut.mutate(payload);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-[1400px] mx-auto">
          <button onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-indigo-600 mb-2 transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center">
              <Receipt className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-900 tracking-tight">Bill Booking</h1>
              <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
                <Link2 className="w-3 h-3" /> 3-Way Match — Purchase Order · IGN (Inward Goods Note) · Vendor Invoice
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto p-6">
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

          {/* Left: Linkage + Invoice details */}
          <div className="xl:col-span-1 space-y-6">
            {/* Procurement linkage */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
              <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-indigo-500" />
                <h3 className="text-[13px] font-semibold text-slate-700">Procurement Linkage</h3>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className={LABEL}>Project Site</label>
                  <select className={INPUT} value={formData.project_id}
                    onChange={e => setFormData(p => ({ ...p, project_id: e.target.value }))}>
                    <option value="">Select project…</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={LABEL}>Vendor</label>
                  <select className={INPUT} value={formData.vendor_id}
                    onChange={e => setFormData(p => ({ ...p, vendor_id: e.target.value, po_id: '', ign_id: '' }))}>
                    <option value="">Select vendor…</option>
                    {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={LABEL}>Purchase Order</label>
                  <select className={INPUT} value={formData.po_id} disabled={!formData.vendor_id}
                    onChange={e => setFormData(p => ({ ...p, po_id: e.target.value, ign_id: '' }))}>
                    <option value="">{formData.vendor_id ? 'Select PO…' : 'Pick a vendor first'}</option>
                    {pos.map(p => <option key={p.id} value={p.id}>{p.po_number}</option>)}
                  </select>
                </div>
                <div>
                  <label className={clsx(LABEL, 'flex items-center justify-between')}>
                    <span>Inward Goods Note (IGN)</span>
                    <ClipboardCheck className="w-3.5 h-3.5 text-emerald-500" />
                  </label>
                  <select
                    className={clsx(INPUT, 'bg-emerald-50/50 border-emerald-200 focus:border-emerald-400 focus:ring-emerald-100')}
                    value={formData.ign_id} disabled={!formData.po_id}
                    onChange={e => setFormData(p => ({ ...p, ign_id: e.target.value }))}>
                    <option value="">{formData.po_id ? 'Select IGN…' : 'Pick a PO first'}</option>
                    {igns.map(g => (
                      <option key={g.id} value={g.id}>
                        {g.ign_number} · {g.date_time ? dayjs(g.date_time).format('DD MMM YY') : '—'}
                      </option>
                    ))}
                  </select>
                  {formData.po_id && igns.length === 0 && (
                    <p className="mt-1.5 text-[11px] text-amber-600 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> No IGN found for this PO yet.
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Invoice details */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
              <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
                <FileText className="w-4 h-4 text-slate-500" />
                <h3 className="text-[13px] font-semibold text-slate-700">Vendor Invoice</h3>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className={LABEL}>Vendor Invoice No.</label>
                  <input className={clsx(INPUT, 'font-mono text-indigo-600')} placeholder="e.g. INV/2024/099"
                    value={formData.invoice_number}
                    onChange={e => setFormData(p => ({ ...p, invoice_number: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={LABEL}><Calendar className="w-3 h-3 inline mr-1" />Invoice Date</label>
                    <input type="date" className={INPUT} value={formData.invoice_date}
                      onChange={e => setFormData(p => ({ ...p, invoice_date: e.target.value }))} />
                  </div>
                  <div>
                    <label className={LABEL}>Due Date</label>
                    <input type="date" className={clsx(INPUT, 'bg-amber-50/50 border-amber-200')} value={formData.due_date}
                      onChange={e => setFormData(p => ({ ...p, due_date: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <label className={LABEL}>Remarks</label>
                  <textarea rows={2} className={clsx(INPUT, 'resize-none')} placeholder="Optional notes…"
                    value={formData.remarks}
                    onChange={e => setFormData(p => ({ ...p, remarks: e.target.value }))} />
                </div>
                {selectedVendor && (
                  <div className="flex items-center gap-2 text-xs text-slate-500 pt-1">
                    <Building2 className="w-3.5 h-3.5" />
                    Booking against <span className="font-semibold text-slate-700">{selectedVendor.name}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right: Reconciliation */}
          <div className="xl:col-span-2">
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col h-full overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Box className="w-4 h-4 text-indigo-600" />
                  <h3 className="text-[13px] font-semibold text-slate-700">Item Reconciliation</h3>
                </div>
                {selectedIgn && (
                  <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                    {selectedIgn.ign_number}
                  </span>
                )}
              </div>

              <div className="overflow-x-auto flex-1">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                      <th className="px-4 py-3 text-left">Material</th>
                      <th className="px-3 py-3 text-center w-24">IGN Qty</th>
                      <th className="px-3 py-3 text-center w-28">Invoice Qty</th>
                      <th className="px-3 py-3 text-right w-32">Rate (₹)</th>
                      <th className="px-3 py-3 text-center w-20">GST %</th>
                      <th className="px-4 py-3 text-right w-32">Amount (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map((it, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-800">{it.material_name}</div>
                          <div className="text-[11px] text-slate-400 mt-0.5">{it.unit}</div>
                        </td>
                        <td className="px-3 py-3 text-center font-mono text-slate-500">{it.quantity_on_ign}</td>
                        <td className="px-3 py-3 text-center">
                          <input type="number" min="0"
                            className="w-20 px-2 py-1.5 text-center bg-white border border-slate-200 rounded-lg focus:border-indigo-400 outline-none font-mono text-slate-800"
                            value={it.quantity_invoiced}
                            onChange={e => setItem(idx, { quantity_invoiced: e.target.value })} />
                        </td>
                        <td className="px-3 py-3 text-right">
                          <input type="number" min="0" step="0.01"
                            className="w-28 px-2 py-1.5 text-right bg-white border border-slate-200 rounded-lg focus:border-indigo-400 outline-none font-mono text-indigo-600"
                            value={it.rate_invoiced}
                            onChange={e => setItem(idx, { rate_invoiced: e.target.value })} />
                        </td>
                        <td className="px-3 py-3 text-center">
                          <input type="number" min="0" max="100"
                            className="w-14 px-2 py-1.5 text-center bg-white border border-slate-200 rounded-lg focus:border-indigo-400 outline-none font-mono text-slate-700"
                            value={it.tax_percent}
                            onChange={e => setItem(idx, { tax_percent: e.target.value })} />
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-semibold text-slate-800">
                          ₹{inr((Number(it.quantity_invoiced) || 0) * (Number(it.rate_invoiced) || 0))}
                        </td>
                      </tr>
                    ))}
                    {items.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-16 text-center text-sm text-slate-400">
                          <ClipboardCheck className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                          Link an IGN above to load its inspected items
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Totals */}
              <div className="border-t border-slate-100 bg-slate-50 p-5 flex justify-end">
                <div className="w-full max-w-sm space-y-3">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500">Taxable Subtotal</span>
                    <span className="font-mono font-medium text-slate-800">₹{inr(totals.subtotal)}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500">GST</span>
                    <span className="font-mono font-medium text-slate-800">₹{inr(totals.tax)}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-amber-600">TDS Deduction (%)</span>
                    <input type="number" min="0" max="100"
                      className="w-20 px-2 py-1 text-right bg-white border border-amber-200 rounded-lg focus:border-amber-400 outline-none font-mono text-amber-600"
                      value={formData.tds_percent}
                      onChange={e => setFormData(p => ({ ...p, tds_percent: e.target.value }))} />
                  </div>
                  <div className="flex justify-between items-center text-sm pt-2 border-t border-slate-200">
                    <span className="text-amber-600">TDS Amount</span>
                    <span className="font-mono text-amber-600">(₹{inr(tdsAmount)})</span>
                  </div>
                  <div className="flex justify-between items-center pt-3 border-t border-slate-200">
                    <span className="text-sm font-semibold text-slate-700">Net Payable</span>
                    <span className="text-2xl font-bold font-mono text-indigo-600">₹{inr(finalPayable)}</span>
                  </div>
                  <button onClick={handleBooking} disabled={createMut.isPending || !canBook}
                    className="w-full mt-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed py-3 rounded-xl text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors shadow-sm">
                    <Save className="w-4 h-4" /> {createMut.isPending ? 'Booking…' : 'Book Bill'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
