import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Gavel, Plus, Trash2 } from 'lucide-react';
import { tenderAPI } from '../../api/client';
import toast from 'react-hot-toast';

const fmt = (n) => n != null ? `₹${parseFloat(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';

export default function TenderBidEntryPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: tenderData, isLoading: loadT } = useQuery({
    queryKey: ['tender', id],
    queryFn: () => tenderAPI.get(id).then(r => r.data?.data),
  });

  const [form, setForm] = useState({
    vendor_id: '',
    bid_reference: '',
    submission_date: new Date().toISOString().slice(0, 10),
    validity_days: 90,
    bid_amount: '',
    discount_pct: 0,
    mobilisation_advance_pct: '',
    retention_pct: '',
    completion_days: '',
    technical_score: '',
    financial_score: '',
    emd_submitted: false,
    emd_reference: '',
    remarks: '',
  });
  const [bidItems, setBidItems] = useState([]);

  // When scope items load, pre-populate bid items
  React.useEffect(() => {
    if (tenderData?.scope_items?.length) {
      setBidItems(tenderData.scope_items.map(si => ({
        scope_item_id: si.id,
        description: si.description,
        unit: si.unit,
        quantity: si.quantity,
        unit_rate: '',
        amount: '',
      })));
    }
  }, [tenderData?.scope_items]);

  const handleRateChange = (idx, rate) => {
    const newItems = [...bidItems];
    newItems[idx] = {
      ...newItems[idx],
      unit_rate: rate,
      amount: rate ? (parseFloat(rate) * parseFloat(newItems[idx].quantity || 0)).toFixed(2) : '',
    };
    setBidItems(newItems);
    // Auto-sum bid_amount
    const total = newItems.reduce((s, it) => s + parseFloat(it.amount || 0), 0);
    if (total > 0) setForm(f => ({ ...f, bid_amount: total.toFixed(2) }));
  };

  const disc = parseFloat(form.discount_pct || 0);
  const baseAmt = parseFloat(form.bid_amount || 0);
  const finalAmount = baseAmt - (baseAmt * disc / 100);

  const submitMut = useMutation({
    mutationFn: (d) => tenderAPI.submitBid(id, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tender', id] });
      qc.invalidateQueries({ queryKey: ['tender-bids', id] });
      toast.success('Bid submitted');
      navigate(`/procurement/tenders/${id}?tab=bids`);
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to submit bid'),
  });

  const handleSubmit = () => {
    if (!form.vendor_id) return toast.error('Select a vendor');
    if (!form.bid_amount) return toast.error('Enter bid amount');
    submitMut.mutate({
      ...form,
      bid_amount: parseFloat(form.bid_amount),
      bid_items: bidItems.filter(it => it.unit_rate).map(it => ({
        scope_item_id: it.scope_item_id,
        unit_rate: parseFloat(it.unit_rate),
        amount: parseFloat(it.amount || 0),
      })),
    });
  };

  if (loadT) return <div className="text-slate-900 font-medium py-12 text-center">Loading…</div>;
  const tender = tenderData;

  // Get invited vendors from tender
  const vendors = tender?.invited_vendors || [];

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 text-slate-900 font-medium hover:text-white"><ArrowLeft className="w-5 h-5" /></button>
        <div>
          <h1 className="text-xl font-medium text-white">Enter Bid</h1>
          <p className="text-sm text-slate-400">{tender?.tender_number} · {tender?.title}</p>
        </div>
      </div>

      {/* Vendor + Header fields */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        <h3 className="col-span-full text-sm font-medium text-slate-300 uppercase tracking-wide">Bid Header</h3>
        <div>
          <label className="block text-xs text-slate-900 font-medium mb-1">Vendor *</label>
          <select value={form.vendor_id} onChange={e => setForm(f => ({ ...f, vendor_id: e.target.value }))}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-violet-500">
            <option value="">Select invited vendor…</option>
            {vendors.map(v => <option key={v.vendor_id} value={v.vendor_id}>{v.vendor_name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-900 font-medium mb-1">Bid Reference</label>
          <input value={form.bid_reference} onChange={e => setForm(f => ({ ...f, bid_reference: e.target.value }))}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none"
            placeholder="Vendor's bid ref no." />
        </div>
        <div>
          <label className="block text-xs text-slate-900 font-medium mb-1">Submission Date</label>
          <input type="date" value={form.submission_date} onChange={e => setForm(f => ({ ...f, submission_date: e.target.value }))}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none" />
        </div>
        <div>
          <label className="block text-xs text-slate-900 font-medium mb-1">Validity (days)</label>
          <input type="number" value={form.validity_days} onChange={e => setForm(f => ({ ...f, validity_days: e.target.value }))}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none" />
        </div>
        <div>
          <label className="block text-xs text-slate-900 font-medium mb-1">Completion (days)</label>
          <input type="number" value={form.completion_days} onChange={e => setForm(f => ({ ...f, completion_days: e.target.value }))}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none"
            placeholder="Contract duration in days" />
        </div>
        <div>
          <label className="block text-xs text-slate-900 font-medium mb-1">Mobilisation Advance %</label>
          <input type="number" value={form.mobilisation_advance_pct} onChange={e => setForm(f => ({ ...f, mobilisation_advance_pct: e.target.value }))}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none"
            placeholder="0" />
        </div>
        <div>
          <label className="block text-xs text-slate-900 font-medium mb-1">Retention %</label>
          <input type="number" value={form.retention_pct} onChange={e => setForm(f => ({ ...f, retention_pct: e.target.value }))}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none"
            placeholder="0" />
        </div>
        <div>
          <label className="block text-xs text-slate-900 font-medium mb-1">Technical Score (0–100)</label>
          <input type="number" value={form.technical_score} onChange={e => setForm(f => ({ ...f, technical_score: e.target.value }))}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none" />
        </div>
        <div>
          <label className="block text-xs text-slate-900 font-medium mb-1">Financial Score (0–100)</label>
          <input type="number" value={form.financial_score} onChange={e => setForm(f => ({ ...f, financial_score: e.target.value }))}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none" />
        </div>
        <div className="flex items-center gap-2 mt-1">
          <input type="checkbox" id="emd" checked={form.emd_submitted} onChange={e => setForm(f => ({ ...f, emd_submitted: e.target.checked }))}
            className="accent-violet-500" />
          <label htmlFor="emd" className="text-sm text-slate-300">EMD Submitted</label>
          {form.emd_submitted && (
            <input value={form.emd_reference} onChange={e => setForm(f => ({ ...f, emd_reference: e.target.value }))}
              placeholder="Reference no." className="ml-2 flex-1 px-2 py-1 bg-slate-700 border border-slate-600 rounded text-white text-xs focus:outline-none" />
          )}
        </div>
        <div className="col-span-full">
          <label className="block text-xs text-slate-900 font-medium mb-1">Remarks</label>
          <textarea value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none h-20 resize-none"
            placeholder="Additional notes…" />
        </div>
      </div>

      {/* Scope item rates */}
      {bidItems.length > 0 && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-700">
            <h3 className="text-sm font-medium text-white">Rate Schedule</h3>
            <p className="text-xs text-slate-900 font-medium mt-0.5">Enter unit rates — bid amount is auto-calculated</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700">
                {['#', 'Description', 'Unit', 'Qty', 'Unit Rate (₹)', 'Amount (₹)'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-slate-900 font-medium text-xs">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bidItems.map((item, idx) => (
                <tr key={item.scope_item_id || idx} className="border-b border-slate-700/50">
                  <td className="px-4 py-2.5 text-slate-900 font-medium text-xs">{idx + 1}</td>
                  <td className="px-4 py-2.5 text-slate-300 max-w-xs">{item.description}</td>
                  <td className="px-4 py-2.5 text-slate-900 font-medium text-xs">{item.unit}</td>
                  <td className="px-4 py-2.5 text-slate-900 font-medium text-xs">{item.quantity}</td>
                  <td className="px-4 py-2.5">
                    <input type="number" value={item.unit_rate}
                      onChange={e => handleRateChange(idx, e.target.value)}
                      className="w-32 px-2 py-1 bg-slate-700 border border-slate-600 rounded text-white text-xs focus:outline-none focus:border-violet-500"
                      placeholder="0.00" />
                  </td>
                  <td className="px-4 py-2.5 text-slate-300 text-xs">
                    {item.amount ? `₹${parseFloat(item.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Financial Summary */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
        <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wide mb-4">Financial Summary</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs text-slate-900 font-medium mb-1">Bid Amount (₹) *</label>
            <input type="number" value={form.bid_amount} onChange={e => setForm(f => ({ ...f, bid_amount: e.target.value }))}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-violet-500"
              placeholder="0.00" />
          </div>
          <div>
            <label className="block text-xs text-slate-900 font-medium mb-1">Discount %</label>
            <input type="number" value={form.discount_pct} onChange={e => setForm(f => ({ ...f, discount_pct: e.target.value }))}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none"
              placeholder="0" />
          </div>
          <div>
            <label className="block text-xs text-slate-900 font-medium mb-1">Final Amount</label>
            <div className="px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-emerald-400 font-medium text-sm">
              {finalAmount > 0 ? `₹${finalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
            </div>
          </div>
        </div>
      </div>

      {/* Submit */}
      <div className="flex gap-3">
        <button onClick={() => navigate(-1)} className="px-6 py-2.5 border border-slate-600 text-slate-900 font-medium rounded-lg text-sm hover:text-white">Cancel</button>
        <button
          disabled={!form.vendor_id || !form.bid_amount || submitMut.isPending}
          onClick={handleSubmit}
          className="px-8 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
        >
          {submitMut.isPending ? 'Submitting…' : 'Submit Bid'}
        </button>
      </div>
    </div>
  );
}
