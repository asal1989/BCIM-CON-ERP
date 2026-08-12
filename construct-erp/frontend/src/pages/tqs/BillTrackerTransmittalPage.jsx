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
const NAVY      = '#1B3A6B';
const NAVY_SOFT = '#2C5490';
const ROW_ALT   = '#F5F8FC';
const CARD_BG   = '#F7FAFD';
const BORDER    = '#D9E2EF';

// Small stroke icons for the meta/sign-off cards. Inline SVG rather than the
// lucide React components used elsewhere — this subtree gets serialized into a
// print window, where an icon font/component that fails to resolve would leave
// a blank box on a document people sign.
const IconDoc = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={NAVY} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" />
  </svg>
);
const IconRevision = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={NAVY} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" />
  </svg>
);
const IconCalendar = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={NAVY} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
  </svg>
);
const IconUser = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={NAVY} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
  </svg>
);

function MetaCard({ icon, label, value }) {
  return (
    <div style={{
      flex: 1, display: 'flex', alignItems: 'center', gap: 9,
      border: `1px solid ${BORDER}`, borderRadius: 6, background: CARD_BG, padding: '8px 11px',
    }}>
      <div style={{
        width: 24, height: 24, borderRadius: 5, background: '#E7EFF9',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>{icon}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 7.5, color: '#6B7C93', fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase' }}>{label}</div>
        <div style={{ fontSize: 10, color: NAVY, fontWeight: 700, whiteSpace: 'nowrap' }}>{value}</div>
      </div>
    </div>
  );
}

function SignOffCard({ title, name, date }) {
  const Line = ({ label, value }) => (
    <div style={{ display: 'flex', gap: 6, marginTop: 7, fontSize: 9 }}>
      <span style={{ color: '#6B7C93', width: 34, flexShrink: 0 }}>{label}</span>
      <span style={{ flex: 1, borderBottom: `1px solid ${BORDER}`, paddingBottom: 1, color: '#0F172A', fontWeight: value ? 600 : 400, minHeight: 12 }}>
        {value || ''}
      </span>
    </div>
  );
  return (
    <div style={{ flex: 1, border: `1px solid ${BORDER}`, borderRadius: 6, overflow: 'hidden' }}>
      <div style={{ background: CARD_BG, borderBottom: `1px solid ${BORDER}`, padding: '6px 11px', fontSize: 8.5, fontWeight: 700, color: NAVY }}>
        {title}
      </div>
      <div style={{ padding: '9px 11px 11px', display: 'flex', gap: 10 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 14, background: '#E7EFF9',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}><IconUser /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Line label="NAME" value={name} />
          <Line label="SIGN" value="" />
          <Line label="DATE" value={date} />
        </div>
      </div>
    </div>
  );
}

const PrintTemplate = React.forwardRef(({ t }, ref) => {
  if (!t) return null;
  const items = t.items || [];
  const totalWithoutTax = items.reduce((s, i) => s + Number(i.amount || 0), 0);
  const totalTax         = items.reduce((s, i) => s + Number(i.tax_amount || 0), 0);
  const grandTotal        = totalWithoutTax + totalTax;

  const projectLabel = t.project_display || t.project_name || 'Project';

  // Column widths sum to 100% — fixed layout so a long vendor name can't push
  // the amount columns off the page (browsers clip rather than scale on print).
  const COLS = [
    { h: 'Sl No',                        w: '4%',  align: 'center' },
    { h: 'Invoice No.',                  w: '12%', align: 'left'   },
    { h: 'Dated',                        w: '8%',  align: 'center' },
    { h: 'Vendor Name',                  w: '19%', align: 'left'   },
    { h: 'Invoice Amount\nwithout Tax',  w: '11%', align: 'right'  },
    { h: 'Tax %',                        w: '6%',  align: 'center' },
    { h: 'Tax Amount',                   w: '10%', align: 'right'  },
    { h: 'Total Amount',                 w: '11%', align: 'right'  },
    { h: 'HSN Codes',                    w: '9%',  align: 'center' },
    { h: 'Remarks',                      w: '10%', align: 'left'   },
  ];

  const cell = (align, extra = {}) => ({
    border: `1px solid ${BORDER}`, padding: '4px 6px', textAlign: align,
    fontSize: 8.5, color: '#0F172A', wordBreak: 'break-word', ...extra,
  });

  return (
    <div ref={ref} style={{ fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 10, padding: '14px 16px', color: '#0F172A' }}>
      {/* Landscape + force background printing — the navy header bar and zebra
          rows are structural here, not decoration, so they must survive the
          browser's default "don't print backgrounds" behaviour. */}
      <style>{`
        @page { size: A4 landscape; margin: 9mm; }
        @media print {
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          thead { display: table-header-group; }
          tr { page-break-inside: avoid; }
        }
      `}</style>

      {/* Letterhead */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, paddingBottom: 9 }}>
        <div style={{ flexShrink: 0, width: 150 }}>
          <img src="/bcim-logo.png" alt="BCIM Engineering" style={{ height: 40, width: 'auto', objectFit: 'contain' }} />
          <div style={{ fontSize: 7.5, fontWeight: 700, color: NAVY_SOFT, letterSpacing: 1.1, textTransform: 'uppercase', marginTop: 2 }}>
            {projectLabel}
          </div>
        </div>

        <div style={{ flex: 1, textAlign: 'center', paddingTop: 4 }}>
          <div style={{ fontSize: 17, fontWeight: 900, color: NAVY, letterSpacing: 0.6 }}>
            INTERNAL INVOICES TRANSMITTAL
          </div>
          <div style={{ width: 132, height: 2.5, background: NAVY, margin: '5px auto 0', borderRadius: 2 }} />
        </div>

        <div style={{ flexShrink: 0, width: 150, textAlign: 'right', fontSize: 7.5, color: '#6B7C93', paddingTop: 4, lineHeight: 1.5 }}>
          <div>From : BCIM Engineering Pvt. Ltd</div>
          <div style={{ fontWeight: 700, color: NAVY_SOFT }}>{projectLabel}</div>
        </div>
      </div>
      <div style={{ height: 1.5, background: NAVY, marginBottom: 11 }} />

      {/* Meta cards */}
      <div style={{ display: 'flex', gap: 9, marginBottom: 12 }}>
        <MetaCard icon={<IconDoc />}      label="Transmittal No."      value={t.transmittal_number} />
        <MetaCard icon={<IconRevision />} label="Transmittal Revision" value={t.revision || 'REV.000'} />
        <MetaCard icon={<IconCalendar />} label="Transmittal Date"     value={fmtDate(t.transmittal_date)} />
      </div>

      {/* Invoice table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <colgroup>{COLS.map((c) => <col key={c.h} style={{ width: c.w }} />)}</colgroup>
        <thead>
          <tr>
            {COLS.map((c) => (
              <th key={c.h} style={{
                background: NAVY, color: '#fff', border: `1px solid ${NAVY}`, padding: '6px 6px',
                textAlign: 'center', fontWeight: 700, fontSize: 8, whiteSpace: 'pre-line', lineHeight: 1.3,
              }}>{c.h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={item.id || idx} style={{ background: idx % 2 ? ROW_ALT : '#fff' }}>
              <td style={cell('center', { color: '#6B7C93' })}>{item.sl_no ?? idx + 1}</td>
              <td style={cell('left')}>{item.invoice_no || '–'}</td>
              <td style={cell('center')}>{fmtDate(item.invoice_date)}</td>
              <td style={cell('left')}>{(item.vendor_name || '').toUpperCase() || '–'}</td>
              <td style={cell('right')}>{fmt(item.amount)}</td>
              <td style={cell('center')}>{item.tax_pct ? `${item.tax_pct}%` : '–'}</td>
              <td style={cell('right')}>{fmt(item.tax_amount)}</td>
              <td style={cell('right', { fontWeight: 700, color: NAVY })}>{fmt(totalOf(item))}</td>
              <td style={cell('center', { color: '#6B7C93' })}>{item.hsn_codes || '–'}</td>
              <td style={cell('left', { color: '#6B7C93' })}>{item.item_remarks || '–'}</td>
            </tr>
          ))}
          <tr>
            <td colSpan={4} style={{ background: NAVY, color: '#fff', border: `1px solid ${NAVY}`, padding: '7px 10px', textAlign: 'right', fontWeight: 700, fontSize: 9, letterSpacing: 0.5 }}>
              TOTAL AMOUNT
            </td>
            <td style={{ background: NAVY, color: '#fff', border: `1px solid ${NAVY}`, padding: '7px 6px', textAlign: 'right', fontWeight: 700, fontSize: 9 }}>{fmt(totalWithoutTax)}</td>
            <td style={{ background: NAVY, border: `1px solid ${NAVY}` }} />
            <td style={{ background: NAVY, color: '#fff', border: `1px solid ${NAVY}`, padding: '7px 6px', textAlign: 'right', fontWeight: 700, fontSize: 9 }}>{fmt(totalTax)}</td>
            <td style={{ background: NAVY, color: '#fff', border: `1px solid ${NAVY}`, padding: '7px 6px', textAlign: 'right', fontWeight: 700, fontSize: 9 }}>{fmt(grandTotal)}</td>
            <td colSpan={2} style={{ background: NAVY, border: `1px solid ${NAVY}` }} />
          </tr>
        </tbody>
      </table>

      {t.remarks && (
        <div style={{ marginTop: 9, fontSize: 8.5, color: '#0F172A' }}>
          <strong style={{ color: NAVY }}>Remarks : </strong>{t.remarks}
        </div>
      )}

      {/* Sign-off */}
      <div style={{ display: 'flex', gap: 14, marginTop: 20 }}>
        <SignOffCard
          title={`Issued By : BCIM Engineering Pvt. Ltd (${t.project_short || projectLabel})`}
          name={t.issued_by}
          date={t.issued_date ? fmtDate(t.issued_date) : ''}
        />
        <SignOffCard
          title="Received By : BCIM Engineering Pvt. Ltd (HO)"
          name={t.received_by}
          date={t.received_date ? fmtDate(t.received_date) : ''}
        />
      </div>

      {/* Doc control footer */}
      <div style={{ marginTop: 16, paddingTop: 5, borderTop: `1px solid ${BORDER}`, textAlign: 'center', fontSize: 7, color: '#94A3B8' }}>
        Doc.No. BCIM/FR/001/01 &nbsp;&nbsp;·&nbsp;&nbsp; Rev. 01 &nbsp;&nbsp;·&nbsp;&nbsp; Date: 27.8.2018
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
  const [selectedBills, setSelectedBills] = useState([]); // full bill objects, can span multiple projects
  const [itemDetails, setItemDetails] = useState({});     // { [billId]: { hsn_codes, item_remarks } }
  const [billSearch, setBillSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState([]); // [] = browse invoices across every project
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
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
    try {
      const params = {};
      if (projectFilter.length) params.project_ids = projectFilter.join(',');
      if (billSearch) params.search = billSearch;
      const r = await tqsTransmittalAPI.lookupBills(params);
      setBills(r.data || []);
    } catch { /* ignore */ }
  }, [projectFilter, billSearch]);

  useEffect(() => { loadBills(); }, [loadBills]);

  const toggleProjectFilter = (projectId) => {
    setProjectFilter(prev => prev.includes(projectId) ? prev.filter(id => id !== projectId) : [...prev, projectId]);
  };

  const distinctSelectedProjects = [...new Set(selectedBills.map(b => b.project_id).filter(Boolean))];

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
    if (!form.transmittal_date || !selectedBills.length) return;
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

          {/* Bill picker — browses invoices across every project by default;
              a transmittal can bundle invoices from more than one project in
              one go, so there's no upfront project selector gating this. */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-700">Select Invoices to Include</label>
              {selectedBills.length > 0 && (
                <span className="text-xs text-blue-600 font-semibold">
                  {selectedBills.length} selected across {distinctSelectedProjects.length || 1} project{distinctSelectedProjects.length > 1 ? 's' : ''} — Total: ₹{fmt(totalSelected)}
                </span>
              )}
            </div>
            <>
              {distinctSelectedProjects.length > 1 && (
                <p className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 mb-2">
                  Invoices from {distinctSelectedProjects.length} projects selected — this transmittal will use a company-wide number (BCIM-HO-INV-XXX) instead of a single project's sequence.
                </p>
              )}
              <div className="flex flex-wrap gap-1.5 mb-2">
                {projects.map(p => {
                  const active = projectFilter.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => toggleProjectFilter(p.id)}
                      className={`text-[11px] px-2.5 py-1 rounded-full border font-medium ${active ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-200 text-slate-600 hover:border-blue-300'}`}
                    >
                      {p.name}
                    </button>
                  );
                })}
                {projectFilter.length > 0 && (
                  <button type="button" onClick={() => setProjectFilter([])} className="text-[11px] px-2.5 py-1 rounded-full border border-gray-200 text-slate-400 hover:text-slate-600">
                    Clear filter
                  </button>
                )}
              </div>
              <div className="relative mb-2">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search invoice no, vendor or project…"
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
                      <th className="px-3 py-2 text-left">Project</th>
                      <th className="px-3 py-2 text-left">Vendor</th>
                      <th className="px-3 py-2 text-right">Amount (excl. tax)</th>
                      <th className="px-3 py-2 text-right">Tax</th>
                      <th className="px-3 py-2 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bills.length === 0 && (
                      <tr><td colSpan={8} className="text-center py-6 text-gray-400">No eligible invoices found</td></tr>
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
                          <td className="px-3 py-2 text-slate-500">{b.project_name || '—'}</td>
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
            disabled={saving || !selectedBills.length}
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
    received_remarks: '',
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
          <div>
            <label className="block text-xs font-medium text-slate-900 mb-1">Remarks</label>
            <textarea
              rows={3}
              placeholder="e.g. 2 invoices missing vendor signature"
              className="w-full border rounded-lg px-3 py-2 text-sm resize-none"
              value={form.received_remarks}
              onChange={e => setForm(f => ({ ...f, received_remarks: e.target.value }))}
            />
            <p className="text-[10px] text-slate-400 mt-1">
              Emailed to whoever raised this transmittal, along with the receipt confirmation.
            </p>
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
    // RGB twins of the print template's palette, so the downloaded PDF and the
    // browser print look like the same document.
    const NAVY_RGB   = [27, 58, 107];   // #1B3A6B
    const BORDER_RGB = [217, 226, 239]; // #D9E2EF
    const CARD_RGB   = [247, 250, 253]; // #F7FAFD
    const MUTED_RGB  = [107, 124, 147]; // #6B7C93
    const projectLabel = t.project_display || t.project_name || 'Project';

    const L = 14, R = 283, W = R - L;

    // ── Letterhead ──
    const logo = await loadBcimLogoBase64();
    if (logo) doc.addImage(logo, 'PNG', L, 9, 26, 13, undefined, 'FAST');
    doc.setFontSize(6.5);
    doc.setTextColor(...NAVY_RGB);
    doc.setFont(undefined, 'bold');
    doc.text(projectLabel.toUpperCase(), L, 26, { maxWidth: 60 });

    doc.setFontSize(16);
    doc.text('INTERNAL INVOICES TRANSMITTAL', 148, 17, { align: 'center' });
    doc.setFillColor(...NAVY_RGB);
    doc.rect(129, 19.5, 38, 0.9, 'F');

    doc.setFontSize(6.5);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(...MUTED_RGB);
    doc.text('From : BCIM Engineering Pvt. Ltd', R, 13, { align: 'right' });
    doc.setFont(undefined, 'bold');
    doc.setTextColor(...NAVY_RGB);
    doc.text(projectLabel, R, 16.5, { align: 'right', maxWidth: 70 });

    doc.setFillColor(...NAVY_RGB);
    doc.rect(L, 29, W, 0.6, 'F');

    // ── Meta cards ──
    const cardY = 32.5, cardH = 11, gap = 3.5, cardW = (W - gap * 2) / 3;
    [
      ['TRANSMITTAL NO.', t.transmittal_number],
      ['TRANSMITTAL REVISION', t.revision || 'REV.000'],
      ['TRANSMITTAL DATE', fmtDate(t.transmittal_date)],
    ].forEach(([label, value], i) => {
      const x = L + i * (cardW + gap);
      doc.setFillColor(...CARD_RGB);
      doc.setDrawColor(...BORDER_RGB);
      doc.setLineWidth(0.3);
      doc.roundedRect(x, cardY, cardW, cardH, 1.5, 1.5, 'FD');
      doc.setFontSize(5.5);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(...MUTED_RGB);
      doc.text(label, x + 4, cardY + 4.2);
      doc.setFontSize(8.5);
      doc.setTextColor(...NAVY_RGB);
      doc.text(String(value || '—'), x + 4, cardY + 8.6, { maxWidth: cardW - 8 });
    });

    autoTable(doc, {
      startY: cardY + cardH + 4,
      margin: { left: L, right: 297 - R },
      head: [['Sl No', 'Invoice No.', 'Dated', 'Vendor Name', 'Invoice Amount\nwithout Tax', 'Tax %', 'Tax Amount', 'Total Amount', 'HSN Codes', 'Remarks']],
      body: [
        ...items.map((i, idx) => [
          i.sl_no ?? idx + 1,
          i.invoice_no || '–',
          fmtDate(i.invoice_date),
          (i.vendor_name || '').toUpperCase() || '–',
          fmt(i.amount),
          i.tax_pct ? `${i.tax_pct}%` : '–',
          fmt(i.tax_amount),
          fmt(totalOf(i)),
          i.hsn_codes || '–',
          i.item_remarks || '–',
        ]),
        [
          { content: 'TOTAL AMOUNT', colSpan: 4, styles: { fillColor: NAVY_RGB, textColor: 255, fontStyle: 'bold', halign: 'right' } },
          { content: fmt(totalWithoutTax), styles: { fillColor: NAVY_RGB, textColor: 255, fontStyle: 'bold', halign: 'right' } },
          { content: '', styles: { fillColor: NAVY_RGB } },
          { content: fmt(totalTax), styles: { fillColor: NAVY_RGB, textColor: 255, fontStyle: 'bold', halign: 'right' } },
          { content: fmt(grandTotal), styles: { fillColor: NAVY_RGB, textColor: 255, fontStyle: 'bold', halign: 'right' } },
          { content: '', colSpan: 2, styles: { fillColor: NAVY_RGB } },
        ],
      ],
      styles: { fontSize: 7, cellPadding: 1.6, lineColor: BORDER_RGB, lineWidth: 0.15, textColor: [15, 23, 42] },
      headStyles: { fillColor: NAVY_RGB, textColor: 255, fontStyle: 'bold', fontSize: 6.5, halign: 'center', valign: 'middle' },
      alternateRowStyles: { fillColor: [245, 248, 252] },
      columnStyles: {
        0: { halign: 'center', cellWidth: 11, textColor: MUTED_RGB },
        2: { halign: 'center', cellWidth: 20 },
        4: { halign: 'right' },
        5: { halign: 'center', cellWidth: 13 },
        6: { halign: 'right' },
        7: { halign: 'right', fontStyle: 'bold', textColor: NAVY_RGB },
        8: { halign: 'center', textColor: MUTED_RGB },
        9: { textColor: MUTED_RGB },
      },
    });

    // ── Sign-off cards ──
    let y = doc.lastAutoTable.finalY + 8;
    const bw = (W - 6) / 2, bh = 26;
    if (y + bh > 200) { doc.addPage(); y = 20; }
    [
      { title: `Issued By : BCIM Engineering Pvt. Ltd (${t.project_short || projectLabel})`, name: t.issued_by, date: t.issued_date },
      { title: 'Received By : BCIM Engineering Pvt. Ltd (HO)', name: t.received_by, date: t.received_date },
    ].forEach((b, idx) => {
      const x = L + idx * (bw + 6);
      doc.setDrawColor(...BORDER_RGB);
      doc.setLineWidth(0.3);
      doc.roundedRect(x, y, bw, bh, 1.5, 1.5, 'D');
      doc.setFillColor(...CARD_RGB);
      doc.rect(x + 0.2, y + 0.2, bw - 0.4, 6, 'F');
      doc.setFontSize(6.5);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(...NAVY_RGB);
      doc.text(b.title, x + 3, y + 4.2, { maxWidth: bw - 6 });

      doc.setFont(undefined, 'normal');
      doc.setFontSize(6.5);
      [['NAME', b.name], ['SIGN', ''], ['DATE', b.date ? fmtDate(b.date) : '']].forEach(([label, value], li) => {
        const ly = y + 11 + li * 5;
        doc.setTextColor(...MUTED_RGB);
        doc.text(label, x + 3, ly);
        doc.setDrawColor(...BORDER_RGB);
        doc.setLineWidth(0.2);
        doc.line(x + 13, ly + 0.8, x + bw - 3, ly + 0.8);
        if (value) {
          doc.setTextColor(15, 23, 42);
          doc.setFont(undefined, 'bold');
          doc.text(String(value), x + 14, ly, { maxWidth: bw - 18 });
          doc.setFont(undefined, 'normal');
        }
      });
    });

    doc.setFontSize(6);
    doc.setTextColor(148, 163, 184);
    doc.text('Doc.No. BCIM/FR/001/01     ·     Rev. 01     ·     Date: 27.8.2018', 148, y + bh + 6, { align: 'center' });

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
          <div><span className="text-slate-900 font-medium text-xs">Project (Site)</span><div>{t.project_display || t.project_name || '—'}</div></div>
          <div><span className="text-slate-900 font-medium text-xs">Issued By</span><div>{t.issued_by || '—'}</div></div>
          {t.received_by && <div><span className="text-slate-900 font-medium text-xs">Received By (HO)</span><div className="text-green-700 font-medium">{t.received_by} on {fmtDate(t.received_date)}</div></div>}
          {t.remarks && <div className="col-span-3"><span className="text-slate-900 font-medium text-xs">Remarks</span><div>{t.remarks}</div></div>}
          {t.received_remarks && (
            <div className="col-span-3">
              <span className="text-slate-900 font-medium text-xs">Remarks from HO (on receipt)</span>
              <div className="mt-1 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-900">{t.received_remarks}</div>
            </div>
          )}
        </div>
      </div>

      {/* Items table — a Project column shows up when this transmittal bundles
          invoices from more than one project (t.project_id is NULL in that case). */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              {['Sl No', 'Invoice No', 'Dated', ...(!t.project_id ? ['Project'] : []), 'Vendor Name', 'Amt w/o Tax (₹)', 'Tax %', 'Tax Amt (₹)', 'Total (₹)', 'HSN', 'Remarks'].map(h => (
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
                {!t.project_id && <td className="px-4 py-2 text-slate-500 text-xs">{item.project_name || '—'}</td>}
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
              <td colSpan={!t.project_id ? 5 : 4} className="px-4 py-2.5 text-right text-sm">TOTAL AMOUNT</td>
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
                  <td className="px-4 py-3 text-gray-600">{t.project_display || t.project_name || '—'}</td>
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
