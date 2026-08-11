// src/pages/finance/FinanceIntelligencePage.jsx
// Finance Intelligence — 4 tabs: Vendor Ledger | Budget vs Actual | Project P&L | AP Aging
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { tqsBillsAPI, reportAPI, budgetAPI, projectAPI } from '../../api/client';
import {
  Users, BarChart3, TrendingUp, Clock, ChevronRight,
  AlertTriangle, CheckCircle2, IndianRupee, FileText, Building2
} from 'lucide-react';

const inr  = v => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inr2 = v => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
const lakh = v => {
  const n = Number(v || 0);
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const fmt  = d => d ? new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—';
const pct  = v => `${Number(v||0).toFixed(1)}%`;

const TABS = [
  { id: 'ledger',  label: 'Vendor Ledger',    icon: Users,       color: 'indigo' },
  { id: 'budget',  label: 'Budget vs Actual',  icon: BarChart3,   color: 'violet' },
  { id: 'pl',      label: 'Project P&L',       icon: TrendingUp,  color: 'emerald' },
  { id: 'aging',   label: 'AP Aging',          icon: Clock,       color: 'amber' },
];

const BUCKET_COLORS = {
  '0-30':       'bg-emerald-100 text-emerald-700',
  '31-60':      'bg-amber-100   text-amber-700',
  '61-90':      'bg-orange-100  text-orange-700',
  '90+':        'bg-red-100     text-red-700',
  'unscheduled':'bg-slate-100   text-slate-500',
};

/* ─── Shared helpers ─── */
function KPICard({ label, value, sub, color = 'slate' }) {
  const colors = {
    indigo:  'bg-indigo-50  border-indigo-100  text-indigo-700',
    emerald: 'bg-emerald-50 border-emerald-100 text-emerald-700',
    red:     'bg-red-50     border-red-100     text-red-600',
    amber:   'bg-amber-50   border-amber-100   text-amber-700',
    slate:   'bg-slate-50   border-slate-100   text-slate-700',
  };
  return (
    <div className={`rounded-xl border p-4 ${colors[color]}`}>
      <p className="text-[10px] font-medium uppercase tracking-widest opacity-70 mb-1">{label}</p>
      <p className="text-2xl font-medium">{value}</p>
      {sub && <p className="text-[10px] mt-1 opacity-60">{sub}</p>}
    </div>
  );
}

function SectionHeader({ children }) {
  return <p className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest mb-3">{children}</p>;
}

/* ═══════════════════════════════════════════════════════════════
   TAB A — Vendor Outstanding Ledger
═══════════════════════════════════════════════════════════════ */
function VendorLedgerTab({ projectId }) {
  const [expanded, setExpanded] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['finance-vendor-ledger', projectId],
    queryFn:  () => reportAPI.vendorLedger(projectId ? { project_id: projectId } : {}).then(r => r.data?.data ?? []),
  });

  const rows = data || [];
  const totalOutstanding  = rows.reduce((s, r) => s + parseFloat(r.outstanding  || 0), 0);
  const totalCertified    = rows.reduce((s, r) => s + parseFloat(r.total_certified || 0), 0);
  const totalTDS          = rows.reduce((s, r) => s + parseFloat(r.total_tds     || 0), 0);
  const totalRetention    = rows.reduce((s, r) => s + parseFloat(r.total_retention || 0), 0);

  if (isLoading) return <div className="py-20 text-center text-slate-900 font-medium text-sm animate-pulse">Loading vendor ledger…</div>;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard label="Total Outstanding"  value={lakh(totalOutstanding)}  color="red" />
        <KPICard label="Total Certified"    value={lakh(totalCertified)}    color="indigo" />
        <KPICard label="TDS Held"           value={lakh(totalTDS)}          color="amber" />
        <KPICard label="Retention Held"     value={lakh(totalRetention)}    color="amber" />
      </div>

      {rows.length === 0 ? (
        <div className="py-16 text-center text-slate-900 font-medium text-sm">No vendor data found.</div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                {['Vendor','Bills','Total Invoiced','Total Certified','Total Paid','TDS Held','Retention','Outstanding'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[10px] font-medium text-slate-900 font-medium uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map((r, i) => {
                const outstanding = parseFloat(r.outstanding || 0);
                return (
                  <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900 font-medium text-sm">{r.vendor_name || '—'}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-900 font-medium text-xs">{r.bill_count}</td>
                    <td className="px-4 py-3 font-mono text-slate-900 text-xs">₹{inr(r.total_invoiced)}</td>
                    <td className="px-4 py-3 font-mono text-indigo-700 text-xs font-semibold">₹{inr(r.total_certified)}</td>
                    <td className="px-4 py-3 font-mono text-emerald-700 text-xs">₹{inr(r.total_paid)}</td>
                    <td className="px-4 py-3 font-mono text-amber-700 text-xs">₹{inr(r.total_tds)}</td>
                    <td className="px-4 py-3 font-mono text-amber-700 text-xs">₹{inr(r.total_retention)}</td>
                    <td className="px-4 py-3">
                      <span className={`font-medium text-sm font-mono ${outstanding > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        ₹{inr(outstanding)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-slate-50 border-t-2 border-slate-200">
              <tr>
                <td colSpan={2} className="px-4 py-3 text-xs font-medium text-slate-900 uppercase tracking-wide">TOTAL ({rows.length} vendors)</td>
                <td className="px-4 py-3 font-mono font-medium text-slate-900 text-xs">₹{inr(rows.reduce((s,r)=>s+parseFloat(r.total_invoiced||0),0))}</td>
                <td className="px-4 py-3 font-mono font-medium text-indigo-700 text-xs">₹{inr(totalCertified)}</td>
                <td className="px-4 py-3 font-mono font-medium text-emerald-700 text-xs">₹{inr(rows.reduce((s,r)=>s+parseFloat(r.total_paid||0),0))}</td>
                <td className="px-4 py-3 font-mono font-medium text-amber-700 text-xs">₹{inr(totalTDS)}</td>
                <td className="px-4 py-3 font-mono font-medium text-amber-700 text-xs">₹{inr(totalRetention)}</td>
                <td className="px-4 py-3 font-mono font-medium text-red-600 text-sm">₹{inr(totalOutstanding)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   TAB B — Budget vs Actual
═══════════════════════════════════════════════════════════════ */
function BudgetVsActualTab({ projects, projectId, setProjectId }) {
  const { data, isLoading } = useQuery({
    queryKey: ['budget-vs-actual', projectId],
    queryFn:  () => budgetAPI.list({ project_id: projectId }).then(r => r.data?.data ?? []),
    enabled:  !!projectId,
  });

  const rows = data || [];
  const totalBudget = rows.reduce((s, r) => s + parseFloat(r.budgeted_amount || 0), 0);
  const totalActual = rows.reduce((s, r) => s + parseFloat(r.actual_amount   || 0), 0);
  const overrun     = totalActual - totalBudget;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <select
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-violet-500 outline-none"
          value={projectId || ''}
          onChange={e => setProjectId(e.target.value || null)}
        >
          <option value="">— Select Project —</option>
          {(projects || []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {!projectId && <span className="text-xs text-slate-400">Select a project to view budget breakdown</span>}
      </div>

      {!projectId ? null : isLoading ? (
        <div className="py-20 text-center text-slate-900 font-medium animate-pulse text-sm">Loading budget data…</div>
      ) : rows.length === 0 ? (
        <div className="py-16 text-center text-slate-900 font-medium text-sm">No budget lines for this project.</div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4">
            <KPICard label="Total Budget"  value={lakh(totalBudget)} color="indigo" />
            <KPICard label="Actual Spent"  value={lakh(totalActual)} color={totalActual > totalBudget ? 'red' : 'emerald'} />
            <KPICard label={overrun > 0 ? 'Overrun' : 'Savings'} value={lakh(Math.abs(overrun))} color={overrun > 0 ? 'red' : 'emerald'} />
          </div>

          <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  {['Cost Head','Budgeted (₹)','Actual Spent (₹)','Variance (₹)','% Used','Progress'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-medium text-slate-900 font-medium uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {rows.map((r, i) => {
                  const budget  = parseFloat(r.budgeted_amount || 0);
                  const actual  = parseFloat(r.actual_amount   || 0);
                  const variance = budget - actual;
                  const used    = budget > 0 ? Math.min((actual / budget) * 100, 100) : 0;
                  const over    = actual > budget;
                  return (
                    <tr key={i} className={`hover:bg-slate-50/50 ${r.unbudgeted ? 'bg-orange-50/30' : ''}`}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-700">{r.cost_head}</p>
                        {r.unbudgeted && <span className="text-[9px] text-orange-500 font-medium uppercase">No Budget Set</span>}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-900 text-xs">₹{inr(budget)}</td>
                      <td className="px-4 py-3 font-mono text-xs font-semibold">{actual > 0 ? `₹${inr(actual)}` : '—'}</td>
                      <td className={`px-4 py-3 font-mono text-xs font-medium ${variance >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {variance >= 0 ? '+' : '−'}₹{inr(Math.abs(variance))}
                      </td>
                      <td className={`px-4 py-3 text-xs font-medium ${over ? 'text-red-600' : 'text-slate-600'}`}>
                        {budget > 0 ? `${((actual / budget) * 100).toFixed(1)}%` : '—'}
                      </td>
                      <td className="px-4 py-3 w-36">
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${over ? 'bg-red-500' : used > 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                            style={{ width: `${Math.min(used, 100)}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                <tr>
                  <td className="px-4 py-3 text-xs font-medium text-slate-600">TOTAL</td>
                  <td className="px-4 py-3 font-mono font-medium text-slate-900 text-xs">₹{inr(totalBudget)}</td>
                  <td className="px-4 py-3 font-mono font-medium text-xs">₹{inr(totalActual)}</td>
                  <td className={`px-4 py-3 font-mono font-medium text-xs ${overrun <= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {overrun <= 0 ? '+' : '−'}₹{inr(Math.abs(overrun))}
                  </td>
                  <td className="px-4 py-3 font-medium text-xs text-slate-600">
                    {totalBudget > 0 ? `${((totalActual / totalBudget) * 100).toFixed(1)}%` : '—'}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   TAB C — Project P&L
═══════════════════════════════════════════════════════════════ */
function ProjectPLTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['project-pl'],
    queryFn:  () => reportAPI.projectPL().then(r => r.data?.data ?? []),
  });

  const rows = data || [];
  const totContractValue = rows.reduce((s,r) => s + parseFloat(r.contract_value    || 0), 0);
  const totNetBilled     = rows.reduce((s,r) => s + parseFloat(r.net_billed        || 0), 0);
  const totVendorCost    = rows.reduce((s,r) => s + parseFloat(r.vendor_certified  || 0), 0);
  const totOtherCost     = rows.reduce((s,r) => s + parseFloat(r.other_cost        || 0), 0);
  const totMargin        = rows.reduce((s,r) => s + parseFloat(r.gross_margin      || 0), 0);

  if (isLoading) return <div className="py-20 text-center text-slate-900 font-medium animate-pulse text-sm">Loading P&L data…</div>;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KPICard label="Contract Value"  value={lakh(totContractValue)} color="indigo" />
        <KPICard label="Billed to Client" value={lakh(totNetBilled)}   color="emerald" />
        <KPICard label="Vendor Cost"     value={lakh(totVendorCost)}    color="amber" />
        <KPICard label="Other Costs"     value={lakh(totOtherCost)}     color="amber" />
        <KPICard label="Gross Margin"    value={lakh(totMargin)}        color={totMargin >= 0 ? 'emerald' : 'red'} sub={totNetBilled > 0 ? `${((totMargin/totNetBilled)*100).toFixed(1)}% margin` : ''} />
      </div>

      {rows.length === 0 ? (
        <div className="py-16 text-center text-slate-900 font-medium text-sm">No project data found.</div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                {['Project','Type','Contract Value','Billed (Net)','Received','Vendor Cost','Other Cost','Gross Margin','Margin%','Bills Billed','% Billed'].map(h => (
                  <th key={h} className="px-3 py-3 text-left text-[10px] font-medium text-slate-900 font-medium uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map((r, i) => {
                const margin    = parseFloat(r.gross_margin || 0);
                const netBilled = parseFloat(r.net_billed   || 0);
                const mPct      = netBilled > 0 ? (margin / netBilled * 100) : 0;
                return (
                  <tr key={i} className="hover:bg-slate-50/50">
                    <td className="px-3 py-3">
                      <p className="font-medium text-slate-900 font-medium text-sm max-w-[180px] truncate">{r.project_name}</p>
                      <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ${r.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{r.status}</span>
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-900 font-medium capitalize">{r.project_type}</td>
                    <td className="px-3 py-3 font-mono text-xs text-slate-600">{lakh(r.contract_value)}</td>
                    <td className="px-3 py-3 font-mono text-xs font-medium text-indigo-700">{lakh(r.net_billed)}</td>
                    <td className="px-3 py-3 font-mono text-xs text-emerald-700">{lakh(r.received_from_client)}</td>
                    <td className="px-3 py-3 font-mono text-xs text-orange-700">{lakh(r.vendor_certified)}</td>
                    <td className="px-3 py-3 font-mono text-xs text-slate-600">{lakh(r.other_cost)}</td>
                    <td className="px-3 py-3 font-mono text-xs font-bold">
                      <span className={margin >= 0 ? 'text-emerald-700' : 'text-red-600'}>{lakh(Math.abs(margin))}</span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5">
                        <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${mPct >= 0 ? 'bg-emerald-500' : 'bg-red-500'}`} style={{ width: `${Math.min(Math.abs(mPct), 100)}%` }} />
                        </div>
                        <span className={`text-xs font-medium ${mPct >= 15 ? 'text-emerald-600' : mPct >= 0 ? 'text-amber-600' : 'text-red-600'}`}>{pct(mPct)}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-500">{r.ra_bill_count} / {r.tqs_bill_count}</td>
                    <td className="px-3 py-3 text-xs font-medium text-slate-600">{pct(r.pct_billed)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-slate-50 border-t-2 border-slate-200 font-bold">
              <tr>
                <td colSpan={2} className="px-3 py-3 text-xs text-slate-900 uppercase tracking-wide">TOTAL ({rows.length} projects)</td>
                <td className="px-3 py-3 font-mono text-xs text-slate-700">{lakh(totContractValue)}</td>
                <td className="px-3 py-3 font-mono text-xs text-indigo-700">{lakh(totNetBilled)}</td>
                <td className="px-3 py-3 font-mono text-xs text-emerald-700">{lakh(rows.reduce((s,r)=>s+parseFloat(r.received_from_client||0),0))}</td>
                <td className="px-3 py-3 font-mono text-xs text-orange-700">{lakh(totVendorCost)}</td>
                <td className="px-3 py-3 font-mono text-xs text-slate-600">{lakh(totOtherCost)}</td>
                <td className="px-3 py-3 font-mono text-xs">
                  <span className={totMargin >= 0 ? 'text-emerald-700' : 'text-red-600'}>{lakh(Math.abs(totMargin))}</span>
                </td>
                <td className="px-3 py-3 font-medium text-xs">
                  <span className={totMargin >= 0 ? 'text-emerald-600' : 'text-red-600'}>{pct(totNetBilled > 0 ? (totMargin / totNetBilled * 100) : 0)}</span>
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   TAB D — AP Aging (Accounts Payable Schedule)
═══════════════════════════════════════════════════════════════ */
function APAgingTab({ projects, projectId, setProjectId }) {
  const { data, isLoading } = useQuery({
    queryKey: ['ap-aging', projectId],
    queryFn:  () => tqsBillsAPI.getAPAging(projectId ? { project_id: projectId } : {}).then(r => r.data?.data ?? []),
  });

  const rows = data || [];

  const buckets = ['0-30','31-60','61-90','90+','unscheduled'];
  const summary = buckets.reduce((acc, b) => {
    const bRows = rows.filter(r => r.aging_bucket === b);
    acc[b] = {
      count:   bRows.length,
      balance: bRows.reduce((s, r) => s + parseFloat(r.balance || 0), 0),
    };
    return acc;
  }, {});

  const totalBalance = rows.reduce((s, r) => s + parseFloat(r.balance || 0), 0);

  const PCStatus = ({ row }) => {
    const qs    = !!row.pc_qs_signed_at;
    const pm    = !!row.pc_pm_signed_at;
    const accts = !!row.pc_accts_signed_at;
    if (!row.pc_number) return <span className="text-[9px] text-slate-400">No PC</span>;
    return (
      <div className="flex items-center gap-1">
        <span className={`w-4 h-4 rounded-full text-[8px] flex items-center justify-center font-medium ${qs ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-400'}`}>Q</span>
        <span className={`w-4 h-4 rounded-full text-[8px] flex items-center justify-center font-medium ${pm ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-400'}`}>P</span>
        <span className={`w-4 h-4 rounded-full text-[8px] flex items-center justify-center font-medium ${accts ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-400'}`}>A</span>
      </div>
    );
  };

  if (isLoading) return <div className="py-20 text-center text-slate-900 font-medium animate-pulse text-sm">Loading AP aging…</div>;

  return (
    <div className="space-y-5">
      {/* Bucket summary */}
      <div className="grid grid-cols-5 gap-3">
        {buckets.map(b => (
          <div key={b} className={`rounded-xl p-3 border text-center ${
            b === '0-30'       ? 'bg-emerald-50 border-emerald-100' :
            b === '31-60'      ? 'bg-amber-50   border-amber-100'   :
            b === '61-90'      ? 'bg-orange-50  border-orange-100'  :
            b === '90+'        ? 'bg-red-50     border-red-100'     :
                                 'bg-slate-50   border-slate-100'
          }`}>
            <p className="text-[9px] font-medium uppercase tracking-widest text-slate-900 font-medium mb-1">
              {b === 'unscheduled' ? 'Unscheduled' : `${b} Days`}
            </p>
            <p className="text-lg font-medium text-black">{summary[b].count}</p>
            <p className="text-[10px] font-medium text-slate-900 mt-0.5">{lakh(summary[b].balance)}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <select
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 outline-none"
          value={projectId || ''}
          onChange={e => setProjectId(e.target.value || null)}
        >
          <option value="">All Projects</option>
          {(projects || []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <div className="text-sm font-medium text-slate-700">
          Total Outstanding: <span className="text-red-600 text-base">₹{inr(totalBalance)}</span>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="py-16 text-center">
          <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
          <p className="text-slate-900 font-medium text-sm">All certified bills are paid. Nothing pending.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                {['SL #','Vendor','Project','Invoice #','Cert Date','Age','Certified','Paid','Balance','PC Sigs','Status'].map(h => (
                  <th key={h} className="px-3 py-3 text-left text-[10px] font-medium text-slate-900 font-medium uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map((r, i) => {
                const balance = parseFloat(r.balance || 0);
                const bucket  = r.aging_bucket;
                return (
                  <tr key={i} className={`hover:bg-slate-50/50 ${bucket === '90+' ? 'bg-red-50/20' : ''}`}>
                    <td className="px-3 py-3">
                      <a href={`/tqs/bills/${r.id}`} className="text-indigo-600 font-mono text-xs hover:underline">{r.sl_number}</a>
                    </td>
                    <td className="px-3 py-3 text-slate-900 text-xs font-medium max-w-[140px] truncate">{r.vendor_name}</td>
                    <td className="px-3 py-3 text-slate-900 font-medium text-xs max-w-[120px] truncate">{r.project_name}</td>
                    <td className="px-3 py-3 text-slate-900 font-medium text-xs">{r.inv_number || '—'}</td>
                    <td className="px-3 py-3 text-slate-900 font-medium text-xs">{fmt(r.qs_certified_date)}</td>
                    <td className="px-3 py-3">
                      <span className={`text-[9px] font-medium px-2 py-0.5 rounded-full ${BUCKET_COLORS[bucket] || 'bg-slate-100 text-slate-500'}`}>
                        {r.days_outstanding != null ? `${r.days_outstanding}d` : '—'}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs font-medium text-slate-700">₹{inr(r.certified_net)}</td>
                    <td className="px-3 py-3 font-mono text-xs text-emerald-700">₹{inr(r.paid_amount)}</td>
                    <td className="px-3 py-3 font-mono text-xs font-medium text-red-600">₹{inr(balance)}</td>
                    <td className="px-3 py-3"><PCStatus row={r} /></td>
                    <td className="px-3 py-3">
                      <span className={`text-[9px] font-medium px-2 py-0.5 rounded-full ${
                        r.payment_status === 'partial' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'
                      }`}>{r.payment_status || 'pending'}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-slate-50 border-t-2 border-slate-200">
              <tr>
                <td colSpan={6} className="px-3 py-3 text-xs font-medium text-slate-600">TOTAL ({rows.length} bills)</td>
                <td className="px-3 py-3 font-mono font-medium text-xs text-slate-700">₹{inr(rows.reduce((s,r)=>s+parseFloat(r.certified_net||0),0))}</td>
                <td className="px-3 py-3 font-mono font-medium text-xs text-emerald-700">₹{inr(rows.reduce((s,r)=>s+parseFloat(r.paid_amount||0),0))}</td>
                <td className="px-3 py-3 font-mono font-medium text-xs text-red-600">₹{inr(totalBalance)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════════════════════ */
export default function FinanceIntelligencePage() {
  const [activeTab,    setActiveTab]    = useState('ledger');
  const [projectId,    setProjectId]    = useState(null);

  const { data: projectsData } = useQuery({
    queryKey: ['projects-list-fi'],
    queryFn:  () => projectAPI.list().then(r => r.data?.data ?? r.data ?? []),
  });
  const projects = projectsData || [];

  const TAB_COLOR = {
    ledger: 'indigo', budget: 'violet', pl: 'emerald', aging: 'amber',
  };

  const activeColor = TAB_COLOR[activeTab];

  const RING = {
    indigo:  'border-indigo-600  text-indigo-700  bg-indigo-50',
    violet:  'border-violet-600  text-violet-700  bg-violet-50',
    emerald: 'border-emerald-600 text-emerald-700 bg-emerald-50',
    amber:   'border-amber-500   text-amber-700   bg-amber-50',
  };

  return (
    <div className="p-6 space-y-6 bg-[#f4f6f9] min-h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Building2 className="w-5 h-5 text-slate-500" />
            <span className="text-xs text-slate-900 font-medium font-medium">Finance</span>
          </div>
          <h1 className="text-xl font-medium text-black">Finance Intelligence</h1>
          <p className="text-sm text-slate-900 font-medium mt-0.5">Vendor ledger · Budget vs actual · Project P&L · AP aging</p>
        </div>
      </div>

      {/* Tab selector */}
      <div className="flex flex-wrap gap-2">
        {TABS.map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium transition-all border-2 ${
                isActive ? RING[tab.color] + ' border-2 shadow-sm' : 'border-transparent text-slate-900 font-medium bg-white hover:bg-slate-50'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="bg-white rounded-2xl border border-slate-100 p-6">
        {activeTab === 'ledger' && <VendorLedgerTab  projectId={projectId} />}
        {activeTab === 'budget' && <BudgetVsActualTab projects={projects} projectId={projectId} setProjectId={setProjectId} />}
        {activeTab === 'pl'     && <ProjectPLTab />}
        {activeTab === 'aging'  && <APAgingTab projects={projects} projectId={projectId} setProjectId={setProjectId} />}
      </div>
    </div>
  );
}
