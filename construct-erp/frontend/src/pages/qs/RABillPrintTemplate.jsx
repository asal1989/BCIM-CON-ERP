import React, { forwardRef } from 'react';
import {
  safeInr as inr,
  safeDate,
  PrintPage,
  SectionTitle,
  SignatureBlock,
  ProjectStrip,
  PrintHeader,
  PrintFooter,
} from './PrintComponents';

const getPublicAppOrigin = () => {
  const configured = import.meta.env?.VITE_PUBLIC_APP_URL || import.meta.env?.VITE_APP_URL || import.meta.env?.VITE_APP_ORIGIN;
  if (configured) return configured.replace(/\/$/, '');
  if (typeof window === 'undefined') return '';
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return 'http://bcim.ddns.net:3000';
  return window.location.origin;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const money = (value) => inr(value);

const moneyChange = (value) => {
  const num = Number(value || 0);
  if (num === 0) return 'Rs. 0.00';
  return num > 0 ? `+ ${money(num)}` : `- ${money(Math.abs(num))}`;
};

/** Diff between two numbers (contractor - qs). Returns { value, sign } */
const diff = (qs, con) => {
  const d = Number(con || 0) - Number(qs || 0);
  return { value: d, sign: d > 0 ? 'pos' : d < 0 ? 'neg' : 'zero' };
};

const DiffCell = ({ qs, con, isMoney = false }) => {
  const { value, sign } = diff(qs, con);
  if (sign === 'zero') return <span className="text-slate-400 text-[9px]">—</span>;
  const color = sign === 'pos' ? 'text-amber-700' : 'text-emerald-700';
  const arrow = sign === 'pos' ? '▲' : '▼';
  const display = isMoney ? money(Math.abs(value)) : Math.abs(value).toFixed(3);
  return (
    <span className={`font-mono font-semibold text-[9px] ${color}`}>
      {arrow} {display}
    </span>
  );
};

// Shared column header colours
const QS_HEAD    = 'bg-blue-800 text-white';
const CON_HEAD   = 'bg-amber-700 text-white';
const QS_CELL    = 'bg-blue-50 text-blue-900 border-l-2 border-blue-400';
const CON_CELL   = 'bg-amber-50 text-amber-900 border-r-2 border-amber-400';
const DIFF_CELL  = 'bg-slate-50 text-slate-700';

// ─── Sub-components ────────────────────────────────────────────────────────────

const LegendBadges = () => (
  <div className="flex items-center gap-4 mb-3">
    <div className="flex items-center gap-1.5">
      <span className="inline-block w-3 h-3 rounded-sm bg-blue-600" />
      <span className="text-[8.5px] font-bold text-blue-700 uppercase tracking-[0.12em]">QS Certified (BCIM)</span>
    </div>
    <div className="flex items-center gap-1.5">
      <span className="inline-block w-3 h-3 rounded-sm bg-amber-600" />
      <span className="text-[8.5px] font-bold text-amber-700 uppercase tracking-[0.12em]">Contractor Claimed</span>
    </div>
  </div>
);

const SummaryCard = ({ label, qs, con, highlight }) => (
  <div className={`rounded-xl border p-3 ${highlight ? 'bg-slate-950 border-slate-950' : 'bg-white border-slate-200'}`}>
    <div className={`text-[7.5px] uppercase tracking-[0.22em] font-bold mb-2 ${highlight ? 'text-slate-300' : 'text-slate-500'}`}>
      {label}
    </div>
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[7px] font-bold px-1.5 py-0.5 rounded ${highlight ? 'bg-blue-800 text-blue-100' : 'bg-blue-100 text-blue-700'}`}>QS</span>
        <span className={`font-mono font-bold text-[12px] leading-none ${highlight ? 'text-white' : 'text-slate-900'}`}>{money(qs)}</span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[7px] font-bold px-1.5 py-0.5 rounded ${highlight ? 'bg-amber-700 text-amber-100' : 'bg-amber-100 text-amber-700'}`}>CON</span>
        <span className={`font-mono font-bold text-[12px] leading-none ${highlight ? 'text-amber-300' : 'text-slate-700'}`}>{money(con)}</span>
      </div>
    </div>
  </div>
);

const InfoRow = ({ label, value }) => (
  <div className="flex items-start justify-between gap-4">
    <span className="text-slate-500 uppercase tracking-[0.18em] text-[8.5px] font-bold">{label}</span>
    <span className="text-slate-900 text-[9.5px] font-semibold text-right">{value || '---'}</span>
  </div>
);

const SummaryLine = ({ label, qsValue, conValue, bold, indent }) => (
  <div className={`flex items-center gap-2 py-1 ${indent ? 'pl-3' : ''} ${bold ? 'border-t border-slate-200 mt-1 pt-2' : ''}`}>
    <span className={`flex-1 text-[8.5px] uppercase tracking-[0.14em] font-bold ${bold ? 'text-slate-900' : 'text-slate-600'}`}>
      {label}
    </span>
    <span className={`font-mono font-semibold text-[9.5px] ${QS_CELL} px-2 py-0.5 rounded min-w-[110px] text-right`}>
      {qsValue}
    </span>
    <span className={`font-mono font-semibold text-[9.5px] ${CON_CELL} px-2 py-0.5 rounded min-w-[110px] text-right`}>
      {conValue}
    </span>
  </div>
);

