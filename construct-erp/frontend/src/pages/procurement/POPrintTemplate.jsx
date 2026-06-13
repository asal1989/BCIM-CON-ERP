// src/pages/procurement/POPrintTemplate.jsx
import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import dayjs from 'dayjs';

// ─── Amount to words ─────────────────────────────────────────────────────────
const ONES  = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
const TENS  = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];

function numToWords(n) {
  n = Math.floor(n);
  if (n === 0) return 'Zero';
  if (n < 0)   return 'Minus ' + numToWords(-n);
  let words = '';
  if (n >= 10000000) { words += numToWords(Math.floor(n / 10000000)) + ' Crore '; n %= 10000000; }
  if (n >= 100000)   { words += numToWords(Math.floor(n / 100000))   + ' Lakh ';  n %= 100000; }
  if (n >= 1000)     { words += numToWords(Math.floor(n / 1000))     + ' Thousand '; n %= 1000; }
  if (n >= 100)      { words += ONES[Math.floor(n / 100)]            + ' Hundred '; n %= 100; }
  if (n >= 20)       { words += TENS[Math.floor(n / 10)]; if (n % 10) words += '-' + ONES[n % 10]; }
  else if (n > 0)    { words += ONES[n]; }
  return words.trim();
}

function amountInWords(amount) {
  if (!amount || isNaN(amount)) return 'Zero Rupees Only';
  const rupees = Math.floor(amount);
  const paise  = Math.round((amount - rupees) * 100);
  let result   = 'Rupees ' + numToWords(rupees);
  if (paise > 0) result += ' and ' + numToWords(paise) + ' Paise';
  return result + ' Only';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const f2 = v => parseFloat(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Collapse a list of item numbers into compact ranges, e.g.
// [1,2,5,6,...,20,23,25,26] -> "1-2, 5-20, 23, 25-26"
const formatItemNos = (nums) => {
  if (!nums || !nums.length) return '';
  const s = [...nums].sort((a, b) => a - b);
  const out = [];
  let start = s[0], prev = s[0];
  for (let k = 1; k <= s.length; k++) {
    if (k < s.length && s[k] === prev + 1) { prev = s[k]; continue; }
    out.push(start === prev ? `${start}` : `${start}-${prev}`);
    if (k < s.length) { start = s[k]; prev = s[k]; }
  }
  return out.join(', ');
};

// ─── LANCO Hills (LH-10) project overrides ────────────────────────────────────
const LANCO_DELIVERY_ADDRESS = `LANCO HILLS - LH10
LANCO Hills Residential Apartments, Tower - LH10,
Survey nos 201, Manikonda, Rajendranagar Mandal,
HYDERABAD - 500089
Contact Person BCIM: Mr. Vijayan - 82700 94285`;

const POPrintTemplate = React.forwardRef(({ data }, ref) => {
  if (!data) return (
    <div ref={ref} className="p-10 text-center font-bold text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">
      Preparing Purchase Order…
    </div>
  );

  const items        = data.items || [];
  const isTaxIncl    = Boolean(data.gst_inclusive);
  const isLanco      = data.project_code === 'LH-10';
  const verifyUrl    = `${window.location.origin}/verify/po/${data.id}`;
  const termsLines   = String(data.terms_conditions || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  // ── Totals ──────────────────────────────────────────────────────────────────
  const subTotal   = parseFloat(data.sub_total  || items.reduce((s, it) => s + parseFloat(it.quantity||0) * parseFloat(it.rate||0), 0));
  const totalGst   = isTaxIncl ? 0 : parseFloat(data.total_gst  || items.reduce((s, it) => s + parseFloat(it.gst_amount||0), 0));
  const tcsAmt     = parseFloat(data.tcs_amount || 0);
  const grandTotal = parseFloat(data.grand_total || (subTotal + totalGst + tcsAmt));

  // GST break-up by rate — items may carry different GST % (5 / 12 / 18 / 28).
  // Track both the tax amount and the item numbers that fall under each rate.
  const gstByRate = {}; // rate -> { amount, nums: [] }
  if (!isTaxIncl) {
    items.forEach((it, idx) => {
      const r   = parseFloat(it.gst_rate || 0);
      const stored = parseFloat(it.gst_amount || 0);
      const amt = stored > 0 ? stored : (parseFloat(it.quantity||0) * parseFloat(it.rate||0) * r / 100);
      if (!gstByRate[r]) gstByRate[r] = { amount: 0, nums: [] };
      gstByRate[r].amount += amt;
      gstByRate[r].nums.push(idx + 1);
    });
  }
  const gstRates = Object.keys(gstByRate).map(Number).filter(r => r > 0).sort((a, b) => a - b);

  // ── Signature / approval grid — rendered in a tfoot so it repeats at the
  //    bottom of EVERY printed page (table-footer-group behaviour) ───────────
  const approvalGrid = (
    <div className="po-approval-block" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', border: '1px solid #000', fontSize: '8px', height: '80px' }}>
      {/* Col 1: Prepared By */}
      <div style={{ borderRight: '1px solid #000', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '4px', textAlign: 'center' }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
          {data.prepared_by_sig
            ? <img src={data.prepared_by_sig} alt="Sig" style={{ maxHeight: '36px', maxWidth: '100%' }} />
            : <span style={{ color: '#6b7280', fontStyle: 'italic', fontSize: '7px' }}>Digitally Signed</span>
          }
        </div>
        <div style={{ borderTop: '1px solid #000', width: '100%', paddingTop: '3px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
          Prepared By
        </div>
        <p style={{ margin: 0, fontSize: '7px' }}>{data.prepared_by_name || 'Procurement'}</p>
      </div>

      {/* Col 2: Director */}
      <div style={{ borderRight: '1px solid #000', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '4px', textAlign: 'center' }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
          {data.released_mgmt_sig
            ? <img src={data.released_mgmt_sig} alt="Sig" style={{ maxHeight: '36px', maxWidth: '100%' }} />
            : <span style={{ color: '#6b7280', fontStyle: 'italic', fontSize: '7px' }}>{data.released_mgmt_name ? 'Approved' : 'Pending'}</span>
          }
        </div>
        <div style={{ borderTop: '1px solid #000', width: '100%', paddingTop: '3px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
          Director
        </div>
        <p style={{ margin: 0, fontSize: '7px', fontWeight: 600 }}>{data.released_mgmt_name || 'Pending'}</p>
      </div>

      {/* Col 3: Managing Director */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '4px', textAlign: 'center' }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
          {data.authorized_md_sig
            ? <img src={data.authorized_md_sig} alt="Sig" style={{ maxHeight: '36px', maxWidth: '100%' }} />
            : data.authorized_md_name
              ? <div style={{ border: '3px solid #16a34a', color: '#16a34a', borderRadius: '50%', padding: '2px 4px', fontWeight: 900, fontSize: '6px', transform: 'rotate(-12deg)' }}>BCIM AUTHORIZED</div>
              : <span style={{ color: '#6b7280', fontStyle: 'italic', fontSize: '7px' }}>Pending</span>
          }
        </div>
        <div style={{ borderTop: '1px solid #000', width: '100%', paddingTop: '3px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Managing Director
        </div>
        <p style={{ margin: 0, fontSize: '7px', fontWeight: 600 }}>{data.authorized_md_name || 'BCIM Engineering'}</p>
      </div>
    </div>
  );

  return (
    <div ref={ref} className="po-print-wrapper">
      {/* po-page: no fixed minHeight — content determines height, allows multi-page */}
      <div className="po-page bg-white text-black"
        style={{ width: '210mm', padding: '12mm', boxSizing: 'border-box', fontSize: '10px', lineHeight: '1.4', fontFamily: "'Book Antiqua','Palatino Linotype',Palatino,serif" }}>

        {/* Fixed page footer: print CSS pins this to the BOTTOM of every printed page */}
        <div className="po-page-footer">
          {approvalGrid}
        </div>

        {/* Layout table: repeated tfoot spacer reserves room for the fixed footer on each page */}
        <table className="po-layout" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tfoot className="po-layout-footer">
            <tr><td><div className="po-footer-space" style={{ height: '100px' }} /></td></tr>
          </tfoot>
          <tbody className="po-layout-body">
            <tr><td style={{ padding: 0 }}>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* HEADER                                                              */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <div style={{ textAlign: 'center', marginBottom: '6px' }}>
          <h1 style={{ fontSize: '20px', fontWeight: 900, letterSpacing: '1px', color: '#000', margin: 0 }}>PURCHASE ORDER</h1>
        </div>
        <div style={{ borderBottom: '2.5px solid #000', paddingBottom: '8px', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
          {/* Left: Logo + Company */}
          <div>
            <img src="/bcim-logo.png" alt="BCIM" style={{ height: '48px', objectFit: 'contain', marginBottom: '6px', display: 'block' }} />
            <div style={{ fontSize: '9px', color: '#000', lineHeight: '1.5' }}>
              <p style={{ fontWeight: 700, fontSize: '12px', color: '#000', margin: '0 0 2px' }}>BCIM ENGINEERING PRIVATE LIMITED</p>
              {isLanco ? (
                <>
                  <p style={{ margin: 0 }}>TOWER VIEW APARTMENT, NO 403, 4th FLOOR,</p>
                  <p style={{ margin: 0 }}>PLOT NO 26 &amp; 27, SRI LAKSHMI NAGAR COLONY,</p>
                  <p style={{ margin: 0 }}>HYDERABAD, RANGAREDDY DIST, TELANGANA – 500089</p>
                  <p style={{ margin: 0 }}>GSTIN: 36AAHCB6485A1ZQ</p>
                </>
              ) : (
                <>
                  <p style={{ margin: 0 }}>No 579, 1st 'A' Main Road, Jayanagar 8th Block, Bangalore – 560070</p>
                  <p style={{ margin: 0 }}>GSTIN: 29AAXCB2929P1Z1 &nbsp;|&nbsp; Tel: +91 80 26650194</p>
                  <p style={{ margin: 0 }}>Email: procurement@bcimengineering.in</p>
                </>
              )}
            </div>
          </div>

          {/* Right: PO Number + QR */}
          <div style={{ textAlign: 'right' }}>
            <div style={{ background: '#1e293b', color: '#fff', padding: '3px 10px', display: 'inline-block', fontWeight: 700, fontSize: '11px', borderRadius: '4px', marginBottom: '6px' }}>
              {data.serial_no_formatted || data.po_number || '—'}
            </div>
            <div style={{ marginTop: '4px' }}>
              <QRCodeSVG value={verifyUrl} size={52} />
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* INFO GRID: Vendor + PO Details                                     */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
          {/* Vendor */}
          <div style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px' }}>
            <p style={{ fontSize: '8px', fontWeight: 700, textTransform: 'uppercase', color: '#000', letterSpacing: '0.05em', borderBottom: '1px solid #e2e8f0', paddingBottom: '3px', marginBottom: '5px' }}>
              Vendor / Supplier
            </p>
            <p style={{ fontWeight: 700, fontSize: '11px', margin: '0 0 3px', color: '#000' }}>{data.vendor_name || '—'}</p>
            {data.vendor_contact_person && <p style={{ margin: '0 0 3px', color: '#000', fontWeight: 600 }}>Kind Attn: {data.vendor_contact_person}</p>}
            {data.vendor_address && <p style={{ color: '#000', whiteSpace: 'pre-line', margin: '0 0 3px' }}>{data.vendor_address}</p>}
            {data.vendor_phone && <p style={{ margin: '2px 0 0', color: '#000', fontWeight: 600 }}>Mobile: {data.vendor_phone}</p>}
            {data.vendor_email && <p style={{ margin: '2px 0 0', color: '#000', fontWeight: 600 }}>Email: {data.vendor_email}</p>}
            <p style={{ margin: '4px 0 0', fontWeight: 700, color: '#000' }}>
              GSTIN: <span style={{ fontFamily: 'inherit' }}>{data.vendor_gstin || data.vendor_gst || '—'}</span>
            </p>
            {data.vendor_pan && <p style={{ margin: '2px 0 0', fontWeight: 700, color: '#000' }}>PAN: <span style={{ fontFamily: 'inherit' }}>{data.vendor_pan}</span></p>}
          </div>

          {/* PO Summary */}
          <div style={{ fontSize: '10px' }}>
            {[
              ['PO Number',       data.serial_no_formatted || data.po_number || '—'],
              ['PO Date',         data.po_date ? dayjs(data.po_date).format('DD MMM YYYY') : '—'],
              ['Expected Delivery', data.delivery_date ? dayjs(data.delivery_date).format('DD MMM YYYY') : 'As Per Terms'],
              ['Project',         data.project_name || '—'],
              ['PO Req. No.',     data.po_req_no || '—'],
              ['PO Req. Date',    data.po_req_date ? dayjs(data.po_req_date).format('DD MMM YYYY') : '—'],
              ['Approval No.',    data.approval_no || '—'],
              ['Cost Head',       data.cost_head || '—'],
            ].map(([label, value]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dotted #cbd5e1', padding: '3px 0', gap: '8px' }}>
                <span style={{ fontWeight: 700, color: '#000', textTransform: 'uppercase', fontSize: '8px', letterSpacing: '0.04em', flexShrink: 0 }}>{label}</span>
                <span style={{ fontWeight: 600, color: '#0f172a', textAlign: 'right' }}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Delivery Address + Order Intro (stacked) */}
        <div style={{ marginBottom: '10px', fontSize: '9px' }}>
          <p style={{ fontWeight: 700, textDecoration: 'underline', marginBottom: '3px' }}>DELIVERY ADDRESS:</p>
          <p style={{ color: '#000', whiteSpace: 'pre-line', marginBottom: '6px' }}>{data.delivery_address || (isLanco ? LANCO_DELIVERY_ADDRESS : data.project_name) || '—'}</p>
          <p style={{ color: '#000', fontStyle: 'italic' }}>
            {data.order_intro || 'We hereby place an order on you for supply of the following materials / services as per the terms and conditions below.'}
          </p>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* ITEMS TABLE                                                         */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <table className="po-items-table" style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '10px', fontSize: '9px' }}>
          <thead>
            <tr style={{ background: '#1e293b', color: '#fff' }}>
              <th style={{ border: '1px solid #000', padding: '5px 4px', width: '22px', textAlign: 'center' }}>SL</th>
              <th style={{ border: '1px solid #000', padding: '5px 4px', textAlign: 'left' }}>Material Description</th>
              <th style={{ border: '1px solid #000', padding: '5px 4px', width: '40px', textAlign: 'center' }}>Unit</th>
              <th style={{ border: '1px solid #000', padding: '5px 4px', width: '44px', textAlign: 'center' }}>Qty</th>
              <th style={{ border: '1px solid #000', padding: '5px 4px', width: '80px', textAlign: 'right' }}>{isTaxIncl ? 'Rate (Incl.GST)' : 'Rate (Rs)'}</th>
              <th style={{ border: '1px solid #000', padding: '5px 4px', width: '40px', textAlign: 'center' }}>GST%</th>
              <th style={{ border: '1px solid #000', padding: '5px 4px', width: '90px', textAlign: 'right' }}>Basic Value</th>
              <th style={{ border: '1px solid #000', padding: '5px 4px', width: '56px', textAlign: 'center' }}>Req. Date</th>
            </tr>
          </thead>
          <tbody>
            {items.length > 0 ? items.map((it, i) => {
              const qty    = parseFloat(it.quantity || 0);
              const rate   = parseFloat(it.rate || 0);
              const basic  = qty * rate;
              const rowBg  = i % 2 === 0 ? '#fff' : '#f8fafc';
              return (
                <tr key={it.id || i} style={{ background: rowBg, borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center', fontWeight: 600 }}>{i + 1}</td>
                  <td style={{ border: '1px solid #000', padding: '4px' }}>
                    <p style={{ fontWeight: 700, margin: '0 0 1px', color: '#000' }}>{it.material_name}</p>
                    {it.mix_design && <p style={{ color: '#000', fontSize: '8px', margin: '0 0 1px' }}>{it.mix_design}</p>}
                    {it.purpose && <p style={{ color: '#000', fontSize: '8px', margin: '1px 0 0', fontStyle: 'italic' }}>{it.purpose}</p>}
                  </td>
                  <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center', textTransform: 'uppercase' }}>{it.unit || '—'}</td>
                  <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center', fontWeight: 700 }}>{qty.toLocaleString('en-IN')}</td>
                  <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'right', fontFamily: 'inherit' }}>{f2(rate)}</td>
                  <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center' }}>{isTaxIncl ? 'Incl.' : `${parseFloat(it.gst_rate || 0)}%`}</td>
                  <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'right', fontWeight: 700, fontFamily: 'inherit' }}>{f2(basic)}</td>
                  <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center', fontSize: '8px' }}>
                    {it.req_date ? dayjs(it.req_date).format('DD.MM.YY') : '—'}
                  </td>
                </tr>
              );
            }) : (
              /* Empty placeholder rows */
              [...Array(6)].map((_, i) => (
                <tr key={i} style={{ height: '24px' }}>
                  {[...Array(8)].map((__, j) => (
                    <td key={j} style={{ border: '1px solid #94a3b8', padding: '4px' }}>&nbsp;</td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* FOOTER: TOTALS + TERMS + APPROVAL — kept together, no page break  */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <div className="po-footer-block">
        <div className="po-totals-block" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px', gap: '16px', pageBreakInside: 'avoid', breakInside: 'avoid' }}>
          {/* Amount in Words */}
          <div style={{ flex: 1, border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', background: '#f8fafc' }}>
            <p style={{ fontSize: '8px', fontWeight: 700, textTransform: 'uppercase', color: '#000', letterSpacing: '0.05em', marginBottom: '4px' }}>Amount in Words</p>
            <p style={{ fontWeight: 700, fontStyle: 'italic', color: '#0f172a', fontSize: '10px', lineHeight: '1.5' }}>
              {amountInWords(grandTotal)}
            </p>
          </div>

          {/* Totals table */}
          <div style={{ minWidth: '300px', fontSize: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid #e2e8f0', gap: '10px' }}>
              <span style={{ fontWeight: 700, color: '#000', textTransform: 'uppercase', fontSize: '9px' }}>Sub Total</span>
              <span style={{ fontWeight: 700, fontFamily: 'inherit', whiteSpace: 'nowrap' }}>₹ {f2(subTotal)}</span>
            </div>
            {isTaxIncl ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid #e2e8f0', gap: '10px' }}>
                <span style={{ fontWeight: 700, color: '#000', textTransform: 'uppercase', fontSize: '9px' }}>Total GST</span>
                <span style={{ fontWeight: 700, fontFamily: 'inherit', whiteSpace: 'nowrap' }}>Inclusive</span>
              </div>
            ) : (
              <>
                {gstRates.map(r => (
                  <div key={r} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid #e2e8f0', gap: '10px' }}>
                    <span style={{ fontWeight: 700, color: '#000', fontSize: '8.5px', lineHeight: '1.35' }}>
                      GST @ {r}% {gstRates.length > 1 ? `on item no. ${formatItemNos(gstByRate[r].nums)}` : ''}
                    </span>
                    <span style={{ fontWeight: 700, fontFamily: 'inherit', whiteSpace: 'nowrap' }}>₹ {f2(gstByRate[r].amount)}</span>
                  </div>
                ))}
                {gstRates.length !== 1 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid #e2e8f0', gap: '10px' }}>
                    <span style={{ fontWeight: 700, color: '#000', textTransform: 'uppercase', fontSize: '9px' }}>Total GST</span>
                    <span style={{ fontWeight: 700, fontFamily: 'inherit', whiteSpace: 'nowrap' }}>₹ {f2(totalGst)}</span>
                  </div>
                )}
              </>
            )}
            {tcsAmt > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid #e2e8f0' }}>
                <span style={{ fontWeight: 700, color: '#000', textTransform: 'uppercase', fontSize: '9px' }}>TCS / Other Tax</span>
                <span style={{ fontWeight: 700, fontFamily: 'inherit' }}>₹ {f2(tcsAmt)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 8px', background: '#1e293b', color: '#fff', borderRadius: '4px', marginTop: '4px' }}>
              <span style={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '10px' }}>Grand Total</span>
              <span style={{ fontWeight: 800, fontFamily: 'inherit', fontSize: '12px' }}>₹ {f2(grandTotal)}</span>
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* TERMS & CONDITIONS                                                 */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <div className="po-terms-block" style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', marginBottom: '10px', fontSize: '8.5px' }}>
          <p style={{ fontWeight: 700, textTransform: 'uppercase', color: '#0f172a', letterSpacing: '0.05em', marginBottom: '5px', borderBottom: '1px solid #e2e8f0', paddingBottom: '3px' }}>
            Terms &amp; Conditions
          </p>
          {termsLines.length > 0 ? (
            <div style={{ color: '#000', lineHeight: '1.6' }}>
              {termsLines.map((line, idx) => <p key={idx} style={{ margin: '1px 0' }}>{line}</p>)}
            </div>
          ) : (
            <ol style={{ paddingLeft: '14px', color: '#000', lineHeight: '1.6', margin: 0 }}>
              <li>{isTaxIncl ? 'Rates are inclusive of GST. No separate GST will be charged.' : 'Rates are basic rates. GST as applicable is shown separately.'}</li>
              <li>Material should exactly match specifications. Deviations must be approved in writing.</li>
              <li>Tax Invoice must reach Accounts within 2 working days of delivery with GRN copy.</li>
              <li>BCIM Engineering Pvt. Ltd. reserves the right to reject sub-standard material.</li>
              <li>Payment as per agreed credit terms. Short-supply to be notified immediately.</li>
              <li>All bills and DCs must reference this PO number.</li>
            </ol>
          )}
        </div>

        </div>{/* /po-footer-block */}

            </td></tr>
          </tbody>
        </table>

      </div>
    </div>
  );
});

POPrintTemplate.displayName = 'POPrintTemplate';
export default POPrintTemplate;
