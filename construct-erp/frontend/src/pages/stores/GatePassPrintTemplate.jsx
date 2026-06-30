// src/pages/stores/GatePassPrintTemplate.jsx
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

const GatePassPrintTemplate = React.forwardRef(({ data }, ref) => {
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

  const isReturnable = data.pass_type === 'returnable';

  const statusLabel = {
    open:      'Open',
    returned:  'Returned',
    closed:    'Closed',
    cancelled: 'Cancelled',
  }[data.status] || (data.status || '—');

  // Pass type badge styles
  const passTypeBadge = isReturnable
    ? { label: 'RETURNABLE',     border: '2px solid #ea580c', color: '#ea580c', background: '#fff7ed' }
    : { label: 'NON-RETURNABLE', border: '2px solid #64748b', color: '#475569', background: '#f8fafc' };

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
                  GATE PASS (OUTWARD)
                </div>
                <div style={{ marginTop: '5px' }}>
                  <span style={{
                    display: 'inline-block',
                    border: passTypeBadge.border,
                    color: passTypeBadge.color,
                    background: passTypeBadge.background,
                    borderRadius: '3px',
                    padding: '2px 8px',
                    fontSize: '8px',
                    fontWeight: 800,
                    letterSpacing: '0.08em',
                  }}>
                    {passTypeBadge.label}
                  </span>
                </div>
                <div style={{ fontSize: '9px', color: '#666', marginTop: '3px' }}>
                  BCIM Engineering Private Limited — Outward Material Pass
                </div>
              </td>

              {/* QR */}
              <td style={{ width: '8%', border: '2px solid black', padding: '4px', textAlign: 'center', verticalAlign: 'middle' }}>
                <QRCodeSVG value={`${getPublicAppOrigin()}/verify/gatepass/${data.id}`} size={40} />
              </td>

              {/* GP meta */}
              <td style={{ width: '22%', border: '2px solid black', padding: '6px', fontSize: '9px', verticalAlign: 'top' }}>
                <MetaRow label="GP No."   value={data.gp_number} bold />
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
                <InfoRow label="Project"    value={data.project_name || '—'} />
                <InfoRow label="Vehicle No." value={data.vehicle_no || '—'} />
                <InfoRow label="Issued By"  value={data.issued_by || '—'} />
                <InfoRow label="Issued To"  value={data.issued_to || '—'} />
              </td>

              {/* Right column */}
              <td style={{ width: '50%', padding: '6px', verticalAlign: 'top', fontSize: '9px' }}>
                <InfoRow label="Indented By"    value={data.indented_by || '—'} />
                <InfoRow label="Authorised By"  value={data.authorised_by || '—'} />
                {isReturnable && (
                  <>
                    <InfoRow
                      label="Expected Return"
                      value={data.expected_return_date ? dayjs(data.expected_return_date).format('DD-MM-YYYY') : '________________________'}
                    />
                    <InfoRow
                      label="Returned At"
                      value={data.returned_at ? dayjs(data.returned_at).format('DD-MM-YYYY HH:mm') : '________________________'}
                    />
                  </>
                )}
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

        {/* ── RETURNABLE NOTICE ────────────────────────────────── */}
        {isReturnable && (
          <div style={{
            border: '2px solid #ea580c',
            borderTop: 'none',
            backgroundColor: '#fff7ed',
            padding: '6px 10px',
            fontSize: '8.5px',
            color: '#9a3412',
          }}>
            <span style={{ fontWeight: 800 }}>IMPORTANT:</span> This is a <span style={{ fontWeight: 800 }}>RETURNABLE</span> gate pass.
            Items must be returned by{' '}
            <span style={{ fontWeight: 800 }}>
              {data.expected_return_date ? dayjs(data.expected_return_date).format('DD-MM-YYYY') : '___/___/______'}
            </span>.
            {' '}Non-return is subject to recovery.
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
              {[
                { role: 'Indented By',   sub: 'Requesting Party',   name: data.indented_by   || null },
                { role: 'Issued By',     sub: 'Stores / Storekeeper', name: data.issued_by   || null },
                { role: 'Authorised By', sub: 'Project Manager',    name: data.authorised_by || null },
                { role: 'Received By',   sub: 'Recipient / Driver', name: null },
              ].map((sig, idx, arr) => (
                <td
                  key={sig.role}
                  style={{
                    width: '25%',
                    borderRight: idx < arr.length - 1 ? '2px solid black' : 'none',
                    verticalAlign: 'bottom',
                    padding: 0,
                  }}
                >
                  {/* Signature space */}
                  <div style={{ height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px 8px' }}>
                    {sig.name && (
                      <span style={{ fontSize: '9px', fontWeight: 700, color: '#166534', fontStyle: 'italic' }}>{sig.name}</span>
                    )}
                  </div>
                  {/* Name/date row */}
                  <div style={{ borderTop: '2px solid black', padding: '4px 6px', fontSize: '8px' }}>
                    <div style={{ fontWeight: 700, fontSize: '9px' }}>{sig.role}</div>
                    <div style={{ color: '#555', marginTop: '1px' }}>({sig.sub})</div>
                    <div style={{ marginTop: '3px' }}>Name: {sig.name || '________________________'}</div>
                    <div>Date: {'________________________'}</div>
                  </div>
                </td>
              ))}
            </tr>
          </tbody>
        </table>

        {/* ── FOOTER ───────────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '7px', color: '#aaa' }}>
          <span>Doc ID: GP-{data.id?.slice(0, 8)?.toUpperCase() ?? '—'} • BCIM Construct-ERP v3.0</span>
          <span>Printed: {dayjs().format('DD-MM-YYYY HH:mm')} • This document is system-generated</span>
        </div>
      </div>
    </div>
  );
});

GatePassPrintTemplate.displayName = 'GatePassPrintTemplate';
export default GatePassPrintTemplate;

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
      <span style={{ width: '115px', fontWeight: 700, color: '#555', flexShrink: 0 }}>{label}</span>
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
