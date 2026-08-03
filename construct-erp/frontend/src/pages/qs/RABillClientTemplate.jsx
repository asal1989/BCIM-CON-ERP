import React, { forwardRef } from 'react';
import { safeInr as inr, safeDate } from './PrintComponents';
import bcimLogo from '../../assets/bcim-logo.png';

const fmt = (n, decimals = 3) => Number(n || 0).toFixed(decimals);

const groupByHead = (items) => {
  const order = [];
  const map = new Map();
  items.forEach((item) => {
    const head = item.cost_head || 'OTHER';
    if (!map.has(head)) {
      map.set(head, []);
      order.push(head);
    }
    map.get(head).push(item);
  });
  return order.map((head) => ({ head, items: map.get(head) }));
};

const RABillClientTemplate = forwardRef(({ data }, ref) => {
  if (!data) return null;

  const items = data.items || [];
  const groups = groupByHead(items);

  const grossExGst  = parseFloat(data.gross_amount || 0);
  const gstAmt      = parseFloat(data.gst_amount || 0);
  const grossWGst   = parseFloat(data.gross_with_gst || grossExGst + gstAmt);
  const halfGst     = gstAmt / 2;
  const retention   = parseFloat(data.retention_amount || 0);
  const retPct      = parseFloat(data.retention_pct || data.retention_percent || 5);
  const tds         = parseFloat(data.tds_amount || 0);
  const tdsRate     = parseFloat(data.tds_rate || 2);
  const netPayable  = parseFloat(data.net_payable || 0);

  let srNo = 0;

  return (
    <div ref={ref} className="bg-white font-sans text-slate-900">
      <style dangerouslySetInnerHTML={{ __html: `
        @page { size: A4 portrait; margin: 12mm 10mm 14mm; }
        @media print {
          html, body { margin: 0 !important; padding: 0 !important;
            -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .client-bill-page { break-inside: auto; }
          .no-break { break-inside: avoid; page-break-inside: avoid; }
          .page-break { break-before: page; page-break-before: always; }
        }
        .client-bill-page { font-family: Arial, Helvetica, sans-serif; font-size: 8.5pt; color: #0f172a; }
        .bill-table { width: 100%; border-collapse: collapse; }
        .bill-table th, .bill-table td { border: 0.5pt solid #94a3b8; padding: 3pt 4pt; }
        .bill-table th { background: #1e3a8a; color: #fff; font-size: 7.5pt; font-weight: bold; text-transform: uppercase; letter-spacing: 0.04em; }
        .bill-table .section-head td { background: #e2e8f0; font-weight: bold; color: #1e3a8a; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.06em; }
        .bill-table .subtotal-row td { background: #dbeafe; font-weight: bold; color: #1e3a8a; }
        .bill-table .total-row td { background: #1e3a8a; color: #fff; font-weight: bold; font-size: 9pt; }
        .bill-table .even-row { background: #fff; }
        .bill-table .odd-row  { background: #f8fafc; }
        .summary-table { border-collapse: collapse; min-width: 260pt; }
        .summary-table td { border: 0.5pt solid #94a3b8; padding: 4pt 8pt; }
        .summary-table .net-row td { background: #1e3a8a; color: #fff; font-weight: bold; font-size: 10pt; }
        .summary-table .deduct-row td { color: #b91c1c; }
        .header-top { height: 6pt; background: #1e3a8a; }
        .header-bottom { height: 2pt; background: #0ea5e9; }
      `}} />

      <div className="client-bill-page">

        {/* ── Company Header ── */}
        <div className="header-top" />
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '8pt 0 6pt', borderBottom: '1pt solid #1e3a8a' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10pt' }}>
            <img src={bcimLogo} alt="BCIM" style={{ width: '44pt', height: '44pt', objectFit: 'contain' }} />
            <div>
              <div style={{ fontSize: '16pt', fontWeight: 'bold', color: '#1e3a8a', lineHeight: 1.1 }}>BCIM Engineering Private Limited</div>
              <div style={{ fontSize: '7pt', color: '#475569', marginTop: '2pt' }}>No. 2, 1st Main Road, Kasturinagar, Bengaluru - 560 043</div>
              <div style={{ fontSize: '7pt', color: '#475569' }}>Ph: +91-80-25485900 | GSTIN: 29AAGCB0777H1ZM</div>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '13pt', fontWeight: 'bold', color: '#1e3a8a', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Running Account Bill</div>
            <div style={{ fontSize: '8pt', marginTop: '4pt', color: '#334155' }}>
              <span style={{ fontWeight: 'bold' }}>Bill No:</span> {data.bill_number}
            </div>
            <div style={{ fontSize: '8pt', color: '#334155' }}>
              <span style={{ fontWeight: 'bold' }}>Date:</span> {safeDate(data.bill_date)}
            </div>
            {data.status && (
              <div style={{ fontSize: '7.5pt', marginTop: '3pt', display: 'inline-block', padding: '1pt 6pt', border: '0.5pt solid #94a3b8', borderRadius: '10pt', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                {data.status}
              </div>
            )}
          </div>
        </div>
        <div className="header-bottom" style={{ marginBottom: '8pt' }} />

        {/* ── To / Project Details ── */}
        <div className="no-break" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8pt', marginBottom: '10pt', border: '0.5pt solid #cbd5e1', borderRadius: '3pt', padding: '6pt 8pt', background: '#f8fafc' }}>
          <div>
            <div style={{ fontSize: '7pt', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#64748b', marginBottom: '2pt' }}>To</div>
            <div style={{ fontSize: '9.5pt', fontWeight: 'bold', color: '#0f172a' }}>{data.contractor_name || '—'}</div>
            <div style={{ fontSize: '7pt', color: '#475569', marginTop: '6pt', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Project</div>
            <div style={{ fontSize: '9pt', fontWeight: '600', color: '#0f172a', marginTop: '1pt' }}>{data.project_name || '—'}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '90pt 1fr', gap: '2pt 6pt', alignContent: 'start', fontSize: '8pt' }}>
            <span style={{ color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Work Order</span>
            <span style={{ fontWeight: '600' }}>{data.wo_number || '—'}</span>
            <span style={{ color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Bill Period</span>
            <span>{safeDate(data.bill_period_from)} — {safeDate(data.bill_period_to)}</span>
            <span style={{ color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Work Scope</span>
            <span style={{ color: '#334155' }}>{data.work_description || '—'}</span>
          </div>
        </div>

        {/* ── Item Table ── */}
        <table className="bill-table">
          <thead>
            <tr>
              <th style={{ width: '22pt', textAlign: 'center' }}>Sr</th>
              <th style={{ textAlign: 'left' }}>Description of Work</th>
              <th style={{ width: '26pt', textAlign: 'center' }}>Unit</th>
              <th style={{ width: '44pt', textAlign: 'right' }}>Prev Qty</th>
              <th style={{ width: '44pt', textAlign: 'right' }}>Curr Qty</th>
              <th style={{ width: '44pt', textAlign: 'right' }}>Cum Qty</th>
              <th style={{ width: '46pt', textAlign: 'right' }}>Rate (Rs.)</th>
              <th style={{ width: '60pt', textAlign: 'right' }}>Amount (Rs.)</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => {
              const groupTotal = group.items.reduce(
                (s, i) => s + Number(i.amount || Number(i.current_qty || 0) * Number(i.rate || 0)), 0
              );
              return (
                <React.Fragment key={group.head}>
                  <tr className="section-head no-break">
                    <td colSpan={8}>{group.head}</td>
                  </tr>
                  {group.items.map((item, idx) => {
                    srNo++;
                    const amt = Number(item.amount || Number(item.current_qty || 0) * Number(item.rate || 0));
                    const desc = item.short_description || (item.description || '').substring(0, 100) || '—';
                    return (
                      <tr key={item.id || idx} className={idx % 2 === 0 ? 'even-row' : 'odd-row'}>
                        <td style={{ textAlign: 'center', fontFamily: 'monospace' }}>{srNo}</td>
                        <td>{desc}</td>
                        <td style={{ textAlign: 'center', textTransform: 'uppercase', fontSize: '7.5pt' }}>{item.unit || '—'}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '7.5pt', color: '#475569' }}>{fmt(item.prev_certified_qty)}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 'bold' }}>{fmt(item.current_qty)}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '7.5pt' }}>{fmt(item.cumulative_qty || item.current_qty)}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{fmt(item.rate, 2)}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 'bold' }}>{inr(amt)}</td>
                      </tr>
                    );
                  })}
                  <tr className="subtotal-row no-break">
                    <td colSpan={7} style={{ textAlign: 'right', paddingRight: '6pt' }}>
                      Sub-total — {group.head}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{inr(groupTotal)}</td>
                  </tr>
                </React.Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="total-row">
              <td colSpan={7} style={{ textAlign: 'right', paddingRight: '6pt', letterSpacing: '0.08em' }}>TOTAL — WORK DONE (Ex-GST)</td>
              <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '10pt' }}>{inr(grossExGst)}</td>
            </tr>
          </tfoot>
        </table>

        {/* ── Financial Summary ── */}
        <div className="no-break" style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12pt' }}>
          <table className="summary-table">
            <tbody>
              <tr>
                <td style={{ color: '#334155' }}>Total Work Done (Ex-GST)</td>
                <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 'bold' }}>{inr(grossExGst)}</td>
              </tr>
              <tr style={{ background: '#f8fafc' }}>
                <td style={{ color: '#475569', paddingLeft: '20pt' }}>Add: CGST @ 9%</td>
                <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{inr(halfGst)}</td>
              </tr>
              <tr style={{ background: '#f8fafc' }}>
                <td style={{ color: '#475569', paddingLeft: '20pt' }}>Add: SGST @ 9%</td>
                <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{inr(halfGst)}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 'bold' }}>Total Gross (Incl. GST)</td>
                <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 'bold' }}>{inr(grossWGst)}</td>
              </tr>
              {retention > 0 && (
                <tr className="deduct-row" style={{ background: '#fff1f2' }}>
                  <td>Less: Retention @ {retPct}% (on Ex-GST)</td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>({inr(retention)})</td>
                </tr>
              )}
              {tds > 0 && (
                <tr className="deduct-row" style={{ background: '#fff1f2' }}>
                  <td>Less: TDS @ {tdsRate}%</td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>({inr(tds)})</td>
                </tr>
              )}
              <tr className="net-row">
                <td style={{ letterSpacing: '0.08em' }}>NET PAYABLE</td>
                <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{inr(netPayable)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ── Sign-off ── */}
        <div className="no-break" style={{ marginTop: '24pt', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12pt' }}>
          {['Prepared By', 'Checked By', 'Approved By'].map((label) => (
            <div key={label} style={{ textAlign: 'center' }}>
              <div style={{ borderBottom: '0.5pt solid #94a3b8', marginBottom: '6pt', height: '32pt' }} />
              <div style={{ fontSize: '7.5pt', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#475569' }}>{label}</div>
            </div>
          ))}
        </div>

        {/* ── Footer ── */}
        <div style={{ marginTop: '12pt', borderTop: '0.5pt solid #cbd5e1', paddingTop: '4pt', display: 'flex', justifyContent: 'space-between', fontSize: '7pt', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          <span>Generated by BCIM ERP</span>
          <span>{data.bill_number} | Client Submission Document</span>
        </div>

      </div>
    </div>
  );
});

RABillClientTemplate.displayName = 'RABillClientTemplate';
export default RABillClientTemplate;
