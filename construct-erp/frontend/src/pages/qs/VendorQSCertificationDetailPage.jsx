// src/pages/qs/VendorQSCertificationDetailPage.jsx
import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { vendorQSCertificationAPI } from '../../api/client';
import useAuthStore from '../../store/authStore';
import { ArrowLeft, Pencil, Printer, RefreshCw, X, IndianRupee, CheckCircle2, FileText, Trash2 } from 'lucide-react';

// Only the QS certifier (or a super_admin/admin) may edit the certificate
// number and GST — matches the CERT_APPROVER_EMAIL gate on the backend.
const CERT_APPROVER_EMAIL = 'prithivi@bcim.in';
import BCIM_LOGO from '../../assets/bcim-logo.png';

// ── Tinos font (Times New Roman equivalent) ───────────────────────────────────
if (typeof document !== 'undefined') {
  const _l = document.createElement('link');
  _l.rel  = 'stylesheet';
  _l.href = 'https://fonts.googleapis.com/css2?family=Tinos:ital,wght@0,400;0,700;1,400;1,700&display=swap';
  if (!document.querySelector('link[href*="Tinos"]')) document.head.appendChild(_l);
}

// ── Design tokens ─────────────────────────────────────────────────────────────
const navy   = '#0B2E59';
const rust   = '#C0392B';
const gold   = '#B8860B';
const lightBg = '#F4F7FC';
const dedBg  = '#FFFBF0';
const netBg  = '#EAF1FB';

