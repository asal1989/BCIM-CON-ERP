import React, { forwardRef } from 'react';
import dayjs from 'dayjs';

const LOGO = 'data:image/png;base64,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';

const fmt  = v => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt0 = v => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 0,  maximumFractionDigits: 0  });

function amountInWords(amount) {
  const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine',
    'Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  if (amount === 0) return 'Zero';
  const n = Math.round(amount);
  function twoDigit(num) {
    if (num < 20) return ones[num];
    return tens[Math.floor(num / 10)] + (num % 10 ? ' ' + ones[num % 10] : '');
  }
  function threeDigit(num) {
    if (num === 0) return '';
    const h = Math.floor(num / 100);
    const r = num % 100;
    return (h ? ones[h] + ' Hundred' : '') + (h && r ? ' ' : '') + (r ? twoDigit(r) : '');
  }
  const crore    = Math.floor(n / 10000000);
  const lakh     = Math.floor((n % 10000000) / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const rest     = n % 1000;
  const parts = [];
  if (crore)    parts.push(threeDigit(crore)    + ' Crore');
  if (lakh)     parts.push(threeDigit(lakh)     + ' Lakh');
  if (thousand) parts.push(threeDigit(thousand) + ' Thousand');
  if (rest)     parts.push(threeDigit(rest));
  return parts.join(' ');
}

const B = '1px solid #000';
const B2 = '2px solid #000';

const cell = (extra = {}) => ({
  border: B, padding: '3px 6px', fontSize: '10.5pt',
  fontFamily: 'Times New Roman, serif', verticalAlign: 'middle',
  wordBreak: 'break-word', overflowWrap: 'anywhere', ...extra,
});
const hcell = (extra = {}) => ({
  ...cell(), fontWeight: 'bold', textAlign: 'center', ...extra,
});
// numeric/amount cells must never wrap mid-number
const numCell = (extra = {}) => cell({
  whiteSpace: 'nowrap', wordBreak: 'normal', overflowWrap: 'normal', textAlign: 'right', ...extra,
});

const RABillTaxInvoice = forwardRef(({ data: b, invoiceNo, invoiceDate }, ref) => {
  if (!b) return null;

  const taxable = parseFloat(b.gross_amount || 0) + parseFloat(b.price_escalation || 0);
  const gstRate = parseFloat(b.gst_rate || 18);
  const cgst    = taxable * (gstRate / 2) / 100;
  const sgst    = taxable * (gstRate / 2) / 100;
  const total   = taxable + cgst + sgst;

  const page = {
    fontFamily: 'Times New Roman, serif',
    fontSize: '10.5pt',
    color: '#000',
    background: '#fff',
    padding: '8mm 10mm',
    width: '210mm',
    minHeight: '297mm',
    boxSizing: 'border-box',
  };

  return (
    <div ref={ref} style={page}>

      {/* ── TITLE ── */}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          <tr>
            <td style={{ border: B2, textAlign: 'center', fontWeight: 'bold', fontSize: '14pt', padding: '5px' }}>
              TAX INVOICE
            </td>
          </tr>
        </tbody>
      </table>

      {/* ── COMPANY HEADER: Logo left | Details right ── */}
      <table style={{ width: '100%', borderCollapse: 'collapse', borderLeft: B2, borderRight: B2, borderBottom: B2 }}>
        <tbody>
          <tr>
            {/* Logo — rowSpan 5 */}
            <td rowSpan={5} style={{ ...cell(), width: '18%', textAlign: 'center', verticalAlign: 'middle', borderLeft: 'none', borderTop: 'none', padding: '6px' }}>
              <img src={LOGO} alt="BCIM Logo" style={{ width: '90px', display: 'block', margin: '0 auto' }} />
            </td>
            <td style={{ ...cell(), textAlign: 'center', fontWeight: 'bold', fontSize: '13pt', borderTop: 'none', borderRight: 'none' }}>
              BCIM ENGINEERING PRIVATE LIMITED
            </td>
          </tr>
          <tr>
            <td style={{ ...cell(), textAlign: 'center', fontSize: '10pt', borderRight: 'none' }}>
              Address: # 11, B Wing, Divyasree Chambers
            </td>
          </tr>
          <tr>
            <td style={{ ...cell(), textAlign: 'center', fontSize: '10pt', borderRight: 'none' }}>
              "O" Shaugnessy Road, Bangalore – 560 025, INDIA
            </td>
          </tr>
          <tr>
            <td style={{ ...cell(), textAlign: 'center', fontSize: '10pt', borderRight: 'none' }}>
              E-Mail: bcim@bcim.in
            </td>
          </tr>
          <tr>
            <td style={{ ...cell(), textAlign: 'center', fontSize: '10pt', borderRight: 'none' }}>
              Telephone No: 080-22244455
            </td>
          </tr>
        </tbody>
      </table>

      {/* ── META ROWS: GSTIN / Invoice / Date ── */}
      <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', borderLeft: B2, borderRight: B2, borderBottom: B }}>
        <colgroup>
          <col style={{ width: '50%' }} />
          <col style={{ width: '50%' }} />
        </colgroup>
        <tbody>
          <tr>
            <td colSpan={2} style={{ ...cell(), fontWeight: 'bold' }}>
              GSTIN: 29AAHCB6485A1ZL
            </td>
          </tr>
          <tr>
            <td style={{ ...cell(), fontWeight: 'bold' }}>
              Serial no. of Invoice: <span style={{ fontWeight: 'normal' }}>{invoiceNo || '—'}</span>
            </td>
            <td style={{ ...cell(), fontWeight: 'bold' }}>
              Work order: {b.project_code || 'WDIRY0151'} Dt. 14.10.2025
            </td>
          </tr>
          <tr>
            <td style={{ ...cell(), fontWeight: 'bold' }}>
              Date of Invoice: <span style={{ fontWeight: 'normal' }}>{invoiceDate ? new Date(invoiceDate).toLocaleDateString('en-GB').replace(/\//g, '.') : '—'}</span>
            </td>
            <td style={{ ...cell(), fontWeight: 'bold' }}>
              Place of Supply: <span style={{ fontWeight: 'normal' }}>Yelahanka, Bangalore</span>
            </td>
          </tr>
        </tbody>
      </table>

      {/* ── BILLED TO / CONSIGNEE ── */}
      <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', borderLeft: B2, borderRight: B2, borderBottom: B }}>
        <colgroup>
          <col style={{ width: '50%' }} />
          <col style={{ width: '50%' }} />
        </colgroup>
        <tbody>
          <tr>
            <td style={{ ...hcell() }}>Details of Receiver (Billed to)</td>
            <td style={{ ...hcell() }}>Details of Consignee (Shipped to)</td>
          </tr>
          <tr>
            <td style={{ ...cell(), verticalAlign: 'top' }}>
              <div><strong>Name:</strong> Divyasree Infrastructure Projects Pvt Ltd</div>
              <div><strong>Address:</strong> #28, Venkatanarayana Road, T. Nagar, Chennai – 600 017</div>
              <div><strong>GSTIN:</strong> 29AADCD3654M1Z9</div>
            </td>
            <td style={{ ...cell(), verticalAlign: 'top' }}>
              <div><strong>Name:</strong> Residential Apartments – Yelahanka</div>
              <div><strong>Address:</strong> YNT63, Survey No. 5/3 &amp; 6/1, Mandalakunte Village, Chikkabommasandra Yelahanka Hobli, Near Mother Dairy, Bangalore 560025</div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* ── LINE ITEMS TABLE ── */}
      <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', borderLeft: B2, borderRight: B2, borderBottom: B }}>
        <thead>
          <tr>
            <th style={{ ...hcell(), width: '4%' }} rowSpan={2}>S.No</th>
            <th style={{ ...hcell(), width: '22%' }} rowSpan={2}>Description of Goods / Services</th>
            <th style={{ ...hcell(), width: '7%' }} rowSpan={2}>HSN Code</th>
            <th style={{ ...hcell(), width: '4%' }} rowSpan={2}>Qty</th>
            <th style={{ ...hcell(), width: '6%' }} rowSpan={2}>Rate</th>
            <th style={{ ...hcell(), width: '11%' }} rowSpan={2}>Total</th>
            <th style={{ ...hcell(), width: '6%' }} rowSpan={2}>Discount</th>
            <th style={{ ...hcell(), width: '12%' }} rowSpan={2}>Taxable Value</th>
            <th style={{ ...hcell(), width: '28%' }} colSpan={2}>GST</th>
          </tr>
          <tr>
            <th style={{ ...hcell(), width: '14%' }}>CGST<br />{gstRate / 2}%</th>
            <th style={{ ...hcell(), width: '14%' }}>SGST<br />{gstRate / 2}%</th>
          </tr>
        </thead>
        <tbody>
          {/* Main line item */}
          <tr>
            <td style={{ ...cell(), textAlign: 'center' }}>1</td>
            <td style={{ ...cell() }}>
              CIVIL WORKS OF RESIDENTIAL BUILDINGS
              <div style={{ fontSize: '9pt', color: '#222', marginTop: '2px' }}>
                {b.bill_number}{b.bill_period_from ? ` | Period: ${new Date(b.bill_period_from).toLocaleDateString('en-GB').replace(/\//g,'.')} to ${new Date(b.bill_period_to).toLocaleDateString('en-GB').replace(/\//g,'.')}` : ''}
              </div>
            </td>
            <td style={{ ...cell(), textAlign: 'center' }}>995411</td>
            <td style={{ ...cell(), textAlign: 'center' }}>—</td>
            <td style={{ ...cell(), textAlign: 'center' }}>—</td>
            <td style={{ ...numCell() }}>{fmt0(taxable)}</td>
            <td style={{ ...cell(), textAlign: 'center' }}>—</td>
            <td style={{ ...numCell() }}>{fmt0(taxable)}</td>
            <td style={{ ...numCell() }}>{fmt(cgst)}</td>
            <td style={{ ...numCell() }}>{fmt(sgst)}</td>
          </tr>
          {/* Blank filler rows */}
          {[...Array(5)].map((_, i) => (
            <tr key={i}>
              {[...Array(10)].map((_, j) => (
                <td key={j} style={{ ...cell(), height: '20px' }}>&nbsp;</td>
              ))}
            </tr>
          ))}
          {/* Totals row */}
          <tr>
            <td colSpan={7} style={{ ...hcell(), textAlign: 'right', borderTop: B2 }}>Total</td>
            <td style={{ ...hcell(), ...numCell(), borderTop: B2 }}>{fmt0(taxable)}</td>
            <td style={{ ...hcell(), ...numCell(), borderTop: B2 }}>{fmt(cgst)}</td>
            <td style={{ ...hcell(), ...numCell(), borderTop: B2 }}>{fmt(sgst)}</td>
          </tr>
        </tbody>
      </table>

      {/* ── SUMMARY BOX ── */}
      <table style={{ width: '100%', borderCollapse: 'collapse', borderLeft: B2, borderRight: B2, borderBottom: B }}>
        <tbody>
          <tr>
            <td rowSpan={3} style={{ ...cell(), width: '55%', verticalAlign: 'top', fontWeight: 'bold' }}>
              Invoice Total (In Words):<br />
              <span style={{ fontWeight: 'normal' }}>
                Rupees {amountInWords(Math.round(total))} Only
              </span>
            </td>
            <td style={{ ...cell(), fontWeight: 'bold' }}>Taxable Value</td>
            <td style={{ ...numCell(), fontWeight: 'bold' }}>₹ {fmt0(taxable)}</td>
          </tr>
          <tr>
            <td style={{ ...cell() }}>Tax Value (GST {gstRate}%)</td>
            <td style={{ ...numCell(), fontWeight: 'bold' }}>₹ {fmt0(cgst + sgst)}</td>
          </tr>
          <tr>
            <td style={{ ...cell(), fontWeight: 'bold' }}>Total Invoice Value</td>
            <td style={{ ...numCell(), fontWeight: 'bold', fontSize: '12pt' }}>₹ {fmt0(total)}</td>
          </tr>
        </tbody>
      </table>

      {/* ── FOOTER ── */}
      <table style={{ width: '100%', borderCollapse: 'collapse', borderLeft: B2, borderRight: B2, borderBottom: B2 }}>
        <tbody>
          <tr>
            <td style={{ ...cell(), width: '60%', fontSize: '9.5pt', verticalAlign: 'top' }}>
              <strong>Declaration:</strong> We declare that this invoice shows the actual price of the goods / services
              described and that all particulars are true and correct.
            </td>
            <td style={{ ...cell(), textAlign: 'center', fontWeight: 'bold' }}>
              For BCIM ENGINEERING PVT LTD
            </td>
          </tr>
          <tr>
            <td style={{ ...cell(), height: '55px' }}></td>
            <td style={{ ...cell(), textAlign: 'center', verticalAlign: 'bottom', fontWeight: 'bold', paddingBottom: '6px' }}>
              Authorised Signatory
            </td>
          </tr>
        </tbody>
      </table>

    </div>
  );
});

RABillTaxInvoice.displayName = 'RABillTaxInvoice';
export default RABillTaxInvoice;