// ─── Page 1: Abstract & Summary Cards ─────────────────────────────────────────

const AbstractPage = ({ data, variations }) => {
  const qs  = data.qs  || {};
  const con = data.con || {};
  const items = data.items || [];

  const projectItems = [
    { label: 'Project',     value: data.project_name },
    { label: 'Work Order',  value: data.contract_number || '---' },
    { label: 'Contractor',  value: data.contractor_name || '---' },
    { label: 'Bill Period', value: `${safeDate(data.bill_period_from)} to ${safeDate(data.bill_period_to)}` },
  ];

  const summaryCards = [
    { label: 'Work Order Value (incl. GST)', qs: qs.work_order_value,  con: con.work_order_value },
    { label: 'Net Work Done (excl. GST)',    qs: qs.net_work_done,     con: con.net_work_done    },
    { label: 'Total Gross Certified (18%)',  qs: qs.gross_certified,   con: con.gross_certified  },
    { label: 'Total Deductions',             qs: qs.total_deductions,  con: con.total_deductions },
    { label: 'Mobilisation Advance Recovery',qs: qs.advance_recovery,  con: con.advance_recovery },
    { label: '✦ Total Net Certified (Payable)', qs: qs.net_payable, con: con.net_payable, highlight: true },
  ];

  const chapterGroups = groupItemsByChapter(items);

  return (
    <PrintPage orientation="landscape">
      <PrintHeader title="ABSTRACT" subtitle="ITEM-WISE CERTIFIED SCHEDULE" billNumber={data.bill_number} qrUrl={`${getPublicAppOrigin()}/verify/ra-bill/${data.id}`} />
      <ProjectStrip items={projectItems} />

      <div className="px-7 py-5">
        <LegendBadges />

        {/* Summary cards grid */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          {summaryCards.map((card) => (
            <SummaryCard key={card.label} {...card} />
          ))}
        </div>

        {/* Chapter summary + Certification details */}
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 px-4 py-2 border-b border-slate-200">
              <div className="text-[9.5px] font-bold uppercase tracking-[0.22em] text-slate-700">Chapter Summary</div>
            </div>
            <div className="p-4">
              <div className="flex gap-2 mb-2">
                <span className="text-[7.5px] font-bold text-slate-400 uppercase tracking-[0.1em] flex-1">Chapter</span>
                <span className="text-[7.5px] font-bold text-slate-400 uppercase tracking-[0.1em] flex-1">Name</span>
                <span className="text-[7.5px] font-bold text-blue-500 uppercase tracking-[0.1em] w-20 text-right">QS Amt</span>
                <span className="text-[7.5px] font-bold text-amber-600 uppercase tracking-[0.1em] w-20 text-right">CON Amt</span>
              </div>
              {chapterGroups.map((chapter) => {
                const qsAmt  = chapter.items.reduce((s, i) => s + Number(i.qs_amount  || Number(i.current_qty || 0) * Number(i.rate || 0)), 0);
                const conAmt = chapter.items.reduce((s, i) => s + Number(i.con_amount || qsAmt), 0);
                return (
                  <div key={`${chapter.chapter_no}-${chapter.chapter_name}`}
                       className="flex gap-2 py-1.5 border-t border-slate-100 items-center">
                    <span className="font-mono font-bold text-[9px] text-slate-900 flex-shrink-0 w-8">{formatChapterNo(chapter.chapter_no)}</span>
                    <span className="font-semibold text-[9px] text-slate-700 flex-1 truncate">{chapter.chapter_name || '---'}</span>
                    <span className={`font-mono text-[9px] font-semibold w-20 text-right ${QS_CELL} px-1 rounded`}>{money(qsAmt)}</span>
                    <span className={`font-mono text-[9px] font-semibold w-20 text-right ${CON_CELL} px-1 rounded`}>{money(conAmt)}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 px-4 py-2 border-b border-slate-200">
              <div className="text-[9.5px] font-bold uppercase tracking-[0.22em] text-slate-700">Certification Details</div>
            </div>
            <div className="p-4 space-y-2.5 text-[9.5px]">
              <InfoRow label="Bill Status"   value={data.status || 'Submitted'} />
              <InfoRow label="Bill Date"     value={safeDate(data.bill_date)} />
              <InfoRow label="Invoice No."   value={data.invoice_number || '---'} />
              <InfoRow label="Prepared By"   value={data.submitted_by_name || '---'} />
              <InfoRow label="Checked By"    value={data.verified_by_name  || '---'} />
              <InfoRow label="Approved By"   value={data.approved_by_name  || '---'} />
            </div>
          </div>
        </div>
      </div>

      <PrintFooter />
    </PrintPage>
  );
};

// ─── Page 2+: Chapter Item Pages (BOQ comparison) ─────────────────────────────

const ChapterPage = ({ chapter, billNumber, billId }) => {
  const qsTotal  = chapter.items.reduce((s, i) => s + Number(i.qs_amount  || Number(i.current_qty || 0) * Number(i.rate || 0)), 0);
  const conTotal = chapter.items.reduce((s, i) => s + Number(i.con_amount || qsTotal / chapter.items.length), 0);

  return (
    <PrintPage orientation="landscape">
      <PrintHeader
        title={`CHAPTER ${formatChapterNo(chapter.chapter_no)} — ${chapter.chapter_name || 'UNSPECIFIED'}`}
        subtitle="ITEM-WISE BOQ — QS VS CONTRACTOR"
        billNumber={billNumber}
        qrUrl={billId ? `${getPublicAppOrigin()}/verify/ra-bill/${billId}` : undefined}
      />
      <ProjectStrip items={[
        { label: 'Chapter',  value: `Chapter ${formatChapterNo(chapter.chapter_no)}` },
        { label: 'Name',     value: chapter.chapter_name || '---' },
        { label: 'Items',    value: String(chapter.items.length) },
        { label: 'QS Total', value: money(qsTotal) },
      ]} />

      <div className="px-7 py-4">
        <LegendBadges />
        <div className="rounded-xl border border-slate-300 overflow-hidden">
          <table className="w-full text-[8.5px] text-left border-collapse">
            <thead>
              {/* Row 1: group headers */}
              <tr className="bg-slate-900 text-white uppercase tracking-[0.14em]">
                <th rowSpan={2} className="px-2 py-2 w-10 text-center border-r border-slate-700">Sr</th>
                <th rowSpan={2} className="px-2 py-2 border-r border-slate-700" style={{ minWidth: 160 }}>Description</th>
                <th rowSpan={2} className="px-2 py-2 w-10 text-center border-r border-slate-700">Unit</th>
                <th rowSpan={2} className="px-2 py-2 w-16 text-right border-r border-slate-700">BOQ Qty</th>
                <th rowSpan={2} className="px-2 py-2 w-14 text-right border-r border-slate-700">Rate</th>
                <th colSpan={2} className={`px-2 py-1.5 text-center border-r border-slate-700 ${QS_HEAD}`}>QS Certified</th>
                <th colSpan={2} className={`px-2 py-1.5 text-center border-r border-slate-700 ${CON_HEAD}`}>Contractor Claimed</th>
                <th rowSpan={2} className="px-2 py-2 w-16 text-center">Diff Qty</th>
              </tr>
              {/* Row 2: sub-headers */}
              <tr className="bg-slate-800 text-white text-[7.5px] uppercase tracking-[0.12em]">
                <th className={`px-2 py-1.5 w-16 text-right border-r border-slate-700 ${QS_HEAD}`}>Qty</th>
                <th className={`px-2 py-1.5 w-20 text-right border-r border-slate-700 ${QS_HEAD}`}>Amount</th>
                <th className={`px-2 py-1.5 w-16 text-right border-r border-slate-700 ${CON_HEAD}`}>Qty</th>
                <th className={`px-2 py-1.5 w-20 text-right border-r border-slate-700 ${CON_HEAD}`}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {chapter.items.map((item, index) => {
                const qsQty    = Number(item.current_qty    || item.qs_qty    || 0);
                const conQty   = Number(item.con_current_qty || item.con_qty  || qsQty);
                const rate     = Number(item.rate            || 0);
                const qsAmt    = Number(item.qs_amount       || qsQty  * rate);
                const conAmt   = Number(item.con_amount      || conQty * rate);
                const { value: dQty, sign } = diff(qsQty, conQty);
                const diffColor = sign === 'pos' ? 'text-amber-700' : sign === 'neg' ? 'text-emerald-700' : 'text-slate-400';

                return (
                  <tr key={item.id || index} className={index % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                    <td className="px-2 py-1.5 border-r border-slate-200 text-center font-mono text-slate-500">{item.sr_no || item.item_no || index + 1}</td>
                    <td className="px-2 py-1.5 border-r border-slate-200">
                      <div className="font-semibold text-slate-900 leading-snug text-[8.5px]">{item.description || '---'}</div>
                      {item.item_code && <div className="text-[7.5px] text-slate-400 font-mono mt-0.5">{item.item_code}</div>}
                    </td>
                    <td className="px-2 py-1.5 border-r border-slate-200 text-center text-slate-500 uppercase text-[8px]">{item.unit || '---'}</td>
                    <td className="px-2 py-1.5 border-r border-slate-200 text-right font-mono text-slate-600">{Number(item.boq_qty || 0).toFixed(3)}</td>
                    <td className="px-2 py-1.5 border-r border-slate-200 text-right font-mono text-slate-700">{money(rate)}</td>
                    {/* QS */}
                    <td className={`px-2 py-1.5 border-r border-blue-200 text-right font-mono ${QS_CELL}`}>{qsQty.toFixed(3)}</td>
                    <td className={`px-2 py-1.5 border-r border-slate-200 text-right font-mono font-semibold ${QS_CELL}`}>{money(qsAmt)}</td>
                    {/* Contractor */}
                    <td className={`px-2 py-1.5 border-r border-amber-200 text-right font-mono ${CON_CELL}`}>{conQty.toFixed(3)}</td>
                    <td className={`px-2 py-1.5 border-r border-slate-200 text-right font-mono font-semibold ${CON_CELL}`}>{money(conAmt)}</td>
                    {/* Diff */}
                    <td className={`px-2 py-1.5 text-center ${DIFF_CELL}`}>
                      {sign !== 'zero' ? (
                        <span className={`font-mono font-semibold text-[8px] ${diffColor}`}>
                          {sign === 'pos' ? '▲' : '▼'} {Math.abs(dQty).toFixed(3)}
                        </span>
                      ) : (
                        <span className="text-slate-300 text-[8px]">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-900 text-white">
                <td colSpan={5} className="px-3 py-2.5 text-right text-[8.5px] uppercase tracking-[0.2em] border-r border-slate-700">
                  Chapter Total
                </td>
                <td className={`px-2 py-2.5 border-r border-blue-700 text-right font-mono font-bold text-[9px] ${QS_HEAD}`} colSpan={2}>
                  {money(qsTotal)}
                </td>
                <td className={`px-2 py-2.5 border-r border-amber-700 text-right font-mono font-bold text-[9px] ${CON_HEAD}`} colSpan={2}>
                  {money(conTotal)}
                </td>
                <td className="px-2 py-2.5 text-center">
                  <DiffCell qs={qsTotal} con={conTotal} isMoney />
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <PrintFooter />
    </PrintPage>
  );
};

// ─── Page: Deductions ──────────────────────────────────────────────────────────

const DeductionsPage = ({ data }) => {
  const qs  = data.qs  || {};
  const con = data.con || {};

  const projectItems = [
    { label: 'Project',    value: data.project_name },
    { label: 'Work Order', value: data.contract_number || '---' },
    { label: 'Contractor', value: data.contractor_name || '---' },
    { label: 'Bill No.',   value: data.bill_number || '---' },
  ];

  const rows = [
    { label: 'Mobilisation Advance Recovery',    qs: qs.advance_recovery, con: con.advance_recovery, remark: '20% of bill value' },
    { label: 'Retention Money',                  qs: qs.retention,        con: con.retention,        remark: '5% of gross certified' },
    { label: 'Steel Deduction (Supply Credit)',  qs: qs.steel_deduction,  con: con.steel_deduction,  remark: 'Client-supplied steel recovery' },
    { label: 'Cement Deduction',                 qs: qs.cement_deduction, con: con.cement_deduction, remark: '' },
    { label: 'Other Deductions / TDS',           qs: qs.other_deductions, con: con.other_deductions, remark: '' },
    { label: 'Adhoc Recovery',                   qs: qs.adhoc_recovery,   con: con.adhoc_recovery,   remark: 'Nil this bill' },
  ];

  return (
    <PrintPage orientation="portrait">
      <PrintHeader title="DEDUCTIONS" subtitle="RECOVERY & DEDUCTION STATEMENT" billNumber={data.bill_number} qrUrl={`${getPublicAppOrigin()}/verify/ra-bill/${data.id}`} />
      <ProjectStrip items={projectItems} />

      <div className="px-7 py-5">
        <LegendBadges />

        <div className="rounded-xl border border-slate-300 overflow-hidden mb-5">
          <table className="w-full text-[9.5px] border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white uppercase tracking-[0.16em]">
                <th className="px-3 py-2.5 text-left border-r border-slate-700" style={{ minWidth: 200 }}>Deduction Head</th>
                <th className="px-3 py-2.5 text-right border-r border-slate-700 w-36">W.O. Cumulative</th>
                <th className={`px-3 py-2.5 text-right border-r border-blue-700 w-32 ${QS_HEAD}`}>QS — This Bill</th>
                <th className={`px-3 py-2.5 text-right border-r border-amber-700 w-32 ${CON_HEAD}`}>Contractor — This Bill</th>
                <th className="px-3 py-2.5 text-center w-24">Variance</th>
                <th className="px-3 py-2.5 text-left">Remarks</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                const qsVal  = Number(row.qs  || 0);
                const conVal = Number(row.con || 0);
                const { value: dv, sign } = diff(qsVal, conVal);
                const dColor = sign === 'pos' ? 'text-amber-700' : sign === 'neg' ? 'text-emerald-700' : 'text-slate-400';
                return (
                  <tr key={row.label} className={idx % 2 === 0 ? 'bg-red-50/30' : 'bg-red-50/10'}>
                    <td className="px-3 py-2 border-r border-slate-200 font-semibold text-slate-800">{row.label}</td>
                    <td className="px-3 py-2 border-r border-slate-200 text-right font-mono text-slate-500">—</td>
                    <td className={`px-3 py-2 border-r border-blue-100 text-right font-mono font-semibold ${QS_CELL}`}>
                      {qsVal > 0 ? `(${money(qsVal)})` : '—'}
                    </td>
                    <td className={`px-3 py-2 border-r border-amber-100 text-right font-mono font-semibold ${CON_CELL}`}>
                      {conVal > 0 ? `(${money(conVal)})` : '—'}
                    </td>
                    <td className="px-3 py-2 text-center border-r border-slate-200">
                      {sign !== 'zero' ? (
                        <span className={`font-mono font-semibold text-[8.5px] ${dColor}`}>
                          {sign === 'pos' ? '▲' : '▼'} {money(Math.abs(dv))}
                        </span>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-3 py-2 text-[8.5px] text-slate-500 italic">{row.remark || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-900 text-white">
                <td className="px-3 py-2.5 font-bold border-r border-slate-700 uppercase tracking-[0.14em]">Total Deductions</td>
                <td className="px-3 py-2.5 border-r border-slate-700" />
                <td className={`px-3 py-2.5 text-right font-bold font-mono ${QS_HEAD} border-r border-blue-700`}>
                  ({money(qs.total_deductions || 0)})
                </td>
                <td className={`px-3 py-2.5 text-right font-bold font-mono ${CON_HEAD} border-r border-amber-700`}>
                  ({money(con.total_deductions || 0)})
                </td>
                <td className="px-3 py-2.5 text-center">
                  <DiffCell qs={qs.total_deductions} con={con.total_deductions} isMoney />
                </td>
                <td />
              </tr>
              <tr style={{ background: '#0f172a' }}>
                <td className="px-3 py-3 font-bold text-white border-r border-slate-700 uppercase tracking-[0.16em] text-[10px]">
                  ✦ Total Net Certified (Payable)
                </td>
                <td className="border-r border-slate-700" />
                <td className={`px-3 py-3 text-right font-bold font-mono text-[11px] border-2 border-blue-400`}
                    style={{ background: '#1e3a8a', color: '#bfdbfe' }}>
                  {money(qs.net_payable || 0)}
                </td>
                <td className={`px-3 py-3 text-right font-bold font-mono text-[11px] border-2 border-amber-400`}
                    style={{ background: '#78350f', color: '#fde68a' }}>
                  {money(con.net_payable || 0)}
                </td>
                <td className="px-3 py-3 text-center" style={{ color: '#fbbf24', fontWeight: 700, fontSize: '10px' }}>
                  Δ {money(Math.abs(Number(con.net_payable || 0) - Number(qs.net_payable || 0)))}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Price Escalation summary */}
        <SectionTitle title="Price Escalation Summary" />
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 px-4 py-2 border-b border-slate-200">
              <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-700">RMC Price Escalation</div>
            </div>
            <div className="p-3 space-y-1.5 text-[9px]">
              <SummaryLine label="RMC Escalation" qsValue={money(qs.rmc_escalation || 0)} conValue={money(con.rmc_escalation || 0)} />
              <SummaryLine label="Steel Escalation (Negative)" qsValue={`(${money(Math.abs(qs.steel_escalation || 0))})`} conValue={`(${money(Math.abs(con.steel_escalation || 0))})`} />
              <SummaryLine label="Net Escalation" qsValue={moneyChange(Number(qs.rmc_escalation || 0) - Math.abs(Number(qs.steel_escalation || 0)))} conValue={moneyChange(Number(con.rmc_escalation || 0) - Math.abs(Number(con.steel_escalation || 0)))} bold />
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 px-4 py-2 border-b border-slate-200">
              <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-700">Steel Escalation by Diameter</div>
            </div>
            <div className="p-3 text-[9px]">
              {(data.steel_esc_rows || [
                { dia: '8mm',  qs: 26,    con: 26    },
                { dia: '10mm', qs: 4217,  con: 4217  },
                { dia: '12mm', qs: 12057, con: 12057 },
                { dia: '16mm', qs: 9513,  con: 9513  },
                { dia: '20mm', qs: 7860,  con: 7860  },
              ]).map((row) => (
                <div key={row.dia} className="flex items-center justify-between py-1 border-b border-slate-100 last:border-0">
                  <span className="font-bold text-slate-700 w-12">{row.dia}</span>
                  <span className={`font-mono text-[8.5px] ${QS_CELL} px-1.5 py-0.5 rounded w-24 text-right`}>({money(row.qs)})</span>
                  <span className={`font-mono text-[8.5px] ${CON_CELL} px-1.5 py-0.5 rounded w-24 text-right`}>({money(row.con)})</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <PrintFooter />
    </PrintPage>
  );
};

// ─── Page: Measurement Sheets ─────────────────────────────────────────────────

const MeasurementPage = ({ data }) => {
  const projectItems = [
    { label: 'Project',    value: data.project_name },
    { label: 'Work Order', value: data.contract_number || '---' },
    { label: 'Contractor', value: data.contractor_name || '---' },
    { label: 'Bill No.',   value: data.bill_number || '---' },
  ];

  const sheets = data.measurement_sheets || [];

  return (
    <PrintPage orientation="landscape">
      <PrintHeader title="MEASUREMENT" subtitle="JOINT MEASUREMENT SHEETS" billNumber={data.bill_number} qrUrl={`${getPublicAppOrigin()}/verify/ra-bill/${data.id}`} />
      <ProjectStrip items={projectItems} />

      <div className="px-7 py-4">
        {sheets.length === 0 ? (
          <div className="text-slate-400 text-[9px] uppercase tracking-[0.18em] p-6 text-center border border-dashed border-slate-200 rounded-lg">
            No measurement sheets attached to this bill.
          </div>
        ) : sheets.map((sheet, si) => (
          <div key={si} className="mb-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-1 h-4 rounded-sm bg-slate-600" />
              <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-800">
                {si + 1}. &nbsp;{sheet.title || `Sheet ${si + 1}`}
              </div>
              {sheet.cumulative_qty != null && (
                <span className="ml-auto font-mono text-[8.5px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                  Total: {Number(sheet.cumulative_qty).toFixed(3)} {sheet.unit || ''}
                </span>
              )}
            </div>
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-[8.5px] border-collapse">
                <thead>
                  <tr className="bg-slate-800 text-white uppercase tracking-[0.12em]">
                    <th className="px-2 py-2 text-center w-8 border-r border-slate-700">Sl</th>
                    <th className="px-2 py-2 text-left border-r border-slate-700" style={{ minWidth: 120 }}>Description</th>
                    <th className="px-2 py-2 text-center w-8 border-r border-slate-700">Nos</th>
                    <th className="px-2 py-2 text-right w-14 border-r border-slate-700">L (m)</th>
                    <th className="px-2 py-2 text-right w-14 border-r border-slate-700">B (m)</th>
                    <th className="px-2 py-2 text-right w-14 border-r border-slate-700">D (m)</th>
                    <th className="px-2 py-2 text-right w-16 border-r border-slate-700">Qty</th>
                    {sheet.show_levels && <>
                      <th className="px-2 py-2 text-right w-14 border-r border-slate-700">Bot. RL</th>
                      <th className="px-2 py-2 text-right w-14 border-r border-slate-700">Top RL</th>
                    </>}
                    {sheet.show_pour_card && <th className="px-2 py-2 text-center w-16">Pour Card</th>}
                  </tr>
                </thead>
                <tbody>
                  {(sheet.rows || []).map((row, ri) => (
                    <tr key={ri} className={ri % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}>
                      <td className="px-2 py-1.5 border-r border-slate-200 text-center font-mono text-slate-500">{row.sl || ri + 1}</td>
                      <td className="px-2 py-1.5 border-r border-slate-200 font-semibold text-slate-800">{row.description || '---'}</td>
                      <td className="px-2 py-1.5 border-r border-slate-200 text-center font-mono">{row.nos ?? '—'}</td>
                      <td className="px-2 py-1.5 border-r border-slate-200 text-right font-mono">{row.l != null ? Number(row.l).toFixed(3) : '—'}</td>
                      <td className="px-2 py-1.5 border-r border-slate-200 text-right font-mono">{row.b != null ? Number(row.b).toFixed(3) : '—'}</td>
                      <td className="px-2 py-1.5 border-r border-slate-200 text-right font-mono">{row.d != null ? Number(row.d).toFixed(3) : '—'}</td>
                      <td className="px-2 py-1.5 border-r border-slate-200 text-right font-mono font-semibold text-slate-900">{row.qty != null ? Number(row.qty).toFixed(3) : '—'}</td>
                      {sheet.show_levels && <>
                        <td className="px-2 py-1.5 border-r border-slate-200 text-right font-mono text-slate-600">{row.bottom_rl ?? '—'}</td>
                        <td className="px-2 py-1.5 border-r border-slate-200 text-right font-mono text-slate-600">{row.top_rl ?? '—'}</td>
                      </>}
                      {sheet.show_pour_card && <td className="px-2 py-1.5 text-center font-mono text-slate-500 text-[8px]">{row.pour_card || '—'}</td>}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-100 border-t-2 border-slate-300">
                    <td colSpan={sheet.show_levels ? (sheet.show_pour_card ? 10 : 9) : (sheet.show_pour_card ? 8 : 7)}
                        className="px-3 py-2 text-right font-bold text-[9px] text-slate-800 uppercase tracking-[0.16em]">
                      Cumulative / Present Bill Quantity
                    </td>
                    <td className="px-2 py-2 text-right font-mono font-bold text-[10px] text-slate-900">
                      {sheet.cumulative_qty != null ? Number(sheet.cumulative_qty).toFixed(3) : '—'} {sheet.unit || ''}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        ))}
      </div>

      <PrintFooter />
    </PrintPage>
  );
};

// ─── Page: Financial Summary + Sign-off ────────────────────────────────────────

const FinancialSummaryPage = ({ data, variations }) => {
  const qs  = data.qs  || {};
  const con = data.con || {};

  const projectItems = [
    { label: 'Project',    value: data.project_name },
    { label: 'Work Order', value: data.contract_number || '---' },
    { label: 'Contractor', value: data.contractor_name || '---' },
    { label: 'Bill No.',   value: data.bill_number || '---' },
  ];

  return (
    <PrintPage orientation="portrait">
      <PrintHeader title="SUMMARY" subtitle="Bill Certification Summary" billNumber={data.bill_number} qrUrl={`${getPublicAppOrigin()}/verify/ra-bill/${data.id}`} />
      <ProjectStrip items={projectItems} />

      <div className="px-7 py-5">
        {/* Financial summary table */}
        <div className="rounded-xl border border-slate-200 overflow-hidden mb-5">
          <div className="bg-slate-50 px-4 py-2 border-b border-slate-200">
            <div className="text-[9.5px] font-bold uppercase tracking-[0.22em] text-slate-700">Financial Summary</div>
          </div>
          <div className="p-4 text-[9.5px]">
            <div className="flex items-center gap-2 mb-3">
              <span className="flex-1" />
              <span className={`text-[7.5px] font-bold uppercase tracking-[0.14em] px-3 py-1 rounded ${QS_HEAD}`} style={{ width: 120, textAlign: 'center' }}>QS Certified</span>
              <span className={`text-[7.5px] font-bold uppercase tracking-[0.14em] px-3 py-1 rounded ${CON_HEAD}`} style={{ width: 120, textAlign: 'center' }}>Contractor Claimed</span>
            </div>
            <SummaryLine label="Gross Certified Value (excl. GST)" qsValue={money(qs.net_work_done || 0)} conValue={money(con.net_work_done || 0)} />
            <SummaryLine label={`CGST @ 9%`} qsValue={money(qs.cgst || 0)} conValue={money(con.cgst || 0)} indent />
            <SummaryLine label={`SGST @ 9%`} qsValue={money(qs.sgst || 0)} conValue={money(con.sgst || 0)} indent />
            <SummaryLine label="Total Gross Certified (incl. GST)" qsValue={money(qs.gross_certified || 0)} conValue={money(con.gross_certified || 0)} bold />
            <SummaryLine label="(Less) Mobilisation Advance Recovery" qsValue={`(${money(qs.advance_recovery || 0)})`} conValue={`(${money(con.advance_recovery || 0)})`} indent />
            <SummaryLine label="(Less) Retention Money" qsValue={`(${money(qs.retention || 0)})`} conValue={`(${money(con.retention || 0)})`} indent />
            <SummaryLine label="(Less) Steel Deduction" qsValue={`(${money(qs.steel_deduction || 0)})`} conValue={`(${money(con.steel_deduction || 0)})`} indent />
            <SummaryLine label="(Less) Other Deductions / TDS" qsValue={`(${money(qs.other_deductions || 0)})`} conValue={`(${money(con.other_deductions || 0)})`} indent />
            <SummaryLine label="Price Escalation (Net)" qsValue={moneyChange(Number(qs.rmc_escalation || 0) - Math.abs(Number(qs.steel_escalation || 0)))} conValue={moneyChange(Number(con.rmc_escalation || 0) - Math.abs(Number(con.steel_escalation || 0)))} />
            <div className="mt-3 pt-3 border-t-2 border-slate-900 flex items-center gap-2">
              <span className="flex-1 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-900">Net Certified Amount (Payable)</span>
              <span className={`font-mono font-bold text-[13px] px-3 py-1 rounded ${QS_HEAD}`}>{money(qs.net_payable || 0)}</span>
              <span className={`font-mono font-bold text-[13px] px-3 py-1 rounded ${CON_HEAD}`}>{money(con.net_payable || 0)}</span>
            </div>
          </div>
        </div>

        {/* Variations */}
        <SectionTitle title="Recoveries & Variations" />
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 px-4 py-2 border-b border-slate-200">
              <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-700">Recoveries</div>
            </div>
            <div className="p-3 space-y-1.5 text-[9px]">
              <SummaryLine label="Advance Recovery" qsValue={money(qs.advance_recovery || 0)} conValue={money(con.advance_recovery || 0)} />
              <SummaryLine label="Retention" qsValue={money(qs.retention || 0)} conValue={money(con.retention || 0)} />
              <SummaryLine label="Steel Deduction" qsValue={money(qs.steel_deduction || 0)} conValue={money(con.steel_deduction || 0)} />
              <SummaryLine label="Price Escalation (RMC)" qsValue={moneyChange(qs.rmc_escalation || 0)} conValue={moneyChange(con.rmc_escalation || 0)} />
              <SummaryLine label="Price Escalation (Steel)" qsValue={moneyChange(-(qs.steel_escalation || 0))} conValue={moneyChange(-(con.steel_escalation || 0))} />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 px-4 py-2 border-b border-slate-200">
              <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-700">Variations</div>
            </div>
            <div className="p-3 text-[9px]">
              {(!variations || variations.length === 0) ? (
                <div className="text-slate-400 uppercase tracking-[0.16em]">No variations certified in this bill</div>
              ) : (
                <div className="space-y-2">
                  {variations.map((v, i) => (
                    <div key={v.id || i} className="rounded-lg border border-slate-200 px-3 py-2">
                      <div className="font-bold text-slate-900 uppercase tracking-[0.12em]">{v.variation_no || `VAR-${i + 1}`}</div>
                      <div className="mt-0.5 text-slate-600 leading-snug">{v.reason || 'Variation item'}</div>
                      <div className="mt-1 flex justify-between items-center">
                        <span className="text-slate-400 uppercase tracking-[0.14em]">{v.items?.[0]?.unit || '---'}</span>
                        <span className="font-mono font-bold text-slate-900">{money(v.total_amount || 0)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sign-off */}
        <SectionTitle title="Sign-Off" />
        <div className="grid grid-cols-3 gap-4">
          <SignatureBlock label="Prepared By" role="QS Engineer"    name={data.submitted_by_name} date={data.created_at}  />
          <SignatureBlock label="Checked By"  role="Project Manager" name={data.verified_by_name}  date={data.verified_at} />
          <SignatureBlock label="Approved By" role="Management"      name={data.approved_by_name}  date={data.approved_at} />
        </div>
      </div>

      <PrintFooter />
    </PrintPage>
  );
};

// ─── Data Normalizer ──────────────────────────────────────────────────────────

/**
 * Reshapes a flat bill object (from the API) into the nested qs/con shape
 * that the template sub-pages expect.
 */
const normalizeBillData = (data) => {
  if (!data) return data;
  // If already normalized (has qs.net_payable), skip
  if (data.qs?.net_payable != null) return data;

  const gross       = parseFloat(data.gross_amount || 0);
  const gst         = parseFloat(data.gst_amount || 0);
  const gstRate     = parseFloat(data.gst_rate || 18);
  const grossWGst   = parseFloat(data.gross_with_gst || gross + gst);
  const retention   = parseFloat(data.retention_amount || 0);
  const advRec      = parseFloat(data.mobilization_advance_recovery || 0);
  const steel       = parseFloat(data.material_recovery_steel || 0);
  const cement      = parseFloat(data.material_recovery_cement || 0);
  const tds         = parseFloat(data.tds_amount || 0);
  const other       = parseFloat(data.other_deductions || 0);
  const totalDed    = parseFloat(data.total_deductions || retention + advRec + steel + cement + tds + other);
  const netPayable  = parseFloat(data.net_payable || 0);
  const contractVal = parseFloat(data.total_contract_value || 0);
  const escalation  = parseFloat(data.price_escalation || 0);
  const halfGst     = gst / 2; // CGST = SGST = 9% each when total 18%

  const qs = {
    work_order_value:  contractVal * (1 + gstRate / 100),
    net_work_done:     gross,
    cgst:              halfGst,
    sgst:              halfGst,
    gross_certified:   grossWGst,
    advance_recovery:  advRec,
    retention:         retention,
    steel_deduction:   steel,
    cement_deduction:  cement,
    other_deductions:  other + tds,
    adhoc_recovery:    0,
    total_deductions:  totalDed,
    net_payable:       netPayable,
    rmc_escalation:    escalation > 0 ? escalation : 0,
    steel_escalation:  escalation < 0 ? Math.abs(escalation) : 0,
  };

  return { ...data, qs, con: { ...qs } };
};

// ─── Main Template ─────────────────────────────────────────────────────────────

/**
 * RABillPrintTemplate
 *
 * Accepts either a flat bill object from the API (with fields like
 * gross_amount, net_payable, retention_amount, etc.) or a pre-normalized
 * object with nested qs/con shapes. normalizeBillData() handles both.
 *
 * variations: [{ id, variation_no, reason, total_amount, items }]
 */
const RABillPrintTemplate = forwardRef(({ data, variations }, ref) => {
  if (!data) return null;

  const normalizedData = normalizeBillData(data);
  const items = normalizedData.items || [];
  const chapterGroups = groupItemsByChapter(items).map((chapter) => ({
    ...chapter,
    totalAmount: chapter.items.reduce(
      (s, i) => s + Number(i.qs_amount || Number(i.current_qty || 0) * Number(i.rate || 0)),
      0,
    ),
  }));

  const hasMeasurements = (normalizedData.measurement_sheets || []).length > 0;

  return (
    <div ref={ref} className="bg-white">
      {/* Page 1: Abstract summary */}
      <AbstractPage data={normalizedData} variations={variations} />

      {/* Pages 2+: Chapter item-wise BOQ */}
      {chapterGroups.map((chapter, ci) => (
        <ChapterPage key={`${chapter.chapter_no}-${ci}`} chapter={chapter} billNumber={normalizedData.bill_number} billId={data.id} />
      ))}

      {/* Measurement sheets page */}
      {hasMeasurements && <MeasurementPage data={normalizedData} />}

      {/* Deductions page */}
      <DeductionsPage data={normalizedData} />

      {/* Financial summary + sign-off (last page) */}
      <FinancialSummaryPage data={normalizedData} variations={variations} />
    </div>
  );
});

// ─── Utilities ────────────────────────────────────────────────────────────────

const groupItemsByChapter = (items) => {
  const map = new Map();
  items.forEach((item) => {
    const key = `${item.chapter_no || '0'}::${item.chapter_name || 'Uncategorized'}`;
    if (!map.has(key)) {
      map.set(key, {
        chapter_no: item.chapter_no || '0',
        chapter_name: item.chapter_name || 'Uncategorized',
        items: [],
      });
    }
    map.get(key).items.push(item);
  });
  return Array.from(map.values()).sort((a, b) =>
    String(a.chapter_no).localeCompare(String(b.chapter_no), undefined, { numeric: true }),
  );
};

const formatChapterNo = (chapterNo) => String(chapterNo || '').trim() || '0';

export default RABillPrintTemplate;
