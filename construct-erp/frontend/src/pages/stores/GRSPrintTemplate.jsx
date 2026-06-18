// src/pages/stores/GRSPrintTemplate.jsx
import React from 'react';
import dayjs from 'dayjs';

const GRSPrintTemplate = React.forwardRef(({ data }, ref) => {
  if (!data) {
    return (
      <div ref={ref} className="p-10 text-center font-bold text-slate-500 border-2 border-dashed border-slate-200 rounded-xl bg-white">
        Preparing Document…
      </div>
    );
  }

  const items       = data.items || [];
  const MIN_ROWS    = 8;
  const displayRows = Math.max(items.length, MIN_ROWS);

  const statusLabel = {
    pending:      'Pending',
    acknowledged: 'Acknowledged',
  }[data.status] || (data.status || '—');

  return (
    <div ref={ref}>
      <div
        className="bg-white text-black font-sans"
        style={{ width: '210mm', minHeight: '297mm', padding: '10mm', boxSizing: 'border-box', position: 'relative' }}
      >

        {/* ── HEADER ───────────────────────────────────────────── */}
        <table style={{ width: '100%', borderCollapse: 'collapse', border: '2px solid black' }}>
          <tbody>
            <tr>
              {/* Logo */}
              <td style={{ width: '22%', border: '2px solid black', padding: '8px', textAlign: 'center', verticalAlign: 'middle' }}>
                <img src="/bcim-logo.png" alt="BCIM" style={{ height: '44px', objectFit: 'contain' }} />
              </td>

              {/* Title block */}
              <td style={{ border: '2px solid black', padding: '6px', textAlign: 'center', verticalAlign: 'middle' }}>
                <div style={{ fontSize: '13px', fontWeight: 900, textDecoration: 'underline', letterSpacing: '0.05em' }}>
                  GOODS RECEIPT BY SECURITY (GRS)
                </div>
                <div style={{ fontSize: '9px', color: '#666', marginTop: '2px' }}>
                  BCIM Engineering Private Limited — Gate-Level Material Entry Log
                </div>
              </td>

              {/* GRS meta */}
              <td style={{ width: '28%', border: '2px solid black', padding: '6px', fontSize: '9px', verticalAlign: 'top' }}>
                <MetaRow label="GRS No."  value={data.grs_number} bold />
                <MetaRow label="Date"     value={data.date_time ? dayjs(data.date_time).format('DD/MM/YYYY') : '—'} />
                <MetaRow label="Status"   value={statusLabel} />
              </td>
            </tr>
          </tbody>
        </table>

        {/* ── INFO SECTION ─────────────────────────────────────── */}
        <table style={{ width: '100%', borderCollapse: 'collapse', borderLeft: '2px solid black', borderRight: '2px solid black', borderBottom: '2px solid black' }}>
          <tbody>
            <tr>
              {/* Left column */}
              <td style={{ width: '50%', borderRight: '2px solid black', padding: '6px', verticalAlign: 'top', fontSize: '9px' }}>
                <InfoRow label="Project"            value={data.project_name || '—'} />
                <InfoRow label="Vehicle No."        value={data.vehicle_no || '—'} />
                <InfoRow label="Security In-charge" value={data.security_incharge || '—'} />
              </td>

              {/* Right column */}
              <td style={{ width: '50%', padding: '6px', verticalAlign: 'top', fontSize: '9px' }}>
                <InfoRow label="Date & Time"  value={data.date_time ? dayjs(data.date_time).format('DD/MM/YYYY HH:mm') : '—'} />
                <InfoRow label="GRS No."      value={data.grs_number || '—'} />
                <InfoRow label="Created By"   value={data.created_by_name || '—'} />
              </td>
            </tr>
          </tbody>
        </table>

        {/* ── ITEMS TABLE ──────────────────────────────────────── */}
        <table style={{ width: '100%', borderCollapse: 'collapse', borderLeft: '2px solid black', borderRight: '2px solid black', borderBottom: '2px solid black', fontSize: '9px' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid black', fontWeight: 700, textAlign: 'center', backgroundColor: '#f8f9fa' }}>
              <TH w="6%"  >SL</TH>
              <TH w="40%" left>PARTICULARS</TH>
              <TH w="10%" >UNIT</TH>
              <TH w="14%" >QUANTITY</TH>
              <TH         left>REMARKS</TH>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: displayRows }).map((_, i) => {
              const it = items[i];
              return (
                <tr key={i} style={{ borderBottom: '1px solid #ddd', height: '22px', textAlign: 'center' }}>
                  <td style={{ borderRight: '1px solid #ccc' }}>{i < items.length ? (it?.sl_no ?? i + 1) : ''}</td>
                  <td style={{ borderRight: '1px solid #ccc', textAlign: 'left', paddingLeft: '4px', fontWeight: it ? 600 : 400 }}>{it?.particulars || ''}</td>
                  <td style={{ borderRight: '1px solid #ccc', textTransform: 'uppercase' }}>{it?.unit || ''}</td>
                  <td style={{ borderRight: '1px solid #ccc', fontWeight: 700 }}>{it?.quantity || ''}</td>
                  <td style={{ paddingLeft: '4px', textAlign: 'left', fontSize: '8px', color: '#666' }}>{it?.remarks || ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* ── REMARKS ──────────────────────────────────────────── */}
        {data.remarks && (
          <table style={{ width: '100%', borderCollapse: 'collapse', borderLeft: '2px solid black', borderRight: '2px solid black', borderBottom: '2px solid black' }}>
            <tbody>
              <tr>
                <td style={{ padding: '5px 8px', fontSize: '8.5px', verticalAlign: 'top' }}>
                  <span style={{ fontWeight: 700, color: '#555', marginRight: '6px' }}>Remarks:</span>
                  <span>{data.remarks}</span>
                </td>
              </tr>
            </tbody>
          </table>
        )}

        {/* ── SIGNATURE BLOCK ──────────────────────────────────── */}
        <table style={{ width: '100%', borderCollapse: 'collapse', borderLeft: '2px solid black', borderRight: '2px solid black', borderBottom: '2px solid black', marginTop: '8px' }}>
          <tbody>
            <tr>
              {/* Security In-charge */}
              <td style={{ width: '50%', borderRight: '2px solid black', verticalAlign: 'bottom', padding: 0 }}>
                <div style={{ height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px 8px' }}>
                  {data.security_incharge && (
                    <span style={{ fontSize: '9px', fontWeight: 700, color: '#166534', fontStyle: 'italic' }}>{data.security_incharge}</span>
                  )}
                </div>
                <div style={{ borderTop: '2px solid black', padding: '4px 6px', fontSize: '8px' }}>
                  <div style={{ fontWeight: 700, fontSize: '9px' }}>Security In-charge</div>
                  <div style={{ color: '#555', marginTop: '1px' }}>(Gate Security)</div>
                  <div style={{ marginTop: '3px' }}>Name: {data.security_incharge || '________________________'}</div>
                  <div>Date: {'________________________'}</div>
                </div>
              </td>

              {/* Engineer / Stores Officer */}
              <td style={{ width: '50%', verticalAlign: 'bottom', padding: 0 }}>
                <div style={{ height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px 8px', flexDirection: 'column', gap: '2px' }}>
                  {data.status === 'acknowledged' && data.acknowledged_by_name && (
                    <>
                      <span style={{ fontSize: '9px', fontWeight: 700, color: '#166534', fontStyle: 'italic' }}>{data.acknowledged_by_name}</span>
                      <span style={{ fontSize: '8px', color: '#166534', fontWeight: 700 }}>Acknowledged</span>
                    </>
                  )}
                </div>
                <div style={{ borderTop: '2px solid black', padding: '4px 6px', fontSize: '8px' }}>
                  <div style={{ fontWeight: 700, fontSize: '9px' }}>Engineer / Stores Officer</div>
                  <div style={{ color: '#555', marginTop: '1px' }}>(Stores Department)</div>
                  <div style={{ marginTop: '3px' }}>
                    Name: {data.status === 'acknowledged' && data.acknowledged_by_name ? data.acknowledged_by_name : '________________________'}
                  </div>
                  <div>
                    Date: {data.status === 'acknowledged' && data.acknowledged_at ? dayjs(data.acknowledged_at).format('DD/MM/YYYY') : '________________________'}
                  </div>
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        {/* ── FOOTER ───────────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '7px', color: '#aaa' }}>
          <span>Doc ID: GRS-{data.id?.slice(0, 8)?.toUpperCase() ?? '—'} • BCIM Construct-ERP v3.0</span>
          <span>Printed: {dayjs().format('DD/MM/YYYY HH:mm')} • This document is system-generated</span>
        </div>
      </div>
    </div>
  );
});

GRSPrintTemplate.displayName = 'GRSPrintTemplate';
export default GRSPrintTemplate;

/* ── Helper components ────────────────────────────────────────── */
function MetaRow({ label, value, bold }) {
  return (
    <div style={{ display: 'flex', marginBottom: '3px' }}>
      <span style={{ width: '72px', fontWeight: 700, color: '#555', flexShrink: 0 }}>{label}</span>
      <span style={{ fontWeight: bold ? 800 : 600 }}>: {value}</span>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div style={{ display: 'flex', marginBottom: '3px' }}>
      <span style={{ width: '120px', fontWeight: 700, color: '#555', flexShrink: 0 }}>{label}</span>
      <span style={{ fontWeight: 500 }}>: {value}</span>
    </div>
  );
}

function TH({ children, w, left }) {
  return (
    <th style={{
      borderRight: '1px solid #ccc',
      padding: '4px 3px',
      width: w || undefined,
      textAlign: left ? 'left' : 'center',
      paddingLeft: left ? '4px' : undefined,
      fontSize: '8.5px',
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.03em',
    }}>
      {children}
    </th>
  );
}
