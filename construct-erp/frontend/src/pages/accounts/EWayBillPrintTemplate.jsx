// src/pages/accounts/EWayBillPrintTemplate.jsx
import React from 'react';
import dayjs from 'dayjs';
import { QRCodeSVG } from 'qrcode.react';

const getPublicAppOrigin = () => {
  const configured = import.meta.env?.VITE_PUBLIC_APP_URL || import.meta.env?.VITE_APP_URL || import.meta.env?.VITE_APP_ORIGIN;
  if (configured) return configured.replace(/\/$/, '');
  if (typeof window === 'undefined') return '';
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return 'http://bcim.ddns.net:3000';
  return window.location.origin;
};

const cell = (label, value, mono = false) => (
  <div style={{ marginBottom: 6 }}>
    <div style={{ fontSize: 9, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>{label}</div>
    <div style={{ fontSize: 11, color: '#111827', fontFamily: mono ? 'monospace' : 'inherit', wordBreak: 'break-all' }}>{value || '—'}</div>
  </div>
);

const inr = v => `₹${(Number(v) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const EWayBillPrintTemplate = React.forwardRef(function EWayBillPrintTemplate({ data }, ref) {
  if (!data) return <div ref={ref}>Preparing…</div>;

  const items = Array.isArray(data.items) ? data.items : (typeof data.items === 'string' ? JSON.parse(data.items || '[]') : []);

  return (
    <div ref={ref} style={{ width: '210mm', minHeight: '297mm', padding: '12mm', fontFamily: 'Arial, sans-serif', fontSize: 11, color: '#111827', backgroundColor: '#fff', boxSizing: 'border-box' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, paddingBottom: 10, borderBottom: '2px solid #111827' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#1e3a5f' }}>BCIM Engineering</div>
          <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>Construction &amp; Infrastructure</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#1e3a5f', letterSpacing: 1 }}>E-WAY BILL</div>
            <div style={{ fontSize: 10, color: '#374151', marginTop: 4 }}>
              <span style={{ fontWeight: 600 }}>EWB No: </span>
              <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{data.ewb_no}</span>
            </div>
            <div style={{ fontSize: 10, color: '#374151' }}>
              <span style={{ fontWeight: 600 }}>Date: </span>{dayjs(data.ewb_date).format('DD/MM/YYYY')}
            </div>
            <div style={{ fontSize: 10, color: '#dc2626', fontWeight: 600 }}>
              Valid Until: {dayjs(data.valid_until).format('DD/MM/YYYY')}
            </div>
          </div>
          <QRCodeSVG value={`${getPublicAppOrigin()}/verify/eway/${data.id}`} size={48} />
        </div>
      </div>

      {/* Transaction Details */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12, padding: '8px 10px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 4 }}>
        {cell('Transaction Type', data.transaction_type)}
        {cell('Sub-Type', data.sub_type)}
        {cell('Document Type', data.doc_type)}
        {cell('Document No', data.doc_no)}
        {cell('Document Date', data.doc_date ? dayjs(data.doc_date).format('DD/MM/YYYY') : null)}
        {cell('Project', data.project_name)}
      </div>

      {/* From / To */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
        <div style={{ border: '1px solid #bfdbfe', borderRadius: 4, padding: '8px 10px', backgroundColor: '#eff6ff' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#1d4ed8', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>From (Dispatch)</div>
          {cell('GSTIN', data.from_gstin, true)}
          {cell('Name', data.from_name)}
          {cell('Address', [data.from_address, data.from_city, data.from_state, data.from_pincode].filter(Boolean).join(', '))}
        </div>
        <div style={{ border: '1px solid #d1fae5', borderRadius: 4, padding: '8px 10px', backgroundColor: '#f0fdf4' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#065f46', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>To (Ship To)</div>
          {cell('GSTIN', data.to_gstin, true)}
          {cell('Name', data.to_name)}
          {cell('Address', [data.to_address, data.to_city, data.to_state, data.to_pincode].filter(Boolean).join(', '))}
        </div>
      </div>

      {/* Transport */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: 8, marginBottom: 14, padding: '8px 10px', backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: 4 }}>
        {cell('Transport Mode', data.transport_mode)}
        {cell('Vehicle No', data.vehicle_no, true)}
        {cell('Transporter', data.transporter_name)}
        {cell('Transporter GSTIN', data.transporter_gstin, true)}
        {cell('Distance (km)', data.distance_km)}
      </div>

      {/* Items Table */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Items</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
          <thead>
            <tr style={{ backgroundColor: '#1e3a5f', color: '#fff' }}>
              {['Sl','Description','HSN Code','Qty','Unit','Taxable Value','Tax Rate','IGST Amount'].map(h => (
                <th key={h} style={{ padding: '5px 6px', textAlign: h === 'Sl' ? 'center' : ['Qty','Taxable Value','Tax Rate','IGST Amount'].includes(h) ? 'right' : 'left', fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #e5e7eb', backgroundColor: i % 2 === 0 ? '#fff' : '#f9fafb' }}>
                <td style={{ padding: '5px 6px', textAlign: 'center' }}>{i + 1}</td>
                <td style={{ padding: '5px 6px' }}>{item.description}</td>
                <td style={{ padding: '5px 6px', fontFamily: 'monospace' }}>{item.hsn_code}</td>
                <td style={{ padding: '5px 6px', textAlign: 'right' }}>{item.quantity} {item.unit}</td>
                <td style={{ padding: '5px 6px', textAlign: 'right' }}>{item.unit}</td>
                <td style={{ padding: '5px 6px', textAlign: 'right' }}>{inr(item.taxable_value)}</td>
                <td style={{ padding: '5px 6px', textAlign: 'right' }}>{item.tax_rate}%</td>
                <td style={{ padding: '5px 6px', textAlign: 'right' }}>{inr(item.igst_amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ backgroundColor: '#1e3a5f', color: '#fff', fontWeight: 700 }}>
              <td colSpan={5} style={{ padding: '5px 6px', textAlign: 'right' }}>Total</td>
              <td style={{ padding: '5px 6px', textAlign: 'right' }}>{inr(data.total_taxable_value)}</td>
              <td></td>
              <td style={{ padding: '5px 6px', textAlign: 'right' }}>{inr(data.total_igst)}</td>
            </tr>
            <tr style={{ backgroundColor: '#f0fdf4', fontWeight: 700 }}>
              <td colSpan={7} style={{ padding: '5px 6px', textAlign: 'right', fontSize: 11 }}>Total Invoice Value (Taxable + IGST)</td>
              <td style={{ padding: '5px 6px', textAlign: 'right', fontSize: 12, color: '#065f46' }}>{inr(data.total_value)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Remarks */}
      {data.remarks && (
        <div style={{ marginBottom: 14, padding: '8px 10px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 4 }}>
          <div style={{ fontSize: 9, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }}>Remarks</div>
          <div style={{ fontSize: 10 }}>{data.remarks}</div>
        </div>
      )}

      {/* Footer */}
      <div style={{ marginTop: 'auto', paddingTop: 12, borderTop: '1px solid #d1d5db', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div style={{ fontSize: 9, color: '#9ca3af' }}>
          Generated from BCIM ERP · Not a substitute for the government-issued e-way bill
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ borderTop: '1px solid #374151', paddingTop: 4, fontSize: 10, color: '#374151' }}>Authorised Signatory</div>
        </div>
      </div>

      <style>{`@media print { body { margin: 0; } }`}</style>
    </div>
  );
});

export default EWayBillPrintTemplate;
