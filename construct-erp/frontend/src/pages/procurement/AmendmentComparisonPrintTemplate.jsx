// src/pages/procurement/AmendmentComparisonPrintTemplate.jsx
// "Previous vs Amended" line-item comparison table for a WO/PO amendment,
// matching the classic amendment-letter layout: a reference line, then a
// table with Qty/Rate/Amount columns for the previous order alongside the
// same columns for the new variation order. Shared by both Work Orders and
// Purchase Orders since the backend normalizes both into the same shape
// (see /work-orders/:id/amendment-comparison and
// /purchase-orders/:id/amendment-comparison).
import React from 'react';
import dayjs from 'dayjs';

const f2 = v => (v === null || v === undefined ? '' : parseFloat(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const q3 = v => (v === null || v === undefined ? '' : parseFloat(v).toLocaleString('en-IN', { maximumFractionDigits: 3 }));

const TD = { border: '1px solid #000', padding: '5px 6px', verticalAlign: 'top', fontSize: '11px' };
const TH = { border: '1px solid #000', padding: '5px 6px', fontWeight: 700, textAlign: 'center', fontSize: '11px' };

const AmendmentComparisonPrintTemplate = React.forwardRef(({ data, company = {} }, ref) => {
  if (!data) return (
    <div ref={ref} className="p-10 text-center font-bold text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">
      Preparing comparison…
    </div>
  );

  const docLabel = data.document_type === 'purchase_order' ? 'Purchase Order' : 'Work Order';
  const coName = company.name || 'BCIM ENGINEERING PRIVATE LIMITED';
  const items = data.items || [];

  const prevTotal = items.reduce((s, it) => s + (parseFloat(it.previous_amount) || 0), 0);
  const amendTotal = items.reduce((s, it) => s + (parseFloat(it.amended_amount) || 0), 0);

  return (
    <div ref={ref} style={{ fontFamily: "'Times New Roman', Times, serif", color: '#000', fontSize: '11px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <img src="/bcim-logo.png" alt="BCIM" style={{ height: '38px', objectFit: 'contain' }} />
        <h1 style={{ fontSize: '15px', fontWeight: 700, letterSpacing: '0.5px', margin: 0, flex: 1, textAlign: 'center' }}>
          AMENDMENT {docLabel.toUpperCase()} — COMPARISON
        </h1>
      </div>

      <div style={{ fontWeight: 700, marginBottom: '4px' }}>{coName}</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '10px' }}>
        <tbody>
          <tr>
            <td style={{ padding: 0, verticalAlign: 'top', width: '60%' }}>
              <div><b>To,</b> M/s. {(data.vendor_name || '—').toUpperCase()}</div>
              <div>Project: {(data.project_name || '—').toUpperCase()} {data.project_code ? `(${data.project_code})` : ''}</div>
            </td>
            <td style={{ padding: 0, verticalAlign: 'top' }}>
              <div><b>Previous {docLabel}:</b> {data.previous_ref}</div>
              <div><b>Amendment No.:</b> {data.amended_ref}</div>
              <div><b>Date:</b> {data.amendment_date ? dayjs(data.amendment_date).format('DD-MM-YYYY') : '—'}</div>
            </td>
          </tr>
        </tbody>
      </table>

      <div style={{ marginBottom: '10px' }}>
        Reference to the above and subsequent discussions had with you, we are pleased to place this amendment {docLabel.toLowerCase()}.
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th rowSpan={2} style={{ ...TH, width: '70px' }}>Code No</th>
            <th rowSpan={2} style={{ ...TH, textAlign: 'left' }}>Description</th>
            <th rowSpan={2} style={{ ...TH, width: '50px' }}>Unit</th>
            <th colSpan={3} style={TH}>Previous {docLabel}</th>
            <th colSpan={3} style={TH}>Variation Order {data.amended_ref}</th>
          </tr>
          <tr>
            <th style={{ ...TH, width: '60px' }}>Qty</th>
            <th style={{ ...TH, width: '70px' }}>Rate</th>
            <th style={{ ...TH, width: '80px' }}>Amount</th>
            <th style={{ ...TH, width: '60px' }}>Qty</th>
            <th style={{ ...TH, width: '70px' }}>Rate</th>
            <th style={{ ...TH, width: '80px' }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => {
            const changed = parseFloat(it.previous_qty) !== parseFloat(it.amended_qty)
              || parseFloat(it.previous_rate) !== parseFloat(it.amended_rate);
            return (
              <tr key={i} style={{ pageBreakInside: 'avoid' }}>
                <td style={{ ...TD, textAlign: 'center' }}>{it.item_code || '—'}</td>
                <td style={TD}>{it.description}</td>
                <td style={{ ...TD, textAlign: 'center' }}>{it.unit || '—'}</td>
                <td style={{ ...TD, textAlign: 'right' }}>{q3(it.previous_qty)}</td>
                <td style={{ ...TD, textAlign: 'right' }}>{f2(it.previous_rate)}</td>
                <td style={{ ...TD, textAlign: 'right' }}>{f2(it.previous_amount)}</td>
                <td style={{ ...TD, textAlign: 'right', fontWeight: changed ? 700 : 400, background: changed ? '#fff8e1' : 'transparent' }}>{q3(it.amended_qty)}</td>
                <td style={{ ...TD, textAlign: 'right', fontWeight: changed ? 700 : 400, background: changed ? '#fff8e1' : 'transparent' }}>{f2(it.amended_rate)}</td>
                <td style={{ ...TD, textAlign: 'right', fontWeight: changed ? 700 : 400, background: changed ? '#fff8e1' : 'transparent' }}>{f2(it.amended_amount)}</td>
              </tr>
            );
          })}
          <tr>
            <td style={{ ...TD, fontWeight: 700 }} colSpan={5}>Total</td>
            <td style={{ ...TD, fontWeight: 700, textAlign: 'right' }}>{f2(prevTotal)}</td>
            <td style={{ ...TD, fontWeight: 700 }} colSpan={2} />
            <td style={{ ...TD, fontWeight: 700, textAlign: 'right' }}>{f2(amendTotal)}</td>
          </tr>
          <tr>
            <td style={{ ...TD, fontWeight: 700, background: '#f0f0f0' }} colSpan={8}>Net Change</td>
            <td style={{ ...TD, fontWeight: 700, background: '#f0f0f0', textAlign: 'right' }}>
              {amendTotal - prevTotal >= 0 ? '+' : ''}{f2(amendTotal - prevTotal)}
            </td>
          </tr>
        </tbody>
      </table>

      <div style={{ marginTop: '16px', fontSize: '10px', color: '#444' }}>
        Highlighted cells indicate a change in quantity or rate from the previous order.
      </div>
    </div>
  );
});

AmendmentComparisonPrintTemplate.displayName = 'AmendmentComparisonPrintTemplate';
export default AmendmentComparisonPrintTemplate;
