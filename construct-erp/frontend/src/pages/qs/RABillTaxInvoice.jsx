import React, { forwardRef } from 'react';
import dayjs from 'dayjs';

const fmt  = v => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt0 = v => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 0,  maximumFractionDigits: 0  });

function amountInWords(amount) {
  const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine',
    'Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen',
    'Seventeen','Eighteen','Nineteen'];
  const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  const scales = ['','Thousand','Lakh','Crore'];

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

  // Indian system: crore / lakh / thousand / rest
  const crore   = Math.floor(n / 10000000);
  const lakh    = Math.floor((n % 10000000) / 100000);
  const thousand= Math.floor((n % 100000) / 1000);
  const rest    = n % 1000;

  const parts = [];
  if (crore)    parts.push(threeDigit(crore)    + ' Crore');
  if (lakh)     parts.push(threeDigit(lakh)     + ' Lakh');
  if (thousand) parts.push(threeDigit(thousand) + ' Thousand');
  if (rest)     parts.push(threeDigit(rest));
  return parts.join(' ') + ' Only';
}

const RABillTaxInvoice = forwardRef(({ data: b, invoiceNo, invoiceDate }, ref) => {
  if (!b) return null;

  const taxable = parseFloat(b.gross_amount || 0) + parseFloat(b.price_escalation || 0);
  const gstRate = parseFloat(b.gst_rate || 18);
  const gst     = taxable * gstRate / 100;
  const cgst    = gst / 2;
  const sgst    = gst / 2;
  const total   = taxable + gst;

  const s = {
    page: {
      fontFamily: 'Times New Roman, serif',
      fontSize: '12pt',
      color: '#000',
      background: '#fff',
      padding: '10mm 12mm',
      width: '210mm',
      minHeight: '297mm',
      boxSizing: 'border-box',
    },
    title: {
      textAlign: 'center', fontWeight: 'bold', fontSize: '16pt',
      border: '2px solid #000', padding: '4px', marginBottom: 0,
    },
    th: {
      border: '1px solid #000', padding: '4px 6px',
      fontWeight: 'bold', textAlign: 'center', fontSize: '11pt',
    },
    td: {
      border: '1px solid #000', padding: '4px 6px', fontSize: '11pt',
    },
    label: { fontWeight: 'bold', fontSize: '11pt' },
    val:   { fontSize: '11pt' },
  };

  return (
    <div ref={ref} style={s.page}>
      {/* Title */}
      <div style={s.title}>TAX INVOICE</div>

      {/* Supplier header */}
      <table style={{ width: '100%', borderCollapse: 'collapse', border: '2px solid #000' }}>
        <tbody>
          <tr>
            <td colSpan={2} style={{ ...s.td, textAlign: 'center', fontWeight: 'bold', fontSize: '14pt', borderBottom: 'none' }}>
              BCIM ENGINEERING PRIVATE LIMITED
            </td>
          </tr>
          <tr>
            <td colSpan={2} style={{ ...s.td, textAlign: 'center', fontSize: '11pt', borderTop: 'none', borderBottom: 'none' }}>
              # 11, B Wing, Divyasree Chambers, "O" Shaugnessy Road, Bangalore – 560 025, INDIA
            </td>
          </tr>
          <tr>
            <td style={{ ...s.td, textAlign: 'center', fontSize: '10pt', borderTop: 'none', borderBottom: 'none', width: '50%' }}>
              E-Mail: bcim@bcim.in
            </td>
            <td style={{ ...s.td, textAlign: 'center', fontSize: '10pt', borderTop: 'none', borderBottom: 'none' }}>
              Telephone No: 080-22244455
            </td>
          </tr>
          {/* GSTIN / Invoice No / Date row */}
          <tr>
            <td style={{ ...s.td, borderTop: '2px solid #000' }}>
              <span style={s.label}>GSTIN: </span>29AAHCB6485A1ZL
            </td>
            <td style={{ ...s.td, borderTop: '2px solid #000' }}>
              <span style={s.label}>Work Order: </span>{b.project_code || 'WDIRY0151'} Dt. 14.10.2025
            </td>
          </tr>
          <tr>
            <td style={s.td}>
              <span style={s.label}>Invoice No: </span>{invoiceNo || '—'}
            </td>
            <td style={s.td}>
              <span style={s.label}>Place of Supply: </span>Yelahanka, Bangalore
            </td>
          </tr>
          <tr>
            <td style={s.td}>
              <span style={s.label}>Date of Invoice: </span>
              {invoiceDate ? dayjs(invoiceDate).format('DD.MM.YYYY') : dayjs().format('DD.MM.YYYY')}
            </td>
            <td style={s.td}>
              <span style={s.label}>Bill Reference: </span>{b.bill_number}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Billed to / Consignee */}
      <table style={{ width: '100%', borderCollapse: 'collapse', border: '2px solid #000', borderTop: 'none' }}>
        <tbody>
          <tr>
            <td style={{ ...s.td, fontWeight: 'bold', width: '50%', borderTop: '2px solid #000' }}>
              Details of Receiver (Billed to)
            </td>
            <td style={{ ...s.td, fontWeight: 'bold', borderTop: '2px solid #000' }}>
              Details of Consignee (Shipped to)
            </td>
          </tr>
          <tr>
            <td style={s.td}>
              <div><span style={s.label}>Name: </span>Divyasree Infrastructure Projects Pvt Ltd</div>
              <div><span style={s.label}>Address: </span>#28, Venkatanarayana Road, T. Nagar, Chennai – 600 017</div>
              <div><span style={s.label}>GSTIN: </span>29AADCD3654M1Z9</div>
            </td>
            <td style={s.td}>
              <div><span style={s.label}>Name: </span>Residential Apartments - Yelahanka</div>
              <div><span style={s.label}>Address: </span>Yelahanka, Bangalore</div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Line items table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', border: '2px solid #000', borderTop: 'none', marginTop: 0 }}>
        <thead>
          <tr>
            <th style={{ ...s.th, width: '4%' }}>S.No</th>
            <th style={{ ...s.th, width: '36%' }}>Description of Goods / Services</th>
            <th style={{ ...s.th, width: '8%' }}>HSN Code</th>
            <th style={{ ...s.th, width: '6%' }}>Qty</th>
            <th style={{ ...s.th, width: '8%' }}>Rate</th>
            <th style={{ ...s.th, width: '10%' }}>Total</th>
            <th style={{ ...s.th, width: '8%' }}>Discount</th>
            <th style={{ ...s.th, width: '10%' }}>Taxable Value</th>
            <th style={{ ...s.th, width: '5%' }}>CGST {gstRate/2}%</th>
            <th style={{ ...s.th, width: '5%' }}>SGST {gstRate/2}%</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ ...s.td, textAlign: 'center' }}>1</td>
            <td style={s.td}>
              CIVIL WORKS — {b.work_description || 'Retaining Wall & STP Works'}
              <div style={{ fontSize: '10pt', color: '#333' }}>
                {b.bill_number} | Period: {b.bill_period_from ? dayjs(b.bill_period_from).format('DD.MM.YYYY') : ''} to {b.bill_period_to ? dayjs(b.bill_period_to).format('DD.MM.YYYY') : ''}
              </div>
            </td>
            <td style={{ ...s.td, textAlign: 'center' }}>995411</td>
            <td style={{ ...s.td, textAlign: 'center' }}>1</td>
            <td style={{ ...s.td, textAlign: 'right' }}>{fmt0(taxable)}</td>
            <td style={{ ...s.td, textAlign: 'right' }}>{fmt0(taxable)}</td>
            <td style={{ ...s.td, textAlign: 'center' }}>—</td>
            <td style={{ ...s.td, textAlign: 'right' }}>{fmt0(taxable)}</td>
            <td style={{ ...s.td, textAlign: 'right' }}>{fmt(cgst)}</td>
            <td style={{ ...s.td, textAlign: 'right' }}>{fmt(sgst)}</td>
          </tr>
          {/* blank filler rows */}
          {[...Array(4)].map((_, i) => (
            <tr key={i}>
              <td style={{ ...s.td, height: '22px' }}>&nbsp;</td>
              <td style={s.td}></td><td style={s.td}></td><td style={s.td}></td>
              <td style={s.td}></td><td style={s.td}></td><td style={s.td}></td>
              <td style={s.td}></td><td style={s.td}></td><td style={s.td}></td>
            </tr>
          ))}
          {/* Totals row */}
          <tr style={{ fontWeight: 'bold', borderTop: '2px solid #000' }}>
            <td colSpan={7} style={{ ...s.td, textAlign: 'right', borderTop: '2px solid #000' }}>Total</td>
            <td style={{ ...s.td, textAlign: 'right', borderTop: '2px solid #000' }}>{fmt0(taxable)}</td>
            <td style={{ ...s.td, textAlign: 'right', borderTop: '2px solid #000' }}>{fmt(cgst)}</td>
            <td style={{ ...s.td, textAlign: 'right', borderTop: '2px solid #000' }}>{fmt(sgst)}</td>
          </tr>
        </tbody>
      </table>

      {/* Summary box */}
      <table style={{ width: '100%', borderCollapse: 'collapse', border: '2px solid #000', borderTop: 'none' }}>
        <tbody>
          <tr>
            <td rowSpan={3} style={{ ...s.td, width: '60%', fontWeight: 'bold', verticalAlign: 'top', fontSize: '11pt', borderTop: '2px solid #000' }}>
              Invoice Total (In Words):<br />
              <span style={{ fontWeight: 'normal' }}>Rupees {amountInWords(Math.round(total))}</span>
            </td>
            <td style={{ ...s.td, borderTop: '2px solid #000' }}>Taxable Value</td>
            <td style={{ ...s.td, textAlign: 'right', fontWeight: 'bold', borderTop: '2px solid #000' }}>₹ {fmt0(taxable)}</td>
          </tr>
          <tr>
            <td style={s.td}>Tax Value (GST {gstRate}%)</td>
            <td style={{ ...s.td, textAlign: 'right', fontWeight: 'bold' }}>₹ {fmt0(gst)}</td>
          </tr>
          <tr>
            <td style={{ ...s.td, fontWeight: 'bold' }}>Total Invoice Value</td>
            <td style={{ ...s.td, textAlign: 'right', fontWeight: 'bold', fontSize: '13pt' }}>₹ {fmt0(total)}</td>
          </tr>
        </tbody>
      </table>

      {/* Footer */}
      <table style={{ width: '100%', borderCollapse: 'collapse', border: '2px solid #000', borderTop: 'none', marginTop: 0 }}>
        <tbody>
          <tr>
            <td style={{ ...s.td, width: '60%', fontSize: '10pt' }}>
              <strong>Declaration:</strong> We declare that this invoice shows the actual price of the goods/services described
              and that all particulars are true and correct.
            </td>
            <td style={{ ...s.td, textAlign: 'center', fontWeight: 'bold' }}>
              For BCIM ENGINEERING PVT LTD
            </td>
          </tr>
          <tr>
            <td style={{ ...s.td, height: '50px' }}></td>
            <td style={{ ...s.td, textAlign: 'center', verticalAlign: 'bottom', fontWeight: 'bold' }}>
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
