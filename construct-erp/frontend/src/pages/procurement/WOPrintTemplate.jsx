// src/pages/procurement/WOPrintTemplate.jsx
import React from 'react';
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

// ─── LANCO Hills (LH-10) project overrides ────────────────────────────────────
const LANCO_DELIVERY_ADDRESS = `LANCO HILLS - LH10
LANCO Hills Residential Apartments, Tower - LH10,
Survey nos 201, Manikonda, Rajendranagar Mandal,
HYDERABAD - 500089
Contact Person BCIM: Mr. Vijayan - 82700 94285`;

const WOPrintTemplate = React.forwardRef(({ data }, ref) => {
  if (!data) return (
    <div ref={ref} className="p-10 text-center font-bold text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">
      Preparing Work Order…
    </div>
  );

  const items      = data.items || [];
  const isLanco    = data.project_code === 'LH-10';
  const termsLines = String(data.terms_conditions || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  const itemsTotal    = items.reduce((s, it) => s + parseFloat(it.amount || (parseFloat(it.quantity || 0) * parseFloat(it.rate || 0))), 0);
  const contractValue = parseFloat(data.total_value || data.contract_amount || itemsTotal || 0);

  return (
    <div ref={ref} className="wo-print-wrapper">
      {/* wo-page: no fixed minHeight — content determines height, allows multi-page */}
      <div className="wo-page bg-white text-black font-sans"
        style={{ width: '210mm', padding: '12mm', boxSizing: 'border-box', fontSize: '10px', lineHeight: '1.4' }}>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* HEADER                                                              */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <div style={{ borderBottom: '2.5px solid #000', paddingBottom: '8px', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          {/* Left: Logo + Company */}
          <div>
            <img src="/bcim-logo.png" alt="BCIM" style={{ height: '48px', objectFit: 'contain', marginBottom: '6px', display: 'block' }} />
            <div style={{ fontSize: '9px', color: '#374151', lineHeight: '1.5' }}>
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

          {/* Right: WO Title + Number */}
          <div style={{ textAlign: 'right' }}>
            <h1 style={{ fontSize: '20px', fontWeight: 900, letterSpacing: '1px', color: '#000', margin: '0 0 4px' }}>WORK ORDER</h1>
            <div style={{ background: '#1e293b', color: '#fff', padding: '3px 10px', display: 'inline-block', fontWeight: 700, fontSize: '11px', borderRadius: '4px' }}>
              {data.wo_number || '—'}
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* INFO GRID: Vendor + WO Details                                     */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
          {/* Contractor / Vendor */}
          <div style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px' }}>
            <p style={{ fontSize: '8px', fontWeight: 700, textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.05em', borderBottom: '1px solid #e2e8f0', paddingBottom: '3px', marginBottom: '5px' }}>
              Contractor / Vendor
            </p>
            <p style={{ fontWeight: 700, fontSize: '11px', margin: '0 0 3px' }}>{data.vendor_name || '—'}</p>
            {data.vendor_address && <p style={{ color: '#475569', whiteSpace: 'pre-line', margin: '0 0 3px' }}>{data.vendor_address}</p>}
            <p style={{ margin: '4px 0 0', fontWeight: 600 }}>
              GSTIN: <span style={{ fontFamily: 'monospace' }}>{data.vendor_gstin || '—'}</span>
            </p>
            {data.vendor_pan && <p style={{ margin: '2px 0 0', fontWeight: 600 }}>PAN: <span style={{ fontFamily: 'monospace' }}>{data.vendor_pan}</span></p>}
          </div>

          {/* WO Summary */}
          <div style={{ fontSize: '10px' }}>
            {[
              ['WO Number',     data.wo_number || '—'],
              ['WO Date',       data.wo_date ? dayjs(data.wo_date).format('DD MMM YYYY') : (data.created_at ? dayjs(data.created_at).format('DD MMM YYYY') : '—')],
              ['Start Date',    data.start_date ? dayjs(data.start_date).format('DD MMM YYYY') : '—'],
              ['End Date',      data.end_date ? dayjs(data.end_date).format('DD MMM YYYY') : '—'],
              ['Project',       data.project_name || '—'],
              ['Cost Head',     data.cost_head || '—'],
              ['Work Category', data.work_category || '—'],
              ['Tower / Block', data.tower_block || '—'],
            ].map(([label, value]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dotted #cbd5e1', padding: '3px 0', gap: '8px' }}>
                <span style={{ fontWeight: 700, color: '#475569', textTransform: 'uppercase', fontSize: '8px', letterSpacing: '0.04em', flexShrink: 0 }}>{label}</span>
                <span style={{ fontWeight: 600, color: '#0f172a', textAlign: 'right' }}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Scope of Work */}
        <div style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', marginBottom: '10px', fontSize: '9px' }}>
          <p style={{ fontWeight: 700, textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.05em', marginBottom: '3px', fontSize: '8px' }}>Scope of Work</p>
          <p style={{ color: '#374151', whiteSpace: 'pre-line', margin: 0 }}>
            {data.scope_of_work || data.work_description || data.subject || '—'}
          </p>
        </div>

        {/* Site / Delivery Address */}
        {(data.delivery_address || isLanco) && (
          <div style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', marginBottom: '10px', fontSize: '9px' }}>
            <p style={{ fontWeight: 700, textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.05em', marginBottom: '3px', fontSize: '8px' }}>Site / Delivery Address</p>
            <p style={{ color: '#374151', whiteSpace: 'pre-line', margin: 0 }}>
              {data.delivery_address || LANCO_DELIVERY_ADDRESS}
            </p>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* ITEMS TABLE                                                         */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <table className="wo-items-table" style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '10px', fontSize: '9px' }}>
          <thead>
            <tr style={{ background: '#1e293b', color: '#fff' }}>
              <th style={{ border: '1px solid #000', padding: '5px 4px', width: '22px', textAlign: 'center' }}>SL</th>
              <th style={{ border: '1px solid #000', padding: '5px 4px', textAlign: 'left' }}>Description of Work / Item</th>
              <th style={{ border: '1px solid #000', padding: '5px 4px', width: '50px', textAlign: 'center' }}>Unit</th>
              <th style={{ border: '1px solid #000', padding: '5px 4px', width: '60px', textAlign: 'center' }}>Qty</th>
              <th style={{ border: '1px solid #000', padding: '5px 4px', width: '80px', textAlign: 'right' }}>Rate (Rs)</th>
              <th style={{ border: '1px solid #000', padding: '5px 4px', width: '90px', textAlign: 'right' }}>Amount (Rs)</th>
            </tr>
          </thead>
          <tbody>
            {items.length > 0 ? items.map((it, i) => {
              const qty    = parseFloat(it.quantity || 0);
              const rate   = parseFloat(it.rate || 0);
              const amount = parseFloat(it.amount || (qty * rate));
              const rowBg  = i % 2 === 0 ? '#fff' : '#f8fafc';
              return (
                <tr key={it.id || i} style={{ background: rowBg, borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center', fontWeight: 600 }}>{i + 1}</td>
                  <td style={{ border: '1px solid #000', padding: '4px' }}>
                    <p style={{ fontWeight: 700, margin: '0 0 1px', color: '#0f172a' }}>{it.description || `Item ${i + 1}`}</p>
                    {it.remarks && <p style={{ color: '#475569', fontSize: '8px', margin: 0, fontStyle: 'italic' }}>{it.remarks}</p>}
                  </td>
                  <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center', textTransform: 'uppercase' }}>{it.unit || '—'}</td>
                  <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center', fontWeight: 700 }}>{qty.toLocaleString('en-IN', { maximumFractionDigits: 3 })}</td>
                  <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'right', fontFamily: 'monospace' }}>{f2(rate)}</td>
                  <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'right', fontWeight: 700, fontFamily: 'monospace' }}>{f2(amount)}</td>
                </tr>
              );
            }) : (
              /* Empty placeholder rows */
              [...Array(6)].map((_, i) => (
                <tr key={i} style={{ height: '24px' }}>
                  {[...Array(6)].map((__, j) => (
                    <td key={j} style={{ border: '1px solid #94a3b8', padding: '4px' }}>&nbsp;</td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* TOTALS + AMOUNT IN WORDS                                           */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <div className="wo-totals-block" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px', gap: '16px' }}>
          {/* Amount in Words */}
          <div style={{ flex: 1, border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', background: '#f8fafc' }}>
            <p style={{ fontSize: '8px', fontWeight: 700, textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.05em', marginBottom: '4px' }}>Amount in Words</p>
            <p style={{ fontWeight: 700, fontStyle: 'italic', color: '#0f172a', fontSize: '10px', lineHeight: '1.5' }}>
              {amountInWords(contractValue)}
            </p>
          </div>

          {/* Totals table */}
          <div style={{ minWidth: '210px', fontSize: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid #e2e8f0' }}>
              <span style={{ fontWeight: 700, color: '#475569', textTransform: 'uppercase', fontSize: '9px' }}>Items Total</span>
              <span style={{ fontWeight: 700, fontFamily: 'monospace' }}>₹ {f2(itemsTotal)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 8px', background: '#1e293b', color: '#fff', borderRadius: '4px', marginTop: '4px' }}>
              <span style={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '10px' }}>Contract Value</span>
              <span style={{ fontWeight: 800, fontFamily: 'monospace', fontSize: '12px' }}>₹ {f2(contractValue)}</span>
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* FINANCIAL / DEDUCTION TERMS STRIP                                  */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '10px' }}>
          {[
            ['GST',              data.gst_pct],
            ['TDS',              data.tds_pct],
            ['Retention',        data.retention_pct],
            ['Advance Recovery', data.advance_recovery_pct],
          ].map(([label, pct]) => (
            <div key={label} style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '6px', textAlign: 'center' }}>
              <p style={{ fontWeight: 700, textTransform: 'uppercase', color: '#64748b', fontSize: '8px', letterSpacing: '0.04em', margin: '0 0 2px' }}>{label}</p>
              <p style={{ fontWeight: 800, color: '#0f172a', fontSize: '12px', margin: 0 }}>{pct !== null && pct !== undefined && pct !== '' ? `${parseFloat(pct)}%` : '—'}</p>
            </div>
          ))}
        </div>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* TERMS & CONDITIONS                                                 */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <div className="wo-terms-block" style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', marginBottom: '10px', fontSize: '8.5px' }}>
          <p style={{ fontWeight: 700, textTransform: 'uppercase', color: '#0f172a', letterSpacing: '0.05em', marginBottom: '5px', borderBottom: '1px solid #e2e8f0', paddingBottom: '3px' }}>
            Terms &amp; Conditions
          </p>
          {termsLines.length > 0 ? (
            <div style={{ color: '#374151', lineHeight: '1.6' }}>
              {termsLines.map((line, idx) => <p key={idx} style={{ margin: '1px 0' }}>{line}</p>)}
            </div>
          ) : (
            <p style={{ color: '#94a3b8', fontStyle: 'italic', margin: 0 }}>No additional terms specified.</p>
          )}
        </div>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* BANK DETAILS + DISCLAIMER                                          */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px', fontSize: '8px' }}>
          <div style={{ border: '1px solid #cbd5e1', borderRadius: '4px', padding: '6px' }}>
            <p style={{ fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: '4px' }}>Company Bank Details</p>
            <p style={{ margin: '1px 0' }}>Bank: HDFC Bank Ltd</p>
            <p style={{ margin: '1px 0' }}>A/C No: 502000482930219</p>
            <p style={{ margin: '1px 0' }}>IFSC: HDFC0000043 &nbsp;|&nbsp; Branch: Jayanagar, Bangalore</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: '#64748b', fontStyle: 'italic', padding: '6px' }}>
            This is a computer-generated Work Order and does not require a physical signature.
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* APPROVAL GRID — 4 COLUMNS                                         */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <div className="wo-approval-block" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', border: '1px solid #000', fontSize: '8px', height: '80px' }}>
          {[
            ['Prepared By',              data.manager_name || 'Procurement'],
            ['Checked By',               '—'],
            ['Approved By',              '—'],
            ['Accepted By (Contractor)', data.vendor_name || '—'],
          ].map(([label, name], idx, arr) => (
            <div key={label} style={{ borderRight: idx < arr.length - 1 ? '1px solid #000' : 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '4px', textAlign: 'center' }}>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
                <span style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: '7px' }}>&nbsp;</span>
              </div>
              <div style={{ borderTop: '1px solid #000', width: '100%', paddingTop: '3px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                {label}
              </div>
              <p style={{ margin: 0, fontSize: '7px' }}>{name}</p>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
});

WOPrintTemplate.displayName = 'WOPrintTemplate';
export default WOPrintTemplate;
