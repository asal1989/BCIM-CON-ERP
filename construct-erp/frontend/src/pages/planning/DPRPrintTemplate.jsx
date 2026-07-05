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
  const directWorkers = (dpr?.direct_workers || []).filter(r => normalize(r.category) && (Number(r.day) || Number(r.night)));
  const subcontractors= (dpr?.subcontractors || []).filter(r => normalize(r.name) || normalize(r.work));
  const staff         = (dpr?.staff          || []).filter(r => normalize(r.category) && Number(r.nos));
  const plant         = (dpr?.plant_items    || []).filter(r => normalize(r.item) && Number(r.nos));

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

/* ─── Palette & shared cell styles ──────────────────────────────
   Matches the navy letterhead used elsewhere in the app (Budget Control /
   BOQ print templates), replacing the previous flat gray/black print. */
const NAVY   = '#0B2E59';
const NAVY_D = '#082140';
const border = '1px solid #cbd5e1';
const borderStrong = `1.5px solid ${NAVY}`;

const th = (extra = {}) => ({
  border,
  padding: '8px 8px',
  background: '#eef2f7',
  color: '#334155',
  fontWeight: 700,
  fontSize: 10,
  lineHeight: 1.35,
  textAlign: 'center',
  verticalAlign: 'middle',
  whiteSpace: 'normal',
  wordBreak: 'break-word',
  textTransform: 'uppercase',
  letterSpacing: 0.3,
  ...extra,
});

const td = (extra = {}) => ({
  border,
  padding: '9px 11px',
  fontSize: 11.5,
  lineHeight: 1.45,
  color: '#1e293b',
  verticalAlign: 'middle',
  wordBreak: 'break-word',
  ...extra,
});

const sectionTitle = (extra = {}) => ({
  border: borderStrong,
  borderBottom: 'none',
  padding: '8px 12px',
  background: NAVY,
  color: '#fff',
  fontWeight: 700,
  fontSize: 11.5,
  textAlign: 'left',
  letterSpacing: 0.8,
  textTransform: 'uppercase',
  ...extra,
});

