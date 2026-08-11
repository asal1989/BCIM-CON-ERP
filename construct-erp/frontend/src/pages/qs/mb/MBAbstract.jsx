// MBAbstract.jsx — Abstract of Measurements
// Dynamically builds BOQ rows from live boqItems + pm_approved measurements.
// Calls onAbstractComputed(rows) whenever data changes.

import { useMemo, useEffect, useState } from 'react';

const GST_RATE = 0.09; // CGST 9% + SGST 9%

const fmt = (n) =>
  typeof n === 'number' && !isNaN(n)
    ? n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '—';

const fmtQty = (n) =>
  typeof n === 'number' && !isNaN(n)
    ? n.toLocaleString('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
    : '—';

const num = (v) => parseFloat(v || 0);

const inputCls =
  'w-full text-right font-mono text-xs border border-yellow-300 rounded px-2 py-1.5 bg-yellow-50 focus:outline-none focus:ring-1 focus:ring-blue-400';

export default function MBAbstract({
  projectMeta = {},
  boqItems = [],
  measurements = [],
  voItems = [],
  onAbstractComputed,
  onDeductionsChange,
  initialDeductions = {},
}) {
  const [retentionPct,   setRetentionPct]   = useState(initialDeductions.retentionPct   ?? 5);
  const [mobAdvance,     setMobAdvance]     = useState(initialDeductions.mobAdvance     ?? 0);
  const [steelRecovery,  setSteelRecovery]  = useState(initialDeductions.steelRecovery  ?? 0);
  const [adhocDeduction, setAdhocDeduction] = useState(initialDeductions.adhocDeduction ?? 0);
  const [escRmc,   setEscRmc]   = useState(0);
  const [escSteel, setEscSteel] = useState(0);

  // Build abstract rows from live data
  const rows = useMemo(() => {
    return boqItems.map(item => {
      const prevQty    = num(item.certified_qty);
      const presentQty = measurements
        .filter(m => String(m.boq_item_id) === String(item.id))
        .reduce((s, m) => s + num(m.net_quantity), 0);
      const cumQty     = prevQty + presentQty;
      const boqQty     = num(item.quantity);
      const rate       = num(item.rate);
      const boqAmt     = boqQty  * rate;
      const prevAmt    = prevQty * rate;
      const presentAmt = presentQty * rate;
      const cumAmt     = cumQty * rate;
      const balQty     = boqQty - cumQty;
      const balAmt     = balQty * rate;
      return {
        id:          item.id,
        sr_no:       item.sr_no,
        item_no:     item.item_no,
        description: item.description,
        unit:        item.unit,
        boqQty, rate, boqAmt,
        prevQty, prevAmt,
        presentQty, presentAmt,
        cumQty, cumAmt,
        balQty, balAmt,
      };
    });
  }, [boqItems, measurements]);

  // VO items total
  const voTotal = useMemo(() =>
    voItems.reduce((s, v) => s + num(v.quantity) * num(v.rate), 0),
  [voItems]);

  // Totals
  const totals = useMemo(() => {
    const subTotal        = rows.reduce((s, r) => s + r.presentAmt, 0) + escRmc + escSteel + voTotal;
    const cgst            = subTotal * GST_RATE;
    const sgst            = subTotal * GST_RATE;
    const grossCertified  = subTotal + cgst + sgst;
    const retentionAmt    = grossCertified * (retentionPct / 100);
    const totalDeductions = retentionAmt + mobAdvance + steelRecovery + adhocDeduction;
    const netCertified    = grossCertified - totalDeductions;
    const boqTotal        = rows.reduce((s, r) => s + r.boqAmt, 0);
    return { subTotal, cgst, sgst, grossCertified, retentionAmt, totalDeductions, netCertified, boqTotal };
  }, [rows, voTotal, retentionPct, mobAdvance, steelRecovery, adhocDeduction, escRmc, escSteel]);

  // Lift computed rows to orchestrator
  useEffect(() => {
    onAbstractComputed?.(rows);
  }, [rows]); // eslint-disable-line

  // Lift deductions to orchestrator
  useEffect(() => {
    onDeductionsChange?.({ retentionPct, mobAdvance, steelRecovery, adhocDeduction });
  }, [retentionPct, mobAdvance, steelRecovery, adhocDeduction]); // eslint-disable-line

  const colClass = 'px-2 py-2 text-center text-[10px] font-medium uppercase tracking-wide leading-tight';

  return (
    <div className="min-h-screen bg-slate-100 p-4 font-sans">
      <div className="max-w-[1400px] mx-auto space-y-4">

        {/* Page Header */}
        <div className="rounded-xl overflow-hidden shadow">
          <div className="bg-[#1F3864] px-6 py-4 flex items-center justify-between">
            <div>
              <p className="text-xs tracking-widest text-blue-300 uppercase">Measurement Book</p>
              <h2 className="text-xl font-medium text-white">Abstract of Measurements</h2>
            </div>
            <div className="text-right text-xs text-blue-200 space-y-0.5">
              <p>Bill: {projectMeta.ra_bill_no || '—'}</p>
              <p>{projectMeta.invoice_ref || ''}</p>
            </div>
          </div>
          {projectMeta.project?.name && (
            <div className="bg-[#D9E1F2] px-6 py-2 grid grid-cols-3 text-xs text-slate-900 gap-4">
              <span><b>Project:</b> {projectMeta.project?.name}</span>
              <span><b>Package:</b> {projectMeta.package_desc || '—'}</span>
              <span><b>Period:</b> {projectMeta.bill_period_from || '—'} to {projectMeta.bill_period_to || '—'}</span>
            </div>
          )}
        </div>

        {/* Main Table */}
        <div className="bg-white rounded-xl shadow overflow-x-auto">
          <table className="w-full text-xs border-collapse min-w-[1100px]">
            <thead>
              <tr className="bg-[#1F3864] text-white">
                <th className={`${colClass} w-8`}    rowSpan={2}>Sr.</th>
                <th className={`${colClass} text-left`} rowSpan={2}>Description</th>
                <th className={`${colClass} w-10`}   rowSpan={2}>Unit</th>
                <th className={`${colClass} w-16`}   rowSpan={2}>BOQ Qty</th>
                <th className={`${colClass} w-20`}   rowSpan={2}>Rate (₹)</th>
                <th className={`${colClass} w-24`}   rowSpan={2}>BOQ Amt (₹)</th>
                <th className={colClass}             colSpan={2}>Previous Bill</th>
                <th className={`${colClass} bg-[#2E75B6]`} colSpan={2}>Present Bill</th>
                <th className={colClass}             colSpan={2}>Cumulative</th>
                <th className={`${colClass} w-16`}   rowSpan={2}>Bal Qty</th>
              </tr>
              <tr className="bg-[#2E75B6] text-white">
                <th className={`${colClass} w-16`}>Qty</th>
                <th className={`${colClass} w-22`}>Amt (₹)</th>
                <th className={`${colClass} w-20 bg-[#1F5694]`}>Qty</th>
                <th className={`${colClass} w-24 bg-[#1F5694]`}>Amt (₹)</th>
                <th className={`${colClass} w-16`}>Qty</th>
                <th className={`${colClass} w-24`}>Amt (₹)</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={13} className="py-12 text-center text-slate-900 font-medium italic">
                    No BOQ items found for this project.
                  </td>
                </tr>
              ) : rows.map((r, idx) => (
                <tr
                  key={r.id}
                  className={`border-b border-slate-100 transition-colors ${
                    idx % 2 === 0 ? 'bg-white hover:bg-blue-50' : 'bg-slate-50 hover:bg-blue-50'
                  }`}
                >
                  <td className="px-2 py-1.5 text-center text-slate-900 font-medium text-xs">{idx + 1}</td>
                  <td className="px-2 py-1.5 text-left text-slate-900 font-medium leading-tight text-xs">
                    <span className="text-[9px] text-slate-900 font-medium block">{r.sr_no}</span>
                    {r.description}
                  </td>
                  <td className="px-2 py-1.5 text-center text-slate-900 text-xs">{r.unit}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-slate-900 text-xs">{fmtQty(r.boqQty)}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-slate-900 text-xs">{fmt(r.rate)}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-slate-900 font-medium text-xs">{fmt(r.boqAmt)}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-slate-900 text-xs">{fmtQty(r.prevQty)}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-slate-900 text-xs">{fmt(r.prevAmt)}</td>
                  <td className="px-2 py-1.5 text-right font-mono font-medium text-blue-800 bg-blue-50 text-xs">{fmtQty(r.presentQty)}</td>
                  <td className="px-2 py-1.5 text-right font-mono font-medium text-blue-800 bg-blue-50 text-xs">{fmt(r.presentAmt)}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-slate-900 text-xs">{fmtQty(r.cumQty)}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-slate-900 text-xs">{fmt(r.cumAmt)}</td>
                  <td className={`px-2 py-1.5 text-right font-mono text-xs ${r.balQty < 0 ? 'text-red-600 font-bold' : 'text-slate-600'}`}>
                    {fmtQty(r.balQty)}
                  </td>
                </tr>
              ))}

              {/* Escalation rows */}
              {[
                { label: 'RMC Price Escalation',   val: escRmc,   set: setEscRmc },
                { label: 'Steel Price Escalation',  val: escSteel, set: setEscSteel },
              ].map(({ label, val, set }) => (
                <tr key={label} className="bg-amber-50 border-b border-amber-100">
                  <td />
                  <td className="px-2 py-1.5 italic text-amber-800 font-medium text-xs">{label}</td>
                  <td colSpan={7} />
                  <td className="px-1 py-1 bg-yellow-50">
                    <input
                      type="number" step="0.01" value={val}
                      onChange={e => set(parseFloat(e.target.value) || 0)}
                      className={inputCls}
                    />
                  </td>
                  <td colSpan={3} />
                </tr>
              ))}
            </tbody>

            {/* ── Extra / Variation Items ── */}
            {voItems.length > 0 && (
              <>
                <tr className="bg-amber-50">
                  <td colSpan={13} className="px-4 py-2 text-xs font-medium text-amber-800 uppercase tracking-widest border-t-2 border-amber-300">
                    Extra Items / Variation Orders
                  </td>
                </tr>
                {voItems.map((v, idx) => (
                  <tr key={v.id} className="bg-amber-50/60 border-b border-amber-100">
                    <td className="px-2 py-1.5 text-center text-slate-900 font-medium text-xs">{rows.length + idx + 1}</td>
                    <td className="px-2 py-1.5 text-left text-xs">
                      <span className="text-[9px] text-amber-600 font-medium block">{v.vo_number}</span>
                      <span className="text-black">{v.new_item_description || v.boq_description || '—'}</span>
                      {v.reason && <span className="text-[9px] text-slate-900 font-medium block">{v.reason}</span>}
                    </td>
                    <td className="px-2 py-1.5 text-center text-slate-900 text-xs">{v.unit}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-slate-900 text-xs">{fmtQty(num(v.quantity))}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-slate-900 text-xs">{fmt(num(v.rate))}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-amber-800 font-medium text-xs">{fmt(num(v.quantity) * num(v.rate))}</td>
                    {/* prev/present/cum/bal — N/A for VO items */}
                    <td className="px-2 py-1.5 text-center text-slate-300 text-xs" colSpan={7}>—</td>
                  </tr>
                ))}
                <tr className="bg-amber-100 border-b border-amber-200">
                  <td colSpan={5} className="px-4 py-1.5 text-right text-xs font-medium text-amber-800 uppercase tracking-wide">
                    Extra Items Sub-Total
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono font-medium text-amber-900 text-xs">{fmt(voTotal)}</td>
                  <td colSpan={7} />
                </tr>
              </>
            )}

            {/* Totals Footer */}
            <tfoot>
              {[
                { label: 'SUB TOTAL',                   val: totals.subTotal,       bg: 'bg-[#2E75B6]', text: 'text-white font-bold' },
                { label: `CGST @ ${GST_RATE * 100}%`,   val: totals.cgst,           bg: 'bg-green-100', text: 'text-green-800 font-semibold' },
                { label: `SGST @ ${GST_RATE * 100}%`,   val: totals.sgst,           bg: 'bg-green-100', text: 'text-green-800 font-semibold' },
                { label: 'TOTAL GROSS CERTIFIED',        val: totals.grossCertified, bg: 'bg-[#1F3864]', text: 'text-white font-medium text-sm' },
              ].map(({ label, val, bg, text }) => (
                <tr key={label} className={`${bg} border-t-2 border-white`}>
                  <td colSpan={9} className={`px-4 py-2 text-right text-xs font-medium uppercase tracking-wide ${text}`}>
                    {label}
                  </td>
                  <td className={`px-3 py-2 text-right font-mono ${text}`}>{fmt(val)}</td>
                  <td colSpan={3} className={bg} />
                </tr>
              ))}
            </tfoot>
          </table>
        </div>

        {/* Deductions */}
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <div className="bg-[#2E75B6] px-4 py-2">
            <h3 className="text-white font-medium text-sm uppercase tracking-widest">Deductions</h3>
          </div>
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Retention (%)',              val: retentionPct,   set: setRetentionPct,   note: `₹${fmt(totals.retentionAmt)} on gross` },
              { label: 'Mob. Advance Recovery (₹)',  val: mobAdvance,     set: setMobAdvance },
              { label: 'Steel Material Recovery (₹)',val: steelRecovery,  set: setSteelRecovery },
              { label: 'Adhoc Recovery (₹)',          val: adhocDeduction, set: setAdhocDeduction },
            ].map(({ label, val, set, note }) => (
              <div key={label} className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-900 font-medium uppercase tracking-wide">{label}</label>
                <input
                  type="number" step="0.01" value={val}
                  onChange={e => set(parseFloat(e.target.value) || 0)}
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono text-right focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                />
                {note && <span className="text-[10px] text-slate-400">{note}</span>}
              </div>
            ))}
          </div>

          {/* Net Certified Banner */}
          <div className="mx-4 mb-4 rounded-lg bg-[#1F3864] px-6 py-4 flex items-center justify-between">
            <div>
              <p className="text-blue-300 text-xs uppercase tracking-widest font-semibold">Total Net Certified</p>
              <p className="text-white text-2xl font-medium font-mono mt-1">
                ₹{fmt(totals.netCertified)}
              </p>
            </div>
            <div className="text-right text-xs text-blue-200 space-y-1">
              <p>Gross (incl GST): ₹{fmt(totals.grossCertified)}</p>
              <p>Total Deductions: ₹{fmt(totals.totalDeductions)}</p>
            </div>
          </div>
        </div>

        {/* Summary Table */}
        <div className="bg-white rounded-xl shadow p-4">
          <p className="text-xs font-medium text-slate-900 font-medium uppercase tracking-widest mb-3">Payment Certificate Summary</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <tbody>
                {[
                  { label: 'Sub-Total (Work Done)',   val: totals.subTotal },
                  { label: `CGST @ ${GST_RATE*100}%`, val: totals.cgst },
                  { label: `SGST @ ${GST_RATE*100}%`, val: totals.sgst },
                  { label: 'Gross Amount',             val: totals.grossCertified, bold: true },
                  { label: `Retention @ ${retentionPct}%`, val: -totals.retentionAmt, red: true },
                  { label: 'Mob. Advance Recovery',   val: -mobAdvance, red: true },
                  { label: 'Steel Recovery',           val: -steelRecovery, red: true },
                  { label: 'Adhoc Recovery',           val: -adhocDeduction, red: true },
                  { label: 'NET CERTIFIED (PAYABLE)', val: totals.netCertified, bold: true, big: true },
                ].map(({ label, val, bold, red, big }) => (
                  <tr key={label} className={`border-b border-slate-100 ${big ? 'bg-[#1F3864] text-white' : ''}`}>
                    <td className={`px-4 py-2 ${bold ? 'font-bold' : ''} ${big ? 'text-white font-bold' : 'text-slate-600'}`}>{label}</td>
                    <td className={`px-4 py-2 text-right font-mono ${bold ? 'font-bold' : ''} ${red ? 'text-red-600' : ''} ${big ? 'text-white font-medium text-sm' : 'text-black'}`}>
                      ₹{fmt(Math.abs(val))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
