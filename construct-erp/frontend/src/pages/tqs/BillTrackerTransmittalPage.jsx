import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useReactToPrint } from 'react-to-print';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { tqsTransmittalAPI, projectAPI } from '../../api/client';
import {
  Plus, Printer, FileDown, Eye, Send, CheckCircle, Trash2,
  ChevronLeft, Search, X, Loader2,
} from 'lucide-react';
import dayjs from 'dayjs';

// ─── Status badge ─────────────────────────────────────────────────────────────
const STATUS = {
  draft:     { label: 'Draft',     cls: 'bg-gray-100 text-gray-700' },
  submitted: { label: 'Sent to HO', cls: 'bg-blue-100 text-blue-700' },
  received:  { label: 'Received',  cls: 'bg-green-100 text-green-700' },
};
function StatusBadge({ status }) {
  const s = STATUS[status] || STATUS.draft;
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${s.cls}`}>{s.label}</span>;
}

// ─── Format helpers ─────────────────────────────────────────────────────────
const fmt = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d) => d ? dayjs(d).format('DD-MM-YYYY') : '—';
const totalOf = (i) => Number(i.amount || 0) + Number(i.tax_amount || 0);

// Static public asset, no auth needed — fetched once and cached for jsPDF's
// addImage(), which needs a base64 data URI rather than a plain <img> src.
let logoBase64Cache = null;
async function loadBcimLogoBase64() {
  if (logoBase64Cache) return logoBase64Cache;
  try {
    const resp = await fetch('/bcim-logo.png');
    const blob = await resp.blob();
    logoBase64Cache = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    return logoBase64Cache;
  } catch {
    return null;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// PRINT TEMPLATE — replicates the site's existing "INTERNAL INVOICES
// TRANSMITTAL" Excel format exactly (title, header block, 10-column table,
// two-party sign-off, doc-control footer line).
// ═════════════════════════════════════════════════════════════════════════════
const PrintTemplate = React.forwardRef(({ t }, ref) => {
  if (!t) return null;
  const items = t.items || [];
  const totalWithoutTax = items.reduce((s, i) => s + Number(i.amount || 0), 0);
  const totalTax         = items.reduce((s, i) => s + Number(i.tax_amount || 0), 0);
  const grandTotal        = totalWithoutTax + totalTax;

  const NAVY = '#1B3A6B';

  return (
    <div ref={ref} style={{ fontFamily: 'Arial, sans-serif', fontSize: '10px', padding: '20px 24px', color: '#000' }}>

      {/* Letterhead — logo + company name, same convention as every other
          print template in the app (ReportPrintKit's ReportPrintHeader). */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, borderBottom: `3px solid ${NAVY}`, paddingBottom: 10, marginBottom: 14 }}>
        <img src="/bcim-logo.png" alt="BCIM Engineering"
          style={{ height: 52, width: 'auto', objectFit: 'contain', flexShrink: 0 }} />
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 9, fontWeight: 600, color: '#555', letterSpacing: 2, textTransform: 'uppercase' }}>
            BCIM Engineering Pvt. Ltd.
          </div>
          <div style={{ fontSize: 16, fontWeight: 900, color: NAVY, letterSpacing: 0.5, margin: '2px 0' }}>
            INTERNAL INVOICES TRANSMITTAL
          </div>
          <div style={{ fontSize: 9, color: '#444' }}>From : {t.project_name || 'Project'}</div>
        </div>
        <div style={{ width: 52, flexShrink: 0 }} />
      </div>

      {/* Header meta block */}
      <table style={{ borderCollapse: 'collapse', marginBottom: '12px', fontSize: '10px' }}>
        <tbody>
          <tr>
            <td style={{ padding: '2px 8px 2px 0', fontWeight: 'bold' }}>Transmittal No :</td>
            <td style={{ padding: '2px 0', fontWeight: 'bold', color: NAVY }}>{t.transmittal_number}</td>
          </tr>
          <tr>
            <td style={{ padding: '2px 8px 2px 0', fontWeight: 'bold' }}>Transmittal Revision :</td>
            <td style={{ padding: '2px 0' }}>{t.revision || 'REV.000'}</td>
          </tr>
          <tr>
            <td style={{ padding: '2px 8px 2px 0', fontWeight: 'bold' }}>Transmittal Date :</td>
            <td style={{ padding: '2px 0' }}>{fmtDate(t.transmittal_date)}</td>
          </tr>
        </tbody>
      </table>

      {/* Invoice table */}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {['Sl No', 'Invoice No.', 'Dated', 'Vendor Name', 'Invoice Amount\nwithout Tax', 'Tax %', 'Tax Amount', 'Total Amount', 'HSN Codes', 'Remarks']
              .map((h) => (
                <th key={h} style={{ background: NAVY, color: '#fff', border: `1px solid ${NAVY}`, padding: '5px 6px', textAlign: 'center', fontWeight: 'bold', fontSize: '9px', whiteSpace: 'pre-line' }}>
                  {h}
                </th>
              ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={item.id || idx} style={{ background: idx % 2 ? '#F3F6FB' : '#fff' }}>
              <td style={{ border: '1px solid #bbb', padding: '3px 6px', textAlign: 'center' }}>{item.sl_no ?? idx + 1}</td>
              <td style={{ border: '1px solid #bbb', padding: '3px 6px' }}>{item.invoice_no || ''}</td>
              <td style={{ border: '1px solid #bbb', padding: '3px 6px', textAlign: 'center' }}>{fmtDate(item.invoice_date)}</td>
              <td style={{ border: '1px solid #bbb', padding: '3px 6px' }}>{(item.vendor_name || '').toUpperCase()}</td>
              <td style={{ border: '1px solid #bbb', padding: '3px 6px', textAlign: 'right' }}>{fmt(item.amount)}</td>
              <td style={{ border: '1px solid #bbb', padding: '3px 6px', textAlign: 'center' }}>{item.tax_pct ? `${item.tax_pct}%` : ''}</td>
              <td style={{ border: '1px solid #bbb', padding: '3px 6px', textAlign: 'right' }}>{fmt(item.tax_amount)}</td>
              <td style={{ border: '1px solid #bbb', padding: '3px 6px', textAlign: 'right', fontWeight: 'bold' }}>{fmt(totalOf(item))}</td>
              <td style={{ border: '1px solid #bbb', padding: '3px 6px', textAlign: 'center' }}>{item.hsn_codes || ''}</td>
              <td style={{ border: '1px solid #bbb', padding: '3px 6px' }}>{item.item_remarks || ''}</td>
            </tr>
          ))}
          {/* Total */}
          <tr style={{ background: '#E8EDF5', fontWeight: 'bold' }}>
            <td colSpan={4} style={{ border: '1px solid #999', padding: '6px', textAlign: 'right', color: NAVY }}>TOTAL AMOUNT</td>
            <td style={{ border: '1px solid #999', padding: '6px', textAlign: 'right', color: NAVY }}>{fmt(totalWithoutTax)}</td>
            <td style={{ border: '1px solid #999', padding: '6px' }}></td>
            <td style={{ border: '1px solid #999', padding: '6px', textAlign: 'right', color: NAVY }}>{fmt(totalTax)}</td>
            <td style={{ border: '1px solid #999', padding: '6px', textAlign: 'right', color: NAVY }}>{fmt(grandTotal)}</td>
            <td colSpan={2} style={{ border: '1px solid #999', padding: '6px' }}></td>
          </tr>
        </tbody>
      </table>

      {t.remarks && (
        <div style={{ marginTop: '8px', fontSize: '10px' }}>
          <strong>Remarks:</strong> {t.remarks}
        </div>
      )}

      {/* Sign-off — Issued By (Site) / Received By (HO), matching the source form exactly */}
      <table style={{ width: '100%', marginTop: '34px', borderCollapse: 'collapse', fontSize: '10px' }}>
        <tbody>
          <tr>
            <td style={{ width: '50%', verticalAlign: 'top', paddingRight: '20px', borderTop: `1.5px solid ${NAVY}`, paddingTop: '10px' }}>
              <div style={{ fontWeight: 'bold', color: NAVY }}>Issued By : BCIM Engineering Pvt. Ltd ({t.project_short || t.project_name || 'Site'})</div>
              <div style={{ marginTop: '18px' }}>NAME: {t.issued_by || '_______________'}</div>
              <div style={{ marginTop: '10px' }}>Sign : _______________</div>
              <div style={{ marginTop: '10px' }}>Date: {fmtDate(t.issued_date)}</div>
            </td>
            <td style={{ width: '50%', verticalAlign: 'top', borderTop: `1.5px solid ${NAVY}`, paddingTop: '10px' }}>
              <div style={{ fontWeight: 'bold', color: NAVY }}>Received By : BCIM Engineering Pvt Ltd (HO)</div>
              <div style={{ marginTop: '18px' }}>Name: {t.received_by || '_______________'}</div>
              <div style={{ marginTop: '10px' }}>Sign : _______________</div>
              <div style={{ marginTop: '10px' }}>Date: {t.received_date ? fmtDate(t.received_date) : '_______________'}</div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Doc control footer */}
      <div style={{ marginTop: '24px', paddingTop: '6px', borderTop: '1px solid #ccc', textAlign: 'center', fontSize: '8px', color: '#666' }}>
        Doc.No. BCIM/FR/001/01 &nbsp;&nbsp;&nbsp; Rev. 01 &nbsp;&nbsp;&nbsp; Date: 27.8.2018
      </div>
    </div>
  );
});
PrintTemplate.displayName = 'PrintTemplate';

// ═════════════════════════════════════════════════════════════════════════════
// CREATE MODAL
// ═════════════════════════════════════════════════════════════════════════════
function CreateModal({ onClose, onCreated }) {
  const [projects, setProjects] = useState([]);
  const [bills, setBills] = useState([]);
  const [selectedBills, setSelectedBills] = useState([]); // full bill objects
  const [itemDetails, setItemDetails] = useState({});     // { [billId]: { hsn_codes, item_remarks } }
  const [billSearch, setBillSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    project_id: '',
    transmittal_date: dayjs().format('YYYY-MM-DD'),
    revision: 'REV.000',
    issued_by: '',
    remarks: '',
  });

  useEffect(() => {
    projectAPI.list().then(r => {
      const d = r.data;
      setProjects(Array.isArray(d) ? d : (d?.projects ?? d?.data ?? []));
    }).catch(() => {});
  }, []);

  const loadBills = useCallback(async () => {
    if (!form.project_id) { setBills([]); return; }
    try {
      const params = { project_id: form.project_id };
      if (billSearch) params.search = billSearch;
      const r = await tqsTransmittalAPI.lookupBills(params);
      setBills(r.data || []);
    } catch { /* ignore */ }
  }, [form.project_id, billSearch]);

  useEffect(() => { loadBills(); }, [loadBills]);

  const toggleBill = (bill) => {
    setSelectedBills(prev =>
      prev.find(b => b.id === bill.id)
        ? prev.filter(b => b.id !== bill.id)
        : [...prev, bill]
    );
  };

  const setDetail = (billId, key, value) =>
    setItemDetails(prev => ({ ...prev, [billId]: { ...prev[billId], [key]: value } }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.transmittal_date || !form.project_id) return;
    setSaving(true);
    try {
      const item_overrides = {};
      selectedBills.forEach(b => { item_overrides[b.id] = itemDetails[b.id] || {}; });
      const r = await tqsTransmittalAPI.create({
        ...form,
        bill_ids: selectedBills.map(b => b.id),
        item_overrides,
      });
      onCreated(r.data);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create transmittal');
    } finally {
      setSaving(false);
    }
  };

  const totalSelected = selectedBills.reduce((s, b) => s + Number(b.amount || 0) + Number(b.tax_amount || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="text-lg font-medium text-gray-800">New Transmittal — Site to HO</h2>
            <p className="text-xs text-slate-500 mt-0.5">Select the invoices being sent to Head Office and fill in any missing details.</p>
          </div>
          <button onClick={onClose} className="text-slate-900 font-medium hover:text-gray-600"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Meta fields */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-900 mb-1">Project *</label>
              <select
                required
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form.project_id}
                onChange={e => { setForm(f => ({ ...f, project_id: e.target.value })); setSelectedBills([]); }}
              >
                <option value="">— Select Project —</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <p className="text-[10px] text-slate-400 mt-1">Transmittal number is generated per project (BCIM-&lt;code&gt;-HO-INV-XXX).</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-900 mb-1">Transmittal Date *</label>
              <input
                required
                type="date"
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form.transmittal_date}
                onChange={e => setForm(f => ({ ...f, transmittal_date: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-900 mb-1">Revision</label>
              <input
                type="text"
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form.revision}
                onChange={e => setForm(f => ({ ...f, revision: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-900 mb-1">Issued By (Site)</label>
              <input
                type="text"
                placeholder="e.g. Derek"
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form.issued_by}
                onChange={e => setForm(f => ({ ...f, issued_by: e.target.value }))}
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-900 mb-1">Remarks</label>
              <input
                type="text"
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form.remarks}
                onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))}
              />
            </div>
          </div>

          {/* Bill picker */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-700">Select Invoices to Include</label>
              {selectedBills.length > 0 && (
                <span className="text-xs text-blue-600 font-semibold">
                  {selectedBills.length} selected — Total: ₹{fmt(totalSelected)}
                </span>
              )}
            </div>
            {!form.project_id ? (
              <div className="border rounded-lg py-8 text-center text-sm text-slate-400">Select a project first</div>
            ) : (
              <>
                <div className="relative mb-2">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search invoice no or vendor…"
                    className="w-full border rounded-lg pl-8 pr-3 py-2 text-sm"
                    value={billSearch}
                    onChange={e => setBillSearch(e.target.value)}
                  />
                </div>
                <div className="border rounded-lg max-h-52 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left w-8"></th>
                        <th className="px-3 py-2 text-left">Invoice No</th>
                        <th className="px-3 py-2 text-left">Date</th>
                        <th className="px-3 py-2 text-left">Vendor</th>
                        <th className="px-3 py-2 text-right">Amount (excl. tax)</th>
                        <th className="px-3 py-2 text-right">Tax</th>
                        <th className="px-3 py-2 text-left">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bills.length === 0 && (
                        <tr><td colSpan={7} className="text-center py-6 text-gray-400">No eligible invoices found</td></tr>
                      )}
                      {bills.map(b => {
                        const checked = !!selectedBills.find(s => s.id === b.id);
                        return (
                          <tr
                            key={b.id}
                            className={`cursor-pointer hover:bg-blue-50 ${checked ? 'bg-blue-50' : ''}`}
                            onClick={() => toggleBill(b)}
                          >
                            <td className="px-3 py-2">
                              <input type="checkbox" readOnly checked={checked} className="accent-blue-600" />
                            </td>
                            <td className="px-3 py-2 font-medium">{b.inv_number || '—'}</td>
                            <td className="px-3 py-2">{fmtDate(b.inv_date)}</td>
                            <td className="px-3 py-2">{(b.vendor_name || '').toUpperCase() || '—'}</td>
                            <td className="px-3 py-2 text-right">₹{fmt(b.amount)}</td>
                            <td className="px-3 py-2 text-right">₹{fmt(b.tax_amount)}</td>
                            <td className="px-3 py-2">
                              <StatusBadge status={
                                b.workflow_status === 'paid' ? 'received'
                                : b.workflow_status === 'accounts' ? 'submitted'
                                : 'draft'
                              } />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          {/* Per-item HSN / remarks — not captured anywhere upstream, so filled here */}
          {selectedBills.length > 0 && (
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-2">HSN Codes &amp; Remarks (per invoice)</label>
              <div className="border rounded-lg max-h-44 overflow-y-auto divide-y">
                {selectedBills.map(b => (
                  <div key={b.id} className="flex items-center gap-2 px-3 py-2">
                    <span className="text-xs font-medium text-slate-700 w-40 truncate">{b.inv_number || b.vendor_name}</span>
                    <input
                      type="text" placeholder="HSN Code"
                      className="border rounded-lg px-2 py-1.5 text-xs w-32"
                      value={itemDetails[b.id]?.hsn_codes || ''}
                      onChange={e => setDetail(b.id, 'hsn_codes', e.target.value)}
                    />
                    <input
                      type="text" placeholder="Remarks"
                      className="border rounded-lg px-2 py-1.5 text-xs flex-1"
                      value={itemDetails[b.id]?.item_remarks || ''}
                      onChange={e => setDetail(b.id, 'item_remarks', e.target.value)}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex justify-end gap-3">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-900 hover:text-slate-900 font-medium border rounded-lg">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !form.project_id}
            className="px-5 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium flex items-center gap-2 disabled:opacity-50"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Create Transmittal
          </button>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// RECEIVE MODAL
// ═════════════════════════════════════════════════════════════════════════════
function ReceiveModal({ transmittal, onClose, onDone }) {
  const [form, setForm] = useState({
    received_by: '',
    received_date: dayjs().format('YYYY-MM-DD'),
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.received_by) return;
    setSaving(true);
    try {
      await tqsTransmittalAPI.receive(transmittal.id, form);
      onDone();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-medium text-gray-800">Mark as Received (HO)</h3>
          <button onClick={onClose} className="text-slate-900 font-medium hover:text-gray-600"><X size={18} /></button>
        </div>
        <p className="text-sm text-slate-900 font-medium mb-4">Transmittal: <strong>{transmittal.transmittal_number}</strong></p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-900 mb-1">Received By *</label>
            <input
              required
              type="text"
              placeholder="e.g. Mr. Krishna"
              className="w-full border rounded-lg px-3 py-2 text-sm"
              value={form.received_by}
              onChange={e => setForm(f => ({ ...f, received_by: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-900 mb-1">Received Date</label>
            <input
              type="date"
              className="w-full border rounded-lg px-3 py-2 text-sm"
              value={form.received_date}
              onChange={e => setForm(f => ({ ...f, received_date: e.target.value }))}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm border rounded-lg text-gray-600">Cancel</button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium flex items-center gap-2 disabled:opacity-50"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              Confirm Receipt
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// DETAIL VIEW
// ═════════════════════════════════════════════════════════════════════════════
function DetailView({ id, onBack, onRefresh }) {
  const [t, setT] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showReceive, setShowReceive] = useState(false);
  const printRef = useRef();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await tqsTransmittalAPI.get(id);
      setT(r.data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handlePrint = useReactToPrint({ contentRef: printRef });

  const handlePDF = async () => {
    if (!t) return;
    const items = t.items || [];
    const totalWithoutTax = items.reduce((s, i) => s + Number(i.amount || 0), 0);
    const totalTax = items.reduce((s, i) => s + Number(i.tax_amount || 0), 0);
    const grandTotal = totalWithoutTax + totalTax;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const NAVY = [27, 58, 107]; // #1B3A6B, matches the print template / ReportPrintKit

    const logo = await loadBcimLogoBase64();
    if (logo) doc.addImage(logo, 'PNG', 14, 8, 20, 20, undefined, 'FAST');

    doc.setTextColor(...NAVY);
    doc.setFontSize(15);
    doc.setFont(undefined, 'bold');
    doc.text('INTERNAL INVOICES TRANSMITTAL', 148, 15, { align: 'center' });
    doc.setTextColor(80);
    doc.setFont(undefined, 'normal');
    doc.setFontSize(9);
    doc.text('BCIM ENGINEERING PVT. LTD.', 148, 21, { align: 'center' });
    doc.setTextColor(0);
    doc.text(`From: ${t.project_name || ''}`, 282, 26, { align: 'right' });
    doc.setDrawColor(...NAVY);
    doc.setLineWidth(0.8);
    doc.line(14, 30, 282, 30);

    doc.text(`Transmittal No: ${t.transmittal_number}   Revision: ${t.revision || 'REV.000'}   Date: ${fmtDate(t.transmittal_date)}`, 14, 37);

    autoTable(doc, {
      startY: 41,
      head: [['Sl No', 'Invoice No.', 'Dated', 'Vendor Name', 'Amt w/o Tax', 'Tax %', 'Tax Amt', 'Total', 'HSN', 'Remarks']],
      body: [
        ...items.map((i, idx) => [
          i.sl_no ?? idx + 1,
          i.invoice_no || '',
          fmtDate(i.invoice_date),
          (i.vendor_name || '').toUpperCase(),
          fmt(i.amount),
          i.tax_pct ? `${i.tax_pct}%` : '',
          fmt(i.tax_amount),
          fmt(totalOf(i)),
          i.hsn_codes || '',
          i.item_remarks || '',
        ]),
        [{ content: 'TOTAL AMOUNT', colSpan: 4, styles: { fontStyle: 'bold', halign: 'right', textColor: NAVY } },
          { content: fmt(totalWithoutTax), styles: { fontStyle: 'bold', halign: 'right', textColor: NAVY } },
          '',
          { content: fmt(totalTax), styles: { fontStyle: 'bold', halign: 'right', textColor: NAVY } },
          { content: fmt(grandTotal), styles: { fontStyle: 'bold', halign: 'right', textColor: NAVY } },
          '', ''],
      ],
      styles: { fontSize: 7.5, cellPadding: 1.8 },
      headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [243, 246, 251] },
      columnStyles: { 0: { halign: 'center', cellWidth: 10 }, 4: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' } },
    });

    const y = doc.lastAutoTable.finalY + 14;
    const blocks = [
      { label: `Issued By : BCIM Engineering Pvt. Ltd (${t.project_name || 'Site'})`, name: t.issued_by, date: t.issued_date },
      { label: 'Received By : BCIM Engineering Pvt Ltd (HO)', name: t.received_by, date: t.received_date },
    ];
    const bw = 130, bh = 32;
    blocks.forEach((b, idx) => {
      const x = 14 + idx * (bw + 8);
      doc.setFontSize(8);
      doc.setFont(undefined, 'bold');
      doc.text(b.label, x, y);
      doc.setFont(undefined, 'normal');
      doc.text(`Name: ${b.name || '_______________'}`, x, y + 10);
      doc.text('Sign: _______________', x, y + 18);
      doc.text(`Date: ${b.date ? fmtDate(b.date) : '_______________'}`, x, y + 26);
    });

    doc.setFontSize(7);
    doc.setTextColor(120);
    doc.text('Doc.No. BCIM/FR/001/01     Rev. 01     Date: 27.8.2018', 148, 200, { align: 'center' });

    doc.save(`Transmittal_${t.transmittal_number}.pdf`);
  };

  const handleSubmit = async () => {
    try {
      await tqsTransmittalAPI.submit(t.id);
      load();
      onRefresh();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed');
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 size={28} className="animate-spin text-blue-500" />
    </div>
  );
  if (!t) return <div className="p-8 text-gray-500">Transmittal not found.</div>;

  const items = t.items || [];
  const totalWithoutTax = items.reduce((s, i) => s + Number(i.amount || 0), 0);
  const totalTax = items.reduce((s, i) => s + Number(i.tax_amount || 0), 0);
  const grandTotal = totalWithoutTax + totalTax;

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-slate-900 hover:text-gray-800">
          <ChevronLeft size={16} /> Back
        </button>
        <div className="flex items-center gap-2">
          <StatusBadge status={t.status} />
          {t.status === 'draft' && (
            <button onClick={handleSubmit} className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg">
              <Send size={14} /> Send to HO
            </button>
          )}
          {t.status === 'submitted' && (
            <button onClick={() => setShowReceive(true)} className="flex items-center gap-1 px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg">
              <CheckCircle size={14} /> Mark Received
            </button>
          )}
          <button onClick={handlePrint} className="flex items-center gap-1 px-3 py-1.5 text-sm border rounded-lg text-slate-900 hover:bg-gray-50">
            <Printer size={14} /> Print
          </button>
          <button onClick={handlePDF} className="flex items-center gap-1 px-3 py-1.5 text-sm border rounded-lg text-slate-900 hover:bg-gray-50">
            <FileDown size={14} /> PDF
          </button>
        </div>
      </div>

      {/* Detail card */}
      <div className="bg-white rounded-xl border shadow-sm p-6 mb-4">
        <div className="grid grid-cols-3 gap-4 text-sm mb-4">
          <div><span className="text-slate-900 font-medium text-xs">Transmittal No</span><div className="font-medium text-blue-700">{t.transmittal_number}</div></div>
          <div><span className="text-slate-900 font-medium text-xs">Revision</span><div>{t.revision || 'REV.000'}</div></div>
          <div><span className="text-slate-900 font-medium text-xs">Date</span><div>{fmtDate(t.transmittal_date)}</div></div>
          <div><span className="text-slate-900 font-medium text-xs">Project (Site)</span><div>{t.project_name || '—'}</div></div>
          <div><span className="text-slate-900 font-medium text-xs">Issued By</span><div>{t.issued_by || '—'}</div></div>
          {t.received_by && <div><span className="text-slate-900 font-medium text-xs">Received By (HO)</span><div className="text-green-700 font-medium">{t.received_by} on {fmtDate(t.received_date)}</div></div>}
          {t.remarks && <div className="col-span-3"><span className="text-slate-900 font-medium text-xs">Remarks</span><div>{t.remarks}</div></div>}
        </div>
      </div>

      {/* Items table */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              {['Sl No', 'Invoice No', 'Dated', 'Vendor Name', 'Amt w/o Tax (₹)', 'Tax %', 'Tax Amt (₹)', 'Total (₹)', 'HSN', 'Remarks'].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-gray-600">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr key={item.id} className="border-t hover:bg-gray-50">
                <td className="px-4 py-2 text-center text-gray-500">{item.sl_no ?? idx + 1}</td>
                <td className="px-4 py-2 font-medium">{item.invoice_no || '—'}</td>
                <td className="px-4 py-2">{fmtDate(item.invoice_date)}</td>
                <td className="px-4 py-2">{(item.vendor_name || '').toUpperCase() || '—'}</td>
                <td className="px-4 py-2 text-right">₹{fmt(item.amount)}</td>
                <td className="px-4 py-2 text-center">{item.tax_pct ? `${item.tax_pct}%` : '—'}</td>
                <td className="px-4 py-2 text-right">₹{fmt(item.tax_amount)}</td>
                <td className="px-4 py-2 text-right font-medium">₹{fmt(totalOf(item))}</td>
                <td className="px-4 py-2 text-slate-600 text-xs">{item.hsn_codes || '—'}</td>
                <td className="px-4 py-2 text-slate-900 font-medium text-xs">{item.item_remarks || ''}</td>
              </tr>
            ))}
            <tr className="border-t bg-gray-50 font-semibold">
              <td colSpan={4} className="px-4 py-2.5 text-right text-sm">TOTAL AMOUNT</td>
              <td className="px-4 py-2.5 text-right text-sm">₹{fmt(totalWithoutTax)}</td>
              <td></td>
              <td className="px-4 py-2.5 text-right text-sm">₹{fmt(totalTax)}</td>
              <td className="px-4 py-2.5 text-right text-sm">₹{fmt(grandTotal)}</td>
              <td colSpan={2}></td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Hidden print template */}
      <div style={{ display: 'none' }}>
        <PrintTemplate ref={printRef} t={t} />
      </div>

      {showReceive && (
        <ReceiveModal
          transmittal={t}
          onClose={() => setShowReceive(false)}
          onDone={() => { setShowReceive(false); load(); onRefresh(); }}
        />
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═════════════════════════════════════════════════════════════════════════════
export default function BillTrackerTransmittalPage() {
  const [transmittals, setTransmittals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [filters, setFilters] = useState({ status: '', search: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.status) params.status = filters.status;
      if (filters.search) params.search = filters.search;
      const r = await tqsTransmittalAPI.list(params);
      setTransmittals(r.data || []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this draft transmittal?')) return;
    try {
      await tqsTransmittalAPI.delete(id);
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Cannot delete');
    }
  };

  if (detailId) {
    return (
      <div className="p-6">
        <DetailView id={detailId} onBack={() => setDetailId(null)} onRefresh={load} />
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-medium text-gray-900">Invoice Transmittals — Site to HO</h1>
          <p className="text-sm text-slate-900 font-medium mt-0.5">Bundle invoices being sent from site to Head Office for payment processing</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"
        >
          <Plus size={16} /> New Transmittal
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-5">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search transmittal no…"
            className="border rounded-lg pl-8 pr-3 py-2 text-sm w-64"
            value={filters.search}
            onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
          />
        </div>
        <select
          className="border rounded-lg px-3 py-2 text-sm"
          value={filters.status}
          onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
        >
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="submitted">Sent to HO</option>
          <option value="received">Received</option>
        </select>
      </div>

      {/* Summary cards */}
      {!loading && (
        <div className="grid grid-cols-3 gap-4 mb-5">
          {[
            { label: 'Total', value: transmittals.length, color: 'blue' },
            { label: 'Sent to HO', value: transmittals.filter(t => t.status === 'submitted').length, color: 'yellow' },
            { label: 'Received', value: transmittals.filter(t => t.status === 'received').length, color: 'green' },
          ].map(c => (
            <div key={c.label} className={`bg-white rounded-xl border shadow-sm p-4`}>
              <div className={`text-2xl font-medium text-${c.color}-600`}>{c.value}</div>
              <div className="text-xs text-slate-900 font-medium mt-0.5">{c.label} Transmittals</div>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 size={28} className="animate-spin text-blue-500" />
          </div>
        ) : transmittals.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-lg font-medium">No transmittals found</p>
            <p className="text-sm mt-1">Create your first Site-to-HO invoice transmittal</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Transmittal No', 'Date', 'Project', 'Invoices', 'Total Amount', 'Status', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {transmittals.map(t => (
                <tr key={t.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-blue-700">{t.transmittal_number}</td>
                  <td className="px-4 py-3">{fmtDate(t.transmittal_date)}</td>
                  <td className="px-4 py-3 text-gray-600">{t.project_name || '—'}</td>
                  <td className="px-4 py-3 text-center">{t.bill_count || 0}</td>
                  <td className="px-4 py-3 font-medium text-right">₹{fmt(t.total_amount)}</td>
                  <td className="px-4 py-3"><StatusBadge status={t.status} /></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setDetailId(t.id)}
                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
                        title="View"
                      >
                        <Eye size={15} />
                      </button>
                      {t.status === 'draft' && (
                        <button
                          onClick={() => handleDelete(t.id)}
                          className="p-1.5 text-red-500 hover:bg-red-50 rounded"
                          title="Delete"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onCreated={(newT) => { setShowCreate(false); load(); setDetailId(newT.id); }}
        />
      )}
    </div>
  );
}
