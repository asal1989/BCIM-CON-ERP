import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertCircle, Building2, CheckCircle2, Download, FileSpreadsheet, FileText, Send, Upload } from 'lucide-react';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import { quotationAPI } from '../../api/client';

const inr = (v) => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cleanKey = (v) => String(v ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
const getCell = (row, names) => {
  const lookup = new Map(Object.keys(row).map(k => [cleanKey(k), row[k]]));
  for (const name of names) {
    if (lookup.has(cleanKey(name))) return lookup.get(cleanKey(name));
  }
  return '';
};
const hasValue = (v) => v !== undefined && v !== null && String(v).trim() !== '';
const asNumberString = (v) => hasValue(v) ? String(v).replace(/,/g, '').trim() : '';
const itemKey = (v) => cleanKey(v).slice(0, 160);

export default function VendorRFQPortalPage() {
  const { token } = useParams();
  const fileInputRef = useRef(null);
  const [form, setForm] = useState({ delivery_days: '', payment_terms: '', notes: '' });
  const [items, setItems] = useState([]);
  const [submitted, setSubmitted] = useState(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['vendor-rfq', token],
    queryFn: () => quotationAPI.getVendorRFQ(token).then(r => r.data?.data),
    enabled: !!token,
    retry: false,
  });

  useEffect(() => {
    if (!data) return;
    const existingItems = new Map((data.existing?.items || []).map(it => [it.mrs_item_id, it]));
    setForm({
      delivery_days: data.existing?.delivery_days || '',
      payment_terms: data.existing?.payment_terms || '',
      notes: data.existing?.notes || '',
    });
    setItems((data.items || []).map(it => {
      const old = existingItems.get(it.mrs_item_id);
      return {
        ...it,
        rate: old?.rate || '',
        discount_percent: old?.discount_percent || 0,
        gst_rate: old?.gst_rate || 18,
        remarks: old?.remarks || '',
      };
    }));
  }, [data]);

  const submitMutation = useMutation({
    mutationFn: () => quotationAPI.submitVendorRFQ(token, {
      ...form,
      items: items.map(it => ({
        mrs_item_id: it.mrs_item_id,
        rate: it.rate,
        discount_percent: it.discount_percent || 0,
        gst_rate: it.gst_rate || 18,
        remarks: it.remarks || '',
      })),
    }),
    onSuccess: () => {
      setSubmitted(true);
      toast.success('Quotation submitted successfully');
    },
    onError: e => toast.error(e?.response?.data?.error || 'Failed to submit quotation'),
  });

  const totals = useMemo(() => {
    return items.reduce((acc, it) => {
      const basicBeforeDiscount = Number(it.quantity || 0) * Number(it.rate || 0);
      const discount = basicBeforeDiscount * (Number(it.discount_percent || 0) / 100);
      const basic = basicBeforeDiscount - discount;
      const gst = basic * (Number(it.gst_rate || 0) / 100);
      acc.basic += basic;
      acc.gst += gst;
      acc.total += basic + gst;
      return acc;
    }, { basic: 0, gst: 0, total: 0 });
  }, [items]);

  const setItem = (idx, key, value) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [key]: value } : it));
  };

  const downloadExcelTemplate = () => {
    if (!items.length) {
      toast.error('No RFQ items available to export');
      return;
    }

    const rows = items.map((it, idx) => ({
      'Sl No': idx + 1,
      'Item ID': it.mrs_item_id,
      'Description': it.material_name,
      'Qty': Number(it.quantity || 0),
      'Unit': it.unit || '',
      'Rate': it.rate || '',
      'Discount %': it.discount_percent || 0,
      'GST %': it.gst_rate || 18,
      'Remarks': it.remarks || '',
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 8 },
      { wch: 38 },
      { wch: 70 },
      { wch: 12 },
      { wch: 12 },
      { wch: 14 },
      { wch: 14 },
      { wch: 10 },
      { wch: 32 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'RFQ Items');
    const safeRfq = String(data?.rfq?.rfq_number || 'RFQ').replace(/[\\/:*?"<>|]+/g, '-');
    XLSX.writeFile(wb, `${safeRfq}-quotation-template.xlsx`);
  };

  const uploadExcelTemplate = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const sheetName = wb.SheetNames[0];
      if (!sheetName) throw new Error('No worksheet found');

      const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' });
      if (!rows.length) {
        toast.error('Excel file has no item rows');
        return;
      }

      const byId = new Map(items.map(it => [String(it.mrs_item_id), it]));
      const byDescription = new Map(items.map(it => [itemKey(it.material_name), it]));
      const updates = new Map();
      let matched = 0;

      rows.forEach(row => {
        const excelId = String(getCell(row, ['Item ID', 'Item Id', 'ID'])).trim();
        const description = getCell(row, ['Description', 'Item', 'Material', 'Material Name']);
        const target = (excelId && byId.get(excelId)) || byDescription.get(itemKey(description));
        if (!target) return;

        const rate = getCell(row, ['Rate', 'Rate Rs', 'Rate (Rs)', 'Unit Rate']);
        const discount = getCell(row, ['Discount %', 'Discount', 'Disc %', 'Disc']);
        const gst = getCell(row, ['GST %', 'GST', 'GST Rate']);
        const remarks = getCell(row, ['Remarks', 'Remark', 'Notes']);
        const next = {};

        if (hasValue(rate)) next.rate = asNumberString(rate);
        if (hasValue(discount)) next.discount_percent = asNumberString(discount);
        if (hasValue(gst)) next.gst_rate = asNumberString(gst);
        if (hasValue(remarks)) next.remarks = String(remarks);

        if (Object.keys(next).length) {
          updates.set(String(target.mrs_item_id), next);
          matched += 1;
        }
      });

      if (!updates.size) {
        toast.error('No matching RFQ item rows found in Excel');
        return;
      }

      setItems(prev => prev.map(it => {
        const patch = updates.get(String(it.mrs_item_id));
        return patch ? { ...it, ...patch } : it;
      }));
      toast.success(`${matched} item rate row${matched > 1 ? 's' : ''} loaded from Excel`);
    } catch (e) {
      toast.error(e?.message || 'Failed to read Excel file');
    }
  };

  const submit = () => {
    if (items.some(it => it.rate === '' || Number.isNaN(Number(it.rate)))) {
      toast.error('Please enter rate for every item');
      return;
    }
    submitMutation.mutate();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-100 p-6 flex items-center justify-center">
        <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm text-slate-700">Loading RFQ...</div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="min-h-screen bg-slate-100 p-6 flex items-center justify-center">
        <div className="bg-white border border-red-100 rounded-2xl p-8 shadow-sm text-center max-w-md">
          <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
          <h1 className="text-lg font-bold text-slate-900">RFQ Link Not Available</h1>
          <p className="text-sm text-slate-600 mt-2">{error?.response?.data?.error || 'This RFQ link is invalid or expired.'}</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-slate-100 p-6 flex items-center justify-center">
        <div className="bg-white border border-emerald-100 rounded-2xl p-8 shadow-sm text-center max-w-md">
          <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-slate-900">Quotation Submitted</h1>
          <p className="text-sm text-slate-600 mt-2">Thank you. Your quotation has been submitted to BCIM Procurement.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="bg-slate-950 text-white border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-6 py-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-slate-300">BCIM Engineering Private Limited</p>
            <h1 className="text-2xl font-bold mt-1">Vendor Quotation Portal</h1>
            <p className="text-sm text-slate-300 mt-1">{data.rfq.rfq_number} - {data.mrs.mrs_number}</p>
          </div>
          <button
            onClick={submit}
            disabled={submitMutation.isPending}
            className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            {submitMutation.isPending ? 'Submitting...' : 'Submit Quotation'}
          </button>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-5">
        <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Info label="Vendor" value={data.vendor.name} />
            <Info label="Project" value={data.mrs.project_name} />
            <Info label="Due Date" value={data.rfq.due_date ? dayjs(data.rfq.due_date).format('DD-MM-YYYY') : '-'} />
            <Info label="Required By" value={data.mrs.required_by ? dayjs(data.mrs.required_by).format('DD-MM-YYYY') : '-'} />
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <section className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-600" />
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">Item Rates</h2>
            </div>
            <div className="mx-5 mt-5 mb-2 rounded-xl border border-blue-100 bg-blue-50 p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-white border border-blue-100 flex items-center justify-center shrink-0">
                  <FileSpreadsheet className="w-5 h-5 text-blue-700" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Excel option for long item quotations</h3>
                  <p className="text-xs text-slate-600 mt-1">Download the item list, fill rate / discount / GST / remarks in Excel, upload it here, then submit the quotation.</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={downloadExcelTemplate}
                  className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-white border border-blue-200 text-blue-700 text-xs font-bold hover:bg-blue-100"
                >
                  <Download className="w-4 h-4" />
                  Download Excel
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={uploadExcelTemplate}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700"
                >
                  <Upload className="w-4 h-4" />
                  Upload Filled Excel
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-700">
                  <tr>
                    <th className="px-4 py-3 text-left">Description</th>
                    <th className="px-4 py-3 text-right">Qty</th>
                    <th className="px-4 py-3 text-left">Unit</th>
                    <th className="px-4 py-3 text-right">Rate</th>
                    <th className="px-4 py-3 text-right">Disc %</th>
                    <th className="px-4 py-3 text-right">GST %</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3 text-left">Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((it, idx) => {
                    const basic = Number(it.quantity || 0) * Number(it.rate || 0) * (1 - Number(it.discount_percent || 0) / 100);
                    const total = basic + basic * Number(it.gst_rate || 0) / 100;
                    return (
                      <tr key={it.mrs_item_id}>
                        <td className="px-4 py-3 font-semibold text-slate-900 min-w-72">{it.material_name}</td>
                        <td className="px-4 py-3 text-right font-mono">{it.quantity}</td>
                        <td className="px-4 py-3">{it.unit}</td>
                        <td className="px-4 py-3">
                          <input type="number" min="0" value={it.rate} onChange={e => setItem(idx, 'rate', e.target.value)} className="w-24 h-9 border border-slate-200 rounded-lg px-2 text-right font-mono" />
                        </td>
                        <td className="px-4 py-3">
                          <input type="number" min="0" value={it.discount_percent} onChange={e => setItem(idx, 'discount_percent', e.target.value)} className="w-20 h-9 border border-slate-200 rounded-lg px-2 text-right font-mono" />
                        </td>
                        <td className="px-4 py-3">
                          <input type="number" min="0" value={it.gst_rate} onChange={e => setItem(idx, 'gst_rate', e.target.value)} className="w-20 h-9 border border-slate-200 rounded-lg px-2 text-right font-mono" />
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-slate-900">Rs {inr(total)}</td>
                        <td className="px-4 py-3">
                          <input value={it.remarks} onChange={e => setItem(idx, 'remarks', e.target.value)} className="w-44 h-9 border border-slate-200 rounded-lg px-2" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <aside className="space-y-5">
            <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <Building2 className="w-4 h-4 text-blue-600" />
                <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">Terms</h2>
              </div>
              <label className="block mb-3">
                <span className="text-xs font-semibold text-slate-700">Delivery Days</span>
                <input type="number" min="0" value={form.delivery_days} onChange={e => setForm({ ...form, delivery_days: e.target.value })} className="mt-1 w-full h-10 border border-slate-200 rounded-lg px-3" />
              </label>
              <label className="block mb-3">
                <span className="text-xs font-semibold text-slate-700">Payment Terms</span>
                <input value={form.payment_terms} onChange={e => setForm({ ...form, payment_terms: e.target.value })} className="mt-1 w-full h-10 border border-slate-200 rounded-lg px-3" placeholder="e.g. 30 days" />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-slate-700">Notes</span>
                <textarea rows={4} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 resize-none" />
              </label>
            </section>

            <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-4">Summary</h2>
              <Summary label="Basic" value={totals.basic} />
              <Summary label="GST" value={totals.gst} />
              <div className="pt-3 mt-3 border-t border-slate-200 flex justify-between items-center">
                <span className="text-sm font-bold text-slate-900">Grand Total</span>
                <span className="text-xl font-bold text-blue-700">Rs {inr(totals.total)}</span>
              </div>
            </section>

            {(data.rfq.delivery_location || data.rfq.terms) && (
              <section className="bg-blue-50 border border-blue-100 rounded-2xl p-5">
                {data.rfq.delivery_location && <p className="text-sm text-slate-900"><strong>Delivery:</strong> {data.rfq.delivery_location}</p>}
                {data.rfq.terms && <p className="text-sm text-slate-900 mt-3 whitespace-pre-wrap"><strong>RFQ Terms:</strong><br />{data.rfq.terms}</p>}
              </section>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div>
      <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">{label}</p>
      <p className="text-sm font-bold text-slate-900 mt-1">{value || '-'}</p>
    </div>
  );
}

function Summary({ label, value }) {
  return (
    <div className="flex justify-between items-center py-1.5 text-sm">
      <span className="text-slate-600">{label}</span>
      <span className="font-bold text-slate-900">Rs {inr(value)}</span>
    </div>
  );
}