const T = {
  page:     { fontFamily: "'Times New Roman',Times,serif", fontSize: '11px', color: '#0A0A0A', fontWeight: '500' },
  // No forced pageBreakAfter here — each print mode (abstract/payment) shows
  // exactly one visible .print-sheet at a time (the other is display:none),
  // so an unconditional break-after just adds a wasted blank trailing page.
  sheet:    { width: '100%', background: '#fff', padding: '4mm 3mm 6mm 3mm', boxSizing: 'border-box' },
  masthead: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: `3px double ${navy}`, paddingBottom: '10px', marginBottom: '10px' },
  logoArea: { display: 'flex', alignItems: 'center', gap: '12px' },
  coName:   { fontSize: '15px', fontWeight: 'bold', color: navy, letterSpacing: '0.6px', lineHeight: 1.2 },
  coSub:    { fontSize: '9.5px', color: '#222', marginTop: '3px', fontStyle: 'italic', fontWeight: '600' },
  docTitle: { fontSize: '13px', fontWeight: 'bold', color: rust, textAlign: 'right', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '4px' },
  badge:    { display: 'inline-block', background: navy, color: '#fff', fontSize: '9.5px', fontWeight: 'bold', padding: '3px 10px', borderRadius: '2px', letterSpacing: '0.5px' },
  certDt:   { fontSize: '9.5px', color: '#222', marginTop: '4px', textAlign: 'right', fontStyle: 'italic', fontWeight: '600' },
  infoPanel:{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 24px', marginBottom: '10px', background: lightBg, border: `1px solid #C8D8EE`, padding: '7px 10px', fontSize: '10.5px' },
  infoRow:  { display: 'flex', alignItems: 'baseline', gap: '4px', paddingBottom: '2px', borderBottom: '1px dotted #D0DCF0' },
  infoLbl:  { fontWeight: 'bold', color: navy, minWidth: '150px', flexShrink: 0, fontSize: '9.5px', textTransform: 'uppercase', letterSpacing: '0.3px' },
  infoVal:  { color: '#0A0A0A', fontSize: '10.5px', fontWeight: '600' },
  secHead:  { background: navy, color: '#fff', fontWeight: 'bold', fontSize: '10px', padding: '4px 10px', marginTop: '10px', marginBottom: '3px', letterSpacing: '0.8px', textTransform: 'uppercase' },
  tbl:      { width: '100%', borderCollapse: 'collapse', fontSize: '9px', tableLayout: 'fixed' },
  th:       { background: navy, color: '#fff', padding: '4px 3px', textAlign: 'center', border: `1px solid #8AAAD0`, fontWeight: 'bold', verticalAlign: 'middle', letterSpacing: '0.2px', fontSize: '9px', lineHeight: '1.3' },
  td:       { padding: '3px 4px', border: '1px solid #9AB0CC', verticalAlign: 'top', lineHeight: '1.4', fontWeight: '500', color: '#0A0A0A', wordBreak: 'break-word' },
  tdC:      { padding: '3px 4px', border: '1px solid #9AB0CC', textAlign: 'center', verticalAlign: 'middle', fontWeight: '500', color: '#0A0A0A' },
  tdR:      { padding: '3px 4px', border: '1px solid #9AB0CC', textAlign: 'right', verticalAlign: 'middle', fontFamily: "'Times New Roman',Times,serif", fontSize: '9px', fontWeight: '600', color: '#0A0A0A' },
  totRow:   { background: '#D6E6F8', fontWeight: 'bold' },
  netRow:   { background: navy, color: '#fff', fontWeight: 'bold' },
  dedRow:   { background: dedBg },
  claimTbl: { width: '100%', borderCollapse: 'collapse', fontSize: '11px' },
  amtBox:   { marginTop: '10px', border: `1px solid ${navy}`, borderLeft: `4px solid ${navy}`, padding: '7px 14px', fontSize: '11px', background: netBg, lineHeight: 1.6, fontWeight: '600' },
  remarks:  { fontSize: '9.5px', color: '#111', marginTop: '8px', borderTop: `1px solid #C8D6E8`, paddingTop: '5px', fontWeight: '500' },
  sigGrid:  { display: 'flex', gap: '6px', marginTop: '16px', flexWrap: 'wrap' },
  // breakInside avoid stops Chrome's print engine from splitting a single
  // signature box across a page boundary (it was rendering the box's top
  // half on one page and duplicating the bottom half on the next).
  sigBox:   { flex: '1 1 110px', minWidth: '100px', border: `1px solid #BCC8DC`, padding: '7px 5px', textAlign: 'center', fontSize: '9px', background: '#FAFCFF', breakInside: 'avoid', WebkitColumnBreakInside: 'avoid' },
  stamp:    { width: '52px', height: '44px', border: '1px dashed #AAB8CC', margin: '0 auto 5px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '7.5px', color: '#666', letterSpacing: '0.4px', fontWeight: 'bold' },
  sigRole:  { fontWeight: 'bold', color: navy, fontSize: '9px', marginBottom: '3px', lineHeight: '1.3' },
  sigDate:  { marginTop: '5px', fontSize: '8.5px', color: '#111', borderTop: '1px solid #C0C8D8', paddingTop: '3px', fontWeight: '500' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const INR   = (v) => v == null ? '—' : '₹ ' + Math.abs(Number(v)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const raw   = (v) => v == null ? '—' : Math.abs(Number(v)).toLocaleString('en-IN', { minimumFractionDigits: 2 });
const inr   = (v) => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const n     = (v) => Number(v || 0);
const fq    = (v) => { const x = parseFloat(n(v).toFixed(3)); return x || '—'; }; // qty: 3dp, no trailing-zero noise
const fmt   = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
const fmtSh = (d) => d ? new Date(d).toLocaleDateString('en-IN') : '—';

function numberToWords(num) {
  const a = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const b = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  const two   = (x) => x < 20 ? a[x] : `${b[Math.floor(x/10)]}${x%10 ? ' '+a[x%10] : ''}`;
  const three = (x) => `${x>99 ? a[Math.floor(x/100)]+' Hundred ' : ''}${x%100 ? two(x%100) : ''}`.trim();
  let value = Math.round(Number(num || 0));
  if (!value) return 'Zero';
  const parts = [];
  const crore    = Math.floor(value / 10000000); value %= 10000000;
  const lakh     = Math.floor(value / 100000);   value %= 100000;
  const thousand = Math.floor(value / 1000);     value %= 1000;
  if (crore)    parts.push(`${three(crore)} Crore`);
  if (lakh)     parts.push(`${three(lakh)} Lakh`);
  if (thousand) parts.push(`${three(thousand)} Thousand`);
  if (value)    parts.push(three(value));
  return parts.join(' ') + ' Only';
}

// ── Masthead ──────────────────────────────────────────────────────────────────
function Masthead({ docTitle, badge, dateLabel }) {
  return (
    <div style={T.masthead}>
      <div style={T.logoArea}>
        <img src={BCIM_LOGO} alt="BCIM" style={{ height: '52px', width: 'auto', objectFit: 'contain' }}
          onError={e => { e.target.style.display = 'none'; }} />
        <div>
          <div style={T.coName}>BCIM Engineering Private Limited</div>
          <div style={T.coSub}>Infrastructure &amp; Construction Management</div>
        </div>
      </div>
      <div>
        <div style={T.docTitle}>{docTitle}</div>
        <div style={{ textAlign: 'right' }}>
          <span style={T.badge}>{badge}</span>
        </div>
        <div style={T.certDt}>{dateLabel}</div>
      </div>
    </div>
  );
}

// ── Info row ──────────────────────────────────────────────────────────────────
function InfoRow({ label, value }) {
  return (
    <div style={T.infoRow}>
      <span style={T.infoLbl}>{label}</span>
      <span style={{ color: '#111', marginRight: '4px', fontWeight: 'bold' }}>:</span>
      <span style={T.infoVal}>{value || '—'}</span>
    </div>
  );
}

// ── Derive grouped items (same logic as before) ───────────────────────────────
function deriveItems(cert) {
  const rawItems = cert.items || [];
  const linkedRefs = [...new Set(rawItems.map(it => it.item_ref_id).filter(Boolean))];
  const singleLinkedRef = linkedRefs.length === 1 ? linkedRefs[0] : null;
  const singleLinkedItem = singleLinkedRef ? rawItems.find(it => it.item_ref_id === singleLinkedRef) : null;
  return Array.from(rawItems.reduce((map, item) => {
    const effective = singleLinkedRef && !item.item_ref_id
      ? { ...item, item_ref_id: singleLinkedRef, description: singleLinkedItem?.description || item.description, unit: singleLinkedItem?.unit || item.unit, order_qty: singleLinkedItem?.order_qty || item.order_qty, order_rate: singleLinkedItem?.order_rate || item.order_rate }
      : item;
    const key = effective.item_ref_id || `${String(effective.description||'').trim().toLowerCase()}|${effective.unit}|${effective.order_rate}`;
    const existing = map.get(key);
    if (existing) {
      existing.source_inv_number = [...new Set([existing.source_inv_number, effective.source_inv_number].filter(Boolean).join(', ').split(', ').filter(Boolean))].join(', ');
      existing.inv_prev_qty  = n(existing.inv_prev_qty)  + n(effective.inv_prev_qty);
      existing.inv_pres_qty  = n(existing.inv_pres_qty)  + n(effective.inv_pres_qty);
      existing.qs_prev_qty   = Math.max(n(existing.qs_prev_qty), n(effective.qs_prev_qty));
      existing.qs_pres_qty   = n(existing.qs_pres_qty)   + n(effective.qs_pres_qty);
      existing.amount        = n(existing.amount)         + n(effective.amount);
      return map;
    }
    map.set(key, { ...effective });
    return map;
  }, new Map()).values());
}

// ── PAGE 1 — Abstract of Measurement ─────────────────────────────────────────
function AbstractSheet({ cert }) {
  const items      = deriveItems(cert);
  const invoiceNos = (cert.bills || []).map(b => b.inv_number).filter(Boolean).join(', ');
  const invDates   = (cert.bills || []).map(b => fmtSh(b.inv_date)).filter(Boolean).join(', ');
  const raBillNo   = cert.ra_bill_number || `RA-${cert.ra_sequence || '01'}`;

  const gross     = n(cert.gross_amount);
  const tax       = n(cert.tax_amount);
  const totalGross = gross + tax;
  const advance   = n(cert.advance_recovered);
  const retention = n(cert.retention_amount);
  const tds       = n(cert.tds_amount);
  const other     = n(cert.other_deductions);
  const totalDed  = advance + retention + tds + other;
  const netCert   = n(cert.net_payable);

  const tdsRate   = n(cert.tds_rate);
  const tdsLabel  = tdsRate > 0
    ? `TDS Deduction @ ${tdsRate}% (Sec 194C)`
    : 'TDS Deduction';

  const deductionLines = [
    { label: 'Mobilisation Advance Recovery', amt: advance },
    { label: 'Retention Money',               amt: retention },
    { label: tdsLabel,                        amt: tds },
    { label: 'Any Other Deductions',          amt: other },
  ];

  const abstractSignatories = [
    'Quantity Surveyor — Site',
    'Project Manager',
    'Project Director',
    'Quantity Surveyor — HO',
    'DGM — Finance & Accounts',
    'Director',
    'Managing Director',
  ];

  return (
    <section className="print-sheet print-abstract" style={{ ...T.page, ...T.sheet }}>
      <Masthead
        docTitle="Abstract of Measurement"
        badge={`RA Bill No: ${raBillNo}`}
        dateLabel={`Certification Date: ${fmt(cert.created_at || cert.updated_at)}`}
      />

      <div style={T.secHead}>Project &amp; Contract Information</div>
      <div style={T.infoPanel}>
        <InfoRow label="Project Name"            value={cert.project_name} />
        <InfoRow label="Vendor / Contractor"     value={cert.vendor_name} />
        <InfoRow label="Package Description"     value={cert.remarks || `${cert.order_type?.toUpperCase() || 'WO'} Certification`} />
        <InfoRow label="RA Bill No."             value={raBillNo} />
        <InfoRow label="Work / Purchase Order"   value={cert.order_number} />
        <InfoRow label="Date of Invoice"         value={invDates || '—'} />
        <InfoRow label="Order Value"             value={INR(cert.order_total_value ?? cert.gross_amount)} />
        <InfoRow label="Invoice Numbers"         value={invoiceNos || '—'} />
      </div>

      <div style={T.secHead}>Bill of Quantities — Abstract</div>
      {/* colgroup sets explicit column widths so the 15-col table fills landscape A4 correctly.
          Total ≈ 281mm (A4 landscape 297mm − 8mm margins each side − 8mm sheet padding each side) */}
      <table style={T.tbl}>
        {/* Percentage widths (sum = 100) + table-layout:fixed guarantee the
            table always fills the printable width exactly and never overflows
            the page horizontally, regardless of the render container width. */}
        <colgroup>
          <col style={{width:'2%'}}/>    {/* Sl */}
          <col style={{width:'3%'}}/>    {/* RA */}
          <col style={{width:'23%'}}/>   {/* Description */}
          <col style={{width:'3%'}}/>    {/* Unit */}
          <col style={{width:'4%'}}/>    {/* Order Qty */}
          <col style={{width:'5%'}}/>    {/* Order Rate */}
          <col style={{width:'6.5%'}}/>  {/* Order Amount */}
          <col style={{width:'4%'}}/>    {/* Inv Prev Qty */}
          <col style={{width:'4%'}}/>    {/* Inv Pres Qty */}
          <col style={{width:'6.5%'}}/>  {/* Inv Amount */}
          <col style={{width:'4%'}}/>    {/* Weighment Qty */}
          <col style={{width:'3.5%'}}/>  {/* MSB */}
          <col style={{width:'3.5%'}}/>  {/* IGN */}
          <col style={{width:'3.5%'}}/>  {/* GRS */}
          <col style={{width:'4%'}}/>    {/* QS Prev Qty */}
          <col style={{width:'4%'}}/>    {/* QS Pres Qty */}
          <col style={{width:'6.5%'}}/>  {/* QS Amount */}
          <col style={{width:'4%'}}/>    {/* Bal Qty */}
          <col style={{width:'6%'}}/>    {/* Bal Amount */}
        </colgroup>
        <thead>
          <tr>
            <th style={T.th} rowSpan={2}>Sl.</th>
            <th style={T.th} rowSpan={2}>RA</th>
            <th style={T.th} rowSpan={2}>Description of Work</th>
            <th style={T.th} rowSpan={2}>Unit</th>
            <th style={T.th} colSpan={3}>As Per Work / Purchase Order</th>
            <th style={T.th} colSpan={3}>As Per Invoice</th>
            <th style={T.th} rowSpan={2}>As Per<br/>Weighment</th>
            <th style={T.th} rowSpan={2}>MSB</th>
            <th style={T.th} rowSpan={2}>IGN</th>
            <th style={T.th} rowSpan={2}>GRS</th>
            <th style={T.th} colSpan={3}>As Per QS Certified</th>
            <th style={T.th} colSpan={2}>Balance</th>
          </tr>
          <tr>
            {['Qty','Rate (₹)','Amount (₹)','Prev Qty','Pres Qty','Amount (₹)','Prev Qty','Pres Qty','Amount (₹)','Qty','Amount (₹)'].map((h,i) => (
              <th key={i} style={T.th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((it, idx) => {
            const orderAmt  = n(it.order_qty)   * n(it.order_rate);
            const invAmt    = n(it.inv_pres_qty) * n(it.order_rate);
            const qsAmt     = n(it.qs_pres_qty)  * n(it.order_rate);
            const cumQty    = n(it.qs_prev_qty) + n(it.qs_pres_qty);
            const balQty    = Math.max(0, n(it.order_qty) - cumQty);
            const balAmt    = balQty * n(it.order_rate);
            return (
              <tr key={it.id || idx} style={{ background: idx % 2 === 0 ? '#fff' : lightBg }}>
                <td style={T.tdC}>{idx + 1}</td>
                <td style={T.tdC}>{raBillNo}</td>
                <td style={{...T.td, whiteSpace:'pre-wrap', lineHeight:'1.5'}}>{it.description}</td>
                <td style={T.tdC}>{it.unit}</td>
                <td style={T.tdR}>{fq(it.order_qty)}</td>
                <td style={T.tdR}>{raw(it.order_rate)}</td>
                <td style={T.tdR}>{raw(orderAmt)}</td>
                <td style={T.tdR}>{fq(it.inv_prev_qty)}</td>
                <td style={T.tdR}>{fq(it.inv_pres_qty)}</td>
                <td style={T.tdR}>{raw(invAmt)}</td>
                <td style={T.tdR}>{fq(it.weighment_qty)}</td>
                <td style={T.tdC}>{it.msb_ref || '—'}</td>
                <td style={T.tdC}>{it.ign_ref || '—'}</td>
                <td style={T.tdC}>{it.grs_ref || '—'}</td>
                <td style={T.tdR}>{fq(it.qs_prev_qty)}</td>
                <td style={T.tdR}>{fq(it.qs_pres_qty)}</td>
                <td style={T.tdR}>{raw(qsAmt)}</td>
                <td style={T.tdR}>{fq(balQty)}</td>
                <td style={T.tdR}>{raw(balAmt)}</td>
              </tr>
            );
          })}

          {/* GST / Tax */}
          {tax > 0 && (
            <tr style={{ background: '#FAFAFA' }}>
              <td style={T.tdC}>—</td>
              <td style={T.tdC}>—</td>
              <td style={{...T.td, fontStyle:'italic', color:'#111', fontWeight:'600'}}>GST / Tax</td>
              <td style={T.tdC}>—</td>
              <td colSpan={14} style={{...T.tdC, color:'#444', fontSize:'10px', fontWeight:'500'}}>Applicable</td>
              <td style={{...T.tdR, fontWeight:'bold'}}>{raw(tax)}</td>
            </tr>
          )}

          {/* Total Gross Certified */}
          <tr style={T.totRow}>
            <td colSpan={4} style={{...T.tdC, fontWeight:'bold', fontSize:'9.5px', color: navy}}>Total Gross Certified</td>
            <td colSpan={12} style={T.tdC}></td>
            <td colSpan={3} style={{...T.tdR, fontWeight:'bold', fontSize:'10px'}}>{raw(totalGross)}</td>
          </tr>

          {/* Deductions header */}
          <tr>
            <td colSpan={19} style={{...T.td, background:'#FFF5CC', fontWeight:'bold', fontSize:'9.5px', color: gold, letterSpacing:'0.5px', textTransform:'uppercase', padding:'4px 10px'}}>
              Deductions
            </td>
          </tr>

          {deductionLines.map((d, i) => (
            <tr key={i} style={T.dedRow}>
              <td style={T.tdC}></td>
              <td style={T.tdC}></td>
              <td style={{...T.td, fontStyle: d.amt === 0 ? 'italic' : 'normal', color: d.amt === 0 ? '#555' : '#0A0A0A', fontWeight: d.amt ? 'bold' : '500'}} colSpan={2}>{d.label}</td>
              <td colSpan={14} style={T.tdC}></td>
              <td style={{...T.tdR, fontWeight: 'bold', color: d.amt ? rust : '#555'}}>{raw(d.amt)}</td>
            </tr>
          ))}

          {/* Total Deductions */}
          <tr style={T.totRow}>
            <td colSpan={18} style={{...T.tdC, fontWeight:'bold', color: navy}}>Total Deductions</td>
            <td style={{...T.tdR, fontWeight:'bold', color: rust}}>{raw(totalDed)}</td>
          </tr>

          {/* Total Net Certified */}
          <tr style={T.netRow}>
            <td colSpan={18} style={{...T.tdC, color:'#fff', fontWeight:'bold', fontSize:'10px', letterSpacing:'0.5px'}}>
              Total Net Certified (Current RA)
            </td>
            <td style={{...T.tdR, color:'#fff', fontWeight:'bold', fontSize:'11px'}}>{raw(netCert)}</td>
          </tr>
        </tbody>
      </table>

      <div style={T.sigGrid}>
        {abstractSignatories.map(s => (
          <div key={s} style={T.sigBox}>
            <div style={T.stamp}>STAMP</div>
            <div style={T.sigRole}>{s}</div>
            <div style={T.sigDate}>Signature: ___________<br/>Date: ___________</div>
          </div>
        ))}
      </div>

      <div style={T.remarks}>
        <strong>Note:</strong>&nbsp; (a) All statutory deductions not listed above shall be effected at the Accounts Department.&nbsp;
        (b) All payments are to be verified for correctness prior to disbursement.&nbsp;
        (c) All transactions are denominated in Indian Rupees (INR).
      </div>
    </section>
  );
}

// ── PAGE 2 — Payment Certificate ──────────────────────────────────────────────
function PaymentCertificate({ cert }) {
  const invoiceNos = (cert.bills || []).map(b => b.inv_number).filter(Boolean).join(', ');
  const invDates   = (cert.bills || []).map(b => fmtSh(b.inv_date)).filter(Boolean).join(', ');
  const raBillNo   = cert.ra_bill_number || `RA-${cert.ra_sequence || '01'}`;

  const orderValue     = n(cert.order_total_value);
  const grossPlusTax   = n(cert.gross_amount) + n(cert.tax_amount);
  const finalContract  = orderValue > 0 ? orderValue : grossPlusTax;

  const prev             = n(cert.previous_certified_amount);
  const grossTillDate    = grossPlusTax + prev;
  const advance          = n(cert.advance_recovered);
  const retention        = n(cert.retention_amount);
  const tds              = n(cert.tds_amount);
  const other            = n(cert.other_deductions);
  const totalNetTillDate = grossTillDate - advance - retention - tds - other;
  const balanceToFinish  = finalContract - grossTillDate;
  const currentDue       = n(cert.net_payable);

  const payTdsRate  = n(cert.tds_rate);
  const payTdsLabel = payTdsRate > 0
    ? `Deduction of TDS @ ${payTdsRate}% (Sec 194C)`
    : 'Deduction of TDS';

  const claimRows = [
    { no:  1, label: 'Original Contract Value',                   value: finalContract,       isDed: false },
    { no:  2, label: 'Net Change by Variation Orders',            value: null,                isDed: false },
    { no:  3, label: 'Final Contract Value to Date',              value: finalContract,       isDed: false },
    { no:  4, label: 'Advance Certified',                         value: advance || null,     isDed: false },
    { no:  5, label: 'Gross Certified Till Date',                 value: grossTillDate,       isDed: false },
    { no:  6, label: 'Deduction of Mobilisation Advance',        value: advance,             isDed: true  },
    { no:  7, label: 'Deduction of Retention Amount',            value: retention,           isDed: true  },
    { no:  8, label: payTdsLabel,                                 value: tds,                 isDed: true  },
    { no:  9, label: 'Any Other Deductions',                     value: other,               isDed: true  },
    { no: 10, label: 'Total Net Certified Till Date',            value: totalNetTillDate,    bold: true   },
    { no: 11, label: 'Less Previous Certificates for Payments',  value: prev,                isDed: false },
    { no: 12, label: 'Balance to Finish',                        value: balanceToFinish,     isDed: false },
    { no: 13, label: 'Current Net Payment Due',                  value: currentDue,          highlight: true },
  ];

  // Package description: use cert remarks as the work package label (same as AbstractSheet)
  const packageDesc = cert.remarks || `${cert.order_type?.toUpperCase() || 'WO'} Certification`;

  return (
    <section className="print-sheet print-payment" style={{ ...T.page, ...T.sheet, padding: '2mm 8mm 10mm 8mm' }}>
      <Masthead
        docTitle="Payment Certificate"
        badge={`PC No: ${cert.cert_number || '—'}`}
        dateLabel={`Recommendation Date: ${fmt(cert.created_at)}`}
      />

      {/* ── Info panel — two-column layout matching Excel template ── */}
      <div style={T.secHead}>Contract &amp; Invoice Details</div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '0',
        marginBottom: '10px',
        border: '1px solid #C8D8EE',
        fontSize: '10.5px',
        background: lightBg,
      }}>
        {/* Left column */}
        <div style={{ padding: '6px 10px', borderRight: '1px solid #C8D8EE' }}>
          {[
            ['Company Name',         'BCIM Engineering Private Limited'],
            ['Package Description',  packageDesc],
            ['Purchase / Work Order', cert.order_number || '—'],
            ['PO / WO Value (₹)',    INR(cert.order_total_value ?? cert.gross_amount)],
            ['Payment Terms',        cert.payment_terms || '30 Days from the date of supply'],
          ].map(([lbl, val]) => (
            <div key={lbl} style={{...T.infoRow, borderBottom:'1px dotted #D0DCF0', paddingBottom:'3px', marginBottom:'3px'}}>
              <span style={T.infoLbl}>{lbl}</span>
              <span style={{color:'#444', marginRight:'4px', fontWeight:'bold'}}>:</span>
              <span style={T.infoVal}>{val}</span>
            </div>
          ))}
        </div>
        {/* Right column */}
        <div style={{ padding: '6px 10px' }}>
          {[
            ['Vendor Name',        cert.vendor_name],
            ['RA Bill No.',        raBillNo],
            ['Date of Invoice',    invDates || '—'],
            ['Invoice Number(s)',  invoiceNos || '—'],
            ['MR / GRS Ref.',      cert.mr_ref || '—'],
          ].map(([lbl, val]) => (
            <div key={lbl} style={{...T.infoRow, borderBottom:'1px dotted #D0DCF0', paddingBottom:'3px', marginBottom:'3px'}}>
              <span style={T.infoLbl}>{lbl}</span>
              <span style={{color:'#444', marginRight:'4px', fontWeight:'bold'}}>:</span>
              <span style={T.infoVal}>{val}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Claim Summary ── */}
      <div style={T.secHead}>Claim Summary</div>
      <table style={{ ...T.claimTbl }}>
        <colgroup>
          <col style={{width:'36px'}}/>
          <col/>
          <col style={{width:'140px'}}/>
        </colgroup>
        <thead>
          <tr>
            <th style={{...T.th, textAlign:'center'}}>No.</th>
            <th style={{...T.th, textAlign:'left', padding:'5px 12px'}}>Particulars</th>
            <th style={{...T.th, textAlign:'right', padding:'5px 12px'}}>Amount (₹)</th>
          </tr>
        </thead>
        <tbody>
          {claimRows.map(row => {
            const bg  = row.highlight ? navy : row.isDed ? dedBg : row.no % 2 === 0 ? lightBg : '#fff';
            const col = row.highlight ? '#fff' : row.isDed ? '#5C3D00' : '#0A0A0A';
            const fw  = (row.highlight || row.bold) ? 'bold' : '500';
            const isNeg = row.value != null && row.value < 0;
            return (
              <tr key={row.no}>
                <td style={{...T.tdC, background: bg, color: col, fontWeight: fw, fontSize:'11px'}}>{row.no}</td>
                <td style={{...T.td, background: bg, color: col, fontWeight: fw, fontSize:'11px', padding:'5px 12px'}}>
                  {row.isDed && <span style={{color: rust, marginRight:'4px'}}>▸</span>}
                  {row.label}
                </td>
                <td style={{...T.tdR, background: bg, color: isNeg ? rust : col, fontWeight: fw, fontSize:'11px', padding:'5px 12px'}}>
                  {row.value == null ? '—' : (isNeg ? `(${raw(Math.abs(row.value))})` : raw(row.value))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* ── Amount in words ── */}
      <div style={{...T.amtBox, width:'100%', boxSizing:'border-box'}}>
        <div style={{fontSize:'10px', color:'#111', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:'3px', fontWeight:'bold'}}>Amount Certified in Words Rupees :</div>
        <div style={{fontWeight:'bold', color: navy, fontSize:'12px'}}>{numberToWords(currentDue)} Only</div>
        <div style={{fontSize:'10px', color:'#111', marginTop:'2px', fontWeight:'600'}}>( ₹ {inr(currentDue)} )</div>
      </div>

      {/* ── Remarks & Conditions ── */}
      <div style={{...T.remarks, marginTop:'10px'}}>
        <div style={{fontWeight:'bold', color: navy, marginBottom:'4px', fontSize:'10px', textTransform:'uppercase', letterSpacing:'0.5px'}}>Remarks</div>
        <ol style={{margin:'0 0 0 18px', padding:0, lineHeight:'1.7'}}>
          <li>Any Statutory deductions required to be made apart from the above shall be made at Accounts Department.</li>
          <li>Payments made to be verified for correctness.</li>
          <li>All transactions in Indian Rupees.</li>
        </ol>
      </div>

      {/* ── Notes for Accounts ── */}
      <div style={{marginTop:'8px', border:'1px solid #C8D8EE', borderRadius:'2px', padding:'6px 10px', background:'#FAFCFF', fontSize:'10px'}}>
        <div style={{fontWeight:'bold', color: navy, marginBottom:'4px', textTransform:'uppercase', fontSize:'9.5px', letterSpacing:'0.4px'}}>Notes for Accounts — If any</div>
        <div style={{minHeight:'20px', color:'#333', fontWeight:'500'}}>{cert.notes_for_accounts || ''}</div>
      </div>

      {/* ── Signature block ── */}
      <div style={{...T.sigGrid, marginTop:'20px'}}>
        {[
          { role: 'Recommended For Payment', title: 'Prepared By' },
          { role: 'Approved For Payment',    title: 'Director' },
          { role: 'Approved For Payment',    title: 'Managing Director' },
        ].map((s, i) => (
          <div key={i} style={{...T.sigBox, flex: 1}}>
            <div style={T.stamp}>STAMP</div>
            <div style={T.sigRole}>{s.role}</div>
            <div style={T.sigDate}>Signature: ___________</div>
            <div style={{...T.sigRole, marginTop:'6px', fontWeight:'600', fontSize:'9px', color:'#222'}}>{s.title}</div>
            <div style={T.sigDate}>Date: ___________</div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Edit Deductions Modal ─────────────────────────────────────────────────────
function AmountCorrectionModal({ cert, onClose }) {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const canEditSensitive =
    (user?.email || '').toLowerCase() === CERT_APPROVER_EMAIL ||
    ['super_admin', 'admin'].includes((user?.role || '').toLowerCase());
  const [form, setForm] = useState({
    tds_rate:          cert.tds_rate          || 0,
    tds_amount:        cert.tds_amount        || 0,
    advance_recovered: cert.advance_recovered || 0,
    retention_amount:  cert.retention_amount  || 0,
    other_deductions:  cert.other_deductions  || 0,
    remarks:           cert.remarks           || '',
    cert_number:       cert.cert_number       || '',
    gst_tax:           cert.tax_amount        || 0,
  });
  // Fetch pending subcon advances from Stores matching this vendor
  const { data: scAdv } = useQuery({
    queryKey: ['pending-sc-advances', cert.vendor_name, cert.project_id],
    queryFn:  () => vendorQSCertificationAPI.pendingScAdvances({ vendor_name: cert.vendor_name, project_id: cert.project_id }).then(r => r.data),
    enabled:  !!cert.vendor_name,
    staleTime: 30000,
  });
  useEffect(() => {
    setForm({
      tds_rate:          cert.tds_rate          || 0,
      tds_amount:        cert.tds_amount        || 0,
      advance_recovered: cert.advance_recovered || 0,
      retention_amount:  cert.retention_amount  || 0,
      other_deductions:  cert.other_deductions  || 0,
      remarks:           cert.remarks           || '',
      cert_number:       cert.cert_number       || '',
      gst_tax:           cert.tax_amount        || 0,
    });
  }, [cert]);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  // When tds_rate changes, auto-recalculate tds_amount
  const handleTdsRateChange = (rate) => {
    const gross = n(cert.gross_amount);
    const newAmt = rate ? Math.round(gross * Number(rate) / 100) : 0;
    setForm(p => ({ ...p, tds_rate: rate, tds_amount: newAmt }));
  };
  const totalDed  = n(form.tds_amount) + n(form.advance_recovered) + n(form.retention_amount) + n(form.other_deductions);
  // Preview follows the edited GST when the approver changes it (WYSIWYG with backend)
  const effectiveTax = canEditSensitive ? n(form.gst_tax) : n(cert.tax_amount);
  const revisedNet = n(cert.gross_amount) + effectiveTax - totalDed;
  const mut = useMutation({
    mutationFn: () => {
      const payload = { ...form };
      if (!canEditSensitive) { delete payload.cert_number; delete payload.gst_tax; }
      return vendorQSCertificationAPI.updateAmounts(cert.id, payload);
    },
    onSuccess: () => {
      toast.success('Certification updated');
      qc.invalidateQueries({ queryKey: ['vendor-qs-certification', cert.id] });
      qc.invalidateQueries({ queryKey: ['vendor-qs-certifications'] });
      onClose();
    },
    onError: err => toast.error(err?.response?.data?.error || 'Failed to update certification'),
  });
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 no-print">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-medium text-slate-900">
              {canEditSensitive ? 'Edit Certification' : 'Edit Certification Deductions'}
            </h2>
            <p className="text-xs text-slate-500">
              {canEditSensitive
                ? 'Correct certificate number, GST, TDS and deductions. Linked bills will be updated.'
                : 'Correct TDS and deductions. Linked bills will be updated.'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg border border-slate-200"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 grid grid-cols-2 gap-3">
          {/* Certificate number + GST — QS certifier (prithivi) / admin only */}
          {canEditSensitive && (
            <>
              <div>
                <label className="text-[11px] font-medium text-slate-900 uppercase">Certificate Number</label>
                <input type="text" className="w-full border border-indigo-200 rounded-lg px-3 py-2 text-sm"
                  value={form.cert_number} onChange={e => set('cert_number', e.target.value)} />
              </div>
              <div>
                <label className="text-[11px] font-medium text-slate-900 uppercase">GST / Tax Amount</label>
                <input type="number" className="w-full border border-indigo-200 rounded-lg px-3 py-2 text-sm"
                  value={form.gst_tax} onChange={e => set('gst_tax', e.target.value)} />
              </div>
              <div className="col-span-2 border-b border-dashed border-slate-200 -mt-1 mb-1" />
            </>
          )}
          {/* TDS Rate selector */}
          <div>
            <label className="text-[11px] font-medium text-slate-900 uppercase">TDS Rate</label>
            <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              value={form.tds_rate} onChange={e => handleTdsRateChange(e.target.value)}>
              <option value="0">No TDS (0%)</option>
              <option value="1">1% — Individual / Labour Contractor</option>
              <option value="2">2% — Company / Subcontractor</option>
              <option value="10">10% — Professional Services</option>
            </select>
          </div>
          {/* TDS Amount — auto-filled or manual */}
          <div>
            <label className="text-[11px] font-medium text-slate-900 uppercase flex items-center gap-1">
              TDS Amount
              {Number(form.tds_rate) > 0 && (
                <span className="text-[10px] text-emerald-600 font-normal normal-case">({form.tds_rate}% of gross)</span>
              )}
            </label>
            <input type="number" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              value={form.tds_amount} onChange={e => set('tds_amount', e.target.value)} />
          </div>
          {/* Advance Recovery — with pending subcon advance hint from Stores */}
          <div className="col-span-2">
            {scAdv?.total > 0 && (
              <div className="mb-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-center justify-between">
                <span className="text-[11px] text-amber-800">
                  Pending subcon advance in Stores ({scAdv.data?.length} entr{scAdv.data?.length === 1 ? 'y' : 'ies'}):
                  {' '}<strong>₹{inr(scAdv.total)}</strong>
                  {scAdv.data?.[0] && <span className="text-amber-600 ml-1">— {scAdv.data[0].payee_name} / {scAdv.data[0].description}</span>}
                </span>
                <button type="button" onClick={() => set('advance_recovered', scAdv.total)}
                  className="ml-3 text-[11px] font-semibold text-amber-700 border border-amber-300 rounded px-2 py-0.5 hover:bg-amber-100 whitespace-nowrap">
                  Apply ₹{inr(scAdv.total)}
                </button>
              </div>
            )}
            <label className="text-[11px] font-medium text-slate-900 uppercase">Advance Recovery</label>
            <input type="number" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              value={form.advance_recovered} onChange={e => set('advance_recovered', e.target.value)} />
          </div>
          {[
            ['retention_amount', 'Retention'],
            ['other_deductions', 'Other Deductions'],
          ].map(([key, label]) => (
            <div key={key}>
              <label className="text-[11px] font-medium text-slate-900 font-medium uppercase">{label}</label>
              <input type="number" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                value={form[key]} onChange={e => set(key, e.target.value)} />
            </div>
          ))}
          <div className="col-span-2">
            <label className="text-[11px] font-medium text-slate-900 font-medium uppercase">Remarks</label>
            <textarea className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" rows={2}
              value={form.remarks} onChange={e => set('remarks', e.target.value)} />
          </div>
          <div className="col-span-2 bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase font-medium text-slate-500">Revised Net Payable</p>
              <p className="text-xl font-medium text-emerald-700">₹{inr(revisedNet)}</p>
            </div>
            <p className="text-xs text-slate-500">Gross ₹{inr(cert.gross_amount)} + Tax ₹{inr(effectiveTax)} − Ded ₹{inr(totalDed)}</p>
          </div>
        </div>
        <div className="px-5 py-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-bold">Cancel</button>
          <button onClick={() => mut.mutate()} disabled={mut.isPending}
            className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50">
            {mut.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Pencil className="w-4 h-4" />}
            Save Correction
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Payment Modal ─────────────────────────────────────────────────────────────
function PaymentModal({ cert, onClose }) {
  const qc = useQueryClient();
  const netPayable    = Number(cert.net_payable    || 0);
  const alreadyPaid   = Number(cert.paid_amount    || 0);
  const remainingDue  = Math.max(0, netPayable - alreadyPaid);

  const [form, setForm] = useState({
    paid_amount:      String(remainingDue.toFixed(2)),
    payment_date:     new Date().toISOString().slice(0, 10),
    payment_mode:     'RTGS',
    reference_number: '',
    bank_name:        '',
    remarks:          '',
  });
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const mut = useMutation({
    mutationFn: () => vendorQSCertificationAPI.recordPayment(cert.id, {
      paid_amount:      Number(form.paid_amount || 0),
      payment_date:     form.payment_date,
      payment_mode:     form.payment_mode,
      reference_number: form.reference_number || null,
      bank_name:        form.bank_name || null,
      remarks:          form.remarks || null,
    }),
    onSuccess: (res) => {
      const data = res.data?.data;
      const billsCount = data?.bills_paid?.length || 0;
      toast.success(
        data?.cert_fully_paid
          ? `Payment recorded · ${billsCount} bill(s) marked Paid · Cert closed`
          : `Partial payment recorded · ${billsCount} bill(s) updated`
      );
      qc.invalidateQueries({ queryKey: ['vendor-qs-certification', cert.id] });
      qc.invalidateQueries({ queryKey: ['vendor-qs-certifications'] });
      qc.invalidateQueries({ queryKey: ['tqs-bills'] });
      qc.invalidateQueries({ queryKey: ['liability-summary'] });
      qc.invalidateQueries({ queryKey: ['liability-ledger'] });
      onClose();
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Payment failed'),
  });

  const payAmt = Number(form.paid_amount || 0);
  const canSave = payAmt > 0 && payAmt <= remainingDue + 0.5 && !!form.payment_date && !mut.isPending;

  return (
    <div className="fixed inset-0 z-[9999] bg-black/45 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-xl shadow-2xl overflow-hidden">
        <div className="bg-emerald-700 text-white px-5 py-3 flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-wider opacity-80">Record Payment</p>
            <p className="text-sm font-bold">{cert.cert_number} · {cert.vendor_name}</p>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white"><X className="w-5 h-5"/></button>
        </div>

        <div className="px-5 py-4 grid grid-cols-3 gap-3 bg-slate-50 border-b border-slate-200">
          <div>
            <p className="text-[10px] uppercase font-bold text-slate-500">Net Payable</p>
            <p className="text-base font-extrabold text-slate-900">₹{inr(netPayable)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold text-slate-500">Already Paid</p>
            <p className="text-base font-extrabold text-slate-600">₹{inr(alreadyPaid)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold text-slate-500">Remaining Due</p>
            <p className="text-base font-extrabold text-emerald-700">₹{inr(remainingDue)}</p>
          </div>
        </div>

        <div className="px-5 py-4 grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="text-[10px] uppercase font-bold text-slate-500">Paid Amount *</label>
            <input type="number" min="0" step="0.01" value={form.paid_amount}
              onChange={e => set('paid_amount', e.target.value)}
              className="w-full mt-1 border border-slate-300 rounded-lg px-3 py-2 text-base font-bold focus:border-emerald-500 outline-none"/>
            {payAmt > remainingDue + 0.5 && (
              <p className="text-[10px] text-red-600 mt-1">Exceeds remaining due (₹{inr(remainingDue)})</p>
            )}
          </div>
          <div>
            <label className="text-[10px] uppercase font-bold text-slate-500">Payment Date *</label>
            <input type="date" value={form.payment_date}
              onChange={e => set('payment_date', e.target.value)}
              className="w-full mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm font-medium focus:border-emerald-500 outline-none"/>
          </div>
          <div>
            <label className="text-[10px] uppercase font-bold text-slate-500">Payment Mode</label>
            <select value={form.payment_mode}
              onChange={e => set('payment_mode', e.target.value)}
              className="w-full mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm font-medium focus:border-emerald-500 outline-none">
              <option>RTGS</option><option>NEFT</option><option>IMPS</option>
              <option>Cheque</option><option>DD</option><option>Cash</option>
              <option>bank_transfer</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className="text-[10px] uppercase font-bold text-slate-500">UTR / Reference Number</label>
            <input type="text" value={form.reference_number}
              onChange={e => set('reference_number', e.target.value)}
              placeholder="UTR / Cheque No / Txn Ref"
              className="w-full mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm font-medium focus:border-emerald-500 outline-none"/>
          </div>
          <div className="col-span-2">
            <label className="text-[10px] uppercase font-bold text-slate-500">Bank Name</label>
            <input type="text" value={form.bank_name}
              onChange={e => set('bank_name', e.target.value)}
              placeholder="e.g. HDFC Bank — Cur A/c"
              className="w-full mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm font-medium focus:border-emerald-500 outline-none"/>
          </div>
          <div className="col-span-2">
            <label className="text-[10px] uppercase font-bold text-slate-500">Remarks</label>
            <textarea value={form.remarks} rows={2}
              onChange={e => set('remarks', e.target.value)}
              className="w-full mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm font-medium focus:border-emerald-500 outline-none"/>
          </div>
        </div>

        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-bold">Cancel</button>
          <button onClick={() => mut.mutate()} disabled={!canSave}
            className="px-5 py-2 bg-emerald-700 text-white rounded-lg text-sm font-bold flex items-center gap-2 disabled:opacity-50">
            {mut.isPending ? <RefreshCw className="w-4 h-4 animate-spin"/> : <CheckCircle2 className="w-4 h-4"/>}
            Pay ₹{inr(payAmt)}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function VendorQSCertificationDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const canEditSensitive =
    (user?.email || '').toLowerCase() === CERT_APPROVER_EMAIL ||
    ['super_admin', 'admin'].includes((user?.role || '').toLowerCase());
  // Work from both /qs and /tqs paths
  const backPath = location.pathname.startsWith('/tqs') ? '/tqs/vendor-certifications'
    : location.pathname.startsWith('/accounts') ? '/accounts/purchases/qs-certifications'
    : '/qs/vendor-certifications';
  const [showCorrection, setShowCorrection] = useState(false);
  const [printMode, setPrintMode] = useState(null); // 'abstract' | 'payment'
  const autoPrintDone = useRef(false);

  const handlePrint = (mode) => {
    setPrintMode(mode);
    setTimeout(() => {
      window.print();
      setTimeout(() => setPrintMode(null), 500);
    }, 80);
  };

  const { data: cert, isLoading } = useQuery({
    queryKey: ['vendor-qs-certification', id],
    queryFn:  () => vendorQSCertificationAPI.get(id).then(r => r.data?.data ?? r.data),
    staleTime: 0,
  });

  const deleteMut = useMutation({
    mutationFn: () => vendorQSCertificationAPI.delete(id),
    onSuccess: () => {
      toast.success('Certification deleted');
      qc.invalidateQueries({ queryKey: ['vendor-qs-certifications'] });
      navigate(backPath);
    },
    onError: err => toast.error(err?.response?.data?.error || 'Failed to delete certification'),
  });

  const handleDelete = () => {
    if (cert.status === 'paid') {
      toast.error('Cannot delete a paid certification.');
      return;
    }
    if (!window.confirm(`Delete certification ${cert.cert_number}?\n\nThis cannot be undone.`)) return;
    deleteMut.mutate();
  };

  const refreshMut = useMutation({
    mutationFn: () => vendorQSCertificationAPI.refreshFromBills(id),
    onSuccess: (res) => {
      const count = res.data?.data?.refreshed_items ?? 0;
      toast.success(`Refreshed from latest bill values (${count} item${count === 1 ? '' : 's'})`);
      qc.invalidateQueries({ queryKey: ['vendor-qs-certification', id] });
      qc.invalidateQueries({ queryKey: ['vendor-qs-certifications'] });
    },
    onError: err => toast.error(err?.response?.data?.error || 'Failed to refresh from bills'),
  });

  // Auto-print when arriving with ?print=abstract or ?print=payment (from buttons that open in new tab)
  useEffect(() => {
    if (autoPrintDone.current) return;
    const mode = searchParams.get('print');
    if (!mode) return;
    if (!cert) return;          // wait for data to load
    autoPrintDone.current = true;
    setPrintMode(mode);
    const t = setTimeout(() => {
      window.print();
      // After print, restore mode so the on-screen view is normal.
      // Do NOT close the tab — user may want to re-print or review.
      setTimeout(() => setPrintMode(null), 600);
    }, 250);                     // give layout time to apply print mode
    return () => clearTimeout(t);
  }, [cert, searchParams]);

  if (isLoading) return <div className="p-8 text-slate-500">Loading certification...</div>;
  if (!cert)    return <div className="p-8 text-slate-500">Certification not found.</div>;

  return (
    <div className="bg-slate-200 min-h-full p-4">
      {/* ── Dynamic print styles ── */}
      <style>{`
        @media print {
          /* ── 1. Unlock Layout overflow so content flows across pages ── */
          /* The root Layout div uses inline overflow:hidden + height:100vh
             which clips everything to one screen. Override ALL ancestors. */
          html, body {
            height: auto !important;
            min-height: 0 !important;
            overflow: visible !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          /* Target the Layout root (.erp-layout-enter) and its children */
          .erp-layout-enter,
          .erp-layout-enter > *,
          .erp-layout-enter > * > * {
            height: auto !important;
            max-height: none !important;
            overflow: visible !important;
          }
          /* Also target #root and any direct body children */
          #root, body > div {
            height: auto !important;
            overflow: visible !important;
          }

          /* ── 2. Color accuracy ── */
          *, *::before, *::after {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          /* ── 3. Hide everything, show only print-area ── */
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible; }
          .no-print { display: none !important; }

          /* ── 4. Print sheet resets ── */
          /* Force the print chain to the full printable width and strip the
             on-screen padding (bg-slate-200 p-4 wrapper + space-y gaps) so the
             sheet occupies the entire page and content isn't squeezed/clipped. */
          .bg-slate-200 { background: #fff !important; padding: 0 !important; margin: 0 !important; }
          .print-area { width: 100% !important; margin: 0 !important; padding: 0 !important; }
          .print-area > * + * { margin-top: 0 !important; }
          .print-sheet {
            box-shadow: none !important;
            border: none !important;
            margin: 0 !important;
            padding-left: 0 !important;
            padding-right: 0 !important;
            width: 100% !important;
            background: #fff !important;
            page-break-after: auto;
          }
          .print-sheet table { width: 100% !important; }
          /* Keep the signature grid together so boxes never split across pages */
          .print-sheet > div:last-child { page-break-inside: avoid; }

          /* ── 5. Table pagination ── */
          tr, .avoid-break { page-break-inside: avoid; }
          thead { display: table-header-group; }
          tfoot { display: table-footer-group; }

          ${printMode === 'abstract'
            ? `.print-payment { display: none !important; }
               @page { size: A4 landscape; margin: 6mm 5mm 8mm 5mm; }`
            : printMode === 'payment'
            ? `.print-abstract { display: none !important; }
               @page { size: A4 portrait; margin: 8mm 8mm 10mm 8mm; }`
            : `@page { size: A4 landscape; margin: 6mm 5mm 8mm 5mm; }`
          }
        }
      `}</style>

      {/* ── Toolbar ── */}
      <div className="no-print flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate(backPath)}
            className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium flex items-center gap-2 shadow-sm hover:bg-slate-50">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <button
            onClick={handleDelete}
            disabled={deleteMut.isPending || cert.status === 'paid'}
            className="px-3 py-2 bg-white border border-red-200 text-red-600 rounded-lg text-sm font-medium flex items-center gap-2 shadow-sm hover:bg-red-50 disabled:opacity-40"
            title={cert.status === 'paid' ? 'Paid certifications cannot be deleted' : 'Delete this certification'}
          >
            {deleteMut.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            Delete
          </button>
          {/* Navigate to the linked invoice(s) */}
          {cert.bills?.length === 1 ? (
            <button
              onClick={() => navigate(`/tqs/bills/${cert.bills[0].bill_id}`)}
              className="px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 shadow-sm text-white"
              style={{ background: '#1a3a6b' }}
              title="Open the invoice linked to this certification"
            >
              <FileText className="w-4 h-4" />
              View Invoice — {cert.bills[0].inv_number || cert.bills[0].sl_number}
            </button>
          ) : cert.bills?.length > 1 ? (
            <button
              onClick={() => navigate(`/tqs/bills?vendor_name=${encodeURIComponent(cert.vendor_name)}`)}
              className="px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 shadow-sm text-white"
              style={{ background: '#1a3a6b' }}
              title={`${cert.bills.length} invoices linked — open bills list for this vendor`}
            >
              <FileText className="w-4 h-4" />
              View Invoices ({cert.bills.length})
            </button>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refreshMut.mutate()}
            disabled={refreshMut.isPending || cert.status === 'paid' || cert.status === 'cancelled'}
            className="px-4 py-2 bg-white border border-slate-200 text-slate-900 rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50 shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 ${refreshMut.isPending ? 'animate-spin' : ''}`} /> Refresh from Bills
          </button>
          <button
            onClick={() => setShowCorrection(true)}
            disabled={cert.status === 'paid' || cert.status === 'cancelled'}
            className="px-4 py-2 bg-white border border-slate-200 text-slate-900 rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50 shadow-sm"
          >
            <Pencil className="w-4 h-4" /> {canEditSensitive ? 'Edit Certification' : 'Edit Deductions'}
          </button>
          {/* ── Print Abstract (Landscape A4) ── */}
          <button
            onClick={() => handlePrint('abstract')}
            className="px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 shadow-sm text-white"
            style={{ background: '#1a5276' }}
          >
            <Printer className="w-4 h-4" /> Print Abstract
          </button>
          {/* ── Print Payment Certificate (Portrait A4) ── */}
          <button
            onClick={() => handlePrint('payment')}
            className="px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 shadow-sm text-white"
            style={{ background: '#145a32' }}
          >
            <Printer className="w-4 h-4" /> Print Payment Cert
          </button>
        </div>
      </div>

      {/* ── Audit trail ── */}
      <div className="no-print bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-4 mb-4">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-3">Timeline</p>
        <div className="flex flex-wrap gap-6 text-xs">
          <div>
            <p className="text-slate-400 uppercase tracking-wide text-[10px]">Created</p>
            <p className="font-medium text-slate-800">{fmt(cert.created_at)}{cert.created_by_name ? ` · ${cert.created_by_name}` : ''}</p>
          </div>
          {cert.status === 'rejected' ? (
            <div>
              <p className="text-orange-500 uppercase tracking-wide text-[10px]">Rejected</p>
              <p className="font-medium text-orange-700">{fmt(cert.rejected_at)}{cert.rejected_by_name ? ` · ${cert.rejected_by_name}` : ''}</p>
              {cert.rejection_remarks && <p className="text-orange-600 mt-0.5 max-w-md">"{cert.rejection_remarks}"</p>}
            </div>
          ) : ['accounts', 'paid'].includes(cert.status) ? (
            <div>
              <p className="text-indigo-500 uppercase tracking-wide text-[10px]">Approved → Accounts</p>
              <p className="font-medium text-indigo-700">{fmt(cert.approved_at)}{cert.approved_by_name ? ` · ${cert.approved_by_name}` : ''}</p>
            </div>
          ) : (
            <div>
              <p className="text-amber-500 uppercase tracking-wide text-[10px]">Status</p>
              <p className="font-medium text-amber-700">Awaiting approval</p>
            </div>
          )}
          {cert.status === 'paid' && (
            <div>
              <p className="text-emerald-500 uppercase tracking-wide text-[10px]">Paid</p>
              <p className="font-medium text-emerald-700">{fmt(cert.paid_at)}</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Print area ── */}
      <div className="print-area space-y-6">
        <AbstractSheet cert={cert} />
        <PaymentCertificate cert={cert} />
      </div>

      {showCorrection && <AmountCorrectionModal cert={cert} onClose={() => setShowCorrection(false)} />}
    </div>
  );
}
