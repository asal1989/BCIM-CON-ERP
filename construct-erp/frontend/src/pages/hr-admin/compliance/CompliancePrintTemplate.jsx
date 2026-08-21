// src/pages/hr-admin/compliance/CompliancePrintTemplate.jsx
// Single-record printable statutory compliance certificate — one entry from
// the Statutory Tracker, letterhead-styled to match the app's other print
// templates (POPrintTemplate, PayslipPrintPage).
import React from 'react';

const DOC_CODE = 'BCIM-HR-F-COMPLIANCE';

function inr(v) {
  const n = parseFloat(v || 0);
  return `Rs. ${Math.round(n).toLocaleString('en-IN')}`;
}
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

const Row = ({ label, value, danger }) => (
  <tr>
    <td style={{ padding: '7px 10px', fontSize: 11, color: '#64748b', fontWeight: 700, width: '38%', border: '1px solid #cbd5e1', background: '#f8fafc' }}>{label}</td>
    <td style={{ padding: '7px 10px', fontSize: 12, color: danger ? '#b91c1c' : '#0f172a', fontWeight: danger ? 800 : 600, border: '1px solid #cbd5e1' }}>{value ?? '—'}</td>
  </tr>
);

export default function CompliancePrintTemplate({ entry, documents = [], company = {} }) {
  if (!entry) return null;
  const printedAt = new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <div style={{ width: '190mm', margin: '10mm auto', fontFamily: "'Times New Roman', Times, serif", color: '#0f172a' }}>
      {/* Letterhead */}
      <div style={{ borderBottom: '3px solid #1B3A6B', paddingBottom: 10, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#1B3A6B', letterSpacing: 0.3 }}>{company.name || 'BCIM ENGINEERING PRIVATE LIMITED'}</div>
          <div style={{ fontSize: 10, fontStyle: 'italic', color: '#64748b' }}>Infrastructure &amp; Construction Management</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 9, color: '#94a3b8' }}>Doc No: {DOC_CODE}</div>
          <div style={{ fontSize: 9, color: '#94a3b8' }}>Printed: {printedAt}</div>
        </div>
      </div>

      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: 1, color: '#1B3A6B' }}>STATUTORY COMPLIANCE RECORD</div>
        <div style={{ fontSize: 10, color: '#64748b', fontStyle: 'italic', marginTop: 2 }}>Legal &amp; Statutory Compliance Tracker</div>
      </div>

      {/* Identity strip */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 14 }}>
        <tbody>
          <tr>
            <td style={{ padding: '8px 10px', border: '1px solid #cbd5e1', background: '#eef2f7', width: '33%' }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b' }}>COMPLIANCE ID</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#1B3A6B' }}>{entry.obligation_code || '—'}</div>
            </td>
            <td style={{ padding: '8px 10px', border: '1px solid #cbd5e1', background: '#eef2f7', width: '34%' }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b' }}>PROJECT / HO</div>
              <div style={{ fontSize: 13, fontWeight: 800 }}>{entry.project_name || 'Head Office'}</div>
            </td>
            <td style={{ padding: '8px 10px', border: '1px solid #cbd5e1', background: '#eef2f7', width: '33%' }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b' }}>CATEGORY</div>
              <div style={{ fontSize: 13, fontWeight: 800 }}>{entry.category}</div>
            </td>
          </tr>
        </tbody>
      </table>

      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
        {entry.obligation_title}{entry.period ? ` — Period: ${entry.period}` : ''}
      </div>

      {/* Detail table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
        <tbody>
          <Row label="Due Date" value={fmtDate(entry.due_date)} />
          <Row label="Actual Payment / Compliance Date" value={fmtDate(entry.actual_payment_date)} />
          <Row label="Due Amount" value={inr(entry.due_amount)} />
          <Row label="Amount Paid" value={inr(entry.amount_paid)} />
          <Row label="Outstanding / Due Amount" value={inr(entry.outstanding_amount)} danger={parseFloat(entry.outstanding_amount) > 0} />
          <Row label="Penalty / Interest" value={inr(entry.penalty_interest)} />
          <Row label="Damages Charges" value={inr(entry.damages_charges)} />
          <Row label="Number of Delay Days" value={entry.delay_days ?? '—'} danger={parseFloat(entry.delay_days) > 0} />
          <Row label="Validity / Expiry Date" value={fmtDate(entry.validity_expiry_date)} />
          <Row label="Current Status" value={entry.status} />
          <Row label="Reason for Delay (if any)" value={entry.reason_for_delay || '—'} />
          <Row label="Action Required / Follow-up" value={entry.action_required || '—'} />
          <Row label="Responsible Person" value={entry.responsible_person || '—'} />
        </tbody>
      </table>

      {/* Attached documents */}
      <div style={{ fontSize: 11, fontWeight: 700, color: '#1B3A6B', marginBottom: 6 }}>
        Attached Documents ({documents.length})
      </div>
      {documents.length ? (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20 }}>
          <tbody>
            {documents.map((d, i) => (
              <tr key={d.id}>
                <td style={{ padding: '5px 10px', fontSize: 10, border: '1px solid #cbd5e1', width: 24 }}>{i + 1}</td>
                <td style={{ padding: '5px 10px', fontSize: 10, border: '1px solid #cbd5e1' }}>{d.doc_name}</td>
                <td style={{ padding: '5px 10px', fontSize: 10, border: '1px solid #cbd5e1', color: '#64748b' }}>{fmtDate(d.uploaded_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div style={{ fontSize: 10, color: '#94a3b8', fontStyle: 'italic', marginBottom: 20 }}>No documents attached.</div>
      )}

      {/* Sign-off */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 30 }}>
        <tbody>
          <tr>
            <td style={{ width: '50%', paddingRight: 10 }}>
              <div style={{ borderTop: '1px solid #0f172a', paddingTop: 4, fontSize: 10 }}>Prepared By (HR / Admin)</div>
              <div style={{ fontSize: 9, color: '#64748b', marginTop: 24 }}>Name: ____________________&nbsp;&nbsp; Date: __________</div>
            </td>
            <td style={{ width: '50%', paddingLeft: 10 }}>
              <div style={{ borderTop: '1px solid #0f172a', paddingTop: 4, fontSize: 10 }}>Verified By</div>
              <div style={{ fontSize: 9, color: '#64748b', marginTop: 24 }}>Name: ____________________&nbsp;&nbsp; Date: __________</div>
            </td>
          </tr>
        </tbody>
      </table>

      <div style={{ textAlign: 'center', fontSize: 8, color: '#94a3b8', marginTop: 20, borderTop: '1px solid #e2e8f0', paddingTop: 8 }}>
        System-generated from ConstructERP — Statutory Compliance Tracker · {printedAt}
      </div>
    </div>
  );
}
