// src/pages/qs/BOQBudgetBreakdownPage.jsx — Master-detail BOQ budget allocation
import React, { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useReactToPrint } from 'react-to-print';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import {
  Percent, IndianRupee, AlertTriangle, ChevronRight, ChevronDown,
  Search, Layers, CheckCircle2, Wallet, Printer, LayoutList, FileText, BarChart2,
} from 'lucide-react';
import { PageHeader, KpiCard as ThemeKpiCard, Theme } from '../../theme';
import { boqBudgetAPI, projectAPI } from '../../api/client';
import BOQSummaryPrintTemplate from './BOQSummaryPrintTemplate';

const GST_PCT = 18;

const inr  = (v) => `₹${(parseFloat(v) || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const inr2 = (v) => `₹${(parseFloat(v) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num  = (v) => parseFloat(v) || 0;

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
    const spent    = advance + invoiced;
    const balance  = budget - spent;
    const over     = spent > budget + 0.01;
    const active   = budget > 0 || spent > 0;
    return { h, cell, budget, advance, invoiced, spent, balance, over, active };
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
      <td className="px-3 py-2 text-right text-purple-600 font-medium">
        {r.advance > 0 ? inr(r.advance) : <span className="text-slate-300">—</span>}
      </td>
      <td className="px-3 py-2 text-right text-emerald-600 font-medium">
        {r.invoiced > 0 ? inr(r.invoiced) : <span className="text-slate-300">—</span>}
      </td>
      <td className="px-3 py-2 text-right font-semibold text-slate-700">
        {r.spent > 0 ? inr(r.spent) : <span className="text-slate-300">—</span>}
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
              <th className="px-3 py-2 text-right text-purple-500">Advance</th>
              <th className="px-3 py-2 text-right text-emerald-600">Invoiced</th>
              <th className="px-3 py-2 text-right">Spent</th>
              <th className="px-3 py-2 text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {active.map(r => <Row key={r.h} r={r} dim={false} />)}
            {active.length > 0 && empty.length > 0 && (
              <tr><td colSpan={6} className="px-3 py-1.5 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-400 font-bold">Unallocated cost heads</td></tr>
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
function CostHeadDrilldown({ projectId, costHead }) {
  const { data, isLoading } = useQuery({
    queryKey: ['costhead-drilldown', projectId, costHead],
    queryFn: () => boqBudgetAPI.costheadDrilldown(projectId, costHead).then(r => r.data?.data || []),
    enabled: !!projectId && !!costHead,
  });

  const fmt = (n) => `₹${Math.round(parseFloat(n) || 0).toLocaleString('en-IN')}`;
  const SOURCE_COLORS = {
    'SC Bill':        'bg-blue-50 text-blue-700',
    'SC Payment':     'bg-emerald-50 text-emerald-700',
    'SC Advance':     'bg-violet-50 text-violet-700',
    'Advance Tracker':'bg-amber-50 text-amber-700',
    'TQS Bill':       'bg-sky-50 text-sky-700',
    'RA Bill':        'bg-teal-50 text-teal-700',
    'Petty Cash':     'bg-orange-50 text-orange-700',
  };

  if (isLoading) return (
    <tr><td colSpan={5} className="bg-slate-50 px-8 py-3 text-xs text-slate-400">Loading…</td></tr>
  );

  const rows = data || [];
  const total = rows.reduce((s, r) => s + parseFloat(r.amount || 0), 0);

  if (!rows.length) return (
    <tr><td colSpan={5} className="bg-slate-50 px-8 py-3 text-xs text-slate-400 italic">
      No paid transactions yet for this cost head.
    </td></tr>
  );

  return (
    <>
      <tr>
        <td colSpan={5} className="p-0">
          <div className="mx-4 my-2 rounded-xl border border-slate-200 overflow-hidden shadow-inner bg-slate-50">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-200 text-slate-600">
                  <th className="px-3 py-2 text-left w-36">Date</th>
                  <th className="px-3 py-2 text-left w-36">Reference</th>
                  <th className="px-3 py-2 text-left">Description</th>
                  <th className="px-3 py-2 text-center w-32">Source</th>
                  <th className="px-3 py-2 text-right w-36">Amount</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => (
                  <tr key={idx} className="border-t border-slate-100 hover:bg-white">
                    <td className="px-3 py-1.5 text-slate-500">
                      {r.date ? new Date(r.date).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—'}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-slate-600">{r.reference || '—'}</td>
                    <td className="px-3 py-1.5 text-slate-700 max-w-xs truncate" title={r.description}>{r.description || '—'}</td>
                    <td className="px-3 py-1.5 text-center">
                      <span className={clsx('px-2 py-0.5 rounded-full text-[10px] font-bold', SOURCE_COLORS[r.source] || 'bg-slate-100 text-slate-500')}>
                        {r.source}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-right font-semibold text-slate-800">{fmt(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100 border-t border-slate-300">
                  <td colSpan={4} className="px-3 py-1.5 text-right font-bold text-slate-600 text-xs">Total</td>
                  <td className="px-3 py-1.5 text-right font-bold text-slate-800">{fmt(total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </td>
      </tr>
    </>
  );
}

// ─── Cost Head Budget Tab ─────────────────────────────────────────────────────
function CostHeadBudgetTab({ projectId }) {
  const qc = useQueryClient();
  const [editingHead, setEditingHead] = useState(null);
  const [editVal, setEditVal] = useState('');
  const [expandedHead, setExpandedHead] = useState(null);
  const [showBulk, setShowBulk] = useState(false);
  const [bulkText, setBulkText] = useState(DEFAULT_BULK_TEXT);

  const { data, isLoading } = useQuery({
    queryKey: ['costhead-summary', projectId],
    queryFn: () => boqBudgetAPI.costheadSummary(projectId).then(r => r.data?.data || []),
    enabled: !!projectId,
  });

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

  const commit = (cost_head) => {
    const n = parseFloat(editVal);
    if (isNaN(n) || n < 0) { toast.error('Enter a valid amount'); return; }
    saveMutation.mutate({ cost_head, budget_amount: n });
  };

  const toggleExpand = (cost_head, hasActual) => {
    if (!hasActual) return;
    setExpandedHead(prev => prev === cost_head ? null : cost_head);
  };

  const rows = data || [];
  const totalBudget = rows.reduce((s, r) => s + r.budget, 0);
  const totalActual = rows.reduce((s, r) => s + r.actual, 0);

  if (isLoading) return <div className="py-16 text-center text-slate-400 text-sm">Loading…</div>;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
      <div className="px-5 py-3 bg-slate-100 border-b border-slate-200">
        <h3 className="text-sm font-bold text-slate-700">Actual Expenditure — Cost Head Budget vs Actual</h3>
        <p className="text-[11px] text-slate-400">Click Budget cell to enter amount · Click Actual amount to expand transaction details</p>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[#0B2E59] text-white text-xs">
            <th className="px-4 py-2.5 text-center w-12">Sl No</th>
            <th className="px-4 py-2.5 text-left">Description of Works</th>
            <th className="px-4 py-2.5 text-right w-52">Budget</th>
            <th className="px-4 py-2.5 text-right w-44">Actual Expenditure</th>
            <th className="px-4 py-2.5 text-right w-44">Balance</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const isEditing = editingHead === r.cost_head;
            const isExpanded = expandedHead === r.cost_head;
            const over = r.actual > r.budget && r.budget > 0;
            const hasActual = r.actual > 0;
            return (
              <React.Fragment key={r.cost_head}>
                <tr className={clsx('border-b border-slate-100', over && 'bg-rose-50/30', isExpanded && 'bg-indigo-50/40')}>
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
                  <td className="px-2 py-1">
                    {isEditing ? (
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
                    {hasActual ? (
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
                  <td className={clsx('px-4 py-2 text-right font-bold',
                    r.budget === 0 ? 'text-slate-300' : over ? 'text-rose-600' : 'text-emerald-600')}>
                    {r.budget > 0 || r.actual > 0
                      ? `₹${Math.round(r.budget - r.actual).toLocaleString('en-IN')}`
                      : '—'}
                    {over && <div className="text-[9px] text-rose-500">⚠ Over budget</div>}
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
            <td className="px-4 py-2.5 text-right text-sm">₹{Math.round(totalBudget).toLocaleString('en-IN')}</td>
            <td className="px-4 py-2.5 text-right text-sm text-emerald-700">₹{Math.round(totalActual).toLocaleString('en-IN')}</td>
            <td className={clsx('px-4 py-2.5 text-right text-sm font-bold', totalBudget - totalActual < 0 ? 'text-rose-600' : 'text-emerald-600')}>
              ₹{Math.round(totalBudget - totalActual).toLocaleString('en-IN')}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export default function BOQBudgetBreakdownPage() {
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

  const saveCell = (item, costHead, field, value) => {
    const entry = { cost_head: costHead };
    entry[field] = value;
    updateMutation.mutate({ boqItemId: item.id, entries: [entry] });
  };

  // Per-item rollups
  const items = useMemo(() => {
    return allItems
      .filter(it => !search ||
        [it.item_no, it.description].some(v => v?.toLowerCase().includes(search.toLowerCase())))
      .map(it => {
        let budgeted = 0, advance = 0, invoiced = 0;
        for (const h of costHeads) {
          const c = it.breakdown?.[h] || {};
          budgeted += num(c.amount);
          advance  += num(c.advance);
          invoiced += num(c.invoiced);
        }
        const spent = advance + invoiced;
        const amount = num(it.amount);
        return {
          ...it, amount, budgeted, advance, invoiced, spent,
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
    spent:    t.spent + it.spent,
    balance:  t.balance + it.balance,
    allocated: t.allocated + (it.allocated ? 1 : 0),
  }), { boq: 0, budgeted: 0, advance: 0, invoiced: 0, spent: 0, balance: 0, allocated: 0 }), [items]);

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
  const printRef = useRef();
  const handlePrint = useReactToPrint({ contentRef: printRef, documentTitle: `BOQ_${selectedProject?.name || 'Summary'}` });
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
    <div style={{ background: Theme.pageBg, minHeight: '100vh' }}>
      <PageHeader
        title="BOQ Budget Breakdown"
        subtitle="Allocate each BOQ item's budget across cost heads and track advance, invoiced & balance"
        breadcrumbs={[{ label: 'QS & Billing' }, { label: 'Budget Breakdown' }]}
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
              <CostHeadBudgetTab projectId={projectId} />
            )}

            {/* ── BUDGET BREAKDOWN VIEW (existing) ── */}
            {view === 'breakdown' && (
            <>
            {/* Summary KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <ThemeKpiCard icon={IndianRupee} label="BOQ Value"     value={inr(totals.boq)}      color="blue"    sub="Total contract value" />
              <ThemeKpiCard icon={Wallet}      label="Budgeted"      value={inr(totals.budgeted)} color="slate"   sub={`${totals.allocated}/${items.length} items allocated`} />
              <ThemeKpiCard icon={IndianRupee} label="Advance Paid"  value={inr(totals.advance)}  color="amber"   sub="Paid to vendors" />
              <ThemeKpiCard icon={IndianRupee} label="Invoiced"      value={inr(totals.invoiced)} color="emerald" sub="Billed actuals" />
              <ThemeKpiCard icon={CheckCircle2} label="Budget Balance" value={inr(totals.balance)} color={totals.balance >= 0 ? 'emerald' : 'red'} sub="Budget minus spent" />
            </div>

            {/* Master list */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
              {/* Column header */}
              <div className="grid grid-cols-[auto_90px_1fr_repeat(5,minmax(0,1fr))_90px] gap-2 items-center px-4 py-3 bg-slate-100 border-b border-slate-200 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                <span className="w-4" />
                <span>Item No</span>
                <span>Description</span>
                <span className="text-right">BOQ Value</span>
                <span className="text-right">Budgeted</span>
                <span className="text-right text-purple-500">Advance</span>
                <span className="text-right text-emerald-600">Invoiced</span>
                <span className="text-right">Balance</span>
                <span className="text-right">Status</span>
              </div>

              <div className="divide-y divide-slate-100">
                {items.length === 0 && (
                  <div className="text-center py-16 text-slate-400 text-sm">
                    {search ? 'No BOQ items match your search.' : 'No BOQ items found for this project.'}
                  </div>
                )}

                {itemsByChapter.map(ch => {
                  const chBoq      = ch.items.reduce((s, i) => s + i.amount, 0);
                  const chBudgeted = ch.items.reduce((s, i) => s + i.budgeted, 0);
                  const chBalance  = ch.items.reduce((s, i) => s + i.balance, 0);
                  return (
                    <div key={ch.key}>
                      {/* Chapter header */}
                      <div className="grid grid-cols-[auto_90px_1fr_repeat(5,minmax(0,1fr))_90px] gap-2 items-center px-4 py-2 bg-[#0B2E59] text-white text-[10px] font-bold uppercase tracking-wide">
                        <span className="w-4" />
                        <span className="col-span-2">{ch.name}</span>
                        <span className="text-right">{inr(chBoq)}</span>
                        <span className={clsx('text-right', chBudgeted > 0 ? 'text-indigo-200' : 'text-slate-400')}>{chBudgeted > 0 ? inr(chBudgeted) : '—'}</span>
                        <span className="text-right text-purple-300">—</span>
                        <span className="text-right text-emerald-300">—</span>
                        <span className={clsx('text-right', chBalance < 0 ? 'text-rose-300' : 'text-emerald-300')}>{chBudgeted > 0 ? inr(chBalance) : '—'}</span>
                        <span />
                      </div>

                      {ch.items.map(item => {
                        const isOpen = expanded[item.id];
                        return (
                          <div key={item.id}>
                            <button onClick={() => toggle(item.id)}
                              className={clsx('w-full grid grid-cols-[auto_90px_1fr_repeat(5,minmax(0,1fr))_90px] gap-2 items-center px-4 py-3 text-xs text-left hover:bg-slate-50 transition',
                                isOpen && 'bg-indigo-50/40')}>
                              <span className="w-4 text-slate-400">
                                {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                              </span>
                              <span className="font-mono font-bold text-indigo-700 truncate">{item.item_no}</span>
                              <span className="text-slate-700 font-medium truncate pr-2" title={item.description}>{item.description}</span>
                              <span className="text-right font-semibold text-slate-800">{inr(item.amount)}</span>
                              <span className={clsx('text-right font-semibold', item.over ? 'text-rose-600' : item.allocated ? 'text-indigo-700' : 'text-slate-300')}>
                                {item.budgeted > 0 ? inr(item.budgeted) : '—'}
                              </span>
                              <span className="text-right font-medium text-purple-600">{item.advance > 0 ? inr(item.advance) : <span className="text-slate-300">—</span>}</span>
                              <span className="text-right font-medium text-emerald-600">{item.invoiced > 0 ? inr(item.invoiced) : <span className="text-slate-300">—</span>}</span>
                              <span className={clsx('text-right font-bold', item.balance < 0 ? 'text-rose-600' : item.allocated ? 'text-emerald-600' : 'text-slate-300')}>
                                {item.allocated || item.spent > 0 ? inr(item.balance) : '—'}
                              </span>
                              <span className="text-right">
                                {!item.allocated
                                  ? <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Not set</span>
                                  : item.over
                                    ? <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full"><AlertTriangle size={10} /> Over</span>
                                    : <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">OK</span>}
                              </span>
                            </button>
                            {isOpen && <CostHeadDetail item={item} costHeads={costHeads} mode={mode} onSave={saveCell} />}
                          </div>
                        );
                      })}
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
                        className={clsx('w-full grid grid-cols-[auto_90px_1fr_repeat(5,minmax(0,1fr))_90px] gap-2 items-center px-4 py-3 text-xs text-left hover:bg-slate-50 transition italic bg-slate-50/60',
                          isOpen && 'bg-indigo-50/40')}>
                        <span className="w-4 text-slate-400">
                          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </span>
                        <span className="font-mono font-bold text-indigo-700 truncate">{item.item_no}</span>
                        <span className="text-slate-700 font-medium truncate pr-2" title={item.description}>{item.description}</span>
                        <span className="text-right font-semibold text-slate-300">—</span>
                        <span className="text-slate-300 text-right">—</span>
                        <span className="text-right font-medium text-purple-600">{item.advance > 0 ? inr(item.advance) : <span className="text-slate-300">—</span>}</span>
                        <span className="text-right font-medium text-emerald-600">{item.invoiced > 0 ? inr(item.invoiced) : <span className="text-slate-300">—</span>}</span>
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
                <div className="grid grid-cols-[auto_90px_1fr_repeat(5,minmax(0,1fr))_90px] gap-2 items-center px-4 py-3 bg-slate-900 text-xs">
                  <span className="w-4" />
                  <span className="font-bold text-white uppercase tracking-wide col-span-2">Grand Total</span>
                  <span className="text-right font-bold text-white">{inr(totals.boq)}</span>
                  <span className="text-right font-bold text-indigo-300">{inr(totals.budgeted)}</span>
                  <span className="text-right font-bold text-purple-300">{inr(totals.advance)}</span>
                  <span className="text-right font-bold text-emerald-300">{inr(totals.invoiced)}</span>
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

      {/* Hidden print zone — Page 1 summary + Page 2 detailed items */}
      <div style={{ display: 'none' }}>
        <div ref={printRef}>
          <BOQSummaryPrintTemplate
            projectName={selectedProject?.name || ''}
            chapterRows={chapterRows}
            lineItemsByChapter={lineItemsByChapter}
            totals={summaryTotals}
            gstPct={GST_PCT}
          />
        </div>
      </div>
    </div>
  );
}
