// src/pages/procurement/WOPrintTemplate.jsx
// Layout mirrors POPrintTemplate.jsx exactly (same fonts, borders, totals
// block, signature footer) so PO and WO documents look like one consistent
// document family. WO-specific content (deduction %, approval status) is
// kept but restyled into the same bordered/Times-New-Roman look.
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
const f2   = v => parseFloat(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inr0 = v => Math.round(parseFloat(v || 0)).toLocaleString('en-IN', { maximumFractionDigits: 0 });

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

const WOPrintTemplate = React.forwardRef(({ data, company = {} }, ref) => {
  if (!data) return (
    <div ref={ref} className="p-10 text-center font-bold text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">
      Preparing Work Order…
    </div>
  );

  const items   = data.items || [];
  const isAmend = /-A\d+$/.test(data.wo_number || '');

  // ── Company header (left block) — live company settings, BCIM fallback ──────
  // LANCO Hills (LH-10) work orders bill from BCIM's Hyderabad address instead
  // of the default Bangalore office — keeps PO and WO addresses in sync.
  const projStr = `${data.project_code || ''} ${data.project_name || ''}`.toLowerCase().replace(/[\s-]/g, '');
  const isLanco = projStr.includes('lanco') || projStr.includes('lancho') || projStr.includes('lh10');
  const BCIM = isLanco ? {
    name: 'BCIM ENGINEERING PRIVATE LIMITED',
    address: 'TOWER VIEW APARTMENT, NO 403, 4th FLOOR,\nPLOT NO 26 & 27, SRI LAKSHMI NAGAR COLONY',
    city: 'Hyderabad', state: 'Telangana, Rangareddy Dist', pincode: '500089',
    gstin: '36AAHCB6485A1ZQ',
  } : {
    name: 'BCIM ENGINEERING PRIVATE LIMITED',
    address: '#11, B Wing, Divyasree Chambers, O\'Shaughnessy Road',
    city: 'Bangalore', state: 'Karnataka', pincode: '560025',
    gstin: '29AAHCB6485A1ZL',
  };
  const coName  = (company.name && !company.name.toLowerCase().includes('pvt ltd') && company.name !== 'BCIM Engineering Pvt Ltd') ? company.name : BCIM.name;
  const coAddr  = (!isLanco && company.address && !company.address.toLowerCase().includes('bcim office') && !company.address.toLowerCase().includes('jayanagar')) ? company.address : BCIM.address;
  const coCity  = isLanco ? BCIM.city : (company.city    || BCIM.city);
  const coState = isLanco ? BCIM.state : (company.state   || BCIM.state);
  const coPin   = isLanco ? BCIM.pincode : (company.pincode || BCIM.pincode);
  const coGstin = isLanco ? BCIM.gstin : ((company.gstin  && !['29AABCB1234C1Z5','29AAXCB2929P1Z1'].includes(company.gstin)) ? company.gstin : BCIM.gstin);
  const coStatePin = [coState, coPin].filter(Boolean).join(' – ');

  const vendorFullAddr = data.vendor_address || '—';
  const siteAddress = data.delivery_address || data.project_name || '—';

  // Split terms; strip any leading "1 ", "1. ", "1) " etc. because the <ol> below
  // adds its own numbering (otherwise we get "1. 1 All work…").
  const termsLines = String(data.terms_conditions || '')
    .split(/\r?\n/)
    .map(l => l.trim().replace(/^\d+[.)]?\s+/, ''))
    .filter(Boolean);

  // ── Totals ──────────────────────────────────────────────────────────────────
  const subTotal = items.reduce((s, it) => s + parseFloat(it.quantity || 0) * parseFloat(it.rate || 0), 0)
    || parseFloat(data.total_value || data.contract_amount || 0);
  const gstPct = parseFloat(data.gst_pct ?? 18);

  // GST break-up by rate, tracking which item numbers fall under each rate.
  const gstByRate = {};
  items.forEach((it, idx) => {
    const qty = parseFloat(it.quantity || 0);
    const rate = parseFloat(it.rate || 0);
    const r = parseFloat(it.gst_rate ?? gstPct ?? 0);
    if (!gstByRate[r]) gstByRate[r] = { amount: 0, nums: [] };
    gstByRate[r].amount += qty * rate * r / 100;
    gstByRate[r].nums.push(idx + 1);
  });
  const gstRates = Object.keys(gstByRate).map(Number).filter(r => r > 0).sort((a, b) => a - b);
  const totalGst = Object.values(gstByRate).reduce((s, g) => s + g.amount, 0) || (subTotal * (gstPct / 100));
  const grandTotal = subTotal + totalGst;

  const TD = { border: '1px solid #000', padding: '3px 5px', verticalAlign: 'top' };
  const TH = { border: '1px solid #000', padding: '4px 5px', fontWeight: 700, background: '#f0f0f0', textAlign: 'center' };

  // ── Signature row + registered-office footer — repeats on EVERY page ────────
  // No signature images exist for WOs yet, so the cell shows the approval
  // status text where a PO would show a signature image.
  const sigCell = (label, statusText) => (
    <td style={{ width: '33.33%', textAlign: 'center', verticalAlign: 'bottom', padding: '2px 6px' }}>
      <div style={{ height: '34px', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
        <span style={{ fontStyle: 'italic', fontSize: '10px', color: '#444' }}>{statusText}</span>
      </div>
      <div style={{ fontWeight: 700, fontSize: '10px', borderTop: '1px solid #000', paddingTop: '2px', marginTop: '2px' }}>{label}</div>
    </td>
  );
  const directorApproved = ['submitted', 'approved'].includes(data.status);
  const mdApproved = data.status === 'approved';

  return (
    <div ref={ref} className="wo-print-wrapper" style={{ fontFamily: "'Times New Roman', Times, serif", color: '#000' }}>
      <table className="wo-doc" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>

        {/* ── Repeating page header: top spacing only (no doc code for WOs) ──── */}
        <thead className="wo-doc-head" style={{ display: 'table-header-group' }}>
          <tr><td style={{ padding: '14mm 0 4px', border: 'none' }} /></tr>
        </thead>

        {/* ── Footer SPACER: reserves the signature band on EVERY page so flowing
            content never hides behind the position:fixed .wo-sig-footer below.
            Height here must match .wo-sig-footer's height in the print CSS. */}
        <tfoot className="wo-doc-foot-spacer" style={{ display: 'table-footer-group' }}>
          <tr><td style={{ border: 'none', padding: 0, height: '44mm' }} /></tr>
        </tfoot>

        {/* ── Flowing body ───────────────────────────────────────────────────── */}
        <tbody>
          <tr><td style={{ border: 'none', padding: 0 }}>

            {/* TITLE + LOGO */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <img src="/bcim-logo.png" alt="BCIM" style={{ height: '40px', objectFit: 'contain' }} />
              <h1 style={{ fontSize: '17px', fontWeight: 700, letterSpacing: '0.5px', margin: 0, flex: 1, textAlign: 'center' }}>
                {isAmend ? 'AMENDMENT WORK ORDER' : 'WORK ORDER'}
              </h1>
              <div style={{ width: '40px' }} />
            </div>

            {/* COMPANY + WO META */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '6px' }}>
              <tbody>
                <tr>
                  <td style={{ width: '58%', verticalAlign: 'top', padding: 0 }}>
                    <div style={{ fontWeight: 700 }}>{coName}</div>
                    <div style={{ whiteSpace: 'pre-line', lineHeight: 1.4 }}>{coAddr}</div>
                    <div>{coCity}</div>
                    <div>{coStatePin}</div>
                    <div style={{ fontWeight: 700, marginTop: '2px' }}>GSTIN : {coGstin}</div>
                  </td>
                  <td style={{ verticalAlign: 'top', padding: 0 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <tbody>
                        {[
                          ['Project:',          data.project_name || '—', true],
                          ['WO No:',            data.wo_number || '—'],
                          ['Date:',             data.wo_date ? dayjs(data.wo_date).format('DD.MM.YYYY') : (data.created_at ? dayjs(data.created_at).format('DD.MM.YYYY') : '—')],
                          ['Start Date:',       data.start_date ? dayjs(data.start_date).format('DD.MM.YYYY') : '—'],
                          ['Completion Date:',  data.end_date ? dayjs(data.end_date).format('DD.MM.YYYY') : '—'],
                        ].map(([label, value, bold]) => (
                          <tr key={label}>
                            <td style={{ fontWeight: 700, padding: '1px 8px 1px 0', whiteSpace: 'nowrap', verticalAlign: 'top' }}>{label}</td>
                            <td style={{ padding: '1px 0', fontWeight: bold ? 700 : 400 }}>{value}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* TO + SITE / WORK ADDRESS */}
            <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #000', marginBottom: '6px' }}>
              <tbody>
                <tr>
                  <td style={{ width: '50%', borderRight: '1px solid #000', padding: '5px 6px', verticalAlign: 'top' }}>
                    <div>To,</div>
                    <div style={{ fontWeight: 700 }}>M/s. {data.vendor_name || '—'}</div>
                    <div style={{ whiteSpace: 'pre-line', lineHeight: 1.4 }}>{vendorFullAddr}</div>
                    {data.vendor_email && <div>Email: {data.vendor_email}</div>}
                    {(data.vendor_contact_person || data.vendor_phone) && (
                      <div>Contact person: {[data.vendor_contact_person, data.vendor_phone].filter(Boolean).join(' - ')}</div>
                    )}
                    <div style={{ fontWeight: 700 }}>GST: {data.vendor_gstin || '—'}</div>
                    {data.vendor_pan && <div style={{ fontWeight: 700 }}>PAN: {data.vendor_pan}</div>}
                  </td>
                  <td style={{ padding: '5px 6px', verticalAlign: 'top' }}>
                    <div style={{ fontWeight: 700, textDecoration: 'underline' }}>SITE / WORK ADDRESS:-</div>
                    {!isLanco && <div style={{ fontWeight: 700 }}>{data.project_name || ''}</div>}
                    <div style={{ whiteSpace: 'pre-line', lineHeight: 1.4 }}>{siteAddress}</div>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* INTRO / SCOPE LINE */}
            <div style={{ marginBottom: '6px' }}>
              {data.scope_of_work || data.work_description || data.subject
                || 'This Work Order is issued for execution of the work detailed below at the site address mentioned above, subject to the terms and conditions stated herein.'}
            </div>

            {/* ITEMS TABLE */}
            <table className="wo-items-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ display: 'table-header-group' }}>
                <tr>
                  <th style={{ ...TH, width: '34px' }}>Sl No</th>
                  <th style={{ ...TH, textAlign: 'left' }}>Description of Work / Item</th>
                  <th style={{ ...TH, width: '46px' }}>Unit</th>
                  <th style={{ ...TH, width: '60px' }}>Quantity</th>
                  <th style={{ ...TH, width: '74px' }}>Rate</th>
                  <th style={{ ...TH, width: '84px' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => {
                  const qty   = parseFloat(it.quantity || 0);
                  const rate  = parseFloat(it.rate || 0);
                  const basic = parseFloat(it.amount || (qty * rate));
                  return (
                    <tr key={it.id || i} style={{ pageBreakInside: 'avoid' }}>
                      <td style={{ ...TD, textAlign: 'center' }}>{i + 1}</td>
                      <td style={TD}>
                        <div style={{ whiteSpace: 'pre-line', fontWeight: 600 }}>{it.description || `Item ${i + 1}`}</div>
                        {it.remarks && <div style={{ fontStyle: 'italic' }}>{it.remarks}</div>}
                      </td>
                      <td style={{ ...TD, textAlign: 'center' }}>{it.unit || '—'}</td>
                      <td style={{ ...TD, textAlign: 'center' }}>{qty.toLocaleString('en-IN')}</td>
                      <td style={{ ...TD, textAlign: 'right' }}>{f2(rate)}</td>
                      <td style={{ ...TD, textAlign: 'right' }}>{inr0(basic)}</td>
                    </tr>
                  );
                })}

                {/* TOTALS — Sub Total / GST / Grand Total as a clean summary block, no inner grid lines */}
                <tr style={{ pageBreakInside: 'avoid' }}>
                  <td style={{ ...TD, border: 'none' }} colSpan={3} rowSpan={2 + gstRates.length} />
                  <td style={{ ...TD, borderTop: '1px solid #000', borderLeft: 'none', borderRight: 'none', borderBottom: 'none', fontWeight: 700, padding: '4px 5px' }} colSpan={2}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Sub Total</span><span>{inr0(subTotal)}</span>
                    </div>
                  </td>
                  <td style={{ ...TD, border: 'none' }} />
                </tr>
                {gstRates.map(r => (
                  <tr key={r} style={{ pageBreakInside: 'avoid' }}>
                    <td style={{ border: 'none', padding: '2px 5px', fontSize: '11px' }} colSpan={2}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>GST @ {r}%</span><span>{inr0(gstByRate[r].amount)}</span>
                      </div>
                      {gstRates.length > 1 && (
                        <div style={{ fontSize: '9px', color: '#555', marginTop: '1px' }}>
                          on item no. {formatItemNos(gstByRate[r].nums)}
                        </div>
                      )}
                    </td>
                    <td style={{ border: 'none' }} />
                  </tr>
                ))}
                <tr style={{ pageBreakInside: 'avoid' }}>
                  <td style={{ ...TD, borderLeft: 'none', borderRight: 'none', borderBottom: 'none', borderTop: '1.5px solid #000', background: '#f0f0f0', fontWeight: 700, fontSize: '13px', padding: '5px' }} colSpan={2}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Grand Total</span><span>{inr0(grandTotal)}</span>
                    </div>
                  </td>
                  <td style={{ ...TD, border: 'none' }} />
                </tr>
              </tbody>
            </table>

            {/* RUPEES IN WORDS */}
            <div style={{ borderTop: '1.5px solid #000', paddingTop: '4px', marginTop: '6px', fontWeight: 700, textDecoration: 'underline' }}>
              {amountInWords(grandTotal).replace(/^Rupees/, 'Rupees:')}
            </div>

            {/* NARRATION */}
            {data.notes && (
              <div style={{ marginTop: '8px' }}>
                <span style={{ fontWeight: 700, textDecoration: 'underline' }}>Narration:</span> {data.notes}
              </div>
            )}

            {/* DEDUCTION TERMS — same bordered-table look as the rest of the doc */}
            <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #000', marginTop: '10px' }}>
              <tbody>
                <tr>
                  {[
                    ['GST',              data.gst_pct ?? 18],
                    ['TDS',              data.tds_pct],
                    ['Retention',        data.retention_pct],
                    ['Advance Recovery', data.advance_recovery_pct],
                  ].map(([label, pct], idx) => (
                    <td key={label} style={{ ...TD, borderTop: 'none', borderLeft: idx === 0 ? 'none' : '1px solid #000', borderBottom: 'none', textAlign: 'center', width: '25%' }}>
                      <div style={{ fontWeight: 700, fontSize: '10px' }}>{label}</div>
                      <div style={{ fontWeight: 700, fontSize: '12px' }}>
                        {pct !== null && pct !== undefined && pct !== '' ? `${parseFloat(pct)}%` : '—'}
                      </div>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>

            {/* TERMS & CONDITIONS */}
            <div className="wo-terms-block" style={{ marginTop: '12px' }}>
              <div style={{ fontWeight: 700, textDecoration: 'underline', marginBottom: '4px' }}>Terms &amp; Conditions:</div>
              <ol style={{ paddingLeft: '18px', margin: 0, lineHeight: 1.5 }}>
                {termsLines.length > 0 ? termsLines.map((line, idx) => (
                  <li key={idx} style={{ pageBreakInside: 'avoid' }}>{line}</li>
                )) : (
                  <>
                    <li>All work shall be carried out as per approved drawings and specifications.</li>
                    <li>Measurements of completed work shall be jointly recorded before billing.</li>
                    <li>Payment shall be released against certified RA bills, subject to deductions specified above.</li>
                    <li>Retention shall be released only after successful DLP completion.</li>
                    <li>All bills must reference this Work Order number.</li>
                  </>
                )}
              </ol>
            </div>

          </td></tr>
        </tbody>
      </table>

      {/* wo-sig-footer: position:fixed in print CSS pins this to the bottom of every page */}
      <div className="wo-sig-footer">
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            <tr>
              {sigCell('Prepared By', data.manager_name || 'Procurement')}
              {sigCell('Director', directorApproved ? 'Approved' : 'Pending')}
              {sigCell('Managing Director', mdApproved ? 'Authorized' : 'Pending')}
            </tr>
          </tbody>
        </table>
        <div style={{ textAlign: 'center', marginTop: '4px', lineHeight: 1.4 }}>
          <div style={{ fontWeight: 700, fontSize: '10px' }}>BCIM ENGINEERING PRIVATE LIMITED</div>
          <div style={{ fontSize: '9px' }}>&ldquo;B&rdquo; Wing, DivyaSree Chambers, No. 11, O&rsquo;Shaugnessy Road, Bangalore-560 025.</div>
        </div>
      </div>
    </div>
  );
});

WOPrintTemplate.displayName = 'WOPrintTemplate';
export default WOPrintTemplate;
