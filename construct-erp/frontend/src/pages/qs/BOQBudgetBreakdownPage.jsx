// src/pages/qs/BOQBudgetBreakdownPage.jsx
import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import { Percent, IndianRupee, AlertTriangle } from 'lucide-react';
import { boqBudgetAPI, projectAPI } from '../../api/client';

const inr = (v) => `₹${(parseFloat(v) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function EditableCell({ value, onSave, mode, maxBudget, itemAmount }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value ?? '');
  const [error, setError] = useState('');

  const commit = () => {
    setEditing(false);
    setError('');
    const newVal = parseFloat(val || 0);

    // Validation: Check if exceeds item budget
    if (mode === 'amount' && itemAmount && newVal > itemAmount + 0.01) {
      setError(`Cannot exceed item amount: ${inr(itemAmount)}`);
      toast.error(`Cannot exceed item amount: ${inr(itemAmount)}`);
      return;
    }

    if (parseFloat(val || 0) !== parseFloat(value || 0)) onSave(newVal);
  };

  if (editing) return (
    <div className="relative">
      <input
        autoFocus
        type="number"
        value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
        className={clsx('w-20 border rounded px-1 py-0.5 text-xs text-right focus:outline-none',
          error ? 'border-rose-400 bg-rose-50' : 'border-blue-400'
        )}
      />
      {error && <div className="absolute left-0 top-6 text-[9px] text-rose-600 font-medium whitespace-nowrap">{error}</div>}
    </div>
  );

  return (
    <button
      onClick={() => { setVal(value ?? ''); setEditing(true); setError(''); }}
      className="w-20 text-right text-xs hover:bg-blue-50 rounded px-1 py-0.5"
    >
      {value ? (mode === 'pct' ? `${parseFloat(value).toFixed(1)}%` : inr(value)) : <span className="text-slate-400 italic">—</span>}
    </button>
  );
}

export default function BOQBudgetBreakdownPage() {
  const [projectId, setProjectId] = useState('');
  const [mode, setMode] = useState('amount'); // 'amount' | 'pct' — which field is primary edit
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

  const items = data?.data || [];
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

  const totals = useMemo(() => {
    const t = {};
    const ta = {};
    const ti = {};
    const tb = {};
    for (const h of costHeads) { t[h] = 0; ta[h] = 0; ti[h] = 0; tb[h] = 0; }
    let grand = 0;
    let grandAdvance = 0;
    let grandInvoiced = 0;
    let grandBalance = 0;
    let unallocated = 0;
    for (const item of items) {
      for (const h of costHeads) {
        const v = item.breakdown?.[h]?.amount || 0;
        const a = item.breakdown?.[h]?.advance || 0;
        const inv = item.breakdown?.[h]?.invoiced || 0;
        const total = a + inv;
        const b = v - total;
        t[h] += v;
        ta[h] += a;
        ti[h] += inv;
        tb[h] += b;
        grand += v;
        grandAdvance += a;
        grandInvoiced += inv;
        grandBalance += b;
      }
      unallocated += item.unallocated_actual || 0;
    }
    return { byHead: t, byHeadAdvance: ta, byHeadInvoiced: ti, byHeadBalance: tb, grand, grandAdvance, grandInvoiced, grandBalance, unallocated };
  }, [items, costHeads]);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">BOQ Budget Breakdown</h1>
          <p className="text-sm text-slate-500">Allocate each BOQ item's budget across cost sub-headings</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={projectId}
            onChange={e => setProjectId(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Select project…</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button
            onClick={() => setMode(mode === 'amount' ? 'pct' : 'amount')}
            className="flex items-center gap-1.5 border border-slate-200 rounded-lg px-3 py-2 text-sm hover:bg-slate-50"
            title="Toggle entry mode"
          >
            {mode === 'amount' ? <IndianRupee size={14} /> : <Percent size={14} />}
            {mode === 'amount' ? 'Amount' : 'Percent'}
          </button>
        </div>
      </div>

      {!projectId && (
        <div className="text-center text-slate-400 py-20 text-sm">Select a project to view its BOQ items.</div>
      )}

      {projectId && isLoading && (
        <div className="text-center text-slate-400 py-20 text-sm">Loading…</div>
      )}

      {projectId && !isLoading && (
        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-50 sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-slate-600 sticky left-0 bg-slate-50">Item No</th>
                <th className="px-3 py-2 text-left font-medium text-slate-600 min-w-[220px]">Description</th>
                <th className="px-3 py-2 text-right font-medium text-slate-600">Amount</th>
                {costHeads.map(h => (
                  <React.Fragment key={h}>
                    <th className="px-3 py-2 text-center font-medium text-slate-600 bg-blue-50 border-l border-slate-200 whitespace-nowrap text-[11px]">{h}</th>
                    <th className="px-3 py-2 text-center font-medium text-slate-600 bg-purple-50 whitespace-nowrap text-[11px]">Advance</th>
                    <th className="px-3 py-2 text-center font-medium text-slate-600 bg-green-50 whitespace-nowrap text-[11px]">Invoiced</th>
                    <th className="px-3 py-2 text-center font-medium text-slate-600 bg-amber-50 border-r border-slate-200 whitespace-nowrap text-[11px]">Balance</th>
                  </React.Fragment>
                ))}
                <th className="px-3 py-2 text-right font-medium text-amber-600 whitespace-nowrap">Unallocated</th>
                <th className="px-3 py-2 text-right font-medium text-slate-600">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map(item => {
                const itemTotal = costHeads.reduce((s, h) => s + (item.breakdown?.[h]?.amount || 0), 0);
                const over = itemTotal > parseFloat(item.amount || 0) + 0.01;
                return (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 sticky left-0 bg-white">{item.item_no}</td>
                    <td className="px-3 py-2">{item.description}</td>
                    <td className="px-3 py-2 text-right font-medium">{inr(item.amount)}</td>
                    {costHeads.map(h => {
                      const cell = item.breakdown?.[h] || {};
                      const advance = cell.advance || 0;
                      const invoiced = cell.invoiced || 0;
                      const totalSpent = advance + invoiced;
                      const budgetAmt = cell.amount || 0;
                      const balance = budgetAmt - totalSpent;
                      const isOverBudget = totalSpent > budgetAmt + 0.01;
                      return (
                        <React.Fragment key={h}>
                          <td className="px-1 py-1 bg-blue-50 border-l border-slate-200">
                            <EditableCell
                              value={mode === 'pct' ? cell.pct : cell.amount}
                              mode={mode}
                              itemAmount={parseFloat(item.amount || 0)}
                              onSave={v => saveCell(item, h, mode, v)}
                            />
                          </td>
                          <td className="px-2 py-2 text-right text-xs bg-purple-50">
                            <span className="text-slate-700">
                              {advance > 0 ? inr(advance) : <span className="text-slate-300">—</span>}
                            </span>
                          </td>
                          <td className={clsx('px-2 py-2 text-right text-xs bg-green-50', isOverBudget && 'border-l border-rose-300')}>
                            <span className={clsx(isOverBudget ? 'text-rose-600 font-bold' : 'text-slate-700')}>
                              {invoiced > 0 ? inr(invoiced) : <span className="text-slate-300">—</span>}
                            </span>
                            {isOverBudget && <div className="text-[9px] text-rose-600 font-bold">⚠ Over Budget</div>}
                          </td>
                          <td className={clsx('px-2 py-2 text-right text-xs border-r border-slate-200', balance < 0 ? 'bg-rose-50' : 'bg-amber-50')}>
                            <span className={clsx(balance < 0 ? 'text-rose-600 font-bold' : 'text-emerald-600')}>
                              {balance !== 0 ? inr(balance) : <span className="text-slate-300">—</span>}
                            </span>
                            {balance < 0 && <div className="text-[9px] text-rose-600 font-bold">⚠ Over Budget</div>}
                          </td>
                        </React.Fragment>
                      );
                    })}
                    <td className="px-3 py-2 text-right text-amber-600">
                      {item.unallocated_actual > 0 ? inr(item.unallocated_actual) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {over
                        ? <span className="inline-flex items-center gap-1 text-rose-600"><AlertTriangle size={12} /> Over</span>
                        : <span className="text-emerald-600">OK</span>}
                    </td>
                  </tr>
                );
              })}

              {items.length === 0 && (
                <tr><td colSpan={costHeads.length + 5} className="text-center py-12 text-slate-400">No BOQ items found for this project.</td></tr>
              )}
            </tbody>
            {items.length > 0 && (
              <tfoot className="bg-slate-50 font-medium text-xs">
                <tr>
                  <td className="px-3 py-2 sticky left-0 bg-slate-50" colSpan={2}>Total</td>
                  <td className="px-3 py-2 text-right text-slate-700">{inr(totals.grand)}</td>
                  {costHeads.map(h => (
                    <React.Fragment key={h}>
                      <td className="px-1 py-2 text-right border-l border-slate-200 bg-blue-50 text-slate-700">{inr(totals.byHead[h])}</td>
                      <td className="px-2 py-2 text-right bg-purple-50 text-slate-700">
                        {totals.byHeadAdvance[h] > 0 ? inr(totals.byHeadAdvance[h]) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-2 py-2 text-right bg-green-50 text-slate-700">
                        {totals.byHeadInvoiced[h] > 0 ? inr(totals.byHeadInvoiced[h]) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-2 py-2 text-right border-r border-slate-200 bg-amber-50 text-emerald-600">
                        {totals.byHeadBalance[h] > 0 ? inr(totals.byHeadBalance[h]) : <span className={totals.byHeadBalance[h] < 0 ? 'text-rose-600 font-bold' : 'text-slate-300'}>
                          {totals.byHeadBalance[h] !== 0 ? inr(totals.byHeadBalance[h]) : '—'}
                        </span>}
                      </td>
                    </React.Fragment>
                  ))}
                  <td className="px-3 py-2 text-right text-amber-600">{totals.unallocated > 0 ? inr(totals.unallocated) : '—'}</td>
                  <td className="px-3 py-2 text-right text-slate-700">{inr(totals.grand)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}
