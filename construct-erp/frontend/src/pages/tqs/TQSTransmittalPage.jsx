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
  submitted: { label: 'Submitted', cls: 'bg-blue-100 text-blue-700' },
  received:  { label: 'Received',  cls: 'bg-green-100 text-green-700' },
};
function StatusBadge({ status }) {
  const s = STATUS[status] || STATUS.draft;
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${s.cls}`}>{s.label}</span>;
}

// ─── Format currency ──────────────────────────────────────────────────────────
const fmt = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d) => d ? dayjs(d).format('DD-MM-YYYY') : '—';

// ═════════════════════════════════════════════════════════════════════════════
// PRINT TEMPLATE
// ═════════════════════════════════════════════════════════════════════════════
const PrintTemplate = React.forwardRef(({ t }, ref) => {
  if (!t) return null;
  const total = (t.items || []).reduce((s, i) => s + Number(i.amount || 0), 0);

  return (
    <div ref={ref} style={{ fontFamily: 'Arial, sans-serif', fontSize: '11px', padding: '24px 28px', color: '#000' }}>

      {/* ── Company Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', borderBottom: '3px solid #1a3c6e', paddingBottom: '10px', marginBottom: '10px' }}>
        {/* Logo box */}
        <div style={{
          width: '64px', height: '64px', background: '#1a3c6e', borderRadius: '6px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          marginRight: '14px', flexShrink: 0,
        }}>
          <div style={{ color: '#fff', fontWeight: '900', fontSize: '20px', lineHeight: '1', letterSpacing: '-1px' }}>BCIM</div>
          <div style={{ color: '#f0a500', fontWeight: '700', fontSize: '7px', letterSpacing: '2px', marginTop: '2px' }}>ENGINEERING</div>
        </div>
        {/* Company name + doc title */}
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: '900', fontSize: '17px', color: '#1a3c6e', letterSpacing: '0.5px', lineHeight: '1.1' }}>
            BCIM ENGINEERING PVT. LTD.
          </div>
          <div style={{ fontSize: '10px', color: '#555', marginTop: '1px' }}>
            Construction &amp; Project Management Services
          </div>
          <div style={{
            display: 'inline-block', marginTop: '6px',
            background: '#1a3c6e', color: '#fff',
            fontWeight: '700', fontSize: '11px', letterSpacing: '1.5px',
            padding: '3px 12px', borderRadius: '3px',
          }}>
            INVOICE DOCUMENT TRANSMITTAL
          </div>
        </div>
      </div>

      {/* Meta row */}
      <table style={{ width: '100%', marginTop: '8px', borderCollapse: 'collapse', fontSize: '10px' }}>
        <tbody>
          <tr>
            <td style={{ width: '60%', padding: '2px 0' }}>
              <strong>Transmittal No:</strong> {t.transmittal_number} &nbsp;&nbsp;
              <strong>Date:</strong> {fmtDate(t.transmittal_date)}
            </td>
            <td style={{ padding: '2px 0' }}>
              <strong>From:</strong> {t.from_dept || 'QS Department'}
            </td>
          </tr>
          <tr>
            <td style={{ padding: '2px 0' }}>
              <strong>To:</strong> {t.to_person ? `${t.to_person}, ` : ''}{t.to_dept || 'Accounts Department'}
            </td>
            <td style={{ padding: '2px 0' }}>
              {t.subject && <><strong>Subject:</strong> {t.subject}</>}
            </td>
          </tr>
          {t.project_name && (
            <tr>
              <td colSpan={2} style={{ padding: '2px 0' }}>
                <strong>Project:</strong> {t.project_name}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Invoice table */}
      <table style={{ width: '100%', marginTop: '10px', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#1a3c6e', color: '#fff' }}>
            {['Sl No', 'Invoice No', 'Dated', 'PO / WO', 'PO / WO Dated', "Invoice Detail's", 'Amount (Rs.)', 'Remarks']
              .map((h) => (
                <th key={h} style={{ border: '1px solid #1a3c6e', padding: '5px 6px', textAlign: 'center', fontWeight: 'bold', fontSize: '10px' }}>
                  {h}
                </th>
              ))}
          </tr>
        </thead>
        <tbody>
          {(t.items || []).map((item) => (
            <tr key={item.id}>
              <td style={{ border: '1px solid #999', padding: '3px 6px', textAlign: 'center' }}>{item.sl_no}</td>
              <td style={{ border: '1px solid #999', padding: '3px 6px' }}>{item.invoice_no || ''}</td>
              <td style={{ border: '1px solid #999', padding: '3px 6px', textAlign: 'center' }}>{fmtDate(item.invoice_date)}</td>
              <td style={{ border: '1px solid #999', padding: '3px 6px' }}>{item.po_wo_ref || ''}</td>
              <td style={{ border: '1px solid #999', padding: '3px 6px', textAlign: 'center' }}>{fmtDate(item.po_wo_date)}</td>
              <td style={{ border: '1px solid #999', padding: '3px 6px' }}>{(item.vendor_name || '').toUpperCase()}</td>
              <td style={{ border: '1px solid #999', padding: '3px 6px', textAlign: 'right' }}>{fmt(item.amount)}</td>
              <td style={{ border: '1px solid #999', padding: '3px 6px' }}>{item.item_remarks || ''}</td>
            </tr>
          ))}
          {/* blank rows to fill space */}
          {Array.from({ length: Math.max(0, 5 - (t.items || []).length) }).map((_, i) => (
            <tr key={`blank-${i}`}>
              {Array.from({ length: 8 }).map((__, j) => (
                <td key={j} style={{ border: '1px solid #999', padding: '8px 6px' }}>&nbsp;</td>
              ))}
            </tr>
          ))}
          {/* Total */}
          <tr style={{ background: '#e8edf5', fontWeight: 'bold' }}>
            <td colSpan={6} style={{ border: '1px solid #aab', padding: '5px 6px', textAlign: 'right', color: '#1a3c6e', fontSize: '11px' }}>TOTAL</td>
            <td style={{ border: '1px solid #aab', padding: '5px 6px', textAlign: 'right', color: '#1a3c6e', fontSize: '11px' }}>{fmt(total)}</td>
            <td style={{ border: '1px solid #aab', padding: '5px 6px' }}></td>
          </tr>
        </tbody>
      </table>

      {/* Remarks */}
      {t.remarks && (
        <div style={{ marginTop: '8px', fontSize: '10px' }}>
          <strong>Remarks:</strong> {t.remarks}
        </div>
      )}

      {/* Signature blocks */}
      <table style={{ width: '100%', marginTop: '30px', borderCollapse: 'collapse', fontSize: '10px' }}>
        <tbody>
          <tr>
            {[
              { label: 'Issued By', dept: `BCIM Engineering Pvt. Ltd.\n(HO) ${t.from_dept || 'QS Department'}`, name: t.issued_by, date: t.issued_date },
              { label: 'Received By (Client)', dept: '', name: '', date: '' },
              { label: 'Received By (QS to HO)', dept: '', name: '', date: '' },
              { label: 'Received By (Accounts)', dept: `${t.to_dept || 'Accounts Department'}`, name: t.received_by, date: t.received_date },
            ].map((block, idx) => (
              <td key={idx} style={{ width: '25%', border: '1px solid #aab', padding: '8px', verticalAlign: 'top' }}>
                <div style={{ fontWeight: 'bold', marginBottom: '4px', color: '#1a3c6e', fontSize: '10px', borderBottom: '1px solid #d0d8ea', paddingBottom: '3px' }}>{block.label}</div>
                <div style={{ whiteSpace: 'pre-line', minHeight: '30px', fontSize: '9px', color: '#333' }}>{block.dept}</div>
                <div style={{ marginTop: '16px', borderTop: '1px solid #aaa', paddingTop: '4px' }}>
                  <div><strong>Name:</strong> {block.name || '_______________'}</div>
                  <div style={{ marginTop: '4px' }}><strong>Date:</strong> {block.date ? fmtDate(block.date) : '_______________'}</div>
                  <div style={{ marginTop: '4px' }}><strong>Sign:</strong> _______________</div>
                </div>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
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
  const [selectedBills, setSelectedBills] = useState([]);
  const [billSearch, setBillSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    project_id: '',
    transmittal_date: dayjs().format('YYYY-MM-DD'),
    to_person: '',
    to_dept: 'Accounts Department',
    from_dept: 'QS Department',
    subject: '',
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
    try {
      const params = {};
      if (form.project_id) params.project_id = form.project_id;
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.transmittal_date) return;
    setSaving(true);
    try {
      const r = await tqsTransmittalAPI.create({
        ...form,
        project_id: form.project_id || null,
        bill_ids: selectedBills.map(b => b.id),
      });
      onCreated(r.data);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create transmittal');
    } finally {
      setSaving(false);
    }
  };

  const totalSelected = selectedBills.reduce((s, b) => s + Number(b.amount || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-medium text-gray-800">New Transmittal — QS to Accounts</h2>
          <button onClick={onClose} className="text-slate-900 font-medium hover:text-gray-600"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Meta fields */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-900 mb-1">Project</label>
              <select
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form.project_id}
                onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))}
              >
                <option value="">— All Projects —</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
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
              <label className="block text-xs font-medium text-slate-900 mb-1">To Person (Accounts)</label>
              <input
                type="text"
                placeholder="e.g. Mr. Krishnamurthy"
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form.to_person}
                onChange={e => setForm(f => ({ ...f, to_person: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-900 mb-1">Issued By (QS)</label>
              <input
                type="text"
                placeholder="e.g. Mr. Perumal.S"
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form.issued_by}
                onChange={e => setForm(f => ({ ...f, issued_by: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-900 mb-1">From Dept</label>
              <input
                type="text"
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form.from_dept}
                onChange={e => setForm(f => ({ ...f, from_dept: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-900 mb-1">To Dept</label>
              <input
                type="text"
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form.to_dept}
                onChange={e => setForm(f => ({ ...f, to_dept: e.target.value }))}
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-900 mb-1">Subject</label>
              <input
                type="text"
                placeholder="Submitting invoices for payment processing"
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form.subject}
                onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
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
              <label className="text-xs font-medium text-gray-700">Select Bills to Include</label>
              {selectedBills.length > 0 && (
                <span className="text-xs text-blue-600 font-semibold">
                  {selectedBills.length} selected — Total: ₹{fmt(totalSelected)}
                </span>
              )}
            </div>
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
                    <th className="px-3 py-2 text-left">PO / WO</th>
                    <th className="px-3 py-2 text-left">Vendor</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                    <th className="px-3 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {bills.length === 0 && (
                    <tr><td colSpan={7} className="text-center py-6 text-gray-400">No bills found</td></tr>
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
                        <td className="px-3 py-2">{b.po_number || '—'}</td>
                        <td className="px-3 py-2">{(b.vendor_name || '').toUpperCase() || '—'}</td>
                        <td className="px-3 py-2 text-right">₹{fmt(b.amount)}</td>
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
          </div>
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex justify-end gap-3">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-900 hover:text-slate-900 font-medium border rounded-lg">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
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
          <h3 className="font-medium text-gray-800">Mark as Received</h3>
          <button onClick={onClose} className="text-slate-900 font-medium hover:text-gray-600"><X size={18} /></button>
        </div>
        <p className="text-sm text-slate-900 font-medium mb-4">Transmittal: <strong>{transmittal.transmittal_number}</strong></p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-900 mb-1">Received By *</label>
            <input
              required
              type="text"
              placeholder="e.g. Mr. Krishnamurthy"
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

  const handlePDF = () => {
    if (!t) return;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const total = (t.items || []).reduce((s, i) => s + Number(i.amount || 0), 0);

    doc.setFontSize(13);
    doc.setFont(undefined, 'bold');
    doc.text('BCIM ENGINEERING PVT. LTD.', 148, 14, { align: 'center' });
    doc.setFontSize(11);
    doc.text('INVOICE DOCUMENT TRANSMITTAL', 148, 20, { align: 'center' });
    doc.setFont(undefined, 'normal');
    doc.setFontSize(9);
    doc.text(`Transmittal No: ${t.transmittal_number}   Date: ${fmtDate(t.transmittal_date)}`, 14, 28);
    doc.text(`From: ${t.from_dept || 'QS Department'}   To: ${t.to_person ? t.to_person + ', ' : ''}${t.to_dept || 'Accounts Department'}`, 14, 33);
    if (t.project_name) doc.text(`Project: ${t.project_name}`, 14, 38);

    autoTable(doc, {
      startY: t.project_name ? 42 : 37,
      head: [['Sl No', 'Invoice No', 'Dated', 'PO / WO', 'PO / WO Dated', "Invoice Detail's", 'Amount (Rs.)', 'Remarks']],
      body: [
        ...(t.items || []).map(i => [
          i.sl_no,
          i.invoice_no || '',
          fmtDate(i.invoice_date),
          i.po_wo_ref || '',
          fmtDate(i.po_wo_date),
          i.vendor_name || '',
          fmt(i.amount),
          i.item_remarks || '',
        ]),
        [{ content: 'TOTAL', colSpan: 6, styles: { fontStyle: 'bold', halign: 'right' } }, { content: fmt(total), styles: { fontStyle: 'bold', halign: 'right' } }, ''],
      ],
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [200, 200, 200], textColor: 0, fontStyle: 'bold' },
      columnStyles: { 0: { halign: 'center', cellWidth: 10 }, 6: { halign: 'right', cellWidth: 28 } },
    });

    // Signature blocks
    const y = doc.lastAutoTable.finalY + 12;
    const blocks = [
      { label: 'Issued By', name: t.issued_by, date: t.issued_date },
      { label: 'Received By (Client)', name: '', date: '' },
      { label: 'Received By (QS to HO)', name: '', date: '' },
      { label: 'Received By (Accounts)', name: t.received_by, date: t.received_date },
    ];
    const bw = 64, bh = 28;
    blocks.forEach((b, idx) => {
      const x = 14 + idx * (bw + 4);
      doc.rect(x, y, bw, bh);
      doc.setFontSize(8);
      doc.setFont(undefined, 'bold');
      doc.text(b.label, x + 2, y + 5);
      doc.setFont(undefined, 'normal');
      doc.text(`Name: ${b.name || '_______________'}`, x + 2, y + 13);
      doc.text(`Date: ${b.date ? fmtDate(b.date) : '_______________'}`, x + 2, y + 19);
      doc.text('Sign: _______________', x + 2, y + 25);
    });

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

  const total = (t.items || []).reduce((s, i) => s + Number(i.amount || 0), 0);

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
              <Send size={14} /> Submit to Accounts
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
          <div><span className="text-slate-900 font-medium text-xs">Date</span><div>{fmtDate(t.transmittal_date)}</div></div>
          <div><span className="text-slate-900 font-medium text-xs">Project</span><div>{t.project_name || '—'}</div></div>
          <div><span className="text-slate-900 font-medium text-xs">From</span><div>{t.from_dept}</div></div>
          <div><span className="text-slate-900 font-medium text-xs">To</span><div>{t.to_person ? `${t.to_person}, ` : ''}{t.to_dept}</div></div>
          <div><span className="text-slate-900 font-medium text-xs">Issued By</span><div>{t.issued_by || '—'}</div></div>
          {t.received_by && <div><span className="text-slate-900 font-medium text-xs">Received By</span><div className="text-green-700 font-medium">{t.received_by} on {fmtDate(t.received_date)}</div></div>}
          {t.subject && <div className="col-span-3"><span className="text-slate-900 font-medium text-xs">Subject</span><div>{t.subject}</div></div>}
          {t.remarks && <div className="col-span-3"><span className="text-slate-900 font-medium text-xs">Remarks</span><div>{t.remarks}</div></div>}
        </div>
      </div>

      {/* Items table */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              {['Sl No', 'Invoice No', 'Dated', 'PO / WO', 'PO / WO Dated', "Invoice Detail's", 'Amount (₹)', 'Remarks'].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-gray-600">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(t.items || []).map(item => (
              <tr key={item.id} className="border-t hover:bg-gray-50">
                <td className="px-4 py-2 text-center text-gray-500">{item.sl_no}</td>
                <td className="px-4 py-2 font-medium">{item.invoice_no || '—'}</td>
                <td className="px-4 py-2">{fmtDate(item.invoice_date)}</td>
                <td className="px-4 py-2">{item.po_wo_ref || '—'}</td>
                <td className="px-4 py-2">{fmtDate(item.po_wo_date)}</td>
                <td className="px-4 py-2">{(item.vendor_name || '').toUpperCase() || '—'}</td>
                <td className="px-4 py-2 text-right font-medium">₹{fmt(item.amount)}</td>
                <td className="px-4 py-2 text-slate-900 font-medium text-xs">{item.item_remarks || ''}</td>
              </tr>
            ))}
            <tr className="border-t bg-gray-50 font-semibold">
              <td colSpan={6} className="px-4 py-2.5 text-right text-sm">TOTAL</td>
              <td className="px-4 py-2.5 text-right text-sm">₹{fmt(total)}</td>
              <td></td>
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
export default function TQSTransmittalPage() {
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
          <h1 className="text-xl font-medium text-gray-900">QS → Accounts Transmittals</h1>
          <p className="text-sm text-slate-900 font-medium mt-0.5">Bundle invoices and forward to Accounts for payment processing</p>
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
            placeholder="Search transmittal no or person…"
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
          <option value="submitted">Submitted</option>
          <option value="received">Received</option>
        </select>
      </div>

      {/* Summary cards */}
      {!loading && (
        <div className="grid grid-cols-3 gap-4 mb-5">
          {[
            { label: 'Total', value: transmittals.length, color: 'blue' },
            { label: 'Submitted', value: transmittals.filter(t => t.status === 'submitted').length, color: 'yellow' },
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
            <p className="text-sm mt-1">Create your first QS-to-Accounts transmittal</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Transmittal No', 'Date', 'Project', 'To', 'Bills', 'Total Amount', 'Status', 'Actions'].map(h => (
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
                  <td className="px-4 py-3 text-gray-600">{t.to_person || t.to_dept || '—'}</td>
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
