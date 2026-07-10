import React, { forwardRef } from 'react';
import bcimLogo from '../../assets/bcim-logo.png';
import dayjs from 'dayjs';

const n   = (v) => parseFloat(v || 0);
const inr = (v) => n(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt = (d) => d ? dayjs(d).format('DD.MM.YYYY') : '—';
const pct = (v) => `${n(v).toFixed(1)}%`;

// ─── Print CSS ─────────────────────────────────────────────────────────────────
const PrintCSS = () => (
  <style>{`
    @media print {
      @page { size: A3 landscape; margin: 8mm 6mm; }
      @page mb { size: A4 portrait; margin: 10mm 8mm; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; margin: 0; }
      .sc-print-page { page-break-after: always; break-after: page; }
      .sc-print-page:last-child { page-break-after: auto; break-after: auto; }
      .sc-mb-page { page: mb; }
    }
    body { font-family: Arial, Helvetica, sans-serif; background: #fff; font-size: 9px; margin: 0; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #94a3b8; padding: 3px 5px; }
    th { font-weight: 700; text-align: center; }
  `}</style>
);

// ─── Page Header ──────────────────────────────────────────────────────────────
const PageHeader = ({ data, title, subtitle }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '3px solid #0f2044', paddingBottom: 8, marginBottom: 8 }}>
    <img src={bcimLogo} alt="BCIM" style={{ height: 48, objectFit: 'contain' }} />
    <div style={{ textAlign: 'center', flex: 1 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: '#0f2044', letterSpacing: 0.5 }}>BCIM ENGINEERING PRIVATE LIMITED</div>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#1d4ed8', marginTop: 2 }}>{title}</div>
      {subtitle && <div style={{ fontSize: 9, color: '#64748b', marginTop: 1 }}>{subtitle}</div>}
    </div>
    <div style={{ textAlign: 'right', minWidth: 120 }}>
      <div style={{ fontSize: 8, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Bill No.</div>
      <div style={{ fontSize: 16, fontWeight: 800, color: '#0f2044', fontFamily: 'monospace' }}>{data.bill_number}</div>
      <div style={{ fontSize: 8, color: '#64748b', marginTop: 2 }}>Date: {fmt(data.bill_date)}</div>
    </div>
  </div>
);

// ─── Bill Info Table ──────────────────────────────────────────────────────────
const BillInfoTable = ({ data }) => {
  const rows = [
    ['Project', data.project_name, 'Work Order No.', data.wo_number || data.contract_number],
    ['Subcontractor', data.sc_name || data.contractor_name, 'SC Code', data.sc_code || '—'],
    ['Bill Period', data.bill_period_from ? `${fmt(data.bill_period_from)} to ${fmt(data.bill_period_to)}` : '—', 'Status', (data.status || 'Draft').toUpperCase()],
    ['WO Value (incl. GST)', `Rs. ${inr(n(data.total_contract_value) * (1 + n(data.gst_rate) / 100))}`, 'GSTIN', data.sc_gstin || '—'],
  ];
  return (
    <table style={{ marginBottom: 8, fontSize: 9, border: '1px solid #cbd5e1' }}>
      <tbody>
        {rows.map(([l1, v1, l2, v2], i) => (
          <tr key={i}>
            <td style={{ background: '#f1f5f9', fontWeight: 700, width: '14%', color: '#334155' }}>{l1}</td>
            <td style={{ width: '36%', fontWeight: 500 }}>{v1 || '—'}</td>
            <td style={{ background: '#f1f5f9', fontWeight: 700, width: '14%', color: '#334155' }}>{l2}</td>
            <td style={{ width: '36%', fontWeight: 500 }}>{v2 || '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

// ─── Abstract Table ───────────────────────────────────────────────────────────
const AbstractTable = ({ data }) => {
  const items   = data.items || [];
  const gstRate = n(data.gst_rate || 18);
  const isIgst  = data.is_igst;
  const halfGst = gstRate / 2;

  const sumWoAmt   = items.reduce((s, it) => s + n(it.wo_amount),      0);
  const sumPrevAmt = items.reduce((s, it) => s + n(it.prev_amount),     0);
  const sumCurrAmt = items.reduce((s, it) => s + n(it.curr_amount),     0);
  const sumCumAmt  = items.reduce((s, it) => s + n(it.cum_amount),      0);
  const sumBalAmt  = items.reduce((s, it) => s + n(it.balance_amount),  0);

  const currGst   = sumCurrAmt * gstRate / 100;
  const currCgst  = isIgst ? 0 : currGst / 2;
  const currSgst  = isIgst ? 0 : currGst / 2;
  const currIgst  = isIgst ? currGst : 0;
  const grossWGst = sumCurrAmt + currGst;

  const deductions = [
    { label: 'Mobilisation Advance Recovery', value: n(data.mobilization_advance_recovery) },
    { label: 'Steel Advance Recovery',         value: n(data.material_recovery_steel) },
    { label: `Retention Money @ ${pct(data.retention_percent)}`, value: n(data.retention_amount) },
    { label: `TDS @ ${pct(data.tds_rate || 2)}`,                 value: n(data.tds_amount) },
    { label: 'Other Deductions',               value: n(data.other_deductions) },
  ].filter(d => d.value > 0);

  const totalDed   = deductions.reduce((s, d) => s + d.value, 0);
  const netPayable = n(data.net_payable) || (grossWGst - totalDed);

  const thBase = { background: '#1e293b', color: '#fff', fontSize: 8 };
  const thGreen  = { background: '#15803d', color: '#fff' };
  const thAmber  = { background: '#b45309', color: '#fff' };
  const thBlue   = { background: '#1d4ed8', color: '#fff' };
  const thRed    = { background: '#b91c1c', color: '#fff' };

  const colBg = (type) => {
    if (type === 'wo')   return { background: '#f0fdf4' };
    if (type === 'prev') return { background: '#fefce8' };
    if (type === 'curr') return { background: '#eff6ff', fontWeight: 700 };
    if (type === 'cum')  return { background: '#f5f3ff' };
    if (type === 'bal')  return { background: '#fff7ed', color: '#92400e' };
    return {};
  };

  return (
    <div style={{ marginBottom: 8 }}>
      <table style={{ fontSize: 8.5 }}>
        <thead>
          <tr>
            <th rowSpan={2} style={{ ...thBase, width: 28 }}>Sr.</th>
            <th rowSpan={2} style={{ ...thBase, textAlign: 'left', minWidth: 160 }}>Description of Work</th>
            <th rowSpan={2} style={{ ...thBase, width: 34 }}>Unit</th>
            <th colSpan={3} style={thGreen}>As per Work Order</th>
            <th colSpan={2} style={thAmber}>Previous Certified</th>
            <th colSpan={2} style={thBlue}>This Bill</th>
            <th colSpan={2} style={{ ...thBlue, background: '#4338ca' }}>Cumulative</th>
            <th colSpan={2} style={thRed}>Balance</th>
          </tr>
          <tr>
            <th style={{ ...thGreen, fontSize: 7.5, width: 46 }}>Qty</th>
            <th style={{ ...thGreen, fontSize: 7.5, width: 48 }}>Rate</th>
            <th style={{ ...thGreen, fontSize: 7.5, width: 68 }}>Amount</th>
            <th style={{ ...thAmber, fontSize: 7.5, width: 46 }}>Qty</th>
            <th style={{ ...thAmber, fontSize: 7.5, width: 68 }}>Amount</th>
            <th style={{ ...thBlue, fontSize: 7.5, width: 46 }}>Qty</th>
            <th style={{ ...thBlue, fontSize: 7.5, width: 68 }}>Amount</th>
            <th style={{ ...thBlue, fontSize: 7.5, background: '#4338ca', width: 46 }}>Qty</th>
            <th style={{ ...thBlue, fontSize: 7.5, background: '#4338ca', width: 68 }}>Amount</th>
            <th style={{ ...thRed, fontSize: 7.5, width: 46 }}>Qty</th>
            <th style={{ ...thRed, fontSize: 7.5, width: 68 }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
              <td style={{ textAlign: 'center', color: '#64748b' }}>{it.sr_no || i + 1}</td>
              <td style={{ textAlign: 'left' }}>
                <div style={{ fontWeight: 600, color: '#1e293b', lineHeight: 1.3 }}>{it.description}</div>
                {it.item_code && <div style={{ fontSize: 7, color: '#94a3b8', fontFamily: 'monospace' }}>{it.item_code}</div>}
              </td>
              <td style={{ textAlign: 'center', color: '#475569', fontSize: 8 }}>{it.unit || '—'}</td>
              <td style={{ ...colBg('wo'), textAlign: 'right', fontFamily: 'monospace' }}>{n(it.wo_qty).toFixed(3)}</td>
              <td style={{ ...colBg('wo'), textAlign: 'right', fontFamily: 'monospace' }}>{inr(it.rate)}</td>
              <td style={{ ...colBg('wo'), textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>{inr(it.wo_amount)}</td>
              <td style={{ ...colBg('prev'), textAlign: 'right', fontFamily: 'monospace' }}>{n(it.prev_certified_qty).toFixed(3)}</td>
              <td style={{ ...colBg('prev'), textAlign: 'right', fontFamily: 'monospace' }}>{inr(it.prev_amount)}</td>
              <td style={{ ...colBg('curr'), textAlign: 'right', fontFamily: 'monospace' }}>{n(it.current_qty).toFixed(3)}</td>
              <td style={{ ...colBg('curr'), textAlign: 'right', fontFamily: 'monospace' }}>{inr(it.curr_amount)}</td>
              <td style={{ ...colBg('cum'), textAlign: 'right', fontFamily: 'monospace' }}>{n(it.cum_qty).toFixed(3)}</td>
              <td style={{ ...colBg('cum'), textAlign: 'right', fontFamily: 'monospace' }}>{inr(it.cum_amount)}</td>
              <td style={{ ...colBg('bal'), textAlign: 'right', fontFamily: 'monospace' }}>{n(it.balance_qty).toFixed(3)}</td>
              <td style={{ ...colBg('bal'), textAlign: 'right', fontFamily: 'monospace' }}>{inr(it.balance_amount)}</td>
            </tr>
          ))}

          {/* GST Rows */}
          {!isIgst && currCgst > 0 && (
            <tr style={{ background: '#fefce8' }}>
              <td /><td style={{ fontWeight: 700, color: '#92400e' }}>CGST @ {halfGst}%</td><td />
              <td colSpan={3} style={{ ...colBg('wo'), textAlign: 'right', color: '#15803d', fontFamily: 'monospace' }}>
                {inr(sumWoAmt * halfGst / 100)}
              </td>
              <td colSpan={2} style={{ ...colBg('prev'), textAlign: 'right', fontFamily: 'monospace' }}>{inr(sumPrevAmt * halfGst / 100)}</td>
              <td colSpan={2} style={{ ...colBg('curr'), textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>{inr(currCgst)}</td>
              <td colSpan={2} style={{ ...colBg('cum') }} /><td colSpan={2} style={{ ...colBg('bal') }} />
            </tr>
          )}
          {!isIgst && currSgst > 0 && (
            <tr style={{ background: '#fefce8' }}>
              <td /><td style={{ fontWeight: 700, color: '#92400e' }}>SGST @ {halfGst}%</td><td />
              <td colSpan={3} style={{ ...colBg('wo'), textAlign: 'right', color: '#15803d', fontFamily: 'monospace' }}>
                {inr(sumWoAmt * halfGst / 100)}
              </td>
              <td colSpan={2} style={{ ...colBg('prev'), textAlign: 'right', fontFamily: 'monospace' }}>{inr(sumPrevAmt * halfGst / 100)}</td>
              <td colSpan={2} style={{ ...colBg('curr'), textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>{inr(currSgst)}</td>
              <td colSpan={2} style={{ ...colBg('cum') }} /><td colSpan={2} style={{ ...colBg('bal') }} />
            </tr>
          )}
          {isIgst && currIgst > 0 && (
            <tr style={{ background: '#fefce8' }}>
              <td /><td style={{ fontWeight: 700, color: '#92400e' }}>IGST @ {gstRate}%</td><td />
              <td colSpan={3} style={{ ...colBg('wo'), textAlign: 'right', fontFamily: 'monospace' }}>{inr(sumWoAmt * gstRate / 100)}</td>
              <td colSpan={2} style={{ ...colBg('prev'), textAlign: 'right', fontFamily: 'monospace' }}>{inr(sumPrevAmt * gstRate / 100)}</td>
              <td colSpan={2} style={{ ...colBg('curr'), textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>{inr(currIgst)}</td>
              <td colSpan={2} style={{ ...colBg('cum') }} /><td colSpan={2} style={{ ...colBg('bal') }} />
            </tr>
          )}

          {/* Total Gross Certified */}
          <tr style={{ background: '#1e293b', color: '#fff', fontWeight: 700 }}>
            <td colSpan={3} style={{ color: '#fff', textAlign: 'right', letterSpacing: '0.12em', fontSize: 8.5 }}>Total Gross Certified (incl. GST)</td>
            <td colSpan={3} style={{ textAlign: 'right', color: '#86efac', fontFamily: 'monospace' }}>{inr(sumWoAmt + sumWoAmt * gstRate / 100)}</td>
            <td colSpan={2} style={{ textAlign: 'right', color: '#fde68a', fontFamily: 'monospace' }}>{inr(sumPrevAmt + sumPrevAmt * gstRate / 100)}</td>
            <td colSpan={2} style={{ textAlign: 'right', color: '#93c5fd', fontFamily: 'monospace', fontWeight: 800, fontSize: 10 }}>{inr(grossWGst)}</td>
            <td colSpan={2} style={{ textAlign: 'right', color: '#c4b5fd', fontFamily: 'monospace' }}>{inr(sumCumAmt + sumCumAmt * gstRate / 100)}</td>
            <td colSpan={2} style={{ textAlign: 'right', color: '#fca5a5', fontFamily: 'monospace' }}>{inr(sumBalAmt + sumBalAmt * gstRate / 100)}</td>
          </tr>

          {/* Deductions header */}
          <tr style={{ background: '#fef2f2' }}>
            <td colSpan={15} style={{ fontWeight: 700, color: '#dc2626', fontSize: 9, letterSpacing: '0.1em' }}>DEDUCTIONS</td>
          </tr>
          {deductions.map((d, i) => (
            <tr key={i} style={{ background: '#fff5f5' }}>
              <td colSpan={2} />
              <td colSpan={6} style={{ color: '#991b1b', fontWeight: 600 }}>{d.label}</td>
              <td colSpan={2} style={{ textAlign: 'right', color: '#dc2626', fontFamily: 'monospace', fontWeight: 700 }}>
                (Rs. {inr(d.value)})
              </td>
              <td colSpan={5} />
            </tr>
          ))}
          <tr style={{ background: '#fecaca', fontWeight: 700 }}>
            <td colSpan={8} style={{ color: '#991b1b', textAlign: 'right', letterSpacing: '0.1em' }}>Total Deductions</td>
            <td colSpan={2} style={{ textAlign: 'right', color: '#dc2626', fontFamily: 'monospace' }}>(Rs. {inr(totalDed)})</td>
            <td colSpan={5} />
          </tr>

          {/* Net Certified */}
          <tr style={{ background: '#ecfdf5', fontWeight: 800 }}>
            <td colSpan={8} style={{ color: '#065f46', textAlign: 'right', fontSize: 10, letterSpacing: '0.12em' }}>
              NET AMOUNT PAYABLE (THIS BILL)
            </td>
            <td colSpan={2} style={{ textAlign: 'right', color: '#047857', fontFamily: 'monospace', fontWeight: 900, fontSize: 11 }}>
              Rs. {inr(netPayable)}
            </td>
            <td colSpan={5} />
          </tr>
        </tbody>
      </table>

      {/* Running totals */}
      <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
        {[
          { label: 'Previous Bills (Cumulative)', value: sumPrevAmt + sumPrevAmt * gstRate / 100, color: '#475569' },
          { label: 'This Bill — Net Payable',     value: netPayable,  color: '#1d4ed8', bold: true },
          { label: 'Cumulative Certified to Date', value: (sumPrevAmt + sumPrevAmt * gstRate / 100) + netPayable, color: '#065f46', bold: true },
        ].map((c, i) => (
          <div key={i} style={{ flex: 1, border: `1.5px solid ${c.bold ? '#6ee7b7' : '#e2e8f0'}`, borderRadius: 6, padding: '7px 10px', background: c.bold ? '#ecfdf5' : '#f8fafc' }}>
            <div style={{ fontSize: 7.5, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 2 }}>{c.label}</div>
            <div style={{ fontSize: c.bold ? 12 : 10, fontWeight: 800, color: c.color, fontFamily: 'monospace' }}>Rs. {inr(c.value)}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Signature blocks ─────────────────────────────────────────────────────────
const SigBlocks = ({ data }) => {
  const sigs = [
    { title: 'QS Engineer\n— Site',      sub: 'Sign & Stamp', name: data.submitted_by_name },
    { title: 'Site Incharge',             sub: 'Sign & Stamp' },
    { title: 'Project Manager',           sub: 'Sign & Stamp', name: data.verified_by_name },
    { title: 'Project Director',          sub: 'Sign & Stamp' },
    { title: 'QS Engineer\n— HO',        sub: 'Sign & Stamp' },
    { title: 'DGM — F&A',               sub: 'Sign & Stamp' },
    { title: 'Director',                  sub: 'Sign & Stamp', name: data.approved_by_name },
    { title: 'Managing Director',         sub: 'Sign & Stamp' },
  ];
  return (
    <div>
      <div style={{ fontSize: 8, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
        Authorised Signatures
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {sigs.map((s, i) => (
          <div key={i} style={{ flex: 1, border: '1px solid #cbd5e1', borderRadius: 5, padding: '6px 5px', textAlign: 'center', minHeight: 72 }}>
            {s.name && <div style={{ fontSize: 8, fontWeight: 700, color: '#1e293b', marginBottom: 2 }}>{s.name}</div>}
            <div style={{ height: s.name ? 24 : 36 }} />
            <div style={{ borderTop: '1.5px solid #334155', paddingTop: 3 }}>
              <div style={{ fontSize: 7.5, fontWeight: 700, color: '#1e293b', whiteSpace: 'pre-line' }}>{s.title}</div>
              <div style={{ fontSize: 7, color: '#94a3b8', marginTop: 1 }}>{s.sub}</div>
              <div style={{ fontSize: 7, color: '#94a3b8', marginTop: 3 }}>Date: ___________</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', marginTop: 3 }}>
        <div style={{ flex: 4, fontSize: 7.5, fontWeight: 700, color: '#64748b', textAlign: 'center', borderTop: '1px dashed #cbd5e1', paddingTop: 2 }}>PROJECT SITE</div>
        <div style={{ flex: 4, fontSize: 7.5, fontWeight: 700, color: '#64748b', textAlign: 'center', borderTop: '1px dashed #cbd5e1', paddingTop: 2 }}>HEAD OFFICE</div>
      </div>
    </div>
  );
};

// ─── Page footer ──────────────────────────────────────────────────────────────
const PageFooter = ({ data }) => (
  <div style={{ marginTop: 10, borderTop: '1px solid #e2e8f0', paddingTop: 6, display: 'flex', justifyContent: 'space-between', fontSize: 7.5, color: '#94a3b8' }}>
    <span>BCIM Engineering Pvt. Ltd. — Subcontractor Bill</span>
    <span>Bill No: {data.bill_number} | WO: {data.wo_number || data.contract_number}</span>
    <span>Generated: {dayjs().format('DD.MM.YYYY HH:mm')}</span>
  </div>
);

// ─── Measurement Book Page ────────────────────────────────────────────────────
const MeasurementBookPage = ({ data }) => {
  const entries = data.mb_entries || [];
  if (!entries.length) return null;

  const thStyle = { background: '#1e293b', color: '#fff', fontSize: 8, fontWeight: 700, textAlign: 'center', padding: '4px 5px' };

  return (
    <div className="sc-print-page sc-mb-page" style={{ padding: '16px 20px', background: '#fff' }}>
      <PageHeader data={data} title="MEASUREMENT BOOK" subtitle="Approved Site Measurements — QS Certified" />
      <BillInfoTable data={data} />

      <table style={{ fontSize: 8.5, marginTop: 6 }}>
        <thead>
          <tr>
            <th style={{ ...thStyle, width: 28 }}>Sr.</th>
            <th style={{ ...thStyle, width: 70 }}>MB No.</th>
            <th style={{ ...thStyle, width: 62 }}>Date</th>
            <th style={{ ...thStyle, width: 70 }}>Tower / Block</th>
            <th style={{ ...thStyle, width: 52 }}>Floor</th>
            <th style={{ ...thStyle, minWidth: 140, textAlign: 'left' }}>Description / Location</th>
            <th style={{ ...thStyle, width: 42 }}>Unit</th>
            <th style={{ ...thStyle, width: 56 }}>Prev Qty</th>
            <th style={{ ...thStyle, width: 62 }}>Exec. Qty</th>
            <th style={{ ...thStyle, width: 52 }}>Status</th>
            <th style={{ ...thStyle, textAlign: 'left', minWidth: 100 }}>Remarks</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
              <td style={{ textAlign: 'center', color: '#64748b' }}>{i + 1}</td>
              <td style={{ textAlign: 'center', fontFamily: 'monospace', fontWeight: 600, color: '#1d4ed8' }}>{e.mb_number}</td>
              <td style={{ textAlign: 'center' }}>{fmt(e.mb_date)}</td>
              <td style={{ textAlign: 'center' }}>{e.tower_block || '—'}</td>
              <td style={{ textAlign: 'center' }}>{e.floor_number || '—'}</td>
              <td style={{ textAlign: 'left' }}>
                <div style={{ fontWeight: 600, color: '#1e293b', lineHeight: 1.3 }}>{e.description}</div>
                {e.location_detail && <div style={{ fontSize: 7.5, color: '#64748b', marginTop: 1 }}>{e.location_detail}</div>}
                {e.drawing_ref    && <div style={{ fontSize: 7,   color: '#94a3b8', fontFamily: 'monospace' }}>Drg: {e.drawing_ref}</div>}
              </td>
              <td style={{ textAlign: 'center', color: '#475569', fontSize: 8 }}>{e.unit || '—'}</td>
              <td style={{ textAlign: 'right', fontFamily: 'monospace', color: '#64748b' }}>{n(e.previous_qty).toFixed(3)}</td>
              <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: '#1d4ed8' }}>{n(e.executed_qty).toFixed(3)}</td>
              <td style={{ textAlign: 'center' }}>
                <span style={{
                  display: 'inline-block', padding: '1px 6px', borderRadius: 10,
                  background: e.status === 'approved' ? '#dcfce7' : '#fef3c7',
                  color: e.status === 'approved' ? '#166534' : '#92400e',
                  fontSize: 7, fontWeight: 700, textTransform: 'uppercase',
                }}>
                  {e.status}
                </span>
              </td>
              <td style={{ color: '#475569', fontSize: 8 }}>{e.remarks || '—'}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ background: '#1e293b', color: '#fff', fontWeight: 700 }}>
            <td colSpan={7} style={{ textAlign: 'right', color: '#94a3b8', letterSpacing: '0.1em', fontSize: 8 }}>
              Total Executed Quantity (This Bill)
            </td>
            <td style={{ textAlign: 'right', fontFamily: 'monospace', color: '#fde68a' }}>
              {entries.reduce((s, e) => s + n(e.previous_qty), 0).toFixed(3)}
            </td>
            <td style={{ textAlign: 'right', fontFamily: 'monospace', color: '#86efac', fontSize: 10 }}>
              {entries.reduce((s, e) => s + n(e.executed_qty), 0).toFixed(3)}
            </td>
            <td colSpan={2} />
          </tr>
        </tfoot>
      </table>

      <PageFooter data={data} />
    </div>
  );
};

// ─── Main template ─────────────────────────────────────────────────────────────
const SCBillPrintTemplate = forwardRef(({ data }, ref) => {
  if (!data) return null;
  return (
    <div ref={ref} style={{ background: '#fff' }}>
      <PrintCSS />

      {/* Page 1: Abstract */}
      <div className="sc-print-page" style={{ padding: '16px 20px', background: '#fff' }}>
        <PageHeader data={data} title="SUBCONTRACTOR RA BILL ABSTRACT" subtitle="QS Certification — Running Account Bill" />
        <BillInfoTable data={data} />
        <AbstractTable data={data} />
        <SigBlocks data={data} />
        <PageFooter data={data} />
      </div>

      {/* Page 2: Measurement Book (only if entries exist) */}
      <MeasurementBookPage data={data} />
    </div>
  );
});

SCBillPrintTemplate.displayName = 'SCBillPrintTemplate';
export default SCBillPrintTemplate;
