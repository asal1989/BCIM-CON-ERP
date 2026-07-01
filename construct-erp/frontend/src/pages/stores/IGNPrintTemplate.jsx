// src/pages/stores/IGNPrintTemplate.jsx
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

const IGNPrintTemplate = React.forwardRef(({ data }, ref) => {
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
    gate_received: 'Gate Received',
    pending:   'Pending',
    inspected: 'Inspected',
    approved:  'Approved',
    cancelled: 'Cancelled',
  }[data.status] || (data.status || '—');

  const totalDC         = items.reduce((s, i) => s + (parseFloat(i.qty_as_per_dc  || 0)), 0);
  const totalInspected  = items.reduce((s, i) => s + (parseFloat(i.qty_inspected  || 0)), 0);
  const totalRejected   = items.reduce((s, i) => s + (parseFloat(i.qty_rejected   || 0)), 0);
  const hasRejections   = totalRejected > 0;

  return (
    <div ref={ref}>
      <div
        className="bg-white text-black font-sans"
        style={{ width: '297mm', minHeight: '210mm', padding: '10mm', boxSizing: 'border-box', position: 'relative' }}
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
                  INWARD GOODS NOTE (IGN)
                </div>
                <div style={{ fontSize: '9px', color: '#666', marginTop: '2px' }}>
                  BCIM Engineering Private Limited — Goods Inspection &amp; Acceptance Record
                </div>
              </td>

              {/* QR */}
              <td style={{ width: '8%', border: '2px solid black', padding: '4px', textAlign: 'center', verticalAlign: 'middle' }}>
                <QRCodeSVG value={`${getPublicAppOrigin()}/verify/ign/${data.id}`} size={40} />
              </td>

              {/* IGN meta */}
              <td style={{ width: '22%', border: '2px solid black', padding: '6px', fontSize: '9px', verticalAlign: 'top' }}>
                <MetaRow label="IGN No."  value={data.ign_number} bold />
                <MetaRow label="Date"     value={data.date_time ? dayjs(data.date_time).format('DD-MM-YYYY') : '—'} />
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
                <InfoRow label="Project"     value={data.project_name || '—'} />
                <InfoRow label="Supplier"    value={data.supplier_name || '—'} />
                <InfoRow label="Vehicle No." value={data.vehicle_no || '—'} />
                <InfoRow label="DC No."      value={data.dc_number || '—'} />
              </td>

              {/* Right column */}
              <td style={{ width: '50%', padding: '6px', verticalAlign: 'top', fontSize: '9px' }}>
                <InfoRow label="Bill No."    value={data.bill_number || '—'} />
                <InfoRow label="PO No."      value={data.po_number || '—'} />
                <InfoRow label="GRS No."     value={data.grs_number || '—'} />
                <InfoRow label="Date & Time" value={data.date_time ? dayjs(data.date_time).format('DD-MM-YYYY HH:mm') : '—'} />
              </td>
            </tr>
          </tbody>
        </table>

        {/* ── GATE SECURITY (if gate entry) ────────────────────── */}
        {(data.security_incharge || data.gate_received_at) && (
          <table style={{ width: '100%', borderCollapse: 'collapse', borderLeft: '2px solid black', borderRight: '2px solid black', borderBottom: '2px solid black', fontSize: '9px' }}>
            <tbody>
              <tr style={{ backgroundColor: '#f0f4f8' }}>
                <td colSpan={4} style={{ padding: '4px 6px', fontWeight: 700, fontSize: '9px', borderBottom: '1px solid #ccc' }}>
                  GATE SECURITY VERIFICATION
                </td>
              </tr>
              <tr>
                <td style={{ width: '25%', padding: '4px 6px', borderRight: '1px solid #ccc' }}>
                  <InfoRow label="Security In-charge" value={data.security_incharge || '—'} />
                </td>
                <td style={{ width: '25%', padding: '4px 6px', borderRight: '1px solid #ccc' }}>
                  <InfoRow label="Gate Received At" value={data.gate_received_at ? dayjs(data.gate_received_at).format('DD-MM-YYYY HH:mm') : '—'} />
                </td>
                <td style={{ width: '25%', padding: '4px 6px', borderRight: '1px solid #ccc' }}>
                  <InfoRow label="Gate Received By" value={data.gate_received_by_name || '—'} />
                </td>
                <td style={{ width: '25%', padding: '4px 6px' }}>
                  <InfoRow label="Vehicle No." value={data.vehicle_no || '—'} />
                </td>
              </tr>
            </tbody>
          </table>
        )}

        {/* ── ITEMS TABLE ──────────────────────────────────────── */}
        <table style={{ width: '100%', borderCollapse: 'collapse', borderLeft: '2px solid black', borderRight: '2px solid black', borderBottom: '2px solid black', fontSize: '9px' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid black', fontWeight: 700, textAlign: 'center', backgroundColor: '#f8f9fa' }}>
              <TH w="4%"  >SL</TH>
              <TH w="9%"  >INVOICE NO.</TH>
              <TH w="28%" left>MATERIAL DESCRIPTION</TH>
              <TH w="7%"  >UNIT</TH>
              <TH w="9%"  >QTY AS PER DC</TH>
              <TH w="9%"  >AFTER INSPECTION</TH>
              <TH w="8%"  >REJECTED</TH>
              <TH         left>REMARKS</TH>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: displayRows }).map((_, i) => {
              const it         = items[i];
              const isRejected = it && parseFloat(it.qty_rejected || 0) > 0;
              return (
                <tr
                  key={i}
                  style={{
                    borderBottom: '1px solid #ddd',
                    height: '22px',
                    textAlign: 'center',
                    backgroundColor: isRejected ? '#fff5f5' : 'transparent',
                  }}
                >
                  <td style={{ borderRight: '1px solid #ccc' }}>{i < items.length ? (it?.sl_no ?? i + 1) : ''}</td>
                  <td style={{ borderRight: '1px solid #ccc', fontSize: '8px', color: '#555' }}>{it?.invoice_no || ''}</td>
                  <td style={{ borderRight: '1px solid #ccc', textAlign: 'left', paddingLeft: '4px', fontWeight: it ? 600 : 400 }}>{it?.material_name || ''}</td>
                  <td style={{ borderRight: '1px solid #ccc', textTransform: 'uppercase' }}>{it?.unit || ''}</td>
                  <td style={{ borderRight: '1px solid #ccc', color: '#666' }}>{it?.qty_as_per_dc || ''}</td>
                  <td style={{ borderRight: '1px solid #ccc', fontWeight: 700 }}>{it?.qty_inspected || ''}</td>
                  <td style={{ borderRight: '1px solid #ccc', fontWeight: isRejected ? 700 : 400, color: isRejected ? '#b91c1c' : 'inherit' }}>{it?.qty_rejected || ''}</td>
                  <td style={{ paddingLeft: '4px', textAlign: 'left', fontSize: '8px', color: '#666' }}>{it?.remarks || ''}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '2px solid black', fontWeight: 700, backgroundColor: '#f8f9fa', textAlign: 'center' }}>
              <td colSpan={4} style={{ borderRight: '1px solid #ccc', textAlign: 'right', paddingRight: '6px', fontSize: '9px' }}>
                TOTALS
              </td>
              <td style={{ borderRight: '1px solid #ccc', fontWeight: 900, fontSize: '10px' }}>{totalDC > 0 ? totalDC : '—'}</td>
              <td style={{ borderRight: '1px solid #ccc', fontWeight: 900, fontSize: '10px' }}>{totalInspected > 0 ? totalInspected : '—'}</td>
              <td style={{ borderRight: '1px solid #ccc', fontWeight: 900, fontSize: '10px', color: totalRejected > 0 ? '#b91c1c' : 'inherit' }}>{totalRejected > 0 ? totalRejected : '—'}</td>
              <td />
            </tr>
          </tfoot>
        </table>

        {/* ── REJECTION WARNING BAND ───────────────────────────── */}
        {hasRejections && (
          <div style={{
            backgroundColor: '#fef2f2',
            border: '2px solid #b91c1c',
            padding: '6px 10px',
            fontSize: '9px',
            fontWeight: 700,
            color: '#b91c1c',
            marginTop: 0,
            borderTop: 'none',
          }}>
            ⚠ REJECTION NOTE: {totalRejected} unit{totalRejected !== 1 ? 's' : ''} rejected — refer to items above for details
          </div>
        )}

        {/* ── REMARKS ──────────────────────────────────────────── */}
        {data.remarks && (
          <table style={{ width: '100%', borderCollapse: 'collapse', borderLeft: '2px solid black', borderRight: '2px solid black', borderBottom: '2px solid black', marginTop: '4px' }}>
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
              {/* Inspected By */}
              <td style={{ width: '33.33%', borderRight: '2px solid black', verticalAlign: 'bottom', padding: 0 }}>
                <div style={{ height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px 8px' }}>
                  {data.inspected_by && (
                    <span style={{ fontSize: '9px', fontWeight: 700, color: '#166534', fontStyle: 'italic' }}>{data.inspected_by}</span>
                  )}
                </div>
                <div style={{ borderTop: '2px solid black', padding: '4px 6px', fontSize: '8px' }}>
                  <div style={{ fontWeight: 700, fontSize: '9px' }}>Inspected By</div>
                  <div style={{ color: '#555', marginTop: '1px' }}>(QC / Site Engineer)</div>
                  <div style={{ marginTop: '3px' }}>Name: {data.inspected_by || '________________________'}</div>
                  <div>Date: {'________________________'}</div>
                </div>
              </td>

              {/* Stores In-charge */}
              <td style={{ width: '33.33%', borderRight: '2px solid black', verticalAlign: 'bottom', padding: 0 }}>
                <div style={{ height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px 8px' }}>
                  {data.stores_incharge && (
                    <span style={{ fontSize: '9px', fontWeight: 700, color: '#166534', fontStyle: 'italic' }}>{data.stores_incharge}</span>
                  )}
                </div>
                <div style={{ borderTop: '2px solid black', padding: '4px 6px', fontSize: '8px' }}>
                  <div style={{ fontWeight: 700, fontSize: '9px' }}>Stores In-charge</div>
                  <div style={{ color: '#555', marginTop: '1px' }}>(Stores Department)</div>
                  <div style={{ marginTop: '3px' }}>Name: {data.stores_incharge || '________________________'}</div>
                  <div>Date: {'________________________'}</div>
                </div>
              </td>

              {/* Approving Authority */}
              <td style={{ width: '33.33%', verticalAlign: 'bottom', padding: 0 }}>
                <div style={{ height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px 8px', flexDirection: 'column', gap: '2px' }}>
                  {data.status === 'approved' && data.approved_by_name && (
                    <>
                      <span style={{ fontSize: '9px', fontWeight: 700, color: '#166534', fontStyle: 'italic' }}>{data.approved_by_name}</span>
                      <span style={{ fontSize: '8px', color: '#166534', fontWeight: 700 }}>Approved</span>
                    </>
                  )}
                </div>
                <div style={{ borderTop: '2px solid black', padding: '4px 6px', fontSize: '8px' }}>
                  <div style={{ fontWeight: 700, fontSize: '9px' }}>Approving Authority</div>
                  <div style={{ color: '#555', marginTop: '1px' }}>(Project Manager)</div>
                  <div style={{ marginTop: '3px' }}>
                    Name: {data.status === 'approved' && data.approved_by_name ? data.approved_by_name : '________________________'}
                  </div>
                  <div>
                    Date: {data.status === 'approved' && data.approved_at ? dayjs(data.approved_at).format('DD-MM-YYYY') : '________________________'}
                  </div>
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        {/* ── FOOTER ───────────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '7px', color: '#aaa' }}>
          <span>Doc ID: IGN-{data.id?.slice(0, 8)?.toUpperCase() ?? '—'} • BCIM Construct-ERP v3.0</span>
          <span>Printed: {dayjs().format('DD-MM-YYYY HH:mm')} • This document is system-generated</span>
        </div>
      </div>
    </div>
  );
});

IGNPrintTemplate.displayName = 'IGNPrintTemplate';
export default IGNPrintTemplate;

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
      <span style={{ width: '110px', fontWeight: 700, color: '#555', flexShrink: 0 }}>{label}</span>
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
