import React from 'react';
import dayjs from 'dayjs';
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

const normalize = (v) => String(v || '').trim();

const fmt = (value, digits = 2) => {
  if (value === '' || value === null || value === undefined) return '';
  const num = Number(value);
  if (Number.isNaN(num)) return value;
  return num.toLocaleString('en-IN', { maximumFractionDigits: digits });
};

const sum = (rows, key) =>
  (rows || []).reduce((acc, r) => acc + (Number(r?.[key]) || 0), 0);

const pct = (qty, total) => {
  const q = Number(qty) || 0;
  const t = Number(total) || 0;
  if (!q || !t) return '';
  return `${((q / t) * 100).toFixed(2)}%`;
};

function toView(dpr, project) {
  const start  = project?.start_date ? dayjs(project.start_date) : null;
  const finish = project?.end_date   ? dayjs(project.end_date)   : null;
  const report = dpr?.report_date    ? dayjs(dpr.report_date)    : dayjs();

  const totalDuration = start && finish ? Math.max(0, finish.diff(start, 'day') + 1) : 0;
  const elapsed       = start ? Math.max(0, report.diff(start, 'day') + 1) : 0;
  const balance       = finish ? Math.max(0, finish.diff(report, 'day')) : 0;

  const workRows      = (dpr?.work_items     || []).filter(r => normalize(r.description));
  const steelRows     = (dpr?.steel          || []).filter(r => normalize(r.dia));
  const directWorkers = dpr?.direct_workers  || [];
  const subcontractors= dpr?.subcontractors  || [];
  const staff         = dpr?.staff           || [];
  const plant         = dpr?.plant_items     || [];

  return {
    projectName   : project?.name || dpr?.project_name || '',
    employer      : project?.client || project?.customer_name || 'Divyasree Infrastructure Projects Pvt Ltd',
    contractNo    : project?.contract_number || project?.code || '',
    mainContractor: project?.contractor || 'BCIM Engineering Pvt Ltd',
    reportDate    : report.format('DD-MM-YYYY'),
    projectStart  : start  ? start.format('DD-MM-YYYY')  : '',
    projectFinish : finish ? finish.format('DD-MM-YYYY') : '',
    totalDuration, elapsed, balance,
    rainLog       : dpr?.rain_log || 'Normal',
    weather       : dpr?.weather  || 'Normal',
    workRows, steelRows, directWorkers, subcontractors, staff, plant,
    totalStaff    : sum(staff,          'nos'),
    directDay     : sum(directWorkers,  'day'),
    directNight   : sum(directWorkers,  'night'),
    subDay        : sum(subcontractors, 'day'),
    subNight      : sum(subcontractors, 'night'),
    steelReceiptDay  : sum(steelRows, 'receipts_today'),
    steelReceiptTill : sum(steelRows, 'receipts_till_date'),
    steelAvailable   : sum(steelRows, 'available'),
    steelConsumption : sum(steelRows, 'consumption'),
    constraints   : dpr?.constraints || '',
    rfi           : dpr?.rfi || '',
    preparedBy    : dpr?.prepared_by || dpr?.submitted_by_name || '',
    approvedBy    : dpr?.approved_by || '',
  };
}

/* ─── Shared cell styles ─────────────────────────────────────── */
const border = '1px solid #000';

const th = (extra = {}) => ({
  border,
  padding: '2px 4px',
  background: '#d9d9d9',
  fontWeight: 700,
  fontSize: 7.5,
  textAlign: 'center',
  verticalAlign: 'middle',
  whiteSpace: 'nowrap',
  ...extra,
});

const td = (extra = {}) => ({
  border,
  padding: '2px 4px',
  fontSize: 7.5,
  verticalAlign: 'middle',
  ...extra,
});

