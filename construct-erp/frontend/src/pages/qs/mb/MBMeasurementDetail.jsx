// MBMeasurementDetail.jsx — Measurement Detail Sheet (dynamic, live data)
// One sub-tab per BOQ item. Reads pm_approved measurements passed from orchestrator.

import { useState, useMemo } from 'react';

const fmtQ = (n, d = 3) =>
  typeof n === 'number' && !isNaN(n)
    ? n.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d })
    : '0.000';

const num = (v) => parseFloat(v || 0);

const normalizeItemCode = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';

  // Some BOQ imports store 01.52.13.21.15.28 as 01.52.13.21.1528.
  const compressedTail = raw.match(/^(\d{2}\.\d{2}\.\d{2}\.\d{2}\.)(\d{2})(\d{2})$/);
  if (compressedTail) return `${compressedTail[1]}${compressedTail[2]}.${compressedTail[3]}`;

  return raw;
};

const getItemCode = (item) =>
  normalizeItemCode(item?.item_no || item?.item_code || item?.boq_item_no || item?.boq_code || item?.sr_no);

// ── Standard Sheet (Nos × L × B × H) ─────────────────────────────────────────
function StandardSheet({ item, rows, prevCertifiedQty }) {
  const cumQty     = useMemo(() => rows.reduce((s, r) => s + num(r.net_quantity), 0), [rows]);
  const prevQty    = num(prevCertifiedQty);
  const presentQty = Math.max(0, cumQty - prevQty);

  const thCls = 'px-2 py-2 text-[10px] font-bold uppercase tracking-wide text-center leading-tight border-b border-blue-800';
  const tdCls = 'px-2 py-1.5 border-b border-slate-100 text-center text-xs';

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl shadow">
        <table className="w-full text-xs border-collapse min-w-[780px]">
          <thead className="bg-[#2E75B6] text-white">
            <tr>
              <th className={`${thCls} w-8`}>Sl.</th>
              <th className={`${thCls} text-left`}>Description / Location</th>
              <th className={`${thCls} w-12`}>Nos</th>
              <th className={`${thCls} w-16`}>L (m)</th>
              <th className={`${thCls} w-16`}>B (m)</th>
              <th className={`${thCls} w-16`}>H (m)</th>
              <th className={`${thCls} w-20 bg-[#1F3864]`}>Net Qty</th>
              <th className={`${thCls} w-20`}>Date</th>
              <th className={`${thCls}`}>Remarks</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-slate-400 text-xs italic">
                  No approved measurements recorded for this item yet.
                </td>
              </tr>
            ) : rows.map((r, idx) => (
              <tr key={r.id || idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                <td className={`${tdCls} text-slate-400`}>{idx + 1}</td>
                <td className={`${tdCls} text-left font-medium text-slate-700`}>
                  {r.description || '—'}
                  {r.location && <span className="text-slate-400 ml-1">({r.location})</span>}
                </td>
                <td className={`${tdCls} font-mono`}>{fmtQ(num(r.nos), 2)}</td>
                <td className={`${tdCls} font-mono`}>{fmtQ(num(r.length))}</td>
                <td className={`${tdCls} font-mono`}>{fmtQ(num(r.breadth))}</td>
                <td className={`${tdCls} font-mono`}>{fmtQ(num(r.height))}</td>
                <td className="px-2 py-1.5 border-b border-slate-100 text-center bg-green-50 font-mono font-semibold text-green-800 text-xs">
                  {fmtQ(num(r.net_quantity))}
                </td>
                <td className={`${tdCls} text-slate-500`}>
                  {r.entry_date ? new Date(r.entry_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}
                </td>
                <td className={`${tdCls} text-left text-slate-500`}>{r.remarks || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Summary Footer */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-xl overflow-hidden shadow-sm border border-slate-200">
          {[
            { label: 'Cumulative Quantity',   val: cumQty,     cls: 'bg-green-100 text-green-800' },
            { label: 'Prev. Certified Qty',   val: prevQty,    cls: 'bg-yellow-50 text-yellow-800' },
            { label: 'Present Bill Quantity', val: presentQty, cls: 'bg-[#1F3864] text-white font-bold' },
          ].map(({ label, val, cls }) => (
            <div key={label} className={`flex items-center justify-between px-4 py-2.5 border-b border-white/20 ${cls}`}>
              <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
              <span className="font-mono text-sm font-bold">{fmtQ(val)} {item.unit}</span>
            </div>
          ))}
        </div>
        <div className="rounded-xl overflow-hidden shadow-sm border border-slate-200">
          <div className="flex items-center justify-between px-4 py-2.5 bg-slate-100 border-b">
            <span className="text-xs font-semibold text-slate-600 uppercase">BOQ Rate</span>
            <span className="font-mono text-sm">₹{num(item.rate).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / {item.unit}</span>
          </div>
          <div className="flex items-center justify-between px-4 py-2.5 bg-blue-50 border-b">
            <span className="text-xs font-semibold text-blue-700 uppercase">Present Bill Qty</span>
            <span className="font-mono text-sm text-blue-800 font-bold">{fmtQ(presentQty)}</span>
          </div>
          <div className="flex items-center justify-between px-4 py-3 bg-[#1F3864]">
            <span className="text-xs font-bold text-white uppercase tracking-wider">Present Bill Amount</span>
            <span className="font-mono text-lg font-bold text-white">
              ₹{(presentQty * num(item.rate)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Steel Sheet (Dia × Bars × Length × Unit Wt) ───────────────────────────────
function SteelSheet({ item, rows, prevCertifiedQty }) {
  // For steel, net_quantity is in MT
  const cumQty     = useMemo(() => rows.reduce((s, r) => s + num(r.net_quantity), 0), [rows]);
  const prevQty    = num(prevCertifiedQty);
  const presentQty = Math.max(0, cumQty - prevQty);

  const thCls = 'px-2 py-2 text-[10px] font-bold uppercase tracking-wide text-center leading-tight border-b border-blue-800';
  const tdCls = 'px-2 py-1.5 border-b border-slate-100 text-center text-xs';

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl shadow">
        <table className="w-full text-xs border-collapse min-w-[700px]">
          <thead className="bg-[#2E75B6] text-white">
            <tr>
              <th className={`${thCls} w-8`}>Sl.</th>
              <th className={`${thCls} text-left`}>Description / Location</th>
              <th className={`${thCls} w-16`}>Net Qty (MT)</th>
              <th className={`${thCls} w-20`}>Date</th>
              <th className={`${thCls}`}>Remarks</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-slate-400 text-xs italic">
                  No approved steel measurements yet.
                </td>
              </tr>
            ) : rows.map((r, idx) => (
              <tr key={r.id || idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                <td className={`${tdCls} text-slate-400`}>{idx + 1}</td>
                <td className={`${tdCls} text-left font-medium text-slate-700`}>
                  {r.description || '—'}
                  {r.location && <span className="text-slate-400 ml-1">({r.location})</span>}
                </td>
                <td className="px-2 py-1.5 border-b border-slate-100 text-center bg-green-50 font-mono font-semibold text-green-800 text-xs">
                  {fmtQ(num(r.net_quantity))}
                </td>
                <td className={`${tdCls} text-slate-500`}>
                  {r.entry_date ? new Date(r.entry_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}
                </td>
                <td className={`${tdCls} text-left text-slate-500`}>{r.remarks || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-xl overflow-hidden shadow-sm border border-slate-200">
          {[
            { label: 'Cumulative (MT)',        val: cumQty,     cls: 'bg-green-100 text-green-800' },
            { label: 'Prev. Certified (MT)',   val: prevQty,    cls: 'bg-yellow-50 text-yellow-800' },
            { label: 'Present Bill (MT)',      val: presentQty, cls: 'bg-[#1F3864] text-white font-bold' },
          ].map(({ label, val, cls }) => (
            <div key={label} className={`flex items-center justify-between px-4 py-2.5 border-b border-white/20 ${cls}`}>
              <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
              <span className="font-mono text-sm font-bold">{fmtQ(val)}</span>
            </div>
          ))}
        </div>
        <div className="rounded-xl overflow-hidden shadow-sm border border-slate-200">
          <div className="flex items-center justify-between px-4 py-2.5 bg-slate-100 border-b">
            <span className="text-xs font-semibold text-slate-600 uppercase">Rate (₹/MT)</span>
            <span className="font-mono text-sm">₹{num(item.rate).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="flex items-center justify-between px-4 py-3 bg-[#1F3864]">
            <span className="text-xs font-bold text-white uppercase tracking-wider">Present Bill Amount</span>
            <span className="font-mono text-lg font-bold text-white">
              ₹{(presentQty * num(item.rate)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function MBMeasurementDetail({ boqItems = [], measurements = [] }) {
  const [activeId, setActiveId] = useState(() => boqItems[0]?.id || null);

  const activeItem = boqItems.find(i => i.id === activeId) || boqItems[0] || null;
  const selectedItemId = activeItem?.id || activeId;

  const activeRows = useMemo(
    () => measurements.filter(m => String(m.boq_item_id) === String(selectedItemId)),
    [measurements, selectedItemId]
  );

  const isSteelItem = (item) =>
    item?.unit?.toUpperCase() === 'MT' || item?.unit?.toUpperCase() === 'KG';

  if (!boqItems.length) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="text-center text-slate-400">
          <p className="text-lg font-semibold mb-2">No BOQ Items</p>
          <p className="text-sm">Import BOQ items first before recording measurements.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4 font-sans">
      <div className="max-w-[1400px] mx-auto space-y-4">

        {/* Header */}
        <div className="rounded-xl overflow-hidden shadow">
          <div className="bg-[#1F3864] px-6 py-4">
            <p className="text-xs tracking-widest text-blue-300 uppercase">Measurement Book</p>
            <h2 className="text-xl font-bold text-white">Measurement Detail Sheet</h2>
            <p className="text-blue-200 text-xs mt-0.5">Showing PM-approved measurements · {measurements.length} total entries</p>
          </div>

          {/* BOQ Item Tabs */}
          <div className="bg-[#0F2040] px-4 overflow-x-auto">
            <div className="flex gap-1 py-1 min-w-max">
              {boqItems.map(item => {
                const itemRows = measurements.filter(m => String(m.boq_item_id) === String(item.id));
                const itemCode = getItemCode(item);
                return (
                  <button
                    key={item.id}
                    title={`${itemCode || 'Item'} - ${item.description || ''}`}
                    onClick={() => setActiveId(item.id)}
                    className={`px-3 py-2 text-xs font-semibold rounded-t-lg transition min-w-[260px] max-w-[360px] text-left ${
                      activeId === item.id
                        ? 'bg-white text-[#1F3864]'
                        : 'text-blue-300 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] font-bold tabular-nums tracking-normal">{itemCode || '-'}</span>
                      {itemRows.length > 0 && (
                        <span className={`text-[9px] rounded-full px-1.5 py-0.5 font-bold ${
                          activeId === item.id ? 'bg-blue-100 text-blue-700' : 'bg-white/20 text-white'
                        }`}>
                          {itemRows.length}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] leading-tight">
                      {item.description || 'No description'}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Item Info Card */}
        {activeItem && (
          <div className="bg-white rounded-xl shadow p-4">
            <div className="flex flex-wrap gap-4 items-start justify-between">
              <div className="flex-1 min-w-[300px]">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">BOQ Item Code</p>
                <p className="text-sm font-mono font-bold text-black break-all">{getItemCode(activeItem) || '—'}</p>
              </div>
              <div className="flex gap-6 flex-wrap">
                {[
                  { label: 'Item No',    val: getItemCode(activeItem) },
                  { label: 'Unit',       val: activeItem.unit },
                  { label: 'BOQ Qty',    val: parseFloat(activeItem.quantity || 0).toLocaleString('en-IN', { minimumFractionDigits: 3 }) },
                  { label: 'Rate (₹)',   val: parseFloat(activeItem.rate || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 }) },
                  { label: 'Prev Cert.', val: parseFloat(activeItem.certified_qty || 0).toLocaleString('en-IN', { minimumFractionDigits: 3 }) },
                ].map(({ label, val }) => (
                  <div key={label}>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">{label}</p>
                    <p className="text-sm font-bold text-black">{val}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800 italic leading-relaxed">
              {activeItem.description}
            </div>
          </div>
        )}

        {/* Measurement Table */}
        {activeItem && (
          isSteelItem(activeItem) ? (
            <SteelSheet
              item={activeItem}
              rows={activeRows}
              prevCertifiedQty={activeItem.certified_qty || 0}
            />
          ) : (
            <StandardSheet
              item={activeItem}
              rows={activeRows}
              prevCertifiedQty={activeItem.certified_qty || 0}
            />
          )
        )}

        {/* Legend */}
        <div className="flex flex-wrap gap-4 text-xs text-slate-500 px-1 pb-4">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-green-100 border border-green-300 inline-block" />
            Auto-calculated quantity
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-yellow-100 border border-yellow-300 inline-block" />
            Approved measurement data
          </span>
          <span className="text-slate-400">
            All rows are PM-approved measurements from the Measurement Book entry module.
          </span>
        </div>
      </div>
    </div>
  );
}
