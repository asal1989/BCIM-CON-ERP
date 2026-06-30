// src/pages/qs/BOQSummaryPrintTemplate.jsx
// Two-page BOQ print for QS & Billing:
//   Page 1 — BOQ Summary (chapter rollup: Bill Value vs Budgeted value)
//   Page 2 — Full BOQ line items with price, grouped by chapter
// Font matches POPrintTemplate / QS certification ('Times New Roman').
import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import bcimLogo from '../../assets/bcim-logo.png';

const getPublicAppOrigin = () => {
  const configured = import.meta.env?.VITE_PUBLIC_APP_URL || import.meta.env?.VITE_APP_URL || import.meta.env?.VITE_APP_ORIGIN;
  if (configured) return configured.replace(/\/$/, '');
  if (typeof window === 'undefined') return '';
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return 'http://bcim.ddns.net:3000';
  return window.location.origin;
};

const navy    = '#0B2E59';
const grayHd  = '#C9C9C9';
const blueHd  = '#7E93B8';
const totalBg = '#E4EFDC';

const INR  = (v) => 'INR  ' + Math.round(Number(v || 0)).toLocaleString('en-IN');
const QTY  = (v) => { const x = parseFloat((Number(v || 0)).toFixed(3)); return x || '—'; };
const RATE = (v) => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const S = {
  page:   { fontFamily: "'Times New Roman',Times,serif", color: '#0A0A0A', fontSize: '12px' },
  sheet:  { width: '100%', background: '#fff', padding: '6mm 5mm', boxSizing: 'border-box', pageBreakAfter: 'always' },
  tbl:    { width: '100%', borderCollapse: 'collapse', marginTop: '0' },
  th:     { border: '1px solid #000', padding: '8px 10px', fontWeight: 'bold', fontSize: '13px', textAlign: 'center', background: blueHd },
  thGray: { border: '1px solid #000', padding: '8px 10px', background: grayHd },
  td:     { border: '1px solid #000', padding: '7px 10px', fontSize: '12.5px', verticalAlign: 'middle' },
  tdNo:   { border: '1px solid #000', padding: '7px 8px', fontSize: '12.5px', textAlign: 'center', fontWeight: 'bold' },
  tdVal:  { border: '1px solid #000', padding: '7px 10px', fontSize: '12.5px', textAlign: 'right', whiteSpace: 'nowrap' },
  tdValL: { border: '1px solid #000', padding: '7px 10px', fontSize: '12.5px', whiteSpace: 'nowrap' },
};

