// src/pages/procurement/QuotationEntryPage.jsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft, Calculator, Save, Truck, Landmark,
  Building2, Package, FileText, Plus, Trash2,
  CheckCircle2, AlertCircle, ClipboardList, ChevronRight,
} from 'lucide-react';
import { mrsAPI, vendorAPI, quotationAPI } from '../../api/client';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';

const inr = (n) =>
  Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const EMPTY_QUOTE = () => ({
  vendor_id: '',
  delivery_days: '',
  payment_terms: '',
  notes: '',
});

export default function QuotationEntryPage() {
  const { id } = useParams();     // indent id
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [formData, setFormData] = useState(EMPTY_QUOTE());
  const [itemRates, setItemRates] = useState([]);
  const [submitted, setSubmitted] = useState(false);

  // Fetch the MRS (material_requisitions table) — items in mrs_items
  const { data: indent, isLoading, isError } = useQuery({
    queryKey: ['mrs-detail', id],
    queryFn: () => mrsAPI.get(id).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    enabled: !!id,
  });

  // Populate item rate rows once MRS loads
  useEffect(() => {
    if (indent?.items?.length) {
      setItemRates(
        indent.items.map(it => ({
          mrs_item_id:    it.id,
          material_name:  it.material_name,
          material_category: it.category || '',
          unit:           it.unit,
          quantity:       it.quantity,
          rate:           '',
          discount_percent: '',
          gst_rate:       18,
          remarks:        '',
        }))
      );
    }
  }, [indent]);

  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors-list'],
    queryFn: () => vendorAPI.list().then(r => r.data?.data || []),
  });

  const { data: rfq } = useQuery({
    queryKey: ['rfq-detail', id],
    queryFn: () => quotationAPI.getRFQ(id).then(r => r.data?.data),
    enabled: !!id,
  });

  const invitedVendorIds = new Set((rfq?.vendors || []).map(v => v.vendor_id).filter(Boolean));
  const visibleVendors = invitedVendorIds.size
    ? vendors.filter(v => invitedVendorIds.has(v.id))
    : vendors;

  const createMutation = useMutation({
    mutationFn: (d) => quotationAPI.create(d),
    onSuccess: () => {
      toast.success('Vendor quotation registered!');
      qc.invalidateQueries({ queryKey: ['mrs-for-cs'] });
      setSubmitted(true);
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Registration failed'),
  });

  const handleSubmit = () => {
    if (!formData.vendor_id) return toast.error('Please select a vendor');
    if (itemRates.some(it => !it.rate || isNaN(parseFloat(it.rate))))
      return toast.error('Enter rates for all line items');
    createMutation.mutate({
      mrs_id: id,
      ...formData,
      items: itemRates.map(it => ({
        mrs_item_id:      it.mrs_item_id,
        rate:             it.rate,
        discount_percent: it.discount_percent || 0,
        gst_rate:         it.gst_rate,
        remarks:          it.remarks,
      })),
    });
  };

  const updateItem = (idx, field, value) =>
    setItemRates(p => p.map((x, i) => (i === idx ? { ...x, [field]: value } : x)));

  const grossTotal = itemRates.reduce(
    (s, it) => s + parseFloat(it.rate || 0) * parseFloat(it.quantity || 0), 0
  );
  const taxTotal = itemRates.reduce(
    (s, it) =>
      s + parseFloat(it.rate || 0) * parseFloat(it.quantity || 0) * (parseFloat(it.gst_rate || 0) / 100),
    0
  );
  const grandTotal = grossTotal + taxTotal;

  // ── Loading ──────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="p-8 max-w-7xl mx-auto min-h-screen bg-[#f4f6f9]">
        <div className="space-y-4">
          <div className="h-10 w-64 bg-slate-200 animate-pulse rounded-lg" />
          <div className="grid grid-cols-3 gap-5">
            <div className="h-64 bg-white border border-slate-100 animate-pulse rounded-xl" />
            <div className="col-span-2 h-64 bg-white border border-slate-100 animate-pulse rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  // ── Error / Not found ─────────────────────────────────────────────────────
  if (isError || !indent) {
    return (
      <div className="p-8 max-w-7xl mx-auto min-h-screen bg-[#f4f6f9] flex items-center justify-center">
        <div className="bg-white border border-red-100 rounded-2xl p-10 text-center shadow-sm max-w-sm">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-4" />
          <h2 className="text-lg font-medium text-slate-900 font-medium mb-1">Indent Not Found</h2>
          <p className="text-sm text-slate-900 font-medium mb-5">
            This material indent could not be loaded. It may have been deleted or you may not have access.
          </p>
          <button
            onClick={() => navigate('/procurement/quotations')}
            className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
          >
            Back to Quotations
          </button>
        </div>
      </div>
    );
  }

  // ── Submitted confirmation ────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="p-8 max-w-7xl mx-auto min-h-screen bg-[#f4f6f9] flex items-center justify-center">
        <div className="bg-white border border-emerald-100 rounded-2xl p-10 text-center shadow-sm max-w-sm">
          <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
          <h2 className="text-lg font-medium text-slate-900 font-medium mb-1">Quotation Submitted</h2>
          <p className="text-sm text-slate-900 font-medium mb-5">
            Vendor quote for <strong>{indent.serial_no_formatted || indent.mrs_number}</strong> has been registered successfully.
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => {
                setSubmitted(false);
                setFormData(EMPTY_QUOTE());
                setItemRates(
                  indent.items.map(it => ({
                    mrs_item_id: it.id, material_name: it.material_name,
                    material_category: it.category || '', unit: it.unit,
                    quantity: it.quantity,
                    rate: '', discount_percent: '', gst_rate: 18, remarks: '',
                  }))
                );
              }}
              className="px-4 py-2 border border-indigo-300 text-indigo-600 rounded-lg text-sm font-medium hover:bg-indigo-50"
            >
              Add Another Vendor
            </button>
            <button
              onClick={() => navigate(`/procurement/quotations/comparison/${id}`)}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
            >
              View Comparison
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Main form ─────────────────────────────────────────────────────────────
  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto min-h-screen bg-[#f4f6f9]">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 flex items-center justify-center bg-white border border-slate-200 rounded-lg text-slate-900 font-medium hover:text-indigo-600 hover:border-indigo-300 transition-all shadow-sm"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-1.5 text-xs text-slate-900 font-medium mb-0.5">
              <span>Procurement</span>
              <ChevronRight className="w-3 h-3" />
              <span>Quotations</span>
              <ChevronRight className="w-3 h-3" />
              <span className="text-slate-900 font-medium">Enter Vendor Quotes</span>
            </div>
            <h1 className="text-xl font-medium text-slate-900">Register Vendor Quotation</h1>
          </div>
        </div>

        <button
          onClick={handleSubmit}
          disabled={createMutation.isPending}
          className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium shadow-sm hover:bg-indigo-700 transition-all disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {createMutation.isPending ? 'Submitting…' : 'Submit Quotation'}
        </button>
      </div>

      {/* Indent info banner */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-5 shadow-sm">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-[11px] text-slate-900 font-medium uppercase tracking-wide mb-0.5">Indent No.</p>
            <p className="text-sm font-medium text-indigo-600">{indent.serial_no_formatted || indent.mrs_number || '—'}</p>
          </div>
          <div>
            <p className="text-[11px] text-slate-900 font-medium uppercase tracking-wide mb-0.5">Project</p>
            <p className="text-sm font-medium text-slate-800">{indent.project_name || '—'}</p>
          </div>
          <div>
            <p className="text-[11px] text-slate-900 font-medium uppercase tracking-wide mb-0.5">Required By</p>
            <p className="text-sm text-slate-700">
              {indent.required_by ? dayjs(indent.required_by).format('DD-MM-YYYY') : '—'}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-slate-900 font-medium uppercase tracking-wide mb-0.5">Priority</p>
            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
              indent.priority === 'urgent' ? 'bg-red-50 text-red-600' :
              indent.priority === 'high'   ? 'bg-amber-50 text-amber-600' :
              'bg-slate-50 text-slate-600'
            }`}>
              {indent.priority || 'Normal'}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">

        {/* Left: vendor + terms + summary */}
        <div className="md:col-span-1 space-y-4">

          {/* Vendor card */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
              <Building2 className="w-4 h-4 text-indigo-400" />
              <h3 className="text-sm font-medium text-slate-700">Vendor Details</h3>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-500">Select Vendor *</label>
              <select
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
                value={formData.vendor_id}
                onChange={e => setFormData(p => ({ ...p, vendor_id: e.target.value }))}
              >
                <option value="">Choose supplier…</option>
                {visibleVendors.map(v => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
              {invitedVendorIds.size > 0 && (
                <p className="text-[11px] text-indigo-500 mt-1">
                  Showing {visibleVendors.length} vendors selected in RFQ {rfq?.rfq_number ? `(${rfq.rfq_number})` : ''}.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-900 font-medium flex items-center gap-1.5">
                <Truck className="w-3.5 h-3.5" /> Delivery Days
              </label>
              <input
                type="number"
                min="0"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
                placeholder="e.g. 7"
                value={formData.delivery_days}
                onChange={e => setFormData(p => ({ ...p, delivery_days: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-900 font-medium flex items-center gap-1.5">
                <Landmark className="w-3.5 h-3.5" /> Payment Terms
              </label>
              <input
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
                placeholder="e.g. 30 Days Credit"
                value={formData.payment_terms}
                onChange={e => setFormData(p => ({ ...p, payment_terms: e.target.value }))}
              />
            </div>
          </div>

          {/* Summary */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100 mb-4">
              <Calculator className="w-4 h-4 text-indigo-400" />
              <h3 className="text-sm font-medium text-slate-700">Quote Summary</h3>
            </div>

            <div className="space-y-2.5">
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-500">Sub Total (Basic)</span>
                <span className="text-sm font-mono text-slate-800">₹{inr(grossTotal)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-500">Total GST</span>
                <span className="text-sm font-mono text-amber-600">₹{inr(taxTotal)}</span>
              </div>
              <div className="pt-3 border-t border-slate-100 flex justify-between items-center">
                <span className="text-xs font-medium text-slate-700">Grand Total</span>
                <span className="text-lg font-medium font-mono text-emerald-600">₹{inr(grandTotal)}</span>
              </div>
            </div>

            <div className="mt-4 p-3 bg-indigo-50 rounded-lg">
              <div className="flex items-center gap-1.5 text-xs text-indigo-600">
                <ClipboardList className="w-3.5 h-3.5" />
                <span className="font-medium">{itemRates.length} line items</span>
              </div>
              <div className="text-[11px] text-indigo-400 mt-0.5">
                {itemRates.filter(it => it.rate).length} of {itemRates.length} rates entered
              </div>
            </div>
          </div>
        </div>

        {/* Right: item rate grid */}
        <div className="md:col-span-2 space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-indigo-400" />
                <div>
                  <h3 className="text-sm font-medium text-slate-700">Material Itemized Rates</h3>
                  <p className="text-[11px] text-slate-900 font-medium mt-0.5">Enter unit rate for each material item</p>
                </div>
              </div>
              <span className="px-2.5 py-1 bg-indigo-50 border border-indigo-100 rounded-full text-xs font-medium text-indigo-600">
                {itemRates.length} items
              </span>
            </div>

            {itemRates.length === 0 ? (
              <div className="py-12 text-center text-slate-400">
                <Package className="w-8 h-8 mx-auto mb-2 text-slate-200" />
                <p className="text-sm">No items found in this indent</p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Column headers */}
                <div className="grid grid-cols-12 gap-2 px-1 text-[11px] font-medium text-slate-900 font-medium uppercase tracking-wide">
                  <div className="col-span-4">Material</div>
                  <div className="col-span-1 text-center">Qty</div>
                  <div className="col-span-2 text-right">Rate/Unit (₹) *</div>
                  <div className="col-span-1 text-center">GST%</div>
                  <div className="col-span-2 text-right">Amount</div>
                  <div className="col-span-2">Remarks</div>
                </div>

                {itemRates.map((it, idx) => {
                  const basic = parseFloat(it.rate || 0) * parseFloat(it.quantity || 0);
                  const gst   = basic * (parseFloat(it.gst_rate || 0) / 100);
                  const total = basic + gst;
                  const hasRate = it.rate && !isNaN(parseFloat(it.rate));

                  return (
                    <div
                      key={idx}
                      className={`grid grid-cols-12 gap-2 p-3 rounded-xl border transition-colors ${
                        hasRate
                          ? 'bg-emerald-50 border-emerald-100'
                          : 'bg-slate-50 border-slate-200 hover:border-indigo-200'
                      }`}
                    >
                      {/* Material name */}
                      <div className="col-span-4 flex items-start gap-2">
                        <div className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 text-[10px] font-medium flex items-center justify-center shrink-0 mt-0.5">
                          {idx + 1}
                        </div>
                        <div>
                          <p className="text-xs font-medium text-slate-900 font-medium leading-tight">{it.material_name}</p>
                          {it.material_category && (
                            <p className="text-[10px] text-slate-900 font-medium mt-0.5">{it.material_category}</p>
                          )}
                          <p className="text-[10px] text-slate-400">{it.unit}</p>
                        </div>
                      </div>

                      {/* Quantity */}
                      <div className="col-span-1 flex items-center justify-center">
                        <span className="text-sm font-medium text-slate-700">{it.quantity}</span>
                      </div>

                      {/* Rate */}
                      <div className="col-span-2">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="w-full bg-white border border-slate-200 rounded-lg px-2 py-2 text-sm font-mono text-emerald-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all text-right"
                          placeholder="0.00"
                          value={it.rate}
                          onChange={e => updateItem(idx, 'rate', e.target.value)}
                        />
                      </div>

                      {/* GST % */}
                      <div className="col-span-1">
                        <select
                          className="w-full bg-white border border-slate-200 rounded-lg px-1.5 py-2 text-xs text-slate-900 outline-none focus:border-indigo-400 transition-all"
                          value={it.gst_rate}
                          onChange={e => updateItem(idx, 'gst_rate', e.target.value)}
                        >
                          {[0, 5, 12, 18, 28].map(g => (
                            <option key={g} value={g}>{g}%</option>
                          ))}
                        </select>
                      </div>

                      {/* Total */}
                      <div className="col-span-2 flex items-center justify-end">
                        {hasRate ? (
                          <div className="text-right">
                            <p className="text-sm font-medium font-mono text-slate-800">₹{inr(total)}</p>
                            {gst > 0 && (
                              <p className="text-[10px] text-amber-500">+₹{inr(gst)} GST</p>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-300 italic">—</span>
                        )}
                      </div>

                      {/* Remarks */}
                      <div className="col-span-2">
                        <input
                          className="w-full bg-white border border-slate-200 rounded-lg px-2 py-2 text-xs text-slate-900 outline-none focus:border-indigo-400 transition-all"
                          placeholder="Brand/Make"
                          value={it.remarks}
                          onChange={e => updateItem(idx, 'remarks', e.target.value)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Notes */}
            <div className="mt-5 pt-5 border-t border-slate-100 space-y-1.5">
              <label className="text-xs font-medium text-slate-900 font-medium flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" /> General Notes &amp; Exclusions
              </label>
              <textarea
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-400 transition-all resize-none"
                rows={3}
                placeholder="Enter additional terms, validity period, inclusions/exclusions…"
                value={formData.notes}
                onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))}
              />
            </div>

            {/* Footer actions */}
            <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between">
              <div className="text-xs text-slate-400">
                {itemRates.filter(it => it.rate).length}/{itemRates.length} items rated
              </div>
              <button
                onClick={handleSubmit}
                disabled={createMutation.isPending}
                className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-2.5 rounded-xl text-sm font-medium shadow-sm hover:bg-indigo-700 transition-all disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {createMutation.isPending ? 'Submitting…' : 'Submit Quotation'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
