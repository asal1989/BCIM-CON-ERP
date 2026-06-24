// src/pages/tqs/TQSAdvanceVoucherPrint.jsx
// Advance Payment Voucher — restyled to match the PO/WO print document family
// (Times New Roman, bordered tables, same signature footer) per
// WOPrintTemplate.jsx / POPrintTemplate.jsx, instead of the old standalone look.
import React, { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { tqsAdvanceAPI } from '../../api/client';

const nv   = (v) => parseFloat(v || 0);
const inr0 = (v) => Math.round(nv(v)).toLocaleString('en-IN', { maximumFractionDigits: 0 });
const fmtD = (d) => {
  if (!d) return '';
  try { return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
  catch { return ''; }
};

// ── Number to words (Indian numbering) ───────────────────────────────────────
const ONES = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten',
  'Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
const TENS = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
function numToWords(n) {
  n = Math.floor(n);
  if (n === 0) return 'Zero';
  if (n < 0)   return 'Minus ' + numToWords(-n);
  let words = '';
  if (n >= 10000000) { words += numToWords(Math.floor(n / 10000000)) + ' Crore ';    n %= 10000000; }
  if (n >= 100000)   { words += numToWords(Math.floor(n / 100000))   + ' Lakh ';     n %= 100000; }
  if (n >= 1000)     { words += numToWords(Math.floor(n / 1000))     + ' Thousand '; n %= 1000; }
  if (n >= 100)      { words += ONES[Math.floor(n / 100)]            + ' Hundred ';  n %= 100; }
  if (n >= 20)       { words += TENS[Math.floor(n / 10)]; if (n % 10) words += '-' + ONES[n % 10]; }
  else if (n > 0)    { words += ONES[n]; }
  return words.trim();
}
function amountInWords(amount) {
  if (!amount || isNaN(amount)) return 'Rupees Zero Only';
  return 'Rupees ' + numToWords(Math.floor(amount)) + ' Only';
}

const printStyles = `
  @media print {
    body * { visibility: hidden !important; }
    #av-wrap, #av-wrap * { visibility: visible !important; }
    #av-wrap {
      position: fixed !important; top: 0 !important; left: 0 !important;
      width: 210mm !important; min-height: 297mm !important;
      margin: 0 !important; padding: 12mm 14mm !important;
      box-sizing: border-box !important; background: white !important;
    }
    .no-print { display: none !important; }
    @page { size: A4 portrait; margin: 0; }
  }
  #av-wrap * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; background: #e5e7eb; }
`;

const TD = { border: '1px solid #000', padding: '4px 6px', verticalAlign: 'top' };
const TH = { border: '1px solid #000', padding: '4px 6px', fontWeight: 700, background: '#f0f0f0', textAlign: 'center' };

export default function TQSAdvanceVoucherPrint() {
  const { id } = useParams();

  const { data: voucher, isLoading } = useQuery({
    queryKey: ['tqs-advance-print', id],
    queryFn: () => tqsAdvanceAPI.get(id).then(r => r.data?.data ?? r.data),
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    const el = document.createElement('style');
    el.textContent = printStyles;
    document.head.appendChild(el);
    return () => document.head.removeChild(el);
  }, []);

  if (isLoading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <p style={{ color: '#94a3b8', fontSize: 13 }}>Loading...</p>
    </div>
  );
  if (!voucher) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <p style={{ color: '#ef4444', fontSize: 13 }}>Voucher not found</p>
    </div>
  );

  const orderValue      = nv(voucher.order_value);
  const variationValue  = nv(voucher.variation_value);
  const finalValue      = orderValue + variationValue;
  const advanceValue    = nv(voucher.advance_value);
  const grossCertified  = nv(voucher.gross_certified_till_date) || advanceValue;
  const mobDeduction    = nv(voucher.mobilisation_advance_deduction);
  const retDeduction    = nv(voucher.retention_deduction);
  const otherDeductions = nv(voucher.other_deductions);
  const paidAmount      = nv(voucher.previous_certificates) || nv(voucher.paid_amount);
  const balanceToFinish = nv(voucher.balance_to_finish);
  const outstanding     = nv(voucher.current_net_payment_due)
    || Math.max(advanceValue - paidAmount - mobDeduction - retDeduction - otherDeductions, 0);
  const advPct = voucher.advance_pct > 0
    ? `${parseFloat(voucher.advance_pct).toFixed(0)}%`
    : advanceValue > 0 && orderValue > 0 ? `${Math.round((advanceValue / orderValue) * 100)}%` : '—';

  const poWoNum  = voucher.wo_number || voucher.po_number || '—';
  const poWoDate = voucher.po_date;
  const certNo   = voucher.voucher_number || voucher.sl_number;

  const claimRows = [
    ['1',  'Original Contract Value (with Tax)',          orderValue],
    ['2',  'Net Change by Variation Orders',               variationValue],
    ['3',  'Final Contract Value to Date',                 finalValue || orderValue],
    ['4',  `Advance Certified (${advPct})`,                advanceValue],
    ['5',  'Gross Certified Till Date',                    grossCertified],
    ['6',  'Deduction of Mobilisation Advance',             mobDeduction],
    ['7',  'Deduction of Retention Amount',                 retDeduction],
    ['8',  'Any Other Deductions',                          otherDeductions],
    ['9',  'Total Net Certified Till Date',                 advanceValue - mobDeduction - retDeduction - otherDeductions],
    ['10', 'Less Previous Certificates for Payments',       paidAmount],
    ['11', 'Balance to Finish',                             balanceToFinish],
    ['12', 'Current Net Payment Due',                       outstanding, true],
  ];

  const termsLines = String(voucher.terms_conditions || '')
    .split(/\r?\n/)
    .map(l => l.trim().replace(/^\d+[.)]?\s+/, ''))
    .filter(Boolean);

  const sigCell = (label, name) => (
    <td style={{ width: '33.33%', textAlign: 'center', verticalAlign: 'bottom', padding: '2px 16px' }}>
      <div style={{ height: '34px' }} />
      <div style={{ borderTop: '1px solid #000', paddingTop: '4px', marginTop: '2px' }}>
        <div style={{ fontWeight: 700, fontSize: '11px' }}>{label}</div>
        <div style={{ fontStyle: 'italic', fontSize: '10px', marginTop: '2px' }}>({name})</div>
      </div>
    </td>
  );

  return (
    <>
      {/* ── Screen toolbar ── */}
      <div className="no-print" style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        background: '#1e293b', padding: '10px 24px', display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <button onClick={() => window.history.back()}
          style={{ background: 'transparent', border: '1px solid #475569', color: '#94a3b8', padding: '5px 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>
          ← Back
        </button>
        <span style={{ color: '#94a3b8', fontSize: 12 }}>
          Advance Voucher — {certNo} · {voucher.vendor_name}
        </span>
        <button onClick={() => window.print()}
          style={{ marginLeft: 'auto', background: '#2563eb', border: 'none', color: '#fff', padding: '6px 20px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
          🖨 Print / Save PDF
        </button>
      </div>
      <div style={{ paddingTop: 50 }} className="no-print" />

      {/* ── Print wrapper — Times New Roman / bordered, matches PO & WO ── */}
      <div id="av-wrap" style={{
        width: 794, minHeight: 1123, background: '#fff', margin: '0 auto',
        padding: '28px 36px', boxSizing: 'border-box', fontSize: '11px',
        color: '#000', fontFamily: "'Times New Roman', Times, serif",
      }}>

        {/* TITLE + LOGO */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <img src="/bcim-logo.png" alt="BCIM" style={{ height: '40px', objectFit: 'contain' }} />
          <h1 style={{ fontSize: '17px', fontWeight: 700, letterSpacing: '0.5px', margin: 0, flex: 1, textAlign: 'center' }}>
            PAYMENT CERTIFICATION
          </h1>
          <div style={{ width: '40px' }} />
        </div>

        {/* COMPANY + VOUCHER META */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '6px' }}>
          <tbody>
            <tr>
              <td style={{ width: '58%', verticalAlign: 'top', padding: 0 }}>
                <div style={{ fontWeight: 700 }}>BCIM ENGINEERING PRIVATE LIMITED</div>
                <div style={{ lineHeight: 1.4 }}>#11, B Wing, Divyasree Chambers, O'Shaughnessy Road</div>
                <div>Bangalore</div>
                <div>Karnataka – 560025</div>
                <div style={{ fontWeight: 700, marginTop: '2px' }}>GSTIN : 29AAHCB6485A1ZL</div>
              </td>
              <td style={{ verticalAlign: 'top', padding: 0 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    {[
                      ['Project:',                voucher.project_name || '—', true],
                      ['Payment Cert. No:',       certNo || '—'],
                      ['Certification Date:',     voucher.voucher_date ? fmtD(voucher.voucher_date) : '—'],
                      ['Purchase/Work Order No:', `${poWoNum}${poWoDate ? ` Dt. ${fmtD(poWoDate)}` : ''}`],
                      ['Order Value:',            orderValue > 0 ? `Rs. ${inr0(orderValue)}` : '—'],
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

        {/* VENDOR + PACKAGE */}
        <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #000', marginBottom: '8px' }}>
          <tbody>
            <tr>
              <td style={{ width: '50%', borderRight: '1px solid #000', padding: '5px 6px', verticalAlign: 'top' }}>
                <div>To,</div>
                <div style={{ fontWeight: 700 }}>M/s. {voucher.vendor_name || '—'}</div>
                <div style={{ fontWeight: 700 }}>RA Bill No: {voucher.ra_bill_no || 'Advance'}</div>
              </td>
              <td style={{ padding: '5px 6px', verticalAlign: 'top' }}>
                <div style={{ fontWeight: 700, textDecoration: 'underline' }}>PACKAGE / WORK DESCRIPTION:-</div>
                <div style={{ lineHeight: 1.4 }}>{voucher.work_desc || '—'}</div>
                {voucher.proforma_invoice_number && (
                  <div>Proforma Invoice: {voucher.proforma_invoice_number}{voucher.proforma_invoice_date ? ` Dt. ${fmtD(voucher.proforma_invoice_date)}` : ''}</div>
                )}
              </td>
            </tr>
          </tbody>
        </table>

        {/* CLAIM SUMMARY TABLE */}
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ display: 'table-header-group' }}>
            <tr>
              <th style={{ ...TH, width: '34px' }}>Sl No</th>
              <th style={{ ...TH, textAlign: 'left' }}>Particulars</th>
              <th style={{ ...TH, width: '110px' }}>Amount (Rs.)</th>
            </tr>
          </thead>
          <tbody>
            {claimRows.map(([num, label, value, bold]) => (
              <tr key={num} style={{ pageBreakInside: 'avoid' }}>
                <td style={{ ...TD, textAlign: 'center' }}>{num}</td>
                <td style={{ ...TD, fontWeight: bold ? 700 : 400 }}>{label}</td>
                <td style={{ ...TD, textAlign: 'right', fontWeight: bold ? 700 : 400, background: bold ? '#f0fdf4' : 'transparent' }}>
                  {value !== 0 || bold ? inr0(value) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* AMOUNT IN WORDS */}
        <div style={{ borderTop: '1.5px solid #000', paddingTop: '4px', marginTop: '6px', fontWeight: 700, textDecoration: 'underline' }}>
          {(voucher.amount_in_words || amountInWords(outstanding)).replace(/^Rupees:?/, 'Rupees:')}
        </div>

        {/* REMARKS */}
        <div style={{ marginTop: '10px' }}>
          <p style={{ fontWeight: 700, textDecoration: 'underline', marginBottom: '4px' }}>REMARKS:</p>
          <p style={{ lineHeight: 1.6, margin: 0 }}>
            1. Any statutory deductions required to be made apart from the above shall be made at Accounts Department.<br/>
            2. Payments made to be verified for correctness.<br/>
            3. All transactions in Indian Rupees.
          </p>
        </div>

        {voucher.remarks && (
          <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #000', marginTop: '8px' }}>
            <tbody>
              <tr>
                <td style={{ padding: '5px 6px' }}>
                  <div style={{ fontWeight: 700, marginBottom: '4px' }}>Specific Comments to Accounts Department:</div>
                  <div>{voucher.remarks}</div>
                </td>
              </tr>
            </tbody>
          </table>
        )}

        {voucher.note && (
          <div style={{ marginTop: '10px' }}>
            <p style={{ fontWeight: 700, textDecoration: 'underline', marginBottom: '2px' }}>NOTE</p>
            <p style={{ margin: 0 }}>{voucher.note}</p>
          </div>
        )}

        {/* TERMS & CONDITIONS */}
        <div style={{ marginTop: '12px' }}>
          <div style={{ fontWeight: 700, textDecoration: 'underline', marginBottom: '4px' }}>Terms &amp; Conditions:</div>
          <ol style={{ paddingLeft: '18px', margin: 0, lineHeight: 1.5 }}>
            {termsLines.length > 0 ? termsLines.map((line, idx) => (
              <li key={idx} style={{ pageBreakInside: 'avoid' }}>{line}</li>
            )) : (
              <>
                <li>Payment shall be released against certified RA bills, subject to applicable statutory deductions.</li>
                <li>This advance shall be recovered proportionately from future running account bills.</li>
                <li>All bills must reference this Payment Certification / Work Order number.</li>
                <li>Retention, if applicable, shall be released only after successful completion / DLP.</li>
              </>
            )}
          </ol>
        </div>

        {/* SIGNATURES */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '24px' }}>
          <tbody>
            <tr>
              {sigCell('Prepared For Payment', voucher.prepared_by_name || 'Mr. Praveen Parameshwar')}
              {sigCell('Director', voucher.director_name || 'Mr. S.Srinivas Raju')}
              {sigCell('Managing Director', voucher.md_name || 'Mr. Stephen A')}
            </tr>
          </tbody>
        </table>

        <div style={{ textAlign: 'center', marginTop: '10px', borderTop: '2px solid #000', paddingTop: '6px', lineHeight: 1.4 }}>
          <div style={{ fontWeight: 700, fontSize: '10px' }}>BCIM ENGINEERING PRIVATE LIMITED</div>
          <div style={{ fontSize: '9px' }}>&ldquo;B&rdquo; Wing, DivyaSree Chambers, No. 11, O&rsquo;Shaugnessy Road, Bangalore-560 025.</div>
        </div>

      </div>
    </>
  );
}