function ValCell({ amount, bold, bg }) {
  return (
    <td style={{ ...S.td, padding: 0, background: bg || 'transparent' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 10px', fontWeight: bold ? 'bold' : 'normal' }}>
        <span>INR</span>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{Math.round(Number(amount || 0)).toLocaleString('en-IN')}</span>
      </div>
    </td>
  );
}

// Shared letterhead shown at the top of each page
function Letterhead({ projectName, projectAddress, clientName, subtitle, qrUrl }) {
  const now = new Date().toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  return (
    <div style={{ fontFamily: 'Arial, sans-serif', marginBottom: 14 }}>
      {/* Top gradient bar */}
      <div style={{ height: 5, background: 'linear-gradient(90deg,#0B2E59 0%,#1e4d8c 55%,#2563eb 100%)', marginBottom: 12 }} />
      {/* Company row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: 10, marginBottom: 10, borderBottom: '1.5px solid #0B2E59' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <img src={bcimLogo} alt="BCIM" style={{ width: 60, height: 60, objectFit: 'contain', flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#0B2E59', lineHeight: 1.1 }}>BCIM Engineering Pvt. Ltd.</div>
            <div style={{ fontSize: 9, color: '#475569', marginTop: 3 }}>Construction &amp; Infrastructure Management</div>
            <div style={{ fontSize: 8.5, color: '#94a3b8', marginTop: 1 }}>Bengaluru, Karnataka, India &nbsp;|&nbsp; www.bcim.in</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ textAlign: 'right', fontSize: 8.5, color: '#64748b', lineHeight: 1.9 }}>
            <div style={{ fontWeight: 700, color: '#1e293b', fontSize: 9 }}>Confidential — Internal Use Only</div>
            <div>Generated: {now}</div>
          </div>
          {qrUrl && <QRCodeSVG value={qrUrl} size={44} />}
        </div>
      </div>
      {/* Project info */}
      {(projectName || clientName) && (
        <div style={{ display: 'flex', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 4, marginBottom: 10, overflow: 'hidden' }}>
          {projectName && (
            <div style={{ flex: 2, padding: '7px 14px', borderRight: clientName ? '1px solid #e2e8f0' : 'none' }}>
              <div style={{ fontSize: 8, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 2 }}>Project</div>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#0B2E59' }}>{projectName}</div>
              {projectAddress && <div style={{ fontSize: 9, color: '#64748b', marginTop: 2 }}>{projectAddress}</div>}
            </div>
          )}
          {clientName && (
            <div style={{ flex: 1, padding: '7px 14px' }}>
              <div style={{ fontSize: 8, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 2 }}>Client</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#1e293b' }}>{clientName}</div>
            </div>
          )}
        </div>
      )}
      {/* Document title band */}
      <div style={{ background: '#0B2E59', color: '#fff', padding: '7px 14px', borderRadius: 4, marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>{subtitle}</div>
      </div>
    </div>
  );
}

// Signature footer shown at the end of the last page
function SignatureFooter() {
  const cols = [
    { role: 'Prepared by', designation: 'QS / Site Engineer' },
    { role: 'Checked by',  designation: 'Project Manager'    },
    { role: 'Approved by', designation: 'Director / MD'      },
  ];
  return (
    <div style={{ marginTop: 48, fontFamily: 'Arial, sans-serif', pageBreakInside: 'avoid' }}>
      <div style={{ borderTop: '2px solid #0B2E59', paddingTop: 14 }}>
        <div style={{ display: 'flex' }}>
          {cols.map((c, i) => (
            <div key={c.role} style={{
              flex: 1,
              paddingLeft: i > 0 ? 24 : 0,
              paddingRight: i < cols.length - 1 ? 24 : 0,
              borderLeft: i > 0 ? '1px solid #e2e8f0' : 'none',
            }}>
              <div style={{ fontSize: 9, fontWeight: 800, color: '#0B2E59', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 38 }}>{c.role}</div>
              <div style={{ borderTop: '1px solid #334155', paddingTop: 4, display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 8, color: '#64748b' }}>Signature</span>
                <span style={{ fontSize: 8, color: '#94a3b8' }}>{c.designation}</span>
              </div>
              <div style={{ marginTop: 8, fontSize: 8.5, color: '#475569', lineHeight: 2.1 }}>
                <div>Name &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;: _______________________________</div>
                <div>Date &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;: _______________________________</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function BOQSummaryPrintTemplate({
  projectName = '',
  projectAddress = '',
  clientName = '',
  subtitle = 'CIVIL WORKS - BOQ',
  chapterRows = [],
  lineItemsByChapter = [],
  totals = { bill: 0, budget: 0, gst: 0, billGrand: 0, budgetGrand: 0 },
  gstPct = 18,
  projectId,
}) {
  const qrUrl = projectId ? `${getPublicAppOrigin()}/verify/boq/${projectId}` : null;
  return (
    <div style={S.page}>

      {/* ─────────────── PAGE 1 — BOQ SUMMARY ─────────────── */}
      <div style={S.sheet}>
        <Letterhead projectName={projectName} projectAddress={projectAddress} clientName={clientName} subtitle="Bill of Quantities — Summary" qrUrl={qrUrl} />

        <table style={S.tbl}>
          <colgroup>
            <col style={{ width: '6%' }} />
            <col style={{ width: '48%' }} />
            <col style={{ width: '23%' }} />
            <col style={{ width: '23%' }} />
          </colgroup>

          <thead>
            <tr>
              <td colSpan={4} style={{ ...S.thGray, textAlign: 'center', fontWeight: 'bold', fontSize: '14px', lineHeight: 1.5 }}>
                {(projectName || 'PROJECT').toUpperCase()}<br />
                <span style={{ fontSize: '12px', fontWeight: 'normal' }}>{subtitle}</span>
              </td>
            </tr>
            <tr>
              <td style={S.thGray} /><td style={S.thGray} /><td style={S.thGray} /><td style={S.thGray} />
            </tr>
            <tr>
              <th style={S.th}>S.No</th>
              <th style={{ ...S.th, textAlign: 'left' }}>DESCRIPTION OF WORKS</th>
              <th style={S.th}>Bill Value</th>
              <th style={S.th}>Budgeted value</th>
            </tr>
          </thead>

          <tbody>
            <tr>
              <td style={S.td}>&nbsp;</td><td style={S.td} /><td style={S.td} /><td style={S.td} />
            </tr>

            {chapterRows.map((c, i) => (
              <tr key={c.chapter_no || i}>
                <td style={S.tdNo}>{i + 1}</td>
                <td style={{ ...S.td, fontWeight: 'bold' }}>{c.name}</td>
                <ValCell amount={c.bill} />
                <ValCell amount={c.budget} />
              </tr>
            ))}

            <tr>
              <td style={{ ...S.td, background: totalBg }} />
              <td style={{ ...S.td, fontWeight: 'bold', background: totalBg }}>Total Works Value excluding GST</td>
              <ValCell amount={totals.bill} bold bg={totalBg} />
              <ValCell amount={totals.budget} bold bg={totalBg} />
            </tr>
            <tr>
              <td style={S.td} />
              <td style={S.td}>GST {gstPct}%</td>
              <ValCell amount={totals.gst} />
              <ValCell amount={totals.gst} />
            </tr>
            <tr>
              <td style={{ ...S.td, background: totalBg }} />
              <td style={{ ...S.td, fontWeight: 'bold', background: totalBg }}>Grand Total Including GST</td>
              <ValCell amount={totals.billGrand} bold bg={totalBg} />
              <ValCell amount={totals.budgetGrand} bold bg={totalBg} />
            </tr>
          </tbody>
        </table>

        <p style={{ textAlign: 'center', fontStyle: 'italic', color: '#555', marginTop: '10px', fontSize: '11px' }}>
          Page 1 of 2 — BOQ Summary
        </p>
      </div>

      {/* ─────────────── PAGE 2 — FULL BOQ ITEMS ─────────────── */}
      <div style={{ ...S.sheet, pageBreakAfter: 'auto' }}>
        <Letterhead projectName={projectName} projectAddress={projectAddress} clientName={clientName} subtitle="Bill of Quantities — Detailed Items" qrUrl={qrUrl} />

        <table style={S.tbl}>
          <colgroup>
            <col style={{ width: '6%' }} />
            <col style={{ width: '46%' }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '13%' }} />
            <col style={{ width: '15%' }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{ ...S.th, fontSize: '11px' }}>Item</th>
              <th style={{ ...S.th, fontSize: '11px', textAlign: 'left' }}>Description</th>
              <th style={{ ...S.th, fontSize: '11px' }}>Unit</th>
              <th style={{ ...S.th, fontSize: '11px' }}>Qty</th>
              <th style={{ ...S.th, fontSize: '11px' }}>Rate</th>
              <th style={{ ...S.th, fontSize: '11px' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {lineItemsByChapter.map((ch, ci) => (
              <React.Fragment key={ch.chapter_no || ci}>
                <tr>
                  <td colSpan={6} style={{ ...S.td, background: navy, color: '#fff', fontWeight: 'bold', fontSize: '12px', letterSpacing: '0.4px' }}>
                    {ch.chapter_no ? `${ch.chapter_no}. ` : ''}{(ch.name || '').toUpperCase()}
                  </td>
                </tr>
                {ch.items.map((it, ii) => {
                  const amt = Number(it.amount) || (Number(it.quantity || 0) * Number(it.rate || 0));
                  return (
                    <tr key={it.id || ii}>
                      <td style={S.tdNo}>{it.item_no || ii + 1}</td>
                      <td style={{ ...S.td, fontSize: '11.5px', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>{it.description}</td>
                      <td style={{ ...S.tdNo, fontWeight: 'normal' }}>{it.unit || '—'}</td>
                      <td style={S.tdVal}>{QTY(it.quantity)}</td>
                      <td style={S.tdVal}>{RATE(it.rate)}</td>
                      <td style={S.tdVal}>{RATE(amt)}</td>
                    </tr>
                  );
                })}
                <tr>
                  <td colSpan={5} style={{ ...S.tdValL, fontWeight: 'bold', textAlign: 'right', background: totalBg }}>
                    Sub-total — {ch.name}
                  </td>
                  <td style={{ ...S.tdVal, fontWeight: 'bold', background: totalBg }}>
                    {RATE(ch.items.reduce((s, it) => s + (Number(it.amount) || (Number(it.quantity || 0) * Number(it.rate || 0))), 0))}
                  </td>
                </tr>
              </React.Fragment>
            ))}

            <tr>
              <td colSpan={5} style={{ ...S.tdValL, fontWeight: 'bold', textAlign: 'right', background: navy, color: '#fff' }}>
                TOTAL WORKS VALUE (excl. GST)
              </td>
              <td style={{ ...S.tdVal, fontWeight: 'bold', background: navy, color: '#fff' }}>{RATE(totals.bill)}</td>
            </tr>
          </tbody>
        </table>

        <p style={{ textAlign: 'center', fontStyle: 'italic', color: '#555', marginTop: '10px', fontSize: '11px' }}>
          Page 2 of 2 — Detailed BOQ Items
        </p>

        <SignatureFooter />
      </div>
    </div>
  );
}