const sectionTitle = (extra = {}) => ({
  border,
  padding: '3px 6px',
  background: '#bfbfbf',
  fontWeight: 700,
  fontSize: 8,
  textAlign: 'center',
  letterSpacing: 0.5,
  textTransform: 'uppercase',
  ...extra,
});

/* ─── Main Component ─────────────────────────────────────────── */
export default function DPRPrintTemplate({ dpr, project }) {
  const v = toView(dpr, project);

  const workRows  = v.workRows.slice(0, 13);
  const staffRows = v.staff.slice(0, 9);
  const dwRows    = v.directWorkers.slice(0, 9);
  const scRows    = v.subcontractors.slice(0, 9);
  const plantRows = v.plant.filter(r => Number(r.nos) || normalize(r.item)).slice(0, 9);
  const steelRows = v.steelRows.slice(0, 8);

  const totalDirectDay   = v.directDay;
  const totalDirectNight = v.directNight;
  const totalSubDay      = v.subDay;
  const totalSubNight    = v.subNight;
  const grandTotalDay    = totalDirectDay  + totalSubDay;
  const grandTotalNight  = totalDirectNight + totalSubNight;
  const grandTotal       = grandTotalDay + grandTotalNight;

  /* fill empty rows so tables have fixed height */
  const fillTo = (arr, n, factory) => {
    const out = [...arr];
    while (out.length < n) out.push(factory(out.length));
    return out;
  };

  const emptyWork  = (i) => ({ description: '', unit: '', boq_qty: '', planned: '', achieved: '', cumulative: '', _empty: true, _i: i });
  const emptyRow   = (i) => ({ _empty: true, _i: i });
  const emptySteel = (i) => ({ dia: '', unit: '', receipts_today: '', receipts_till_date: '', available: '', consumption: '', _empty: true });

  const filledWork  = fillTo(workRows,  13, emptyWork);
  const filledStaff = fillTo(staffRows,  9, emptyRow);
  const filledDW    = fillTo(dwRows,     9, emptyRow);
  const filledSC    = fillTo(scRows,     9, emptyRow);
  const filledPlant = fillTo(plantRows,  9, emptyRow);
  const filledSteel = fillTo(steelRows,  8, emptySteel);

  return (
    <div style={{ background: '#e8e8e8', padding: 16, fontFamily: 'Arial, Helvetica, sans-serif' }}>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          html, body { margin: 0 !important; padding: 0 !important; }
          .dpr-print-root, .dpr-print-root * { visibility: visible !important; }
          .dpr-print-root { position: absolute; left: 0; top: 0; padding: 0 !important; background: #fff !important; }
          .dpr-no-print { display: none !important; }
          @page { size: A4 landscape; margin: 6mm; }
        }
        .dpr-print-root table { border-collapse: collapse; }
      `}</style>

      <div className="dpr-no-print" style={{ marginBottom: 10, textAlign: 'center' }}>
        <button
          onClick={() => window.print()}
          style={{ background: '#1e3a5f', color: '#fff', border: 'none', padding: '8px 24px', borderRadius: 5, fontWeight: 700, cursor: 'pointer', fontSize: 13 }}
        >
          Print / Save as PDF
        </button>
      </div>

      <div className="dpr-print-root" style={{ width: 1060, margin: '0 auto', background: '#fff', padding: '8px 10px' }}>

        {/* ── TOP HEADER ─────────────────────────────────────── */}
        <table style={{ width: '100%', marginBottom: 2 }}>
          <tbody>
            <tr>
              {/* Logo */}
              <td style={{ width: 90, border, padding: 4, textAlign: 'center', verticalAlign: 'middle' }}>
                <img src={bcimLogo} alt="BCIM" style={{ height: 36, objectFit: 'contain', display: 'block', margin: '0 auto', background: '#1e3a5f', borderRadius: 3, padding: 3 }} />
              </td>
              {/* Title */}
              <td style={{ border, padding: 4, textAlign: 'center', verticalAlign: 'middle' }}>
                <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 2, textTransform: 'uppercase' }}>Daily Progress Report</div>
                <div style={{ fontSize: 8.5, color: '#555', marginTop: 2 }}>{v.projectName || '—'}</div>
              </td>
              {/* QR */}
              <td style={{ width: 50, border, padding: 4, textAlign: 'center', verticalAlign: 'middle' }}>
                <QRCodeSVG value={`${getPublicAppOrigin()}/verify/dpr/${dpr.id}`} size={36} />
              </td>
              {/* Right info box */}
              <td style={{ width: 260, border, padding: 0, verticalAlign: 'top' }}>
                <table style={{ width: '100%' }}>
                  <tbody>
                    <InfoRow label="Report Date"    value={v.reportDate} />
                    <InfoRow label="Contract No."   value={v.contractNo || '—'} />
                    <InfoRow label="Start Date"     value={v.projectStart || '—'} />
                    <InfoRow label="Finish Date"    value={v.projectFinish || '—'} />
                    <InfoRow label="Duration"       value={`${v.totalDuration} days  |  Elapsed: ${v.elapsed}  |  Balance: ${v.balance}`} />
                  </tbody>
                </table>
              </td>
            </tr>
            <tr>
              <td style={{ border, padding: '2px 6px', fontSize: 7.5, fontWeight: 700, textAlign: 'center', background: '#f0f0f0' }}>Employer</td>
              <td style={{ border, padding: '2px 8px', fontSize: 8 }}>{v.employer}</td>
              <td style={{ border, padding: '2px 8px', fontSize: 8, fontWeight: 700 }}>{v.mainContractor}</td>
            </tr>
            <tr>
              <td style={{ border, padding: '2px 6px', fontSize: 7.5, fontWeight: 700, textAlign: 'center', background: '#f0f0f0' }}>Weather / Rain</td>
              <td colSpan={2} style={{ border, padding: '2px 8px', fontSize: 8 }}>{v.weather}  &nbsp;|&nbsp;  {v.rainLog}</td>
            </tr>
          </tbody>
        </table>

        {/* ── WORK PROGRESS ──────────────────────────────────── */}
        <table style={{ width: '100%', marginBottom: 2, tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 24 }} />
            <col style={{ width: 230 }} />
            <col style={{ width: 44 }} />
            <col style={{ width: 70 }} />
            <col style={{ width: 70 }} />
            <col style={{ width: 70 }} />
            <col style={{ width: 70 }} />
            <col style={{ width: 55 }} />
          </colgroup>
          <thead>
            <tr>
              <td colSpan={8} style={sectionTitle()}>Work Progress</td>
            </tr>
            <tr>
              <th style={th({ rowSpan: 2 })}>#</th>
              <th style={th({ textAlign: 'left' })}>Activity Description</th>
              <th style={th()}>Unit</th>
              <th style={th()}>BOQ Qty</th>
              <th style={th()}>Planned<br />(Today)</th>
              <th style={th()}>Achieved<br />(Today)</th>
              <th style={th()}>Cum. Qty<br />(Till Date)</th>
              <th style={th()}>Cum. %</th>
            </tr>
          </thead>
          <tbody>
            {filledWork.map((row, i) => (
              <tr key={i} style={{ background: i % 2 === 1 ? '#f7f7f7' : '#fff' }}>
                <td style={td({ textAlign: 'center' })}>{row._empty ? '' : i + 1}</td>
                <td style={td()}>{row.description}</td>
                <td style={td({ textAlign: 'center' })}>{row.unit}</td>
                <td style={td({ textAlign: 'right' })}>{fmt(row.boq_qty)}</td>
                <td style={td({ textAlign: 'right' })}>{fmt(row.planned)}</td>
                <td style={td({ textAlign: 'right' })}>{fmt(row.achieved)}</td>
                <td style={td({ textAlign: 'right' })}>{fmt(row.cumulative)}</td>
                <td style={td({ textAlign: 'right' })}>{row._empty ? '' : pct(row.cumulative, row.boq_qty)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* ── RESOURCES ROW ──────────────────────────────────── */}
        <table style={{ width: '100%', marginBottom: 2, tableLayout: 'fixed' }}>
          <colgroup>
            {/* Staff */}
            <col style={{ width: 140 }} /><col style={{ width: 36 }} />
            {/* divider */}
            <col style={{ width: 4 }} />
            {/* Direct Workers */}
            <col style={{ width: 140 }} /><col style={{ width: 36 }} /><col style={{ width: 36 }} /><col style={{ width: 36 }} />
            {/* divider */}
            <col style={{ width: 4 }} />
            {/* Subcontractors */}
            <col style={{ width: 160 }} /><col style={{ width: 36 }} /><col style={{ width: 36 }} /><col style={{ width: 36 }} />
          </colgroup>
          <thead>
            <tr>
              <td colSpan={2}  style={sectionTitle()}>Staff</td>
              <td style={{ border: 'none' }} />
              <td colSpan={4}  style={sectionTitle()}>Daily Labour Register — Direct Workers</td>
              <td style={{ border: 'none' }} />
              <td colSpan={4}  style={sectionTitle()}>Subcontractors</td>
            </tr>
            <tr>
              <th style={th({ textAlign: 'left' })}>Category</th>
              <th style={th()}>Nos</th>
              <td style={{ border: 'none' }} />
              <th style={th({ textAlign: 'left' })}>Category</th>
              <th style={th()}>Day</th>
              <th style={th()}>Night</th>
              <th style={th()}>Total</th>
              <td style={{ border: 'none' }} />
              <th style={th({ textAlign: 'left' })}>Name / Work</th>
              <th style={th()}>Day</th>
              <th style={th()}>Night</th>
              <th style={th()}>Total</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 9 }).map((_, i) => {
              const s  = filledStaff[i] || {};
              const dw = filledDW[i]    || {};
              const sc = filledSC[i]    || {};
              return (
                <tr key={i} style={{ background: i % 2 === 1 ? '#f7f7f7' : '#fff' }}>
                  <td style={td()}>{s.category}</td>
                  <td style={td({ textAlign: 'center' })}>{s._empty ? '' : fmt(s.nos, 0)}</td>
                  <td style={{ border: 'none' }} />
                  <td style={td()}>{dw.category}</td>
                  <td style={td({ textAlign: 'center' })}>{dw._empty ? '' : fmt(dw.day, 0)}</td>
                  <td style={td({ textAlign: 'center' })}>{dw._empty ? '' : fmt(dw.night, 0)}</td>
                  <td style={td({ textAlign: 'center' })}>{dw._empty ? '' : fmt((Number(dw.day)||0)+(Number(dw.night)||0), 0)}</td>
                  <td style={{ border: 'none' }} />
                  <td style={td()}>{sc.name || sc.work}</td>
                  <td style={td({ textAlign: 'center' })}>{sc._empty ? '' : fmt(sc.day, 0)}</td>
                  <td style={td({ textAlign: 'center' })}>{sc._empty ? '' : fmt(sc.night, 0)}</td>
                  <td style={td({ textAlign: 'center' })}>{sc._empty ? '' : fmt((Number(sc.day)||0)+(Number(sc.night)||0), 0)}</td>
                </tr>
              );
            })}
            {/* Totals */}
            <tr style={{ background: '#d9d9d9', fontWeight: 700 }}>
              <td style={td({ fontWeight: 700 })}>TOTAL</td>
              <td style={td({ textAlign: 'center', fontWeight: 700 })}>{fmt(v.totalStaff, 0)}</td>
              <td style={{ border: 'none' }} />
              <td style={td({ fontWeight: 700 })}>TOTAL</td>
              <td style={td({ textAlign: 'center', fontWeight: 700 })}>{fmt(totalDirectDay, 0)}</td>
              <td style={td({ textAlign: 'center', fontWeight: 700 })}>{fmt(totalDirectNight, 0)}</td>
              <td style={td({ textAlign: 'center', fontWeight: 700 })}>{fmt(totalDirectDay + totalDirectNight, 0)}</td>
              <td style={{ border: 'none' }} />
              <td style={td({ fontWeight: 700 })}>TOTAL</td>
              <td style={td({ textAlign: 'center', fontWeight: 700 })}>{fmt(totalSubDay, 0)}</td>
              <td style={td({ textAlign: 'center', fontWeight: 700 })}>{fmt(totalSubNight, 0)}</td>
              <td style={td({ textAlign: 'center', fontWeight: 700 })}>{fmt(totalSubDay + totalSubNight, 0)}</td>
            </tr>
            <tr style={{ background: '#bfbfbf', fontWeight: 700 }}>
              <td colSpan={2} style={td({ fontWeight: 700, textAlign: 'center' })}>Grand Total Labour</td>
              <td style={{ border: 'none' }} />
              <td colSpan={4} style={td({ fontWeight: 700, textAlign: 'center' })}>Day: {fmt(grandTotalDay, 0)} &nbsp;|&nbsp; Night: {fmt(grandTotalNight, 0)} &nbsp;|&nbsp; Total: {fmt(grandTotal, 0)}</td>
              <td style={{ border: 'none' }} />
              <td colSpan={4} style={td({ fontWeight: 700, textAlign: 'center' })}>Grand Total SC: {fmt(totalSubDay + totalSubNight, 0)}</td>
            </tr>
          </tbody>
        </table>

        {/* ── PLANT & MATERIAL ROW ───────────────────────────── */}
        <table style={{ width: '100%', marginBottom: 2, tableLayout: 'fixed' }}>
          <colgroup>
            {/* Plant */}
            <col style={{ width: 200 }} /><col style={{ width: 36 }} />
            {/* divider */}
            <col style={{ width: 4 }} />
            {/* Steel */}
            <col style={{ width: 80 }} />
            <col style={{ width: 36 }} />
            <col style={{ width: 60 }} />
            <col style={{ width: 75 }} />
            <col style={{ width: 70 }} />
            <col style={{ width: 70 }} />
            <col style={{ width: 75 }} />
          </colgroup>
          <thead>
            <tr>
              <td colSpan={2}  style={sectionTitle()}>Plant &amp; Machinery</td>
              <td style={{ border: 'none' }} />
              <td colSpan={7}  style={sectionTitle()}>Material — Steel Fe 500</td>
            </tr>
            <tr>
              <th style={th({ textAlign: 'left' })}>Equipment</th>
              <th style={th()}>Nos</th>
              <td style={{ border: 'none' }} />
              <th style={th()}>Dia</th>
              <th style={th()}>Unit</th>
              <th style={th()}>Receipt<br />(Today)</th>
              <th style={th()}>Receipt<br />(Till Date)</th>
              <th style={th()}>Available<br />on Site</th>
              <th style={th()}>Consumed<br />(Today)</th>
              <th style={th()}>Consumed<br />(Cumulative)</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 9 }).map((_, i) => {
              const pl = filledPlant[i] || {};
              const st = filledSteel[i] || {};
              return (
                <tr key={i} style={{ background: i % 2 === 1 ? '#f7f7f7' : '#fff' }}>
                  <td style={td()}>{pl.item}</td>
                  <td style={td({ textAlign: 'center' })}>{pl._empty ? '' : fmt(pl.nos, 0)}</td>
                  <td style={{ border: 'none' }} />
                  <td style={td({ textAlign: 'center' })}>{st.dia}</td>
                  <td style={td({ textAlign: 'center' })}>{st.unit || (st.dia ? 'MT' : '')}</td>
                  <td style={td({ textAlign: 'right' })}>{st._empty ? '' : fmt(st.receipts_today)}</td>
                  <td style={td({ textAlign: 'right' })}>{st._empty ? '' : fmt(st.receipts_till_date)}</td>
                  <td style={td({ textAlign: 'right' })}>{st._empty ? '' : fmt(st.available)}</td>
                  <td style={td({ textAlign: 'right' })}>{st._empty ? '' : fmt(st.consumption)}</td>
                  <td style={td({ textAlign: 'right' })}>{''}</td>
                </tr>
              );
            })}
            {/* Steel totals */}
            <tr style={{ background: '#d9d9d9', fontWeight: 700 }}>
              <td style={td({ fontWeight: 700 })}>Total Plant: {fmt(sum(v.plant, 'nos'), 0)} units</td>
              <td style={td()} />
              <td style={{ border: 'none' }} />
              <td colSpan={2} style={td({ fontWeight: 700 })}>TOTAL</td>
              <td style={td({ textAlign: 'right', fontWeight: 700 })}>{fmt(v.steelReceiptDay)}</td>
              <td style={td({ textAlign: 'right', fontWeight: 700 })}>{fmt(v.steelReceiptTill)}</td>
              <td style={td({ textAlign: 'right', fontWeight: 700 })}>{fmt(v.steelAvailable)}</td>
              <td style={td({ textAlign: 'right', fontWeight: 700 })}>{fmt(v.steelConsumption)}</td>
              <td style={td()} />
            </tr>
          </tbody>
        </table>

        {/* ── FOOTER ─────────────────────────────────────────── */}
        <table style={{ width: '100%', tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '34%' }} />
            <col style={{ width: '33%' }} />
            <col style={{ width: '33%' }} />
          </colgroup>
          <tbody>
            <tr>
              <td style={sectionTitle()}>Constraints / Issues</td>
              <td style={sectionTitle()}>RFI / Open Items</td>
              <td style={sectionTitle()}>Signatures</td>
            </tr>
            <tr style={{ verticalAlign: 'top' }}>
              <td style={{ border, padding: '4px 6px', fontSize: 8, minHeight: 32 }}>{v.constraints || '—'}</td>
              <td style={{ border, padding: '4px 6px', fontSize: 8 }}>{v.rfi || '—'}</td>
              <td style={{ border, padding: '4px 6px', fontSize: 8 }}>
                <table style={{ width: '100%' }}>
                  <tbody>
                    <tr>
                      <td style={{ fontSize: 7.5, fontWeight: 700, paddingRight: 6, whiteSpace: 'nowrap' }}>Prepared by:</td>
                      <td style={{ fontSize: 8, borderBottom: '1px solid #999', width: '100%' }}>{v.preparedBy || ''}</td>
                    </tr>
                    <tr><td colSpan={2} style={{ height: 6 }} /></tr>
                    <tr>
                      <td style={{ fontSize: 7.5, fontWeight: 700, paddingRight: 6, whiteSpace: 'nowrap' }}>Approved by:</td>
                      <td style={{ fontSize: 8, borderBottom: '1px solid #999', width: '100%' }}>{v.approvedBy || ''}</td>
                    </tr>
                    <tr><td colSpan={2} style={{ height: 6 }} /></tr>
                    <tr>
                      <td colSpan={2} style={{ fontSize: 7, color: '#555' }}>
                        Distribution: Divyasree &nbsp;|&nbsp; BCIM
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>

      </div>
    </div>
  );
}

/* ─── Helper ─────────────────────────────────────────────────── */
function InfoRow({ label, value }) {
  return (
    <tr>
      <td style={{ border, padding: '1px 5px', fontSize: 7.5, fontWeight: 700, background: '#f0f0f0', whiteSpace: 'nowrap', width: 90 }}>{label}</td>
      <td style={{ border, padding: '1px 5px', fontSize: 7.5 }}>{value}</td>
    </tr>
  );
}
