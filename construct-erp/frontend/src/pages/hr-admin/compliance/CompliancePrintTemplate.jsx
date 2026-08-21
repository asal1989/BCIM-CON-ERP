// src/pages/hr-admin/compliance/CompliancePrintTemplate.jsx
// Single-record printable statutory compliance certificate — premium
// letterhead layout matching the app's official print documents
// (POPrintTemplate), with a bordered certificate frame, gold accent rule,
// and a formal sign-off block.
import React from 'react';

const DOC_CODE = 'BCIM-HR-F-COMPLIANCE';
const NAVY = '#0F2A52';
const GOLD = '#B8862F';
const INK = '#1a2536';
const MUTED = '#5b6b82';
const BORDER = '#c9d2e0';

const STATUS_STYLE = {
  Pending:         { bg: '#FFF7E6', fg: '#B45309', border: '#F5D08A' },
  Overdue:         { bg: '#FEF2F2', fg: '#B91C1C', border: '#F5B5B5' },
  Paid:            { bg: '#F0FDF4', fg: '#15803D', border: '#B7E4C7' },
  Closed:          { bg: '#F1F5F9', fg: '#475569', border: '#CBD5E1' },
  'Not Applicable':{ bg: '#F8FAFC', fg: '#94A3B8', border: '#E2E8F0' },
};

function inr(v) {
  const n = parseFloat(v || 0);
  return `Rs. ${Math.round(n).toLocaleString('en-IN')}`;
}
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

const InfoChip = ({ label, value, accent }) => (
  <div style={{ flex: 1, padding: '10px 14px', borderRight: `1px solid ${BORDER}` }}>
    <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.08em', color: MUTED, textTransform: 'uppercase' }}>{label}</div>
    <div style={{ fontSize: 14, fontWeight: 800, color: accent || NAVY, marginTop: 2 }}>{value}</div>
  </div>
);

const DetailRow = ({ label, value, danger, i }) => (
  <tr style={{ background: i % 2 === 0 ? '#ffffff' : '#F7F9FC' }}>
    <td style={{ padding: '8px 12px', fontSize: 9.5, fontWeight: 700, color: MUTED, width: '36%', borderBottom: `1px solid ${BORDER}` }}>{label}</td>
    <td style={{ padding: '8px 12px', fontSize: 11.5, color: danger ? '#B91C1C' : INK, fontWeight: danger ? 800 : 600, borderBottom: `1px solid ${BORDER}` }}>{value ?? '—'}</td>
  </tr>
);

const SummaryTile = ({ label, value, danger }) => (
  <div style={{ flex: 1, textAlign: 'center', padding: '10px 4px' }}>
    <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.06em', color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase' }}>{label}</div>
    <div style={{ fontSize: 14, fontWeight: 800, color: danger ? '#FCA5A5' : '#fff', marginTop: 3 }}>{value}</div>
  </div>
);

