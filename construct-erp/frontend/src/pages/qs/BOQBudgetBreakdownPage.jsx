// src/pages/qs/BOQBudgetBreakdownPage.jsx — Master-detail BOQ budget allocation
import React, { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useReactToPrint } from 'react-to-print';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import {
  Percent, IndianRupee, AlertTriangle, AlertCircle, ChevronRight, ChevronDown,
  Search, Layers, CheckCircle2, Wallet, Printer, LayoutList, FileText, BarChart2, Download,
  Bell, TrendingUp, Activity,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { PageHeader, KpiCard as ThemeKpiCard, Theme } from '../../theme';
import { boqBudgetAPI, projectAPI } from '../../api/client';
import BOQSummaryPrintTemplate from './BOQSummaryPrintTemplate';
import bcimLogo from '../../assets/bcim-logo.png';

const GST_PCT = 18;

const inr  = (v) => `₹${(parseFloat(v) || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const inr2 = (v) => `₹${(parseFloat(v) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num  = (v) => parseFloat(v) || 0;

// ─── Shared professional print letterhead ─────────────────────────────────────
function BOQPrintHeader({ title, subtitle, projectName, projectAddress, clientName, meta = [] }) {
  const now = new Date().toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  return (
    <div className="hidden print:block" style={{ fontFamily: 'Arial, sans-serif', marginBottom: 16 }}>
      {/* Top colour bar */}
      <div style={{ height: 5, background: 'linear-gradient(90deg,#0B2E59 0%,#1e4d8c 55%,#2563eb 100%)', marginBottom: 12 }} />
      {/* Letterhead */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: 10, marginBottom: 10, borderBottom: '1.5px solid #0B2E59' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <img src={bcimLogo} alt="BCIM" style={{ width: 64, height: 64, objectFit: 'contain', flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 19, fontWeight: 900, color: '#0B2E59', lineHeight: 1.1 }}>BCIM Engineering Pvt. Ltd.</div>
            <div style={{ fontSize: 9, color: '#475569', marginTop: 3 }}>Construction &amp; Infrastructure Management</div>
            <div style={{ fontSize: 8.5, color: '#94a3b8', marginTop: 1 }}>Bengaluru, Karnataka, India &nbsp;|&nbsp; www.bcim.in</div>
          </div>
        </div>
        <div style={{ textAlign: 'right', fontSize: 8.5, color: '#64748b', lineHeight: 1.9 }}>
          <div style={{ fontWeight: 700, color: '#1e293b', fontSize: 9 }}>Confidential — Internal Use Only</div>
          <div>Generated: {now}</div>
        </div>
      </div>
      {/* Project info block */}
      {(projectName || clientName) && (
        <div style={{ display: 'flex', gap: 0, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 4, marginBottom: 8, overflow: 'hidden' }}>
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
      {/* Navy title band */}
      <div style={{ background: '#0B2E59', color: '#fff', padding: '7px 14px', borderRadius: 4, marginBottom: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 9, color: '#93c5fd', marginTop: 2 }}>{subtitle}</div>}
      </div>
      {/* Metadata row */}
      {meta.filter(([, v]) => v).length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, fontSize: 9, color: '#475569', borderBottom: '1px solid #e2e8f0', paddingBottom: 8, marginBottom: 10 }}>
          {meta.filter(([, v]) => v).map(([k, v]) => (
            <span key={k}><span style={{ fontWeight: 700, color: '#1e293b' }}>{k}:</span> {v}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Shared print footer with signature columns ────────────────────────────────
function BOQPrintFooter() {
  const cols = [
    { role: 'Prepared by', designation: 'QS / Site Engineer' },
    { role: 'Checked by',  designation: 'Project Manager'    },
    { role: 'Approved by', designation: 'Director / MD'      },
  ];
  return (
    <div className="hidden print:block" style={{ marginTop: 48, fontFamily: 'Arial, sans-serif', pageBreakInside: 'avoid' }}>
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

// Synthetic row for cost-head spend (mainly material POs) that isn't tied to
// one specific BOQ item — see boq-budget.routes.js. It has no real budget to
// set, so its cells render read-only instead of going through the save API.
const isUnlinkedRow = (item) => item.id === 'project-level-unlinked';

// ─── Inline editable budget cell ──────────────────────────────────────────────
function EditableBudget({ value, onSave, mode, itemAmount }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value ?? '');

  const commit = () => {
    setEditing(false);
    const newVal = parseFloat(val || 0);
    if (mode === 'amount' && itemAmount && newVal > itemAmount + 0.01) {
      toast.error(`Cannot exceed item amount: ${inr(itemAmount)}`);
      return;
    }
    if (parseFloat(val || 0) !== parseFloat(value || 0)) onSave(newVal);
  };

  if (editing) return (
    <input
      autoFocus type="number" value={val}
      onChange={e => setVal(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
      className="w-28 border border-indigo-400 rounded-lg px-2 py-1 text-xs text-right focus:outline-none focus:ring-2 focus:ring-indigo-200"
    />
  );

  return (
    <button
      onClick={() => { setVal(value ?? ''); setEditing(true); }}
      className="w-28 text-right text-xs font-semibold hover:bg-indigo-50 rounded-lg px-2 py-1 transition border border-transparent hover:border-indigo-200"
    >
      {value ? (mode === 'pct' ? `${parseFloat(value).toFixed(1)}%` : inr(value))
             : <span className="text-slate-300 italic font-normal">set budget</span>}
    </button>
  );
}

// Inline-edit cell for item-row total budget (div-based to avoid nested <button>)
function EditableTotal({ value, onSave }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState('');

  const commit = () => {
    setEditing(false);
    const newVal = parseFloat(val || 0);
    if (!isNaN(newVal) && newVal !== parseFloat(value || 0)) onSave(newVal);
  };

  if (editing) return (
    <input
      autoFocus type="number" value={val}
      onChange={e => setVal(e.target.value)}
      onBlur={commit}
      onClick={e => e.stopPropagation()}
      onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
      className="w-28 border border-indigo-400 rounded-lg px-2 py-1 text-xs text-right focus:outline-none focus:ring-2 focus:ring-indigo-200"
    />
  );

  return (
    <div
      onClick={e => { e.stopPropagation(); setVal(value ?? ''); setEditing(true); }}
      className="w-28 text-right text-xs font-semibold hover:bg-indigo-50 rounded-lg px-2 py-1 transition border border-transparent hover:border-indigo-200 cursor-pointer select-none"
    >
      {value > 0 ? inr(value) : <span className="text-slate-300 italic font-normal">set budget</span>}
    </div>
  );
}

// ─── Editable chapter-level budget cell in the BOQ Summary tab ───────────────
function ChapterBudgetCell({ value, onSave, saving }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState('');

  const open  = () => { setVal(value ? Math.round(value).toString() : ''); setEditing(true); };
  const cancel = () => setEditing(false);
  const commit = () => {
    const n = parseFloat(val);
    if (isNaN(n) || n < 0) { toast.error('Enter a valid amount'); return; }
    setEditing(false);
    onSave(n);
  };

  if (editing) return (
    <div className="flex items-center gap-1 px-1 py-1">
      <input
        autoFocus
        type="number"
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') cancel(); }}
        placeholder="Amount"
        className="flex-1 min-w-0 border border-indigo-400 rounded-lg px-2 py-1 text-xs text-right focus:outline-none focus:ring-2 focus:ring-indigo-200"
      />
      <button onClick={commit} disabled={saving}
        className="shrink-0 px-2 py-1 bg-indigo-600 text-white text-[10px] font-bold rounded-lg hover:bg-indigo-500 disabled:opacity-50">
        Save
      </button>
      <button onClick={cancel}
        className="shrink-0 px-2 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold rounded-lg hover:bg-slate-200">
        ✕
      </button>
    </div>
  );

  return (
    <div className="flex items-center justify-end gap-2 px-3 py-1.5">
      <span className={clsx('text-sm font-semibold', value > 0 ? 'text-slate-800' : 'text-slate-300 italic text-xs')}>
        {value > 0 ? `₹${Math.round(value).toLocaleString('en-IN')}` : 'Not set'}
      </span>
      <button onClick={open} disabled={saving}
        className="shrink-0 px-2 py-0.5 bg-indigo-50 border border-indigo-200 text-indigo-600 text-[10px] font-bold rounded hover:bg-indigo-100 disabled:opacity-50">
        {saving ? '…' : 'Edit'}
      </button>
    </div>
  );
}

// ─── Cost-head detail table (shown when a BOQ item is expanded) ────────────────
function CostHeadDetail({ item, costHeads, mode, onSave }) {
  const itemAmount = num(item.amount);
  const readOnly = isUnlinkedRow(item);

  // Split rows into "active" (has budget or actuals) and "empty" for clarity
  const rows = costHeads.map(h => {
    const cell = item.breakdown?.[h] || {};
    const budget   = num(cell.amount);
    const advance  = num(cell.advance);
    const invoiced = num(cell.invoiced);
    const prorated = num(cell.prorated);
    const spent    = advance + invoiced + prorated;
    const balance  = budget - spent;
    const over     = spent > budget + 0.01;
    const active   = budget > 0 || spent > 0;
    // "spent" is pro-rated (estimated by budget share) when there is no directly
    // tagged advance/invoiced for this head — flag it so the number reads honestly.
    const estimated = prorated > 0 && advance === 0 && invoiced === 0;
    return { h, cell, budget, advance, invoiced, prorated, spent, balance, over, active, estimated };
  });
  const active = rows.filter(r => r.active);
  const empty  = rows.filter(r => !r.active);

  const Row = ({ r, dim }) => (
    <tr className={clsx('border-b border-slate-100', dim && 'opacity-60', r.over && 'bg-rose-50/40')}>
      <td className="px-3 py-2 font-medium text-slate-700">{r.h}</td>
      <td className="px-3 py-2 text-right">
        {readOnly ? (
          <span className="w-28 inline-block text-right text-xs text-slate-300">—</span>
        ) : (
          <EditableBudget
            value={mode === 'pct' ? r.cell.pct : r.cell.amount}
            mode={mode} itemAmount={itemAmount}
            onSave={v => onSave(item, r.h, mode, v)}
          />
        )}
      </td>
      <td className="px-3 py-2 text-right font-semibold text-slate-700">
        {r.spent > 0 ? (
          <span className="inline-flex items-center gap-1 justify-end">
            {r.estimated && <span title="Estimated — pro-rated by budget share" className="text-[9px] font-bold text-amber-500">≈</span>}
            {inr(r.spent)}
          </span>
        ) : <span className="text-slate-300">—</span>}
      </td>
      <td className={clsx('px-3 py-2 text-right font-bold', r.balance < 0 ? 'text-rose-600' : r.budget > 0 ? 'text-emerald-600' : 'text-slate-300')}>
        {r.budget > 0 || r.spent > 0 ? inr(r.balance) : '—'}
        {r.over && !readOnly && <div className="text-[9px] text-rose-500 font-bold">⚠ over budget</div>}
      </td>
    </tr>
  );

  return (
    <div className="bg-slate-50 px-4 py-4">
      {readOnly && (
        <div className="mb-2 flex items-center gap-2 text-[11px] text-slate-500 bg-slate-100 border border-slate-200 rounded-lg px-3 py-2">
          <Layers size={13} />
          Cost-head spend from POs/bills not linked to a specific BOQ item — no budget to set here, totals only.
        </div>
      )}
      <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-100 border-b border-slate-200 text-[10px] uppercase tracking-wide text-slate-500 font-bold">
              <th className="px-3 py-2 text-left">Cost Head</th>
              <th className="px-3 py-2 text-right">Budget</th>
              <th className="px-3 py-2 text-right">Spent</th>
              <th className="px-3 py-2 text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {active.map(r => <Row key={r.h} r={r} dim={false} />)}
            {active.length > 0 && empty.length > 0 && (
              <tr><td colSpan={4} className="px-3 py-1.5 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-400 font-bold">Unallocated cost heads</td></tr>
            )}
            {empty.map(r => <Row key={r.h} r={r} dim />)}
          </tbody>
        </table>
      </div>
      {num(item.unallocated_actual) > 0 && (
        <div className="mt-2 flex items-center gap-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <AlertTriangle size={13} />
          <span className="font-semibold">{inr(item.unallocated_actual)}</span> of actual spend isn't tagged to any cost head.
        </div>
      )}
    </div>
  );
}

// Default paste text matching the 20 cost heads — user can edit before importing
const DEFAULT_BULK_TEXT =
`Sub Con	48816858.20
Supervision & Accommodation	12565908.40
EPF, PT & Insurance	3044138.33
Office Items & Camp Expenses	1215376.66
Travel & Transport	913241.50
Concrete Material	5662042.65
Steel	1133219.11
Blocks	15211372.26
Cement	3341429.86
Sand	4290542.43
Materials / Consumables	4789466.48
Safety Items	3859775.55
Testing	527414.79
Debris Disposal	2041341.16
Equipment & Rentals	3734819.90
Power & Water	2084985.82
Overhead	14496254.84
Petty Cash	954211.41`;

// ─── Drilldown sub-table shown when a cost head row is expanded ───────────────
const DRILLDOWN_COLSPAN = 8; // must match number of <th> columns in the parent table
function CostHeadDrilldown({ projectId, costHead }) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['costhead-drilldown', projectId, costHead],
    queryFn: () => boqBudgetAPI.costheadDrilldown(projectId, costHead).then(r => r.data?.data || []),
    enabled: !!projectId && !!costHead,
    retry: 1,
  });

  const fmt = (n) => `₹${Math.round(parseFloat(n) || 0).toLocaleString('en-IN')}`;
  const SOURCE_COLORS = {
    'SC Bill':          'bg-blue-50 text-blue-700 border border-blue-200',
    'SC Payment':       'bg-emerald-50 text-emerald-700 border border-emerald-200',
    'SC Advance':       'bg-violet-50 text-violet-700 border border-violet-200',
    'Stores PC Advance':'bg-purple-50 text-purple-700 border border-purple-200',
    'Advance Tracker':  'bg-amber-50 text-amber-700 border border-amber-200',
    'TQS Bill':         'bg-sky-50 text-sky-700 border border-sky-200',
    'RA Bill':          'bg-teal-50 text-teal-700 border border-teal-200',
    'Petty Cash':       'bg-orange-50 text-orange-700 border border-orange-200',
  };

  if (isLoading) return (
    <tr>
      <td colSpan={DRILLDOWN_COLSPAN} className="bg-indigo-50/40 px-8 py-4">
        <div className="flex items-center gap-2 text-xs text-indigo-500">
          <div className="w-3.5 h-3.5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
          Loading transactions for <strong>{costHead}</strong>…
        </div>
      </td>
    </tr>
  );

  if (isError) return (
    <tr>
      <td colSpan={DRILLDOWN_COLSPAN} className="bg-red-50 px-8 py-3">
        <div className="flex items-center gap-2 text-xs text-red-600">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          Failed to load transactions: {error?.response?.data?.error || error?.message || 'Unknown error'}
        </div>
      </td>
    </tr>
  );

  const rows = data || [];
  const total = rows.reduce((s, r) => s + parseFloat(r.amount || 0), 0);

  if (!rows.length) return (
    <tr>
      <td colSpan={DRILLDOWN_COLSPAN} className="bg-slate-50 px-8 py-4">
        <div className="flex items-center gap-2 text-xs text-slate-400 italic">
          <AlertCircle className="w-3.5 h-3.5" />
          No transactions found for <strong className="not-italic text-slate-500">{costHead}</strong>.
          Amount may come from a source not yet linked to drilldown (check SC module, TQS bills, or advance tracker).
        </div>
      </td>
    </tr>
  );

  // Group by source for a summary header
  const bySource = rows.reduce((acc, r) => {
    acc[r.source] = (acc[r.source] || 0) + parseFloat(r.amount || 0);
    return acc;
  }, {});

  return (
    <tr>
      <td colSpan={DRILLDOWN_COLSPAN} className="p-0 bg-indigo-50/20">
        <div className="mx-6 my-3 rounded-xl border border-indigo-100 overflow-hidden shadow-sm">
          {/* Source summary pills */}
          <div className="flex items-center gap-2 flex-wrap px-4 py-2.5 bg-white border-b border-indigo-100">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mr-1">Sources:</span>
            {Object.entries(bySource).map(([src, amt]) => (
              <span key={src} className={clsx('flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold', SOURCE_COLORS[src] || 'bg-slate-100 text-slate-500')}>
                {src} <span className="font-mono font-bold">{fmt(amt)}</span>
              </span>
            ))}
            <span className="ml-auto text-[11px] font-bold text-slate-700 font-mono">Total: {fmt(total)}</span>
          </div>
          {/* Transaction rows */}
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-600 text-[10px] uppercase tracking-wide">
                <th className="px-4 py-2 text-left w-32">Date</th>
                <th className="px-4 py-2 text-left w-40">Reference</th>
                <th className="px-4 py-2 text-left">Description</th>
                <th className="px-4 py-2 text-center w-36">Source</th>
                <th className="px-4 py-2 text-right w-36">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {rows.map((r, idx) => (
                <tr key={idx} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-2 text-slate-500 font-mono text-[11px]">
                    {r.date ? new Date(r.date).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—'}
                  </td>
                  <td className="px-4 py-2 font-mono text-indigo-700 text-[11px]">{r.reference || '—'}</td>
                  <td className="px-4 py-2 text-slate-700 max-w-sm truncate" title={r.description}>{r.description || '—'}</td>
                  <td className="px-4 py-2 text-center">
                    <span className={clsx('px-2 py-0.5 rounded-full text-[10px] font-bold', SOURCE_COLORS[r.source] || 'bg-slate-100 text-slate-500')}>
                      {r.source}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right font-semibold text-slate-800 font-mono">{fmt(r.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100 border-t-2 border-slate-300">
                <td colSpan={4} className="px-4 py-2 text-right font-bold text-slate-600 text-xs">Total — {costHead}</td>
                <td className="px-4 py-2 text-right font-bold text-emerald-700 font-mono">{fmt(total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </td>
    </tr>
  );
}

// ─── Monthly Analysis Matrix (cost heads × months) ───────────────────────────
function CostHeadMonthlyTab({ projectId, projectName, projectAddress, clientName }) {
  const [monthlyView, setMonthlyView] = useState('table'); // 'table' | 'scurve' | 'forecast'
  const printRef = useRef();
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Monthly_Analysis_${projectName || projectId}`,
    pageStyle: `
      @page { size: A4 landscape; margin: 10mm; }
      @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; font-size: 10px; } }
    `,
  });

  const { data: resp, isLoading } = useQuery({
    queryKey: ['costhead-monthly', projectId],
    queryFn: () => boqBudgetAPI.costheadMonthly(projectId).then(r => r.data),
    enabled: !!projectId,
  });

  const months = resp?.months || [];
  const data   = resp?.data   || [];

  // Collect all cost heads that appear in any month
  const { BOQ_COST_HEADS_ORDER, headTotals, monthTotals, grandTotal } = useMemo(() => {
    const headMap = {};
    const monthTotalsMap = {};
    for (const { month, breakdown } of data) {
      for (const [head, amt] of Object.entries(breakdown)) {
        headMap[head]      = (headMap[head]      || 0) + amt;
        monthTotalsMap[month] = (monthTotalsMap[month] || 0) + amt;
      }
    }
    // Sort heads: known order first, then extras
    const BOQ_KNOWN = [
      'Sub Con','Supervision & Accommodation','EPF, PT & Insurance',
      'Office Items & Camp Expenses','Travel & Transport','Concrete Material',
      'Steel','Blocks','Cement','Sand','Materials / Consumables',
      'Safety Items','Testing','Debris Disposal','Equipment & Rentals',
      'Power & Water','Overhead','Petty Cash',
    ];
    const allHeads = Object.keys(headMap);
    const sorted = [
      ...BOQ_KNOWN.filter(h => allHeads.includes(h)),
      ...allHeads.filter(h => !BOQ_KNOWN.includes(h)).sort(),
    ];
    return {
      BOQ_COST_HEADS_ORDER: sorted,
      headTotals: headMap,
      monthTotals: monthTotalsMap,
      grandTotal: Object.values(headMap).reduce((s, v) => s + v, 0),
    };
  }, [data]);

  const byMonthBreakdown = useMemo(() => {
    const map = {};
    for (const { month, breakdown } of data) map[month] = breakdown;
    return map;
  }, [data]);

  const fmtMonth = (ym) => {
    const [y, m] = ym.split('-');
    return new Date(+y, +m - 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
  };
  const fmtAmt = (v) => v > 0 ? `₹${Math.round(v).toLocaleString('en-IN')}` : '—';

  const exportCSV = () => {
    const rows = [];
    rows.push(['Cost Head', ...months.map(fmtMonth), 'Total']);
    for (const head of BOQ_COST_HEADS_ORDER) {
      rows.push([head, ...months.map(m => (byMonthBreakdown[m]?.[head] || 0).toFixed(2)), (headTotals[head] || 0).toFixed(2)]);
    }
    rows.push(['Monthly Total', ...months.map(m => (monthTotals[m] || 0).toFixed(2)), grandTotal.toFixed(2)]);
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `Monthly_Analysis_${projectName || projectId}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  // ── S-curve data: cumulative spend per month ──────────────────────────────
  const scurveData = useMemo(() => {
    let cumulative = 0;
    return months.map(m => {
      cumulative += monthTotals[m] || 0;
      return { month: fmtMonth(m), monthly: Math.round(monthTotals[m] || 0), cumulative: Math.round(cumulative) };
    });
  }, [months, monthTotals]);

  // ── Cash flow projection: trailing 3-month avg per head → next 3 months ───
  const forecastData = useMemo(() => {
    const last3 = months.slice(-3);
    const nextMonths = [1, 2, 3].map(n => {
      const d = new Date();
      d.setMonth(d.getMonth() + n);
      return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
    });
    const rows = BOQ_COST_HEADS_ORDER
      .map(head => {
        const trailing = last3.map(m => byMonthBreakdown[m]?.[head] || 0);
        const avg = trailing.reduce((s, v) => s + v, 0) / Math.max(last3.length, 1);
        return { head, trailing_avg: avg, projected: [avg, avg, avg] };
      })
      .filter(r => r.trailing_avg > 0);
    const totalAvg = rows.reduce((s, r) => s + r.trailing_avg, 0);
    return { rows, nextMonths, totalAvg };
  }, [months, byMonthBreakdown, BOQ_COST_HEADS_ORDER]);

  const VIEWS = [
    { id: 'table',    label: 'Monthly Matrix', icon: LayoutList },
    { id: 'charts',   label: '3D Charts',      icon: BarChart2  },
    { id: 'scurve',   label: 'S-Curve',        icon: TrendingUp },
    { id: 'forecast', label: 'Cash Forecast',  icon: Activity   },
  ];

  const fmtCrore = (v) => v >= 1e7 ? `₹${(v / 1e7).toFixed(2)}Cr` : v >= 1e5 ? `₹${(v / 1e5).toFixed(1)}L` : fmtAmt(v);

  const HEAD_COLORS = [
    '#818cf8','#f472b6','#34d399','#fbbf24','#f87171',
    '#a78bfa','#22d3ee','#4ade80','#fb923c','#60a5fa',
    '#c084fc','#a3e635','#fb7185','#38bdf8','#facc15',
    '#7c3aed','#10b981','#ef4444',
  ];

  const stackedBarData = useMemo(() => months.map(m => ({
    month: fmtMonth(m),
    ...BOQ_COST_HEADS_ORDER.reduce((acc, h) => { acc[h] = Math.round(byMonthBreakdown[m]?.[h] || 0); return acc; }, {}),
  })), [months, BOQ_COST_HEADS_ORDER, byMonthBreakdown]);

  const donutData = useMemo(() =>
    BOQ_COST_HEADS_ORDER
      .map((h, i) => ({ name: h, value: Math.round(headTotals[h] || 0), color: HEAD_COLORS[i % HEAD_COLORS.length] }))
      .filter(d => d.value > 0),
  [BOQ_COST_HEADS_ORDER, headTotals]);

  const topMonthsData = useMemo(() =>
    months
      .map(m => ({ month: fmtMonth(m), total: Math.round(monthTotals[m] || 0) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8),
  [months, monthTotals]);

  if (isLoading) return <div className="py-16 text-center text-slate-400 text-sm">Loading…</div>;
  if (!months.length) return (
    <div className="py-16 text-center text-slate-400 text-sm">No paid expenditure records found for this project.</div>
  );

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
      <div className="px-5 py-3 bg-slate-100 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-700">Monthly Expenditure Analysis</h3>
          <p className="text-[11px] text-slate-400">Period: {months.length > 0 ? `${fmtMonth(months[0])} – ${fmtMonth(months[months.length - 1])}` : '—'} · Total paid: {fmtAmt(grandTotal)}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* View toggle */}
          {VIEWS.map(v => {
            const Icon = v.icon;
            return (
              <button key={v.id} onClick={() => setMonthlyView(v.id)}
                className={clsx('flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border transition',
                  monthlyView === v.id ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50')}>
                <Icon className="w-3.5 h-3.5" /> {v.label}
              </button>
            );
          })}
          <button onClick={exportCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition">
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
          <button onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition">
            <Printer className="w-3.5 h-3.5" /> Print
          </button>
        </div>
      </div>

      {/* ── 3D Charts view ───────────────────────────────────────────────────── */}
      {monthlyView === 'charts' && (
        <div className="p-5 space-y-6">
          <style>{`@keyframes growBar { from { width: 0% } }`}</style>

          {/* Animated stacked bar — months × cost heads */}
          <div className="rounded-2xl overflow-hidden"
            style={{ background: 'linear-gradient(135deg,#0f172a 0%,#1e1b4b 60%,#0f172a 100%)',
                     boxShadow: '0 24px 64px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06)' }}>
            <div className="px-5 pt-4 pb-2 border-b border-white/10 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-white tracking-wide">Monthly Expenditure by Cost Head</p>
                <p className="text-[11px] text-slate-400 mt-0.5">{months.length} months · Grand total {fmtCrore(grandTotal)}</p>
              </div>
              <span className="text-[10px] px-2.5 py-1 rounded-full font-semibold"
                style={{ background: 'rgba(129,140,248,0.15)', color: '#a5b4fc', border: '1px solid rgba(129,140,248,0.3)' }}>
                Animated · Stacked
              </span>
            </div>
            <div className="p-4" style={{ filter: 'drop-shadow(0 8px 32px rgba(99,102,241,0.25))' }}>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={stackedBarData} margin={{ top: 8, right: 24, left: 8, bottom: 24 }}
                  barSize={Math.max(12, Math.min(36, Math.floor(400 / (months.length || 1) - 6)))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 10 }} tickLine={false}
                    axisLine={{ stroke: 'rgba(255,255,255,0.08)' }} angle={months.length > 8 ? -35 : 0}
                    textAnchor={months.length > 8 ? 'end' : 'middle'} interval={0} />
                  <YAxis tickFormatter={fmtCrore} tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip
                    formatter={(v, n) => [fmtAmt(v), n]}
                    contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, fontSize: 11 }}
                    labelStyle={{ color: '#e2e8f0', fontWeight: 700 }}
                    cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                  />
                  <Legend wrapperStyle={{ paddingTop: 14, fontSize: 10.5, color: '#94a3b8' }}
                    formatter={(v) => <span style={{ color: '#cbd5e1' }}>{v}</span>} />
                  {BOQ_COST_HEADS_ORDER.map((head, i) => (
                    <Bar key={head} dataKey={head} stackId="a" fill={HEAD_COLORS[i % HEAD_COLORS.length]}
                      isAnimationActive animationDuration={900} animationBegin={i * 50} animationEasing="ease-out"
                      radius={i === BOQ_COST_HEADS_ORDER.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Row 2: Donut + Top months */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

            {/* Donut — cost head distribution */}
            <div className="rounded-2xl overflow-hidden"
              style={{ background: 'linear-gradient(135deg,#0f172a 0%,#0c1a3a 100%)',
                       boxShadow: '0 16px 48px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.05)' }}>
              <div className="px-4 pt-4 pb-2 border-b border-white/10">
                <p className="text-sm font-bold text-white">Cost Head Distribution</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Total spend breakdown across all cost heads</p>
              </div>
              <div className="flex flex-col items-center py-4">
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={donutData} cx="50%" cy="50%" innerRadius={72} outerRadius={110}
                      dataKey="value" nameKey="name" paddingAngle={2}
                      isAnimationActive animationBegin={0} animationDuration={1200} animationEasing="ease-out"
                      startAngle={90} endAngle={-270}>
                      {donutData.map((d, i) => (
                        <Cell key={d.name} fill={d.color}
                          style={{ filter: `drop-shadow(0 0 6px ${d.color}55)` }} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v, n) => [fmtAmt(v), n]}
                      contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, fontSize: 11 }}
                      labelStyle={{ color: '#e2e8f0' }} />
                  </PieChart>
                </ResponsiveContainer>
                {/* Legend */}
                <div className="px-4 pb-3 grid grid-cols-2 gap-x-4 gap-y-1.5 w-full">
                  {donutData.map(d => (
                    <div key={d.name} className="flex items-center gap-1.5 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: d.color, boxShadow: `0 0 6px ${d.color}80` }} />
                      <span className="text-[10px] text-slate-300 truncate">{d.name}</span>
                      <span className="text-[10px] text-slate-500 ml-auto flex-shrink-0">{((d.value / grandTotal) * 100).toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Top-spending months horizontal bar */}
            <div className="rounded-2xl overflow-hidden"
              style={{ background: 'linear-gradient(135deg,#0f172a 0%,#1a0e2e 100%)',
                       boxShadow: '0 16px 48px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.05)' }}>
              <div className="px-4 pt-4 pb-2 border-b border-white/10">
                <p className="text-sm font-bold text-white">Top Spending Months</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Highest expenditure months (sorted)</p>
              </div>
              <div className="p-4">
                <div className="space-y-3 mt-1">
                  {topMonthsData.map((d, i) => {
                    const pct = grandTotal > 0 ? (d.total / (topMonthsData[0]?.total || 1)) * 100 : 0;
                    const barColor = HEAD_COLORS[i % HEAD_COLORS.length];
                    return (
                      <div key={d.month}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[11px] font-semibold text-slate-300">{d.month}</span>
                          <span className="text-[11px] font-bold" style={{ color: barColor }}>{fmtCrore(d.total)}</span>
                        </div>
                        <div className="h-5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                          <div className="h-full rounded-full transition-all duration-1000"
                            style={{
                              width: `${pct}%`,
                              background: `linear-gradient(90deg, ${barColor}cc, ${barColor})`,
                              boxShadow: `0 0 10px ${barColor}60`,
                              animation: `growBar 1s ease-out ${i * 80}ms both`,
                            }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ── S-Curve view ─────────────────────────────────────────────────────── */}
      {monthlyView === 'scurve' && (
        <div className="p-5">
          <p className="text-xs text-slate-500 mb-4">Cumulative spend (blue area) and monthly spend (green bars) across the project duration.</p>
          <ResponsiveContainer width="100%" height={340}>
            <AreaChart data={scurveData} margin={{ top: 10, right: 20, left: 20, bottom: 5 }}>
              <defs>
                <linearGradient id="cumulGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#2563eb" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#2563eb" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="monthGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#10b981" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} />
              <YAxis yAxisId="left"  tickFormatter={fmtCrore} tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} />
              <YAxis yAxisId="right" orientation="right" tickFormatter={fmtCrore} tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
              <Tooltip
                formatter={(v, name) => [fmtAmt(v), name]}
                contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area yAxisId="left" type="monotone" dataKey="cumulative" name="Cumulative Spend" stroke="#2563eb" strokeWidth={2.5} fill="url(#cumulGrad)" dot={{ r: 3, fill: '#2563eb' }} />
              <Area yAxisId="right" type="monotone" dataKey="monthly"    name="Monthly Spend"    stroke="#10b981" strokeWidth={1.5} fill="url(#monthGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Cash Flow Forecast view ───────────────────────────────────────────── */}
      {monthlyView === 'forecast' && (
        <div className="p-5">
          <p className="text-xs text-slate-500 mb-1">
            Projected spend for the next 3 months based on <strong>trailing 3-month average</strong> per cost head.
            Actual outcomes may vary with project phase and procurement cycles.
          </p>
          <div className="mb-4 flex gap-4 text-xs text-slate-600">
            <span>Trailing period: <strong>{months.slice(-3).map(fmtMonth).join(', ')}</strong></span>
            <span>Projected total/month: <strong className="text-indigo-600">{fmtAmt(forecastData.totalAvg)}</strong></span>
          </div>
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-[#0B2E59] text-white">
                  <th className="px-4 py-2.5 text-left min-w-[180px]">Cost Head</th>
                  <th className="px-4 py-2.5 text-right">3-Month Avg</th>
                  {forecastData.nextMonths.map(m => (
                    <th key={m} className="px-4 py-2.5 text-right text-blue-200">{m} <span className="text-[9px] opacity-60">(proj.)</span></th>
                  ))}
                  <th className="px-4 py-2.5 text-right">3-Month Proj. Total</th>
                </tr>
              </thead>
              <tbody>
                {forecastData.rows.map((r, i) => (
                  <tr key={r.head} className={clsx('border-b border-slate-100', i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40')}>
                    <td className="px-4 py-2 font-medium text-slate-700">{r.head}</td>
                    <td className="px-4 py-2 text-right font-semibold text-slate-800">{fmtAmt(r.trailing_avg)}</td>
                    {r.projected.map((v, j) => (
                      <td key={j} className="px-4 py-2 text-right text-indigo-600 font-medium">{fmtAmt(v)}</td>
                    ))}
                    <td className="px-4 py-2 text-right font-bold text-slate-800">{fmtAmt(r.trailing_avg * 3)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-[#E4EFDC] font-bold border-t-2 border-slate-300">
                  <td className="px-4 py-2.5 text-sm font-bold text-slate-800">Total</td>
                  <td className="px-4 py-2.5 text-right text-sm text-emerald-700">{fmtAmt(forecastData.totalAvg)}</td>
                  {[0, 1, 2].map(j => (
                    <td key={j} className="px-4 py-2.5 text-right text-sm text-indigo-700 font-bold">{fmtAmt(forecastData.totalAvg)}</td>
                  ))}
                  <td className="px-4 py-2.5 text-right text-sm font-bold text-slate-900">{fmtAmt(forecastData.totalAvg * 3)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ── Monthly matrix table (default) ───────────────────────────────────── */}
      {monthlyView === 'table' && (
      <div ref={printRef} className="overflow-x-auto">
        <BOQPrintHeader
          title="Monthly Cost Head Expenditure Analysis"
          subtitle="All paid transactions grouped by month — cost head × month matrix for project analysis"
          projectName={projectName}
          projectAddress={projectAddress}
          clientName={clientName}
          meta={[
            ['Period', months.length > 0 ? `${fmtMonth(months[0])} – ${fmtMonth(months[months.length - 1])}` : '—'],
            ['Total Paid', grandTotal > 0 ? `₹${Math.round(grandTotal).toLocaleString('en-IN')}` : '—'],
            ['Months', String(months.length)],
          ]}
        />
        <table className="text-xs w-full min-w-max">
          <thead>
            <tr className="bg-[#0B2E59] text-white">
              <th className="px-4 py-2.5 text-left sticky left-0 bg-[#0B2E59] z-10 min-w-[180px]">Cost Head</th>
              {months.map(m => (
                <th key={m} className="px-3 py-2.5 text-right min-w-[110px] font-medium">{fmtMonth(m)}</th>
              ))}
              <th className="px-4 py-2.5 text-right min-w-[120px] font-bold bg-[#0D3870]">Total</th>
            </tr>
          </thead>
          <tbody>
            {BOQ_COST_HEADS_ORDER.map((head, i) => (
              <tr key={head} className={clsx('border-b border-slate-100', i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40')}>
                <td className="px-4 py-2 font-medium text-slate-700 sticky left-0 bg-inherit">{head}</td>
                {months.map(m => {
                  const amt = byMonthBreakdown[m]?.[head] || 0;
                  return (
                    <td key={m} className={clsx('px-3 py-2 text-right tabular-nums', amt > 0 ? 'text-slate-800 font-semibold' : 'text-slate-300')}>
                      {fmtAmt(amt)}
                    </td>
                  );
                })}
                <td className="px-4 py-2 text-right font-bold text-slate-800 bg-slate-50 tabular-nums">
                  {fmtAmt(headTotals[head] || 0)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-[#E4EFDC] font-bold border-t-2 border-slate-300">
              <td className="px-4 py-2.5 text-sm font-bold text-slate-800 sticky left-0 bg-[#E4EFDC]">Monthly Total</td>
              {months.map(m => (
                <td key={m} className="px-3 py-2.5 text-right text-sm text-emerald-700 tabular-nums">
                  {fmtAmt(monthTotals[m] || 0)}
                </td>
              ))}
              <td className="px-4 py-2.5 text-right text-sm font-bold text-slate-900 bg-[#d0e6c4] tabular-nums">
                {fmtAmt(grandTotal)}
              </td>
            </tr>
          </tfoot>
        </table>
        <BOQPrintFooter />
      </div>
      )}
    </div>
  );
}

// ─── Cost Head Budget Tab ─────────────────────────────────────────────────────
function CostHeadBudgetTab({ projectId, projectName, projectAddress, clientName }) {
  const qc = useQueryClient();
  const [editingHead, setEditingHead] = useState(null);
  const [editVal, setEditVal] = useState('');
  const [editingBoqHead, setEditingBoqHead] = useState(null);
  const [editBoqVal, setEditBoqVal] = useState('');
  const [expandedHead, setExpandedHead] = useState(null);
  const [showBulk, setShowBulk] = useState(false);
  const [bulkText, setBulkText] = useState(DEFAULT_BULK_TEXT);
  const [costheadView, setCostheadView] = useState('summary'); // 'summary' | 'monthly'
  const printBudgetRef = useRef();
  const handlePrintBudget = useReactToPrint({
    contentRef: printBudgetRef,
    documentTitle: `Cost_Head_Budget_${projectName || projectId}`,
    pageStyle: `
      @page { size: A4 portrait; margin: 10mm; }
      @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    `,
  });

  const { data: summaryResp, isLoading } = useQuery({
    queryKey: ['costhead-summary', projectId],
    queryFn: () => boqBudgetAPI.costheadSummary(projectId).then(r => r.data),
    enabled: !!projectId,
  });
  const data          = summaryResp?.data          || [];
  const totalBoqValue = summaryResp?.total_boq_value || 0;
  const monthsElapsed = summaryResp?.months_elapsed  || 1;

  const saveMutation = useMutation({
    mutationFn: ({ cost_head, budget_amount }) =>
      boqBudgetAPI.setCostheadBudget(projectId, { cost_head, budget_amount }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['costhead-summary', projectId] });
      setEditingHead(null);
      toast.success('Budget saved');
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed to save'),
  });

  const alertMutation = useMutation({
    mutationFn: () => boqBudgetAPI.sendBudgetAlert(projectId),
    onSuccess: (res) => {
      const d = res.data;
      if (d.sent) toast.success(`Alert emailed — ${d.alert_count} head(s) flagged (${d.over_count} over, ${d.near_count} near limit)`);
      else toast(`No alert sent: ${d.reason}`, { icon: 'ℹ️' });
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed to send alert'),
  });

  const commit = (cost_head) => {
    const n = parseFloat(editVal);
    if (isNaN(n) || n < 0) { toast.error('Enter a valid amount'); return; }
    saveMutation.mutate({ cost_head, budget_amount: n });
  };

  const commitBoq = (cost_head) => {
    const n = parseFloat(editBoqVal);
    if (isNaN(n) || n < 0) { toast.error('Enter a valid amount'); return; }
    saveMutation.mutate({ cost_head, boq_amount: n });
  };

  const rows = data || [];
  const totalBudget = rows.reduce((s, r) => s + r.budget, 0);
  const totalActual = rows.filter(r => !r.derived).reduce((s, r) => s + r.actual, 0);

  // Contingency absorption: overages in non-derived heads draw from the contingency reserve.
  const totalNonDerivedOverage = rows
    .filter(r => !r.derived && r.budget > 0 && r.actual > r.budget)
    .reduce((s, r) => s + (r.actual - r.budget), 0);
  const contRow = rows.find(r => r.cost_head === 'Contingency');
  const contBudget = contRow?.budget || 0;
  const contAbsorbed = Math.min(totalNonDerivedOverage, contBudget);
  const contRemaining = contBudget - contAbsorbed;
  const contingencyCoversAll = contBudget > 0 && totalNonDerivedOverage <= contBudget;

  const alertHeads     = data.filter(r => !r.derived && r.budget > 0 && r.actual / r.budget >= 0.8);
  const overHeads      = alertHeads.filter(r => r.actual > r.budget);
  const nearHeads      = alertHeads.filter(r => r.actual <= r.budget);

  const toggleExpand = (cost_head, hasActual) => {
    if (!hasActual) return;
    setExpandedHead(prev => prev === cost_head ? null : cost_head);
  };

  if (isLoading && costheadView === 'summary') return <div className="py-16 text-center text-slate-400 text-sm">Loading…</div>;

  return (
    <div className="space-y-3">
      {/* Sub-tabs: Summary vs Monthly */}
      <div className="flex gap-2">
        {[
          { id: 'summary', label: 'Budget vs Actual' },
          { id: 'monthly', label: 'Monthly Analysis' },
        ].map(t => (
          <button key={t.id} onClick={() => setCostheadView(t.id)}
            className={clsx('px-4 py-1.5 text-xs font-bold rounded-lg border transition',
              costheadView === t.id
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50')}>
            {t.label}
          </button>
        ))}
      </div>

      {costheadView === 'monthly' && <CostHeadMonthlyTab projectId={projectId} projectName={projectName} projectAddress={projectAddress} clientName={clientName} />}

      {costheadView === 'summary' && (
    <div className="space-y-3">

      {/* ── Budget alert banner ── */}
      {alertHeads.length > 0 && (
        <div className={clsx(
          'rounded-xl px-4 py-3 flex items-center justify-between gap-3 border',
          overHeads.length > 0 && !contingencyCoversAll ? 'bg-rose-50 border-rose-200'
          : overHeads.length > 0 && contingencyCoversAll ? 'bg-amber-50 border-amber-200'
          : 'bg-amber-50 border-amber-200'
        )}>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <AlertTriangle size={16} className={clsx(
              overHeads.length > 0 && !contingencyCoversAll ? 'text-rose-500 flex-shrink-0'
              : 'text-amber-500 flex-shrink-0'
            )} />
            <span className={clsx('text-xs font-semibold',
              overHeads.length > 0 && !contingencyCoversAll ? 'text-rose-800' : 'text-amber-800')}>
              {overHeads.length > 0 && contingencyCoversAll && `${overHeads.length} head${overHeads.length > 1 ? 's' : ''} over individual budget — covered by contingency`}
              {overHeads.length > 0 && !contingencyCoversAll && `${overHeads.length} head${overHeads.length > 1 ? 's' : ''} OVER budget — contingency insufficient`}
              {overHeads.length > 0 && nearHeads.length > 0 && ' · '}
              {nearHeads.length > 0 && `${nearHeads.length} near limit (≥80%)`}
              {' — '}
              {alertHeads.map(r => r.cost_head).join(', ')}
            </span>
          </div>
          <button
            onClick={() => alertMutation.mutate()}
            disabled={alertMutation.isPending || !projectId}
            className={clsx(
              'flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition',
              overHeads.length > 0 && !contingencyCoversAll
                ? 'bg-rose-600 hover:bg-rose-700 text-white disabled:opacity-50'
                : 'bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-50'
            )}>
            <Bell size={12} />
            {alertMutation.isPending ? 'Sending…' : 'Email Alert'}
          </button>
        </div>
      )}

    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
      <div className="px-5 py-3 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-slate-700">Actual Expenditure — Cost Head Budget vs Actual</h3>
          <p className="text-[11px] text-slate-400">Click Budget cell to enter amount · Click Actual amount to expand transaction details</p>
        </div>
        <div className="flex items-center gap-3">
          {monthsElapsed > 1 && (
            <div className="text-right">
              <div className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">Months Tracked</div>
              <div className="text-sm font-bold text-slate-700">{monthsElapsed} mo</div>
            </div>
          )}
          {totalBoqValue > 0 && (
            <div className="text-right">
              <div className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">Total BOQ Value</div>
              <div className="text-sm font-bold text-slate-700">₹{Math.round(totalBoqValue).toLocaleString('en-IN')}</div>
            </div>
          )}
          <button onClick={handlePrintBudget}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition">
            <Printer className="w-3.5 h-3.5" /> Print
          </button>
        </div>
      </div>
      <div ref={printBudgetRef}>
        <BOQPrintHeader
          title="Cost Head Budget vs Actual Expenditure"
          subtitle="Allocated budget vs actual spend — advance, invoiced and balance by cost head"
          projectName={projectName}
          projectAddress={projectAddress}
          clientName={clientName}
          meta={[
            ['Total BOQ Value', totalBoqValue > 0 ? `₹${Math.round(totalBoqValue).toLocaleString('en-IN')}` : null],
            ['Total Budget', totalBudget > 0 ? `₹${Math.round(totalBudget).toLocaleString('en-IN')}` : null],
            ['Total Actual', totalActual > 0 ? `₹${Math.round(totalActual).toLocaleString('en-IN')}` : null],
          ]}
        />
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[#0B2E59] text-white text-xs">
            <th className="px-4 py-2.5 text-center w-12">Sl No</th>
            <th className="px-4 py-2.5 text-left">Description of Works</th>
            <th className="px-4 py-2.5 text-right w-44">BOQ Value</th>
            <th className="px-4 py-2.5 text-right w-52">Budget</th>
            <th className="px-4 py-2.5 text-right w-44">Actual Expenditure</th>
            <th className="px-4 py-2.5 text-right w-24">% Used</th>
            <th className="px-4 py-2.5 text-right w-40">Provisional</th>
            <th className="px-4 py-2.5 text-right w-44">Balance</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const isEditing = editingHead === r.cost_head;
            const isExpanded = expandedHead === r.cost_head;
            const over = !r.derived && r.actual > r.budget && r.budget > 0;
            // When contingency can cover all overages, treat over-budget heads as amber (covered) not rose (critical)
            const overCovered = over && contingencyCoversAll;
            const overCritical = over && !contingencyCoversAll;
            const isContingency = r.cost_head === 'Contingency';
            const hasActual = r.actual > 0;
            return (
              <React.Fragment key={r.cost_head}>
                <tr className={clsx('border-b border-slate-100',
                  overCritical && 'bg-rose-50/30',
                  overCovered && 'bg-amber-50/30',
                  isContingency && contAbsorbed > 0 && 'bg-blue-50/20',
                  isExpanded && 'bg-indigo-50/40')}>
                  <td className="px-4 py-2 text-center text-slate-500 font-bold">{i + 1}</td>
                  <td className="px-4 py-2 font-medium text-slate-700">
                    <div className="flex items-center gap-1.5">
                      {hasActual && (
                        <button onClick={() => toggleExpand(r.cost_head, hasActual)}
                          className="text-indigo-400 hover:text-indigo-600 transition-colors flex-shrink-0">
                          <svg xmlns="http://www.w3.org/2000/svg" className={clsx('w-3.5 h-3.5 transition-transform', isExpanded && 'rotate-90')} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                      )}
                      <span>{r.cost_head}</span>
                    </div>
                  </td>
                  <td className="px-2 py-1 group/boq">
                    {r.derived ? (
                      <div className="text-right px-2 text-sm font-semibold text-slate-600 tabular-nums">
                        {r.boq_value > 0 ? `₹${Math.round(r.boq_value).toLocaleString('en-IN')}` : <span className="text-slate-300">—</span>}
                      </div>
                    ) : editingBoqHead === r.cost_head ? (
                      <div className="flex items-center gap-1">
                        <input autoFocus type="number" value={editBoqVal}
                          onChange={e => setEditBoqVal(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') commitBoq(r.cost_head); if (e.key === 'Escape') setEditingBoqHead(null); }}
                          className="flex-1 min-w-0 border border-teal-400 rounded-lg px-2 py-1 text-xs text-right focus:outline-none"
                        />
                        <button onClick={() => commitBoq(r.cost_head)} disabled={saveMutation.isPending}
                          className="shrink-0 px-2 py-1 bg-teal-600 text-white text-[10px] font-bold rounded-lg hover:bg-teal-500 disabled:opacity-50">Save</button>
                        <button onClick={() => setEditingBoqHead(null)}
                          className="shrink-0 px-2 py-1 bg-slate-100 text-slate-600 text-[10px] rounded-lg hover:bg-slate-200">✕</button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-1 px-2">
                        <span className={clsx('text-sm font-semibold tabular-nums', r.boq_value > 0 ? 'text-slate-700' : 'text-slate-300 italic text-xs')}>
                          {r.boq_value > 0 ? `₹${Math.round(r.boq_value).toLocaleString('en-IN')}` : '— set'}
                        </span>
                        {r.boq_source !== 'breakdown' && (
                          <button
                            onClick={() => { setEditingBoqHead(r.cost_head); setEditBoqVal(r.boq_value > 0 && r.boq_source !== 'budget' ? String(r.boq_value) : ''); setEditingHead(null); }}
                            className="opacity-0 group-hover/boq:opacity-100 transition-opacity w-5 h-5 rounded hover:bg-teal-100 flex items-center justify-center flex-shrink-0"
                            title="Edit BOQ Value">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 text-teal-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>
                        )}
                        {r.boq_source === 'breakdown' && (
                          <span className="opacity-0 group-hover/boq:opacity-100 text-[9px] text-teal-600 bg-teal-50 border border-teal-200 rounded px-1 py-0.5 ml-1 flex-shrink-0">BOQ</span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-1">
                    {r.derived ? (
                      <div className="flex items-center justify-end gap-2 px-2">
                        <span className="text-sm font-semibold text-slate-800">
                          {r.budget !== 0 ? `₹${Math.round(r.budget).toLocaleString('en-IN')}` : '—'}
                        </span>
                        {r.cost_head === 'Profit' ? (
                          <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 font-bold">auto 10%</span>
                        ) : (
                          <span className="text-[10px] text-blue-600 bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5 font-bold">reserved</span>
                        )}
                      </div>
                    ) : isEditing ? (
                      <div className="flex items-center gap-1">
                        <input autoFocus type="number" value={editVal}
                          onChange={e => setEditVal(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') commit(r.cost_head); if (e.key === 'Escape') setEditingHead(null); }}
                          className="flex-1 min-w-0 border border-indigo-400 rounded-lg px-2 py-1 text-xs text-right focus:outline-none"
                        />
                        <button onClick={() => commit(r.cost_head)} disabled={saveMutation.isPending}
                          className="shrink-0 px-2 py-1 bg-indigo-600 text-white text-[10px] font-bold rounded-lg hover:bg-indigo-500 disabled:opacity-50">Save</button>
                        <button onClick={() => setEditingHead(null)}
                          className="shrink-0 px-2 py-1 bg-slate-100 text-slate-600 text-[10px] rounded-lg hover:bg-slate-200">✕</button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-2 px-2">
                        <span className={clsx('text-sm font-semibold', r.budget > 0 ? 'text-slate-800' : 'text-slate-300 italic text-xs')}>
                          {r.budget > 0 ? `₹${Math.round(r.budget).toLocaleString('en-IN')}` : 'Not set'}
                        </span>
                        <button onClick={() => { setEditVal(r.budget ? Math.round(r.budget).toString() : ''); setEditingHead(r.cost_head); }}
                          className="px-2 py-0.5 bg-indigo-50 border border-indigo-200 text-indigo-600 text-[10px] font-bold rounded hover:bg-indigo-100">
                          Edit
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right font-semibold">
                    {isContingency ? (
                      <div className="text-right">
                        {contAbsorbed > 0 ? (
                          <>
                            <div className="font-semibold text-amber-700">
                              ₹{Math.round(contAbsorbed).toLocaleString('en-IN')}
                            </div>
                            <div className="text-[9px] text-amber-500">drawn for overages</div>
                          </>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </div>
                    ) : r.derived ? (
                      <span className="font-semibold text-emerald-700">
                        {r.actual > 0 ? `₹${Math.round(r.actual).toLocaleString('en-IN')}` : '—'}
                      </span>
                    ) : hasActual ? (
                      <button onClick={() => toggleExpand(r.cost_head, hasActual)}
                        className={clsx('font-semibold hover:underline underline-offset-2 transition-colors',
                          isExpanded ? 'text-indigo-600' : 'text-emerald-700 hover:text-indigo-600')}>
                        ₹{Math.round(r.actual).toLocaleString('en-IN')}
                        <span className="ml-1 text-[10px] opacity-60">{isExpanded ? '▲' : '▼'}</span>
                      </button>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right text-xs font-bold tabular-nums">
                    {r.budget > 0 && !isContingency ? (
                      <span className={clsx(
                        r.actual / r.budget > 1
                          ? (overCovered ? 'text-amber-600' : 'text-rose-600')
                          : r.actual / r.budget > 0.85 ? 'text-amber-600' : 'text-slate-600'
                      )}>
                        {((r.actual / r.budget) * 100).toFixed(1)}%
                      </span>
                    ) : isContingency && contBudget > 0 ? (
                      <span className={clsx('text-slate-500')}>
                        {contAbsorbed > 0 ? `${((contAbsorbed / contBudget) * 100).toFixed(1)}%` : '0.0%'}
                      </span>
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-2 text-right text-xs tabular-nums">
                    {!isContingency && r.monthly_avg > 0 ? (
                      <div>
                        <div className={clsx('font-bold',
                          r.budget > 0 && r.monthly_avg * 12 > r.budget ? 'text-rose-600' : 'text-indigo-600')}>
                          {inr(r.monthly_avg * 12)}
                        </div>
                        <div className="text-[9px] text-slate-400">{inr(r.monthly_avg)}/mo</div>
                      </div>
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className={clsx('px-4 py-2 text-right font-bold',
                    r.budget === 0 && !isContingency ? 'text-slate-300'
                    : overCritical ? 'text-rose-600'
                    : overCovered ? 'text-amber-600'
                    : isContingency && contAbsorbed > 0 ? (contRemaining > 0 ? 'text-emerald-600' : 'text-rose-600')
                    : 'text-emerald-600')}>
                    {isContingency ? (
                      <>
                        {contBudget > 0
                          ? `₹${Math.round(contRemaining).toLocaleString('en-IN')}`
                          : '—'}
                        {contAbsorbed > 0 && contBudget > 0 && (
                          <div className="text-[9px] text-blue-500">
                            {contRemaining > 0 ? `₹${Math.round(contRemaining).toLocaleString('en-IN')} left` : '⚠ Exhausted'}
                          </div>
                        )}
                      </>
                    ) : r.budget > 0 || r.actual > 0
                      ? `₹${Math.round(r.budget - r.actual).toLocaleString('en-IN')}`
                      : '—'}
                    {overCritical && <div className="text-[9px] text-rose-500">⚠ Over — contingency exhausted</div>}
                    {overCovered && <div className="text-[9px] text-amber-500">↑ From contingency</div>}
                  </td>
                </tr>
                {isExpanded && <CostHeadDrilldown projectId={projectId} costHead={r.cost_head} />}
              </React.Fragment>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="bg-[#E4EFDC] font-bold border-t-2 border-slate-300">
            <td className="px-4 py-2.5" />
            <td className="px-4 py-2.5 text-sm font-bold text-slate-800">Total</td>
            <td className="px-4 py-2.5 text-right text-sm text-slate-700">
              {rows.reduce((s, r) => s + (r.boq_value || 0), 0) > 0
                ? `₹${Math.round(rows.reduce((s, r) => s + (r.boq_value || 0), 0)).toLocaleString('en-IN')}`
                : '—'}
            </td>
            <td className="px-4 py-2.5 text-right text-sm">₹{Math.round(totalBudget).toLocaleString('en-IN')}</td>
            <td className="px-4 py-2.5 text-right text-sm text-emerald-700">₹{Math.round(totalActual).toLocaleString('en-IN')}</td>
            <td className="px-4 py-2.5 text-right text-xs font-bold text-slate-600">
              {totalBudget > 0 ? `${((totalActual / totalBudget) * 100).toFixed(1)}%` : '—'}
            </td>
            <td className="px-4 py-2.5 text-right text-xs font-bold text-indigo-600">
              {monthsElapsed > 0
                ? inr((rows.reduce((s, r) => s + (r.monthly_avg || 0), 0)) * 12)
                : '—'}
            </td>
            <td className={clsx('px-4 py-2.5 text-right text-sm font-bold', totalBudget - totalActual < 0 ? 'text-rose-600' : 'text-emerald-600')}>
              ₹{Math.round(totalBudget - totalActual).toLocaleString('en-IN')}
            </td>
          </tr>
        </tfoot>
      </table>
        <BOQPrintFooter />
      </div>
    </div>
    </div>
      )}
    </div>
  );
}

export default function BOQBudgetBreakdownPage({ embedded = false }) {
  const [projectId, setProjectId] = useState('');
  const [mode, setMode] = useState('amount'); // 'amount' | 'pct'
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState({});
  const qc = useQueryClient();

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectAPI.list().then(r => {
      const d = r?.data;
      if (Array.isArray(d)) return d;
      if (d?.data) return d.data;
      return [];
    }).catch(() => []),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['boq-budget', projectId],
    queryFn: () => boqBudgetAPI.list(projectId).then(r => r.data).catch(() => ({ data: [], cost_heads: [] })),
    enabled: !!projectId,
  });

  const allItems = data?.data || [];
  const costHeads = data?.cost_heads || [];

  const updateMutation = useMutation({
    mutationFn: ({ boqItemId, entries }) => boqBudgetAPI.updateItem(boqItemId, entries),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['boq-budget', projectId] });
      if (res?.data?.over_budget) toast.error('Breakdown exceeds BOQ item amount');
      else toast.success('Saved');
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed to save'),
  });

  const setTotalMutation = useMutation({
    mutationFn: ({ boqItemId, total }) => boqBudgetAPI.setItemTotal(boqItemId, total),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['boq-budget', projectId] });
      toast.success('Budget saved');
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed to save'),
  });

  const saveCell = (item, costHead, field, value) => {
    const entry = { cost_head: costHead };
    entry[field] = value;
    updateMutation.mutate({ boqItemId: item.id, entries: [entry] });
  };

  const saveItemTotal = (item, total) => {
    setTotalMutation.mutate({ boqItemId: item.id, total });
  };

  // Per-item rollups
  const items = useMemo(() => {
    return allItems
      .filter(it => !search ||
        [it.item_no, it.description].some(v => v?.toLowerCase().includes(search.toLowerCase())))
      .map(it => {
        let budgeted = 0, advance = 0, invoiced = 0, prorated = 0;
        for (const h of costHeads) {
          const c = it.breakdown?.[h] || {};
          budgeted += num(c.amount);
          advance  += num(c.advance);
          invoiced += num(c.invoiced);
          prorated += num(c.prorated);
        }
        const spent = advance + invoiced + prorated;
        const amount = num(it.amount);
        return {
          ...it, amount, budgeted, advance, invoiced, prorated, spent,
          balance: budgeted - spent,
          over: budgeted > amount + 0.01,
          allocated: budgeted > 0,
        };
      });
  }, [allItems, costHeads, search]);

  const totals = useMemo(() => items.reduce((t, it) => ({
    boq:      t.boq + it.amount,
    budgeted: t.budgeted + it.budgeted,
    advance:  t.advance + it.advance,
    invoiced: t.invoiced + it.invoiced,
    prorated: t.prorated + it.prorated,
    spent:    t.spent + it.spent,
    balance:  t.balance + it.balance,
    allocated: t.allocated + (it.allocated ? 1 : 0),
  }), { boq: 0, budgeted: 0, advance: 0, invoiced: 0, prorated: 0, spent: 0, balance: 0, allocated: 0 }), [items]);

  const toggle = (id) => setExpanded(e => ({ ...e, [id]: !e[id] }));

  // ── BOQ Summary rollup (chapter-level Bill Value vs Budgeted value) ───────────
  // Grouped by chapter NAME (not chapter_no) so every item belonging to a chapter
  // like "Blockwork" rolls into ONE row whose total equals the sum of those items,
  // even when sub-items carry different hierarchical chapter_no values.
  // Independent of the search box so the summary/print always covers the whole BOQ.
  const toNum = (v) => parseFloat(String(v || '').replace(/[^0-9.]/g, '')) || 0;
  const toTitleCase = (s) => s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  const normName = (s) => (s || '').trim().replace(/\s+/g, ' ').toLowerCase();

  // Adaptive: group by chapter_name when multiple distinct names exist, else by chapter_no
  const useNameGrouping = useMemo(() => {
    const names = new Set(allItems.map(i => normName(i.chapter_name)).filter(Boolean));
    return names.size > 1;
  }, [allItems]);

  const chapterKey = (it) => {
    if (useNameGrouping) {
      const name = normName(it.chapter_name);
      return name || `__no:${it.chapter_no || 'ZZZ'}`;
    }
    return it.chapter_no || '0';
  };
  const chapterLabel = (it) => {
    if (useNameGrouping) {
      const name = (it.chapter_name || '').trim().replace(/\s+/g, ' ');
      return name ? toTitleCase(name) : (it.chapter_no ? `Chapter ${it.chapter_no}` : 'Other Miscellaneous Works');
    }
    return it.chapter_name && it.chapter_no
      ? `${it.chapter_no} — ${toTitleCase((it.chapter_name || '').trim())}`
      : it.chapter_no ? `Chapter ${it.chapter_no}` : 'Miscellaneous';
  };

  const chapterRows = useMemo(() => {
    const map = {};
    allItems.forEach(it => {
      if (it.id === 'project-level-unlinked') return;
      const key = chapterKey(it);
      let budget = 0;
      for (const h of costHeads) budget += num(it.breakdown?.[h]?.amount);
      if (!map[key]) map[key] = { chapter_no: it.chapter_no, name: chapterLabel(it), bill: 0, budget: 0, sort: Infinity };
      map[key].bill   += num(it.amount);
      map[key].budget += budget;
      const sk = toNum(it.chapter_no) || toNum(it.item_no);
      if (sk) map[key].sort = Math.min(map[key].sort, sk);
    });
    return Object.values(map).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
  }, [allItems, costHeads]);

  const summaryTotals = useMemo(() => {
    const bill   = chapterRows.reduce((s, c) => s + c.bill, 0);
    const budget = chapterRows.reduce((s, c) => s + c.budget, 0);
    const gst    = bill * GST_PCT / 100; // bill-side GST on both columns (matches client sheet)
    return { bill, budget, gst, billGrand: bill + gst, budgetGrand: budget + gst };
  }, [chapterRows]);

  const lineItemsByChapter = useMemo(() => {
    const map = {};
    allItems.forEach(it => {
      if (it.id === 'project-level-unlinked') return;
      const key = chapterKey(it);
      if (!map[key]) map[key] = { chapter_no: it.chapter_no, name: chapterLabel(it), items: [], sort: Infinity };
      map[key].items.push(it);
      const sk = toNum(it.chapter_no) || toNum(it.item_no);
      if (sk) map[key].sort = Math.min(map[key].sort, sk);
    });
    // keep items ordered by their item_no within each chapter
    Object.values(map).forEach(ch =>
      ch.items.sort((a, b) => toNum(a.item_no) - toNum(b.item_no) || String(a.item_no).localeCompare(String(b.item_no))));
    return Object.values(map).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
  }, [allItems]);

  // Groups the computed items (with budgeted/spent rollups) by chapter for the breakdown view
  const itemsByChapter = useMemo(() => {
    const map = {};
    items.forEach(it => {
      if (it.id === 'project-level-unlinked') return;
      const key = chapterKey(it);
      if (!map[key]) map[key] = { key, name: chapterLabel(it), items: [], sort: Infinity };
      map[key].items.push(it);
      const sk = toNum(it.chapter_no) || toNum(it.item_no);
      if (sk && sk < map[key].sort) map[key].sort = sk;
    });
    return Object.values(map).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
  }, [items, useNameGrouping]);

  // unlinked row (if any) shown after all chapters
  const unlinkedItem = items.find(isUnlinkedRow);

  const selectedProject = projects.find(p => p.id === projectId);
  const projectAddress = [selectedProject?.location, selectedProject?.city, selectedProject?.state].filter(Boolean).join(', ');
  const clientName = selectedProject?.client_name || '';
  const printRef = useRef();
  const handlePrint = useReactToPrint({ contentRef: printRef, documentTitle: `BOQ_${selectedProject?.name || 'Summary'}` });
  const breakdownPrintRef = useRef();
  const handlePrintBreakdown = useReactToPrint({
    contentRef: breakdownPrintRef,
    documentTitle: `Budget_Breakdown_${selectedProject?.name || projectId}`,
    pageStyle: `
      @page { size: A4 landscape; margin: 10mm; }
      @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    `,
  });
  const [view, setView] = useState('breakdown'); // 'breakdown' | 'summary'

  const chapterBudgetMutation = useMutation({
    mutationFn: ({ chapterName, chapterNo, totalBudget }) =>
      boqBudgetAPI.setChapterBudget(projectId, {
        chapter_name: chapterName,
        chapter_no: chapterNo,
        total_budget: totalBudget,
        cost_head: 'Sub Con',
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['boq-budget', projectId] });
      toast.success(`Budget set for ${vars.chapterName || vars.chapterNo}`);
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed to set budget'),
  });

  return (
    <div style={embedded ? {} : { background: Theme.pageBg, minHeight: '100vh' }}>
      {!embedded && (
        <PageHeader
          title="BOQ Budget Breakdown"
          subtitle="Allocate each BOQ item's budget across cost heads and track advance, invoiced & balance"
          breadcrumbs={[{ label: 'Procurement' }, { label: 'BOQ Budget Breakdown' }]}
          actions={
            <div className="flex items-center gap-2">
              {mode !== undefined && view === 'breakdown' && (
                <button
                  onClick={() => setMode(mode === 'amount' ? 'pct' : 'amount')}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg transition"
                  style={{ background: 'rgba(255,255,255,0.16)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff' }}
                  title="Toggle budget entry mode">
                  {mode === 'amount' ? <IndianRupee className="w-3.5 h-3.5" /> : <Percent className="w-3.5 h-3.5" />}
                  Enter as {mode === 'amount' ? 'Amount' : 'Percent'}
                </button>
              )}
              {projectId && (
                <button
                  onClick={handlePrint}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg transition"
                  style={{ background: '#fff', color: '#0B2E59', border: '1px solid rgba(255,255,255,0.25)' }}
                  title="Print BOQ Summary + Items">
                  <Printer className="w-3.5 h-3.5" /> Print BOQ
                </button>
              )}
            </div>
          }
        />
      )}

      <div className="p-5 md:p-6 max-w-[1400px] mx-auto space-y-5">

        {/* Project selector + search */}
        <div className="flex flex-wrap gap-3">
          <select value={projectId} onChange={e => setProjectId(e.target.value)}
            className="border border-slate-200 bg-white rounded-xl px-3 py-2 text-sm shadow-sm focus:outline-none min-w-64">
            <option value="">— Select Project —</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {projectId && (
            <div className="relative flex-1 min-w-52">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search BOQ items…"
                className="pl-9 pr-3 py-2 border border-slate-200 bg-white rounded-xl text-sm w-full focus:outline-none shadow-sm" />
            </div>
          )}
        </div>

        {!projectId && (
          <div className="bg-white rounded-2xl border border-slate-200 py-20 text-center shadow-sm">
            <Layers className="w-12 h-12 text-slate-200 mx-auto mb-4" />
            <p className="text-slate-500 font-semibold">Select a project to view its budget breakdown</p>
            <p className="text-xs text-slate-400 mt-1">Allocate each BOQ item's budget across cost heads</p>
          </div>
        )}

        {projectId && isLoading && (
          <div className="space-y-2">{[1, 2, 3].map(n => <div key={n} className="h-14 bg-white border border-slate-200 rounded-xl animate-pulse" />)}</div>
        )}

        {projectId && !isLoading && (
          <>
            {/* View tabs */}
            <div className="flex gap-2">
              {[
                { id: 'breakdown', label: 'Budget Breakdown', icon: LayoutList },
                { id: 'summary',   label: 'BOQ Summary',      icon: FileText },
                { id: 'costhead',  label: 'Cost Head Budget',  icon: BarChart2 },
              ].map(t => (
                <button key={t.id} onClick={() => setView(t.id)}
                  className={clsx('flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg border transition',
                    view === t.id ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50')}>
                  <t.icon className="w-3.5 h-3.5" /> {t.label}
                </button>
              ))}
            </div>

            {/* ── BOQ SUMMARY VIEW (chapter rollup — same data as print) ── */}
            {view === 'summary' && (
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="px-5 py-3 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-700">{selectedProject?.name} — BOQ Summary</h3>
                    <p className="text-[11px] text-slate-400">Click any Budgeted value cell to enter chapter budget — distributed proportionally across items</p>
                  </div>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#7E93B8] text-white">
                      <th className="px-3 py-2.5 text-center w-14 font-bold border border-slate-300">S.No</th>
                      <th className="px-3 py-2.5 text-left font-bold border border-slate-300">Description of Works</th>
                      <th className="px-3 py-2.5 text-right font-bold border border-slate-300">Bill Value</th>
                      <th className="px-3 py-2.5 text-right font-bold border border-slate-300 w-52">Budgeted value <span className="font-normal text-[10px] opacity-75">(click to edit)</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {chapterRows.map((c, i) => (
                      <tr key={c.chapter_no || i} className="border-b border-slate-100">
                        <td className="px-3 py-2 text-center font-bold border border-slate-200">{i + 1}</td>
                        <td className="px-3 py-2 font-semibold text-slate-700 border border-slate-200">{c.name}</td>
                        <td className="px-3 py-2 text-right border border-slate-200">{inr2(c.bill)}</td>
                        <td className="px-3 py-1 border border-slate-200">
                          <ChapterBudgetCell
                            value={c.budget}
                            saving={chapterBudgetMutation.isPending}
                            onSave={(v) => chapterBudgetMutation.mutate({
                              chapterName: useNameGrouping ? c.name : undefined,
                              chapterNo: !useNameGrouping ? c.chapter_no : undefined,
                              totalBudget: v,
                            })}
                          />
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-[#E4EFDC] font-bold">
                      <td className="border border-slate-200" />
                      <td className="px-3 py-2 border border-slate-200">Total Works Value excluding GST</td>
                      <td className="px-3 py-2 text-right border border-slate-200">{inr2(summaryTotals.bill)}</td>
                      <td className="px-3 py-2 text-right border border-slate-200">{inr2(summaryTotals.budget)}</td>
                    </tr>
                    <tr>
                      <td className="border border-slate-200" />
                      <td className="px-3 py-2 border border-slate-200">GST {GST_PCT}%</td>
                      <td className="px-3 py-2 text-right border border-slate-200">{inr2(summaryTotals.gst)}</td>
                      <td className="px-3 py-2 text-right border border-slate-200">{inr2(summaryTotals.gst)}</td>
                    </tr>
                    <tr className="bg-[#E4EFDC] font-bold">
                      <td className="border border-slate-200" />
                      <td className="px-3 py-2 border border-slate-200">Grand Total Including GST</td>
                      <td className="px-3 py-2 text-right border border-slate-200">{inr2(summaryTotals.billGrand)}</td>
                      <td className="px-3 py-2 text-right border border-slate-200">{inr2(summaryTotals.budgetGrand)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* ── COST HEAD BUDGET VIEW ── */}
            {view === 'costhead' && (
              <CostHeadBudgetTab projectId={projectId} projectName={selectedProject?.name || ''} projectAddress={projectAddress} clientName={clientName} />
            )}

            {/* ── BUDGET BREAKDOWN VIEW (existing) ── */}
            {view === 'breakdown' && (
            <>
            {/* Summary KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <ThemeKpiCard icon={IndianRupee} label="BOQ Value"     value={inr(totals.boq)}      color="blue"    sub="Total contract value" />
              <ThemeKpiCard icon={Wallet}      label="Budgeted"      value={inr(totals.budgeted)} color="slate"   sub={`${totals.allocated}/${items.length} items allocated`} />
              <ThemeKpiCard icon={IndianRupee} label="Spent"         value={inr(totals.spent)}    color="amber"   sub={totals.prorated > 0 ? 'Incl. pro-rated spend' : 'Advance + invoiced'} />
              <ThemeKpiCard icon={CheckCircle2} label="Budget Balance" value={inr(totals.balance)} color={totals.balance >= 0 ? 'emerald' : 'red'} sub="Budget minus spent" />
            </div>

            {/* Master list */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
              {/* Title + Print button */}
              <div className="px-5 py-3 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-700">BOQ Budget Breakdown</h3>
                  <p className="text-[11px] text-slate-400">Click any row to expand cost-head detail · Budget cells are editable · <span className="text-amber-600">Spend not line-tagged to a BOQ item is pro-rated by budget share (≈)</span></p>
                </div>
                <button onClick={handlePrintBreakdown}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition">
                  <Printer className="w-3.5 h-3.5" /> Print
                </button>
              </div>
              {/* Column header */}
              <div className="grid grid-cols-[auto_40px_1fr_repeat(4,minmax(0,1fr))_90px] gap-2 items-center px-4 py-3 bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                <span className="w-4" />
                <span>S.No</span>
                <span>Chapter / Description</span>
                <span className="text-right">BOQ Value</span>
                <span className="text-right">Budget</span>
                <span className="text-right">Spent</span>
                <span className="text-right">Balance</span>
                <span className="text-right">Status</span>
              </div>

              <div className="divide-y divide-slate-100">
                {items.length === 0 && (
                  <div className="text-center py-16 text-slate-400 text-sm">
                    {search ? 'No BOQ items match your search.' : 'No BOQ items found for this project.'}
                  </div>
                )}

                {itemsByChapter.map((ch, ci) => {
                  const chBoq      = ch.items.reduce((s, i) => s + i.amount, 0);
                  const chBudgeted = ch.items.reduce((s, i) => s + i.budgeted, 0);
                  const chSpent    = ch.items.reduce((s, i) => s + i.spent, 0);
                  const chBalance  = chBudgeted - chSpent;
                  const chOver     = chSpent > chBoq + 0.01;
                  const chAllocated = chBudgeted > 0;
                  const isOpen     = expanded[`ch-${ch.key}`];
                  return (
                    <div key={ch.key}>
                      <button onClick={() => toggle(`ch-${ch.key}`)}
                        className={clsx('w-full grid grid-cols-[auto_40px_1fr_repeat(4,minmax(0,1fr))_90px] gap-2 items-center px-4 py-3 text-xs text-left hover:bg-slate-50 transition',
                          isOpen && 'bg-indigo-50/40')}>
                        <span className="w-4 text-slate-400">
                          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </span>
                        <span className="font-bold text-slate-500">{ci + 1}</span>
                        <span className="font-semibold text-slate-800">{ch.name}</span>
                        <span className="text-right font-semibold text-slate-800">{inr(chBoq)}</span>
                        <span className={clsx('text-right font-semibold', chOver ? 'text-rose-600' : chAllocated ? 'text-indigo-700' : 'text-slate-300')}>
                          {chBudgeted > 0 ? inr(chBudgeted) : '—'}
                        </span>
                        <span className="text-right font-medium text-amber-600">{chSpent > 0 ? inr(chSpent) : <span className="text-slate-300">—</span>}</span>
                        <span className={clsx('text-right font-bold', chBalance < 0 ? 'text-rose-600' : chAllocated ? 'text-emerald-600' : 'text-slate-300')}>
                          {chAllocated || chSpent > 0 ? inr(chBalance) : '—'}
                        </span>
                        <span className="text-right">
                          {!chAllocated
                            ? <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Not set</span>
                            : chOver
                              ? <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full"><AlertTriangle size={10} /> Over</span>
                              : <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">OK</span>}
                        </span>
                      </button>
                      {isOpen && (
                        <div className="bg-slate-50 border-t border-slate-200">
                          {ch.items.map(item => {
                            const itemOpen = expanded[item.id];
                            return (
                              <div key={item.id}>
                                <button onClick={() => toggle(item.id)}
                                  className={clsx('w-full grid grid-cols-[auto_90px_1fr_repeat(4,minmax(0,1fr))_90px] gap-2 items-center px-4 py-2 text-xs text-left hover:bg-white/60 transition pl-10',
                                    itemOpen && 'bg-indigo-50/40')}>
                                  <span className="w-4 text-slate-300">
                                    {itemOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                  </span>
                                  <span className="font-mono text-[10px] text-indigo-600 truncate">{item.item_no}</span>
                                  <span className="text-slate-600 truncate pr-2" title={item.description}>{item.description}</span>
                                  <span className="text-right text-slate-700">{inr(item.amount)}</span>
                                  <span className={clsx(item.allocated ? 'text-indigo-600' : 'text-slate-400')}>
                                    <EditableTotal value={item.budgeted} onSave={total => saveItemTotal(item, total)} />
                                  </span>
                                  <span className="text-right text-amber-600">{item.spent > 0 ? inr(item.spent) : <span className="text-slate-300">—</span>}</span>
                                  <span className={clsx('text-right', item.balance < 0 ? 'text-rose-600' : item.allocated ? 'text-emerald-600' : 'text-slate-300')}>
                                    {item.allocated || item.spent > 0 ? inr(item.balance) : '—'}
                                  </span>
                                  <span />
                                </button>
                                {itemOpen && <CostHeadDetail item={item} costHeads={costHeads} mode={mode} onSave={saveCell} />}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Unlinked project-level row (no chapter) */}
                {unlinkedItem && (() => {
                  const item = unlinkedItem;
                  const isOpen = expanded[item.id];
                  return (
                    <div key={item.id}>
                      <button onClick={() => toggle(item.id)}
                        className={clsx('w-full grid grid-cols-[auto_40px_1fr_repeat(4,minmax(0,1fr))_90px] gap-2 items-center px-4 py-3 text-xs text-left hover:bg-slate-50 transition italic bg-slate-50/60',
                          isOpen && 'bg-indigo-50/40')}>
                        <span className="w-4 text-slate-400">
                          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </span>
                        <span className="font-bold text-slate-500">—</span>
                        <span className="text-slate-700 font-medium">Unlinked Spend</span>
                        <span className="text-right font-semibold text-slate-300">—</span>
                        <span className="text-slate-300 text-right">—</span>
                        <span className="text-right font-medium text-amber-600">{item.spent > 0 ? inr(item.spent) : <span className="text-slate-300">—</span>}</span>
                        <span className="text-slate-300 text-right">—</span>
                        <span className="text-right"><span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">Unlinked</span></span>
                      </button>
                      {isOpen && <CostHeadDetail item={item} costHeads={costHeads} mode={mode} onSave={saveCell} />}
                    </div>
                  );
                })()}
              </div>

              {/* Grand total footer */}
              {items.length > 0 && (
                <div className="grid grid-cols-[auto_40px_1fr_repeat(4,minmax(0,1fr))_90px] gap-2 items-center px-4 py-3 bg-slate-900 text-xs">
                  <span className="w-4" />
                  <span className="font-bold text-white uppercase tracking-wide col-span-2">Grand Total</span>
                  <span className="text-right font-bold text-white">{inr(totals.boq)}</span>
                  <span className="text-right font-bold text-indigo-300">{inr(totals.budgeted)}</span>
                  <span className="text-right font-bold text-amber-300">{inr(totals.spent)}</span>
                  <span className={clsx('text-right font-bold', totals.balance < 0 ? 'text-rose-400' : 'text-emerald-300')}>{inr(totals.balance)}</span>
                  <span />
                </div>
              )}
            </div>
            </>
            )}
          </>
        )}
      </div>

      {/* Hidden print zone — BOQ Summary + Bill of Quantities */}
      <div style={{ display: 'none' }}>
        <div ref={printRef}>
          <BOQSummaryPrintTemplate
            projectName={selectedProject?.name || ''}
            projectAddress={projectAddress}
            clientName={clientName}
            chapterRows={chapterRows}
            lineItemsByChapter={lineItemsByChapter}
            totals={summaryTotals}
            gstPct={GST_PCT}
          />
        </div>
      </div>

      {/* Hidden print zone — Budget Breakdown (item-level) */}
      <div style={{ display: 'none' }}>
        <div ref={breakdownPrintRef} style={{ fontFamily: 'Arial, sans-serif', padding: 4 }}>
          <BOQPrintHeader
            title="BOQ Budget Breakdown Report"
            subtitle="Item-level budget vs spend and balance · spend not line-tagged to a BOQ item is pro-rated by budget share"
            projectName={selectedProject?.name || ''}
            projectAddress={projectAddress}
            clientName={clientName}
            meta={[
              ['Total BOQ Value', inr(totals.boq)],
              ['Total Budgeted', totals.budgeted > 0 ? inr(totals.budgeted) : 'Not set'],
              ['Total Balance', inr(totals.balance)],
              ['Items', String(items.length)],
            ]}
          />
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9 }}>
            <thead>
              <tr style={{ background: '#0B2E59', color: '#fff' }}>
                <th style={{ padding: '6px 8px', textAlign: 'left', width: 70 }}>Item No</th>
                <th style={{ padding: '6px 8px', textAlign: 'left' }}>Description of Works</th>
                <th style={{ padding: '6px 8px', textAlign: 'right', width: 95 }}>BOQ Value</th>
                <th style={{ padding: '6px 8px', textAlign: 'right', width: 95 }}>Budget</th>
                <th style={{ padding: '6px 8px', textAlign: 'right', width: 95 }}>Spent</th>
                <th style={{ padding: '6px 8px', textAlign: 'right', width: 95 }}>Balance</th>
                <th style={{ padding: '6px 8px', textAlign: 'center', width: 55 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {itemsByChapter.map((ch) => {
                const chBoq      = ch.items.reduce((s, i) => s + i.amount,    0);
                const chBudgeted = ch.items.reduce((s, i) => s + i.budgeted,  0);
                const chSpent    = ch.items.reduce((s, i) => s + i.spent,     0);
                const chBalance  = ch.items.reduce((s, i) => s + i.balance,   0);
                return (
                  <React.Fragment key={ch.key}>
                    {/* Chapter header row */}
                    <tr style={{ background: '#1e4d8c', color: '#fff' }}>
                      <td colSpan={2} style={{ padding: '5px 8px', fontWeight: 700, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.4 }}>{ch.name}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 700 }}>{inr(chBoq)}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right' }}>{chBudgeted > 0 ? inr(chBudgeted) : '—'}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', color: '#fcd34d' }}>{chSpent > 0 ? inr(chSpent) : '—'}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right' }}>{chBudgeted > 0 || chSpent > 0 ? inr(chBalance) : '—'}</td>
                      <td />
                    </tr>
                    {/* Item rows */}
                    {ch.items.map((item, ii) => (
                      <tr key={item.id} style={{ background: ii % 2 === 0 ? '#fff' : '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '4px 8px', fontFamily: 'monospace', color: '#4338ca', fontWeight: 700 }}>{item.item_no}</td>
                        <td style={{ padding: '4px 8px', color: '#334155' }}>{item.description}</td>
                        <td style={{ padding: '4px 8px', textAlign: 'right', color: '#1e293b', fontWeight: 600 }}>{inr(item.amount)}</td>
                        <td style={{ padding: '4px 8px', textAlign: 'right', color: item.over ? '#dc2626' : item.allocated ? '#4338ca' : '#94a3b8' }}>
                          {item.budgeted > 0 ? inr(item.budgeted) : '—'}
                        </td>
                        <td style={{ padding: '4px 8px', textAlign: 'right', color: '#b45309' }}>
                          {item.spent > 0 ? inr(item.spent) : '—'}
                        </td>
                        <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 700, color: item.balance < 0 ? '#dc2626' : item.allocated ? '#059669' : '#94a3b8' }}>
                          {item.allocated || item.spent > 0 ? inr(item.balance) : '—'}
                        </td>
                        <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                          {!item.allocated
                            ? <span style={{ background: '#fef3c7', color: '#b45309', padding: '1px 5px', borderRadius: 10, fontWeight: 700, fontSize: 8 }}>Not set</span>
                            : item.over
                              ? <span style={{ background: '#fee2e2', color: '#dc2626', padding: '1px 5px', borderRadius: 10, fontWeight: 700, fontSize: 8 }}>Over</span>
                              : <span style={{ background: '#dcfce7', color: '#059669', padding: '1px 5px', borderRadius: 10, fontWeight: 700, fontSize: 8 }}>OK</span>
                          }
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
              {/* Grand total row */}
              <tr style={{ background: '#0f172a', color: '#fff', fontWeight: 700 }}>
                <td colSpan={2} style={{ padding: '7px 8px', textTransform: 'uppercase', letterSpacing: 0.5 }}>Grand Total</td>
                <td style={{ padding: '7px 8px', textAlign: 'right' }}>{inr(totals.boq)}</td>
                <td style={{ padding: '7px 8px', textAlign: 'right', color: '#a5b4fc' }}>{inr(totals.budgeted)}</td>
                <td style={{ padding: '7px 8px', textAlign: 'right', color: '#fcd34d' }}>{inr(totals.spent)}</td>
                <td style={{ padding: '7px 8px', textAlign: 'right', color: totals.balance < 0 ? '#fca5a5' : '#6ee7b7' }}>{inr(totals.balance)}</td>
                <td />
              </tr>
            </tbody>
          </table>
          <BOQPrintFooter />
        </div>
      </div>
    </div>
  );
}