/* ─── Main Component ─────────────────────────────────────────── */
export default function DPRPrintTemplate({ dpr, project }) {
  const v = toView(dpr, project);
  const now = dayjs().format('DD MMM YYYY, HH:mm');

  const workRows  = v.workRows.slice(0, 14);
  const staffRows = v.staff.slice(0, 8);
  const dwRows    = v.directWorkers.slice(0, 8);
  const scRows    = v.subcontractors.slice(0, 8);
  const plantRows = v.plant.slice(0, 8);
  const steelRows = v.steelRows.slice(0, 6);

  const totalDirectDay   = v.directDay;
  const totalDirectNight = v.directNight;
  const totalSubDay      = v.subDay;
  const totalSubNight    = v.subNight;
  const grandTotalDay    = totalDirectDay  + totalSubDay;
  const grandTotalNight  = totalDirectNight + totalSubNight;
  const grandTotal       = grandTotalDay + grandTotalNight;

  const maxResourceRows = Math.max(staffRows.length, dwRows.length, scRows.length, 1);
  const maxPlantRows    = Math.max(plantRows.length, steelRows.length, 1);

  return (
    <div style={{ background: '#e8e8e8', padding: 16, fontFamily: 'Arial, Helvetica, sans-serif' }}>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          html, body { margin: 0 !important; padding: 0 !important; }
          .dpr-print-root, .dpr-print-root * { visibility: visible !important; }
          .dpr-print-root { position: absolute; left: 0; top: 0; padding: 0 !important; background: #fff !important; }
          .dpr-no-print { display: none !important; }
          @page { size: A3 landscape; margin: 12mm; }
        }
        .dpr-print-root table { border-collapse: collapse; }
      `}</style>

      <div className="dpr-no-print" style={{ marginBottom: 10, textAlign: 'center' }}>
        <button
          onClick={() => window.print()}
          style={{ background: NAVY, color: '#fff', border: 'none', padding: '9px 26px', borderRadius: 6, fontWeight: 700, cursor: 'pointer', fontSize: 13 }}
        >
          Print / Save as PDF
        </button>
      </div>

      {/* 1490px ≈ A3 landscape printable width (420mm − 2×12mm margins ≈ 396mm
          ≈ 1497 CSS px) so printing at 100% scale never clips the right edge. */}
      <div className="dpr-print-root" style={{ width: 1490, margin: '0 auto', background: '#fff', padding: '26px 34px', boxSizing: 'border-box' }}>

        {/* ── LETTERHEAD ─────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 22, paddingBottom: 18, marginBottom: 20, borderBottom: `3px solid ${NAVY}` }}>
          <img src={bcimLogo} alt="BCIM" style={{ width: 64, height: 64, objectFit: 'contain', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: NAVY, lineHeight: 1.15 }}>BCIM Engineering Pvt. Ltd.</div>
            <div style={{ fontSize: 10.5, color: '#64748b', marginTop: 4 }}>Construction &amp; Infrastructure Management &nbsp;|&nbsp; Bengaluru, Karnataka, India</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: 2, textTransform: 'uppercase', color: NAVY_D }}>Daily Progress Report</div>
            <div style={{ fontSize: 11, color: '#475569', marginTop: 4 }}>{v.projectName || '—'}</div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 10, color: '#64748b', lineHeight: 1.6 }}>
            <div style={{ fontWeight: 700, color: '#1e293b', fontSize: 11 }}>{dpr?.dpr_number}</div>
            <div>Generated: {now}</div>
          </div>
          <div style={{ padding: 7, border, borderRadius: 4 }}>
            <QRCodeSVG value={`${getPublicAppOrigin()}/verify/dpr/${dpr.id}`} size={52} />
          </div>
        </div>

        {/* ── PROJECT INFO STRIP ─────────────────────────────── */}
        <table style={{ width: '100%', marginBottom: 18, tableLayout: 'fixed' }}>
          <tbody>
            <tr>
              <InfoCell label="Employer" value={v.employer} flex={2} />
              <InfoCell label="Main Contractor" value={v.mainContractor} flex={2} />
              <InfoCell label="Contract No." value={v.contractNo || '—'} flex={1.4} />
              <InfoCell label="Report Date" value={v.reportDate} flex={1.2} accent />
            </tr>
            <tr>
              <InfoCell label="Project Start" value={v.projectStart || '—'} flex={2} />
              <InfoCell label="Project Finish" value={v.projectFinish || '—'} flex={2} />
              <InfoCell label="Duration" value={`${v.totalDuration}d total · ${v.elapsed}d elapsed · ${v.balance}d left`} flex={1.4} />
              <InfoCell label="Weather / Rain" value={`${v.weather} · ${v.rainLog}`} flex={1.2} />
            </tr>
          </tbody>
        </table>

        {/* ── WORK PROGRESS ──────────────────────────────────── */}
        <table style={{ width: '100%', marginBottom: 18, tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '3%' }} />
            <col style={{ width: '27%' }} />
            <col style={{ width: '5%' }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '9%' }} />
            <col style={{ width: '7%' }} />
            <col style={{ width: '25%' }} />
          </colgroup>
          <thead>
            <tr><td colSpan={9} style={sectionTitle()}>Work Progress</td></tr>
            <tr>
              <th style={th()}>#</th>
              <th style={th({ textAlign: 'left' })}>Activity Description</th>
              <th style={th()}>Unit</th>
              <th style={th()}>BOQ Qty</th>
              <th style={th()}>Planned<br />(Today)</th>
              <th style={th()}>Achieved<br />(Today)</th>
              <th style={th()}>Cum. Qty<br />(Till Date)</th>
              <th style={th()}>Cum. %</th>
              <th style={th({ textAlign: 'left' })}>Remarks</th>
            </tr>
          </thead>
          <tbody>
            {workRows.length === 0 && (
              <tr><td colSpan={9} style={td({ textAlign: 'center', color: '#94a3b8', fontStyle: 'italic', padding: '10px 6px' })}>No activities recorded</td></tr>
            )}
            {workRows.map((row, i) => (
              <tr key={i} style={{ background: i % 2 === 1 ? '#f8fafc' : '#fff' }}>
                <td style={td({ textAlign: 'center', color: '#94a3b8' })}>{i + 1}</td>
                <td style={td({ fontWeight: 600 })}>{row.description}</td>
                <td style={td({ textAlign: 'center' })}>{row.unit}</td>
                <td style={td({ textAlign: 'right' })}>{fmt(row.boq_qty)}</td>
                <td style={td({ textAlign: 'right' })}>{fmt(row.planned)}</td>
                <td style={td({ textAlign: 'right', fontWeight: 700, color: NAVY })}>{fmt(row.achieved)}</td>
                <td style={td({ textAlign: 'right' })}>{fmt(row.cumulative)}</td>
                <td style={td({ textAlign: 'right', fontWeight: 700 })}>{pct(row.cumulative, row.boq_qty)}</td>
                <td style={td({ fontSize: 10.5, color: '#64748b' })}>{row.remarks}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* ── RESOURCES ROW ──────────────────────────────────────
            Grid with minmax(0, fr) tracks instead of flex + width:% —
            flex refuses to shrink tables below their content width, so a
            single long subcontractor name pushed the whole row past the
            page edge. Grid tracks hard-clamp each table to its column. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,18fr) minmax(0,38fr) minmax(0,44fr)', gap: 16, marginBottom: 18 }}>
          {/* Staff */}
          <table style={{ width: '100%', tableLayout: 'fixed' }}>
            <colgroup><col style={{ width: '70%' }} /><col style={{ width: '30%' }} /></colgroup>
            <thead>
              <tr><td style={sectionTitle()}>Staff</td></tr>
              <tr><th style={th({ textAlign: 'left' })}>Category</th><th style={th()}>Nos</th></tr>
            </thead>
            <tbody>
              {Array.from({ length: maxResourceRows }).map((_, i) => {
                const s = staffRows[i];
                return (
                  <tr key={i} style={{ background: i % 2 === 1 ? '#f8fafc' : '#fff' }}>
                    <td style={td()}>{s?.category || ''}</td>
                    <td style={td({ textAlign: 'center' })}>{s ? fmt(s.nos, 0) : ''}</td>
                  </tr>
                );
              })}
              <tr style={{ background: '#eef2f7' }}>
                <td style={td({ fontWeight: 700 })}>Total</td>
                <td style={td({ textAlign: 'center', fontWeight: 700 })}>{fmt(v.totalStaff, 0)}</td>
              </tr>
            </tbody>
          </table>

          {/* Direct Workers */}
          <table style={{ width: '100%', tableLayout: 'fixed' }}>
            <colgroup><col style={{ width: '46%' }} /><col style={{ width: '18%' }} /><col style={{ width: '18%' }} /><col style={{ width: '18%' }} /></colgroup>
            <thead>
              <tr><td colSpan={4} style={sectionTitle()}>Daily Labour Register — Direct Workers</td></tr>
              <tr>
                <th style={th({ textAlign: 'left' })}>Category</th>
                <th style={th()}>Day</th><th style={th()}>Night</th><th style={th()}>Total</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: maxResourceRows }).map((_, i) => {
                const dw = dwRows[i];
                return (
                  <tr key={i} style={{ background: i % 2 === 1 ? '#f8fafc' : '#fff' }}>
                    <td style={td()}>{dw?.category || ''}</td>
                    <td style={td({ textAlign: 'center' })}>{dw ? fmt(dw.day, 0) : ''}</td>
                    <td style={td({ textAlign: 'center' })}>{dw ? fmt(dw.night, 0) : ''}</td>
                    <td style={td({ textAlign: 'center' })}>{dw ? fmt((Number(dw.day)||0)+(Number(dw.night)||0), 0) : ''}</td>
                  </tr>
                );
              })}
              <tr style={{ background: '#eef2f7' }}>
                <td style={td({ fontWeight: 700 })}>Total</td>
                <td style={td({ textAlign: 'center', fontWeight: 700 })}>{fmt(totalDirectDay, 0)}</td>
                <td style={td({ textAlign: 'center', fontWeight: 700 })}>{fmt(totalDirectNight, 0)}</td>
                <td style={td({ textAlign: 'center', fontWeight: 700 })}>{fmt(totalDirectDay + totalDirectNight, 0)}</td>
              </tr>
            </tbody>
          </table>

          {/* Subcontractors */}
          <table style={{ width: '100%', tableLayout: 'fixed' }}>
            <colgroup><col style={{ width: '52%' }} /><col style={{ width: '16%' }} /><col style={{ width: '16%' }} /><col style={{ width: '16%' }} /></colgroup>
            <thead>
              <tr><td colSpan={4} style={sectionTitle()}>Subcontractor Labour</td></tr>
              <tr>
                <th style={th({ textAlign: 'left' })}>Name / Work</th>
                <th style={th()}>Day</th><th style={th()}>Night</th><th style={th()}>Total</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: maxResourceRows }).map((_, i) => {
                const sc = scRows[i];
                return (
                  <tr key={i} style={{ background: i % 2 === 1 ? '#f8fafc' : '#fff' }}>
                    <td style={td()}>{sc ? `${sc.name || ''}${sc.work ? ` — ${sc.work}` : ''}` : ''}</td>
                    <td style={td({ textAlign: 'center' })}>{sc ? fmt(sc.day, 0) : ''}</td>
                    <td style={td({ textAlign: 'center' })}>{sc ? fmt(sc.night, 0) : ''}</td>
                    <td style={td({ textAlign: 'center' })}>{sc ? fmt((Number(sc.day)||0)+(Number(sc.night)||0), 0) : ''}</td>
                  </tr>
                );
              })}
              <tr style={{ background: '#eef2f7' }}>
                <td style={td({ fontWeight: 700 })}>Total</td>
                <td style={td({ textAlign: 'center', fontWeight: 700 })}>{fmt(totalSubDay, 0)}</td>
                <td style={td({ textAlign: 'center', fontWeight: 700 })}>{fmt(totalSubNight, 0)}</td>
                <td style={td({ textAlign: 'center', fontWeight: 700 })}>{fmt(totalSubDay + totalSubNight, 0)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Grand total labour strip */}
        <div style={{ display: 'flex', justifyContent: 'space-between', background: NAVY, color: '#fff', padding: '10px 18px', borderRadius: 4, fontSize: 11.5, fontWeight: 700, marginBottom: 18 }}>
          <span>Grand Total Labour on Site</span>
          <span>Day: {fmt(grandTotalDay, 0)} &nbsp;·&nbsp; Night: {fmt(grandTotalNight, 0)} &nbsp;·&nbsp; Total: {fmt(grandTotal, 0)}</span>
        </div>

        {/* ── PLANT & MATERIAL ROW ───────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,32fr) minmax(0,68fr)', gap: 16, marginBottom: 18 }}>
          <table style={{ width: '100%', tableLayout: 'fixed' }}>
            <colgroup><col style={{ width: '70%' }} /><col style={{ width: '30%' }} /></colgroup>
            <thead>
              <tr><td colSpan={2} style={sectionTitle()}>Plant &amp; Machinery</td></tr>
              <tr><th style={th({ textAlign: 'left' })}>Equipment</th><th style={th()}>Nos</th></tr>
            </thead>
            <tbody>
              {Array.from({ length: maxPlantRows }).map((_, i) => {
                const pl = plantRows[i];
                return (
                  <tr key={i} style={{ background: i % 2 === 1 ? '#f8fafc' : '#fff' }}>
                    <td style={td()}>{pl?.item || ''}</td>
                    <td style={td({ textAlign: 'center' })}>{pl ? fmt(pl.nos, 0) : ''}</td>
                  </tr>
                );
              })}
              <tr style={{ background: '#eef2f7' }}>
                <td style={td({ fontWeight: 700 })}>Total</td>
                <td style={td({ textAlign: 'center', fontWeight: 700 })}>{fmt(sum(v.plant, 'nos'), 0)}</td>
              </tr>
            </tbody>
          </table>

          <table style={{ width: '100%', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '11%' }} /><col style={{ width: '11%' }} />
              <col style={{ width: '19.5%' }} /><col style={{ width: '19.5%' }} />
              <col style={{ width: '13%' }} /><col style={{ width: '13%' }} /><col style={{ width: '13%' }} />
            </colgroup>
            <thead>
              <tr><td colSpan={7} style={sectionTitle()}>Material — Steel Fe 500</td></tr>
              <tr>
                <th style={th()}>Dia</th><th style={th()}>Unit</th>
                <th style={th()}>Receipt<br />(Today)</th><th style={th()}>Receipt<br />(Till Date)</th>
                <th style={th()}>Available<br />on Site</th><th style={th()}>Consumed<br />(Today)</th>
                <th style={th()}>Consumed<br />(Cumulative)</th>
              </tr>
            </thead>
            <tbody>
              {steelRows.length === 0 && (
                <tr><td colSpan={7} style={td({ textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' })}>No steel data recorded today</td></tr>
              )}
              {steelRows.map((st, i) => (
                <tr key={i} style={{ background: i % 2 === 1 ? '#f8fafc' : '#fff' }}>
                  <td style={td({ textAlign: 'center' })}>{st.dia}</td>
                  <td style={td({ textAlign: 'center' })}>{st.unit || 'MT'}</td>
                  <td style={td({ textAlign: 'right' })}>{fmt(st.receipts_today)}</td>
                  <td style={td({ textAlign: 'right' })}>{fmt(st.receipts_till_date)}</td>
                  <td style={td({ textAlign: 'right' })}>{fmt(st.available)}</td>
                  <td style={td({ textAlign: 'right' })}>{fmt(st.consumption)}</td>
                  <td style={td({ textAlign: 'right' })}>{''}</td>
                </tr>
              ))}
              {steelRows.length > 0 && (
                <tr style={{ background: '#eef2f7' }}>
                  <td colSpan={2} style={td({ fontWeight: 700 })}>Total</td>
                  <td style={td({ textAlign: 'right', fontWeight: 700 })}>{fmt(v.steelReceiptDay)}</td>
                  <td style={td({ textAlign: 'right', fontWeight: 700 })}>{fmt(v.steelReceiptTill)}</td>
                  <td style={td({ textAlign: 'right', fontWeight: 700 })}>{fmt(v.steelAvailable)}</td>
                  <td style={td({ textAlign: 'right', fontWeight: 700 })}>{fmt(v.steelConsumption)}</td>
                  <td style={td()} />
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ── FOOTER ─────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,34fr) minmax(0,30fr) minmax(0,36fr)', gap: 16 }}>
          <div>
            <div style={sectionTitle()}>Constraints / Issues</div>
            <div style={{ border, borderTop: 'none', padding: '12px 14px', fontSize: 11, lineHeight: 1.55, minHeight: 76, whiteSpace: 'pre-wrap', color: '#334155' }}>
              {v.constraints || <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>None reported</span>}
            </div>
          </div>
          <div>
            <div style={sectionTitle()}>RFI / Open Items</div>
            <div style={{ border, borderTop: 'none', padding: '12px 14px', fontSize: 11, lineHeight: 1.55, minHeight: 76, whiteSpace: 'pre-wrap', color: '#334155' }}>
              {v.rfi || <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>None</span>}
            </div>
          </div>
          <div>
            <div style={sectionTitle()}>Signatures</div>
            <div style={{ border, borderTop: 'none', padding: '14px' }}>
              <table style={{ width: '100%' }}>
                <tbody>
                  <tr>
                    <td style={{ fontSize: 10.5, fontWeight: 700, color: '#475569', paddingRight: 12, whiteSpace: 'nowrap', paddingBottom: 22 }}>Prepared by:</td>
                    <td style={{ fontSize: 11.5, borderBottom: '1px solid #94a3b8', width: '100%', paddingBottom: 5 }}>{v.preparedBy || ''}</td>
                  </tr>
                  <tr>
                    <td style={{ fontSize: 10.5, fontWeight: 700, color: '#475569', paddingRight: 12, whiteSpace: 'nowrap' }}>Approved by:</td>
                    <td style={{ fontSize: 11.5, borderBottom: '1px solid #94a3b8', width: '100%', paddingBottom: 5 }}>{v.approvedBy || ''}</td>
                  </tr>
                  <tr><td colSpan={2} style={{ height: 14 }} /></tr>
                  <tr>
                    <td colSpan={2} style={{ fontSize: 9.5, color: '#94a3b8' }}>Distribution: {v.employer} &nbsp;|&nbsp; BCIM Engineering</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

/* ─── Helper ─────────────────────────────────────────────────── */
function InfoCell({ label, value, flex, accent }) {
  return (
    <td style={{ border, padding: '9px 14px', width: `${flex * 10}%`, verticalAlign: 'top', background: accent ? '#eef2f7' : '#fff' }}>
      <div style={{ fontSize: 9.5, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: accent ? 800 : 600, color: accent ? NAVY : '#1e293b', marginTop: 4 }}>{value}</div>
    </td>
  );
}