export default function CompliancePrintTemplate({ entry, documents = [], company = {} }) {
  if (!entry) return null;
  const printedAt = new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const st = STATUS_STYLE[entry.status] || STATUS_STYLE.Pending;

  return (
    <div style={{ width: '190mm', margin: '8mm auto', fontFamily: "'Georgia', 'Times New Roman', serif", color: INK }}>
      {/* Outer certificate frame */}
      <div style={{ border: `1.5px solid ${NAVY}`, padding: '3px' }}>
        <div style={{ border: `0.75px solid ${GOLD}`, padding: '18px 22px 16px' }}>

          {/* Letterhead */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 10, borderBottom: `2px solid ${NAVY}`, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <img src="/bcim-logo.png" alt="BCIM" style={{ height: 36, objectFit: 'contain' }} />
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: NAVY, letterSpacing: 0.2 }}>{company.name || 'BCIM ENGINEERING PRIVATE LIMITED'}</div>
                <div style={{ fontSize: 9, fontStyle: 'italic', color: MUTED }}>Infrastructure &amp; Construction Management</div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 8.5, color: MUTED }}>Doc No: <strong>{DOC_CODE}</strong></div>
              <div style={{ fontSize: 8.5, color: MUTED }}>Printed: {printedAt}</div>
            </div>
          </div>

          {/* Title block */}
          <div style={{ textAlign: 'center', marginBottom: 14 }}>
            <div style={{ fontSize: 9, letterSpacing: '0.25em', color: GOLD, fontWeight: 700, textTransform: 'uppercase' }}>Statutory Compliance Record</div>
            <div style={{ fontSize: 19, fontWeight: 800, color: NAVY, letterSpacing: 0.3, marginTop: 3 }}>{entry.obligation_title}</div>
            <div style={{ width: 70, height: 2, background: GOLD, margin: '8px auto 0' }} />
          </div>

          <div style={{ fontSize: 10, color: MUTED, textAlign: 'center', lineHeight: 1.6, marginBottom: 14, fontStyle: 'italic' }}>
            This record certifies the tracked status of the above statutory compliance item{entry.period ? ` for the period ${entry.period}` : ''},
            maintained under the Legal &amp; Statutory Compliance Tracker of {company.name || 'BCIM Engineering Private Limited'}.
          </div>

          {/* Identity strip */}
          <div style={{ display: 'flex', border: `1px solid ${BORDER}`, borderRadius: 4, overflow: 'hidden', marginBottom: 4 }}>
            <InfoChip label="Compliance ID" value={entry.obligation_code || '—'} accent={GOLD} />
            <InfoChip label="Project / HO" value={entry.project_name || 'Head Office'} />
            <InfoChip label="Category" value={entry.category} />
            <div style={{ flex: 1, padding: '10px 14px' }}>
              <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(0,0,0,.45)', textTransform: 'uppercase' }}>Status</div>
              <div style={{ display: 'inline-block', marginTop: 4, fontSize: 10, fontWeight: 800, padding: '2px 10px', borderRadius: 20, background: st.bg, color: st.fg, border: `1px solid ${st.border}` }}>
                {entry.status}
              </div>
            </div>
          </div>

          {/* Financial summary ribbon */}
          <div style={{ display: 'flex', background: NAVY, borderRadius: 4, marginTop: 12, marginBottom: 16 }}>
            <SummaryTile label="Due Amount" value={inr(entry.due_amount)} />
            <SummaryTile label="Amount Paid" value={inr(entry.amount_paid)} />
            <SummaryTile label="Outstanding" value={inr(entry.outstanding_amount)} danger={parseFloat(entry.outstanding_amount) > 0} />
            <SummaryTile label="Penalty + Damages" value={inr((parseFloat(entry.penalty_interest) || 0) + (parseFloat(entry.damages_charges) || 0))} danger={(parseFloat(entry.penalty_interest) || 0) + (parseFloat(entry.damages_charges) || 0) > 0} />
          </div>

          {/* Detail section */}
          <div style={{ fontSize: 10, fontWeight: 800, color: NAVY, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6, borderBottom: `1px solid ${GOLD}`, paddingBottom: 4 }}>
            Compliance Details
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', border: `1px solid ${BORDER}`, marginBottom: 16 }}>
            <tbody>
              <DetailRow i={0} label="Due Date" value={fmtDate(entry.due_date)} />
              <DetailRow i={1} label="Actual Payment / Compliance Date" value={fmtDate(entry.actual_payment_date)} />
              <DetailRow i={2} label="Penalty / Interest" value={inr(entry.penalty_interest)} />
              <DetailRow i={3} label="Damages Charges" value={inr(entry.damages_charges)} />
              <DetailRow i={4} label="Number of Delay Days" value={entry.delay_days ?? '—'} danger={parseFloat(entry.delay_days) > 0} />
              <DetailRow i={5} label="Validity / Expiry Date" value={fmtDate(entry.validity_expiry_date)} />
              <DetailRow i={6} label="Reason for Delay (if any)" value={entry.reason_for_delay || '—'} />
              <DetailRow i={7} label="Action Required / Follow-up" value={entry.action_required || '—'} />
              <DetailRow i={8} label="Responsible Person" value={entry.responsible_person || '—'} />
            </tbody>
          </table>

          {/* Attached documents */}
          <div style={{ fontSize: 10, fontWeight: 800, color: NAVY, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6, borderBottom: `1px solid ${GOLD}`, paddingBottom: 4 }}>
            Attached Documents ({documents.length})
          </div>
          {documents.length ? (
            <table style={{ width: '100%', borderCollapse: 'collapse', border: `1px solid ${BORDER}`, marginBottom: 20 }}>
              <tbody>
                {documents.map((d, i) => (
                  <tr key={d.id} style={{ background: i % 2 === 0 ? '#ffffff' : '#F7F9FC' }}>
                    <td style={{ padding: '6px 12px', fontSize: 9, color: MUTED, width: 24, borderBottom: `1px solid ${BORDER}` }}>{i + 1}</td>
                    <td style={{ padding: '6px 12px', fontSize: 10, fontWeight: 600, borderBottom: `1px solid ${BORDER}` }}>{d.doc_name}</td>
                    <td style={{ padding: '6px 12px', fontSize: 9, color: MUTED, borderBottom: `1px solid ${BORDER}` }}>{fmtDate(d.uploaded_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ fontSize: 9.5, color: MUTED, fontStyle: 'italic', marginBottom: 20, padding: '8px 2px' }}>No documents attached to this record.</div>
          )}

          {/* Sign-off */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 24 }}>
            <tbody>
              <tr>
                <td style={{ width: '48%', verticalAlign: 'top' }}>
                  <div style={{ border: `1px solid ${BORDER}`, borderRadius: 4, padding: '10px 12px', height: 58 }}>
                    <div style={{ fontSize: 9, fontWeight: 800, color: NAVY, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Prepared By</div>
                    <div style={{ fontSize: 9, color: MUTED, marginTop: 20 }}>Name: ____________________&nbsp;&nbsp; Date: __________</div>
                  </div>
                </td>
                <td style={{ width: '4%' }} />
                <td style={{ width: '48%', verticalAlign: 'top' }}>
                  <div style={{ border: `1px solid ${BORDER}`, borderRadius: 4, padding: '10px 12px', height: 58 }}>
                    <div style={{ fontSize: 9, fontWeight: 800, color: NAVY, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Verified By</div>
                    <div style={{ fontSize: 9, color: MUTED, marginTop: 20 }}>Name: ____________________&nbsp;&nbsp; Date: __________</div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>

          {/* Footer */}
          <div style={{ textAlign: 'center', fontSize: 7.5, color: MUTED, marginTop: 22, paddingTop: 8, borderTop: `0.75px solid ${GOLD}` }}>
            System-generated from ConstructERP — Statutory Compliance Tracker &nbsp;·&nbsp; {printedAt} &nbsp;·&nbsp; {DOC_CODE}
          </div>
        </div>
      </div>
    </div>
  );
}
