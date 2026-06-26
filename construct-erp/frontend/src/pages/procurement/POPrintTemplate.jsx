// src/pages/procurement/POPrintTemplate.jsx
// Layout matches the official BCIM-PUR-F-03 Purchase Order format.
// Header (doc code) repeats on every printed page via <thead>; the signature
// row + registered-office footer repeat on every page via <tfoot>.
import React from 'react';
import dayjs from 'dayjs';
import { LANCO_DELIVERY_ADDRESS } from '../../constants/poAddresses';

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
// Rate — always two decimals (e.g. 31,500.00)
const f2 = v => parseFloat(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Amount / totals — Indian grouping, no decimals (e.g. 2,48,089)
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

const DOC_CODE = 'BCIM-PUR-F-03';

const POPrintTemplate = React.forwardRef(({ data, company = {} }, ref) => {
  if (!data) return (
    <div ref={ref} className="p-10 text-center font-bold text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">
      Preparing Purchase Order…
    </div>
  );

  const items     = data.items || [];
  const isTaxIncl = Boolean(data.gst_inclusive);

  // ── Amendment detection — a "-A{n}" suffix means this is a revised PO ────────
  const poRefStr     = String(data.po_ref_no || data.serial_no_formatted || data.po_number || '');
  const amendMatch   = poRefStr.match(/-A(\d+)$/i);
  const isAmendment  = !!amendMatch;
  const amendmentNo  = amendMatch ? amendMatch[1] : null;
  const originalPoRef = isAmendment ? poRefStr.replace(/-A\d+$/i, '') : '';

  // ── Company header (left block) — live company settings, BCIM fallback ──────
  // LANCO Hills (LH-10) purchase orders bill from BCIM's Hyderabad address instead
  // of the default Bangalore office — keeps PO and WO addresses in sync. Detection
  // is tolerant of project_code/name variants (LH-10, LH10, LANCO, LANCHO).
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

  // ── Vendor full address ─────────────────────────────────────────────────────
  const vendorCityStatePin = [
    data.vendor_city,
    [data.vendor_state, data.vendor_pincode].filter(Boolean).join(' – '),
  ].filter(Boolean).join(', ');
  const vendorFullAddr = [data.vendor_address, vendorCityStatePin].filter(Boolean).join(', ');

  const deliveryAddr = isLanco
    ? LANCO_DELIVERY_ADDRESS
    : (data.delivery_address
        || [data.project_location, data.project_city, data.project_state].filter(Boolean).join(', ')
        || '—');

  // Split terms; strip any leading "1 ", "1. ", "1) " etc. because the <ol> below
  // adds its own numbering (otherwise we get "1. 1 All Bills…").
  const termsLines = String(data.terms_conditions || '')
    .split(/\r?\n/)
    .map(l => l.trim().replace(/^\d+[.)]?\s+/, ''))
    .filter(Boolean);

  // ── Totals ──────────────────────────────────────────────────────────────────
  const subTotal   = parseFloat(data.sub_total || items.reduce((s, it) => s + parseFloat(it.quantity||0) * parseFloat(it.rate||0), 0));
  const totalGst   = isTaxIncl ? 0 : parseFloat(data.total_gst || items.reduce((s, it) => s + parseFloat(it.gst_amount||0), 0));
  const tcsAmt     = parseFloat(data.tcs_amount || 0);
  const grandTotal = parseFloat(data.grand_total || (subTotal + totalGst + tcsAmt));

  // GST break-up by rate, tracking which item numbers fall under each rate.
  const gstByRate = {};
  if (!isTaxIncl) {
    items.forEach((it, idx) => {
      const r = parseFloat(it.gst_rate || 0);
      const stored = parseFloat(it.gst_amount || 0);
      const amt = stored > 0 ? stored : (parseFloat(it.quantity||0) * parseFloat(it.rate||0) * r / 100);
      if (!gstByRate[r]) gstByRate[r] = { amount: 0, nums: [] };
      gstByRate[r].amount += amt;
      gstByRate[r].nums.push(idx + 1);
    });
  }
  const gstRates = Object.keys(gstByRate).map(Number).filter(r => r > 0).sort((a, b) => a - b);

  const TD = { border: '1px solid #000', padding: '3px 5px', verticalAlign: 'top' };
  const TH = { border: '1px solid #000', padding: '4px 5px', fontWeight: 700, background: '#f0f0f0', textAlign: 'center' };

  // ── Signature row + registered-office footer — repeats on EVERY page ────────
  const sigCell = (label, sigUrl) => (
    <td style={{ width: '33.33%', textAlign: 'center', verticalAlign: 'bottom', padding: '2px 6px' }}>
      <div style={{ height: '34px', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
        {sigUrl ? <img src={sigUrl} alt="" style={{ maxHeight: '32px', maxWidth: '100%' }} /> : null}
      </div>
      <div style={{ fontWeight: 700, fontSize: '10px', borderTop: '1px solid #000', paddingTop: '2px', marginTop: '2px' }}>{label}</div>
    </td>
  );

  return (
    <div ref={ref} className="po-print-wrapper" style={{ fontFamily: "'Times New Roman', Times, serif", color: '#000' }}>
      <table className="po-doc" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>

        {/* ── Repeating page header: doc code ────────────────────────────────────
            Top space lives HERE (not in body padding) so it repeats identically
            on every page — body padding-top only applies to page 1. */}
        <thead className="po-doc-head" style={{ display: 'table-header-group' }}>
          <tr>
            <td style={{ padding: '14mm 0 4px', border: 'none' }}>
              <div style={{ textAlign: 'right', fontWeight: 700, fontSize: '11px' }}>{DOC_CODE}</div>
            </td>
          </tr>
        </thead>

        {/* ── Footer SPACER: reserves the signature band on EVERY page so flowing
            content never hides behind the position:fixed .po-sig-footer below.
            Height here must match .po-sig-footer's height in the print CSS. */}
        <tfoot className="po-doc-foot-spacer" style={{ display: 'table-footer-group' }}>
          <tr><td style={{ border: 'none', padding: 0, height: '36mm' }} /></tr>
        </tfoot>

        {/* ── Flowing body ───────────────────────────────────────────────────── */}
        <tbody>
          <tr><td style={{ border: 'none', padding: 0 }}>

            {/* TITLE + LOGO */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <img src="/bcim-logo.png" alt="BCIM" style={{ height: '40px', objectFit: 'contain' }} />
              <div style={{ flex: 1, textAlign: 'center' }}>
                <h1 style={{ fontSize: '17px', fontWeight: 700, letterSpacing: '0.5px', margin: 0 }}>
                  {isAmendment ? 'AMENDMENT PURCHASE ORDER' : 'PURCHASE ORDER'}
                </h1>
              </div>
              <div style={{ width: '40px' }} />
            </div>

            {/* COMPANY + PO META */}
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
                          ['Project:',    data.project_name || '—', true],
                          ['PO No:',      data.serial_no_formatted || data.po_number || '—', true],
                          ...(isAmendment ? [['Original PO:', originalPoRef]] : []),
                          ['Date:',       data.po_date ? dayjs(data.po_date).format('DD-MM-YYYY') : '—'],
                          ['PO Req No:',  data.po_req_no || '—'],
                          ['PO Req Date:', data.po_req_date ? dayjs(data.po_req_date).format('DD-MM-YYYY') : '—'],
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

            {/* TO + DELIVERY ADDRESS */}
            <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #000', marginBottom: '6px' }}>
              <tbody>
                <tr>
                  <td style={{ width: '50%', borderRight: '1px solid #000', padding: '5px 6px', verticalAlign: 'top' }}>
                    <div>To,</div>
                    <div style={{ fontWeight: 700 }}>M/s. {data.vendor_name || '—'}</div>
                    <div style={{ whiteSpace: 'pre-line', lineHeight: 1.4 }}>{vendorFullAddr || '—'}</div>
                    {data.vendor_email && <div>Email: {data.vendor_email}</div>}
                    {(data.vendor_contact_person || data.vendor_phone) && (
                      <div>Contact person: {[data.vendor_contact_person, data.vendor_phone].filter(Boolean).join(' - ')}</div>
                    )}
                    <div style={{ fontWeight: 700 }}>GST: {data.vendor_gstin || data.vendor_gst || '—'}</div>
                  </td>
                  <td style={{ padding: '5px 6px', verticalAlign: 'top' }}>
                    <div style={{ fontWeight: 700, textDecoration: 'underline' }}>DELIVERY ADDRESS:-</div>
                    {!isLanco && <div style={{ fontWeight: 700 }}>{data.project_name || ''}</div>}
                    <div style={{ whiteSpace: 'pre-line', lineHeight: 1.4 }}>{deliveryAddr}</div>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* INTRO LINE */}
            <div style={{ marginBottom: '6px' }}>
              {data.order_intro || (isAmendment
                ? `This is an amendment to Purchase Order ${originalPoRef}. The following revised details supersede the original order; all other terms and conditions remain unchanged.`
                : 'We hereby place an order on you for supply of the following materials with same terms and conditions as per original order.')}
            </div>

            {/* ITEMS TABLE */}
            <table className="po-items-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ display: 'table-header-group' }}>
                <tr>
                  <th style={{ ...TH, width: '34px' }}>Sl No</th>
                  <th style={{ ...TH, textAlign: 'left' }}>Description</th>
                  <th style={{ ...TH, width: '46px' }}>UOM</th>
                  <th style={{ ...TH, width: '60px' }}>Quantity</th>
                  <th style={{ ...TH, width: '74px' }}>Rate</th>
                  <th style={{ ...TH, width: '84px' }}>Amount</th>
                  <th style={{ ...TH, width: '64px' }}>Req Date</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => {
                  const qty   = parseFloat(it.quantity || 0);
                  const rate  = parseFloat(it.rate || 0);
                  const basic = qty * rate;
                  return (
                    <tr key={it.id || i} style={{ pageBreakInside: 'avoid' }}>
                      <td style={{ ...TD, textAlign: 'center' }}>{i + 1}</td>
                      <td style={TD}>
                        <div style={{ whiteSpace: 'pre-line', fontWeight: 600 }}>{it.material_name}</div>
                        {it.mix_design && <div>{it.mix_design}</div>}
                        {it.purpose && <div style={{ fontStyle: 'italic' }}>{it.purpose}</div>}
                      </td>
                      <td style={{ ...TD, textAlign: 'center' }}>{it.unit || '—'}</td>
                      <td style={{ ...TD, textAlign: 'center' }}>{qty.toLocaleString('en-IN')}</td>
                      <td style={{ ...TD, textAlign: 'right' }}>{isTaxIncl ? f2(rate) + ' (Incl.)' : f2(rate)}</td>
                      <td style={{ ...TD, textAlign: 'right' }}>{inr0(basic)}</td>
                      <td style={{ ...TD, textAlign: 'center' }}>{it.req_date ? dayjs(it.req_date).format('DD-MM-YYYY') : ''}</td>
                    </tr>
                  );
                })}

                {/* TOTALS — Sub Total / GST / Grand Total as a clean summary block, no inner grid lines */}
                <tr style={{ pageBreakInside: 'avoid' }}>
                  <td style={{ ...TD, border: 'none' }} colSpan={4} rowSpan={2 + gstRates.length + (isTaxIncl ? 1 : 0)} />
                  <td style={{ ...TD, borderTop: '1px solid #000', borderLeft: 'none', borderRight: 'none', borderBottom: 'none', fontWeight: 700, padding: '4px 5px' }} colSpan={2}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Sub Total</span><span>{inr0(subTotal)}</span>
                    </div>
                  </td>
                  <td style={{ ...TD, border: 'none' }} />
                </tr>
                {isTaxIncl ? (
                  <tr style={{ pageBreakInside: 'avoid' }}>
                    <td style={{ border: 'none', padding: '2px 5px' }} colSpan={2}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>GST</span><span>Inclusive</span>
                      </div>
                    </td>
                    <td style={{ border: 'none' }} />
                  </tr>
                ) : gstRates.map(r => (
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
            {(data.notes || data.narration) && (
              <div style={{ marginTop: '8px' }}>
                <span style={{ fontWeight: 700, textDecoration: 'underline' }}>Narration:</span> {data.notes || data.narration}
              </div>
            )}

            {/* TERMS & CONDITIONS */}
            <div className="po-terms-block" style={{ marginTop: '12px' }}>
              <div style={{ fontWeight: 700, textDecoration: 'underline', marginBottom: '4px' }}>Terms &amp; Conditions:</div>
              <ol style={{ paddingLeft: '18px', margin: 0, lineHeight: 1.5 }}>
                {termsLines.length > 0 ? termsLines.map((line, idx) => (
                  <li key={idx} style={{ pageBreakInside: 'avoid' }}>{line}</li>
                )) : (
                  <>
                    <li>All Bills and DCs should contain the Reference of the Concerned PO.</li>
                    <li>All materials supplied will be subject to inspections &amp; test when received at our site.</li>
                    <li>Final Bill shall be cleared after Certification by the Concerned Engg &amp; on actual measurements taken at Site.</li>
                    <li>If any Goods damaged or rejected must be replaced immediately at the suppliers own expenses.</li>
                  </>
                )}
              </ol>
            </div>

          </td></tr>
        </tbody>
      </table>

      {/* po-sig-footer: position:fixed in print CSS pins this to the bottom of every page */}
      <div className="po-sig-footer">
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            <tr>
              {sigCell('Checked by', data.created_by_sig)}
              {sigCell('Director', data.released_mgmt_sig)}
              {sigCell('Managing Director', data.authorized_md_sig)}
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

POPrintTemplate.displayName = 'POPrintTemplate';
export default POPrintTemplate;
