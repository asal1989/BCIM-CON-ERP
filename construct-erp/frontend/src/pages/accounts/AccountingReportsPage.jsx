// src/pages/accounts/AccountingReportsPage.jsx — Trial Balance, P&L, Balance Sheet from Chart of Accounts
import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { BarChart3, Scale, FileBarChart, Download, FileDown, Clock3, Wallet, BookOpen,
         ChevronDown, ChevronRight, Search, CheckCircle2, AlertCircle, TrendingUp, TrendingDown, Hash } from 'lucide-react';
import { chartOfAccountsAPI, reportAPI, journalEntryAPI, projectAPI } from '../../api/client';
import { inr } from '../dashboards/DashKPI';
import { downloadCsv, downloadPdf } from '../../utils/exportCsv';
import dayjs from 'dayjs';

const TABS = [
  { key: 'trial-balance', label: 'Trial Balance', icon: Scale },
  { key: 'pnl', label: 'Profit & Loss', icon: BarChart3 },
  { key: 'balance-sheet', label: 'Balance Sheet', icon: FileBarChart },
  { key: 'ar-aging', label: 'Aged Receivables', icon: Clock3 },
  { key: 'ap-aging', label: 'Aged Payables', icon: Wallet },
  { key: 'day-book', label: 'Day Book', icon: BookOpen },
];

const AGE_BUCKETS = ['current', '1-30', '31-60', '61-90', '90+'];
const AGE_LABELS = { current: 'Current', '1-30': '1-30 days', '31-60': '31-60 days', '61-90': '61-90 days', '90+': '90+ days' };

function AgingTable({ rows, buckets, total, dateLabel, nameLabel, amountLabel }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {AGE_BUCKETS.map(b => (
          <div key={b} className="bg-white border border-slate-200 rounded-md p-4">
            <div className="text-xs text-slate-400">{AGE_LABELS[b]}</div>
            <div className="text-lg font-semibold text-black mt-1">{inr(buckets?.[b] || 0)}</div>
          </div>
        ))}
      </div>
      <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
        {rows.length === 0 ? (
          <p className="px-4 py-10 text-sm text-slate-400 text-center">No outstanding items</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                {[nameLabel, dateLabel, 'Age (days)', 'Bucket', amountLabel].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-slate-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map(r => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 text-black">{r.party}<div className="text-[11px] text-slate-400">{r.ref}</div></td>
                  <td className="px-4 py-2 text-slate-600 whitespace-nowrap">{dayjs(r.date).format('DD MMM YYYY')}</td>
                  <td className="px-4 py-2 text-slate-600">{r.age_days}</td>
                  <td className="px-4 py-2 text-slate-500 text-xs">{AGE_LABELS[r.bucket]}</td>
                  <td className="px-4 py-2 text-right font-mono font-semibold text-black">{inr(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-100 bg-slate-50">
          <span className="text-sm font-semibold text-black">Total Outstanding</span>
          <span className="text-sm font-mono font-semibold text-black">{inr(total)}</span>
        </div>
      </div>
    </div>
  );
}

// ── Trial Balance Redesign ──────────────────────────────────────────────────────
const TB_GROUPS = [
  { key: 'asset',     label: 'Assets',      side: 'debit',  accent: '#2563EB', bg: '#EFF6FF', pill: 'bg-blue-100 text-blue-700'   },
  { key: 'expense',   label: 'Expenses',    side: 'debit',  accent: '#D97706', bg: '#FFFBEB', pill: 'bg-amber-100 text-amber-700'  },
  { key: 'liability', label: 'Liabilities', side: 'credit', accent: '#DC2626', bg: '#FEF2F2', pill: 'bg-red-100 text-red-700'      },
  { key: 'equity',    label: 'Equity',      side: 'credit', accent: '#7C3AED', bg: '#F5F3FF', pill: 'bg-violet-100 text-violet-700'},
  { key: 'income',    label: 'Income',      side: 'credit', accent: '#059669', bg: '#ECFDF5', pill: 'bg-emerald-100 text-emerald-700'},
];

function TBKpiCard({ label, value, sub, icon: Icon, color }) {
  const colors = {
    blue:    'bg-blue-50 text-blue-600 border-blue-100',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    amber:   'bg-amber-50 text-amber-600 border-amber-100',
    slate:   'bg-slate-50 text-slate-600 border-slate-100',
  };
  return (
    <div className="bg-white rounded-2xl border border-gray-100 px-5 py-4 flex items-center gap-4"
      style={{boxShadow:'0 2px 12px rgba(10,31,92,0.06)'}}>
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center border ${colors[color]}`}>
        <Icon size={20}/>
      </div>
      <div>
        <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{label}</div>
        <div className="text-xl font-black text-gray-900 mt-0.5">{value}</div>
        {sub && <div className="text-[11px] text-gray-400 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

function TrialBalanceView({ byType, trialDebit, trialCredit, projectId, projects, onProjectChange, onExportCsv, onExportPdf }) {
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState({});
  const toggle = key => setCollapsed(p => ({ ...p, [key]: !p[key] }));

  const balanced = Math.abs(Math.abs(trialDebit) - Math.abs(trialCredit)) < 0.01;
  const totalAccounts = TB_GROUPS.reduce((s, g) => s + (byType[g.key]?.length || 0), 0);

  const filterRows = rows => !search.trim() ? rows
    : rows.filter(r => r.name?.toLowerCase().includes(search.toLowerCase()) || r.code?.toLowerCase().includes(search.toLowerCase()));

  const groupSum = (key, side) => {
    const rows = byType[key] || [];
    const raw = rows.reduce((s, r) => s + Number(r.balance || 0), 0);
    return side === 'credit' ? Math.abs(raw) : Math.abs(raw);
  };

  return (
    <div className="space-y-5">
      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <TBKpiCard label="Total Debit" value={`₹${inr(Math.abs(trialDebit))}`} sub="Assets + Expenses" icon={TrendingUp} color="blue"/>
        <TBKpiCard label="Total Credit" value={`₹${inr(Math.abs(trialCredit))}`} sub="Liabilities + Equity + Income" icon={TrendingDown} color="amber"/>
        <TBKpiCard label="Accounts" value={totalAccounts} sub="Active ledger accounts" icon={Hash} color="slate"/>
        <div className={`bg-white rounded-2xl border px-5 py-4 flex items-center gap-4 ${balanced ? 'border-emerald-200' : 'border-red-200'}`}
          style={{boxShadow:'0 2px 12px rgba(10,31,92,0.06)'}}>
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${balanced ? 'bg-emerald-50' : 'bg-red-50'}`}>
            {balanced ? <CheckCircle2 size={20} className="text-emerald-600"/> : <AlertCircle size={20} className="text-red-600"/>}
          </div>
          <div>
            <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Balance</div>
            <div className={`text-base font-black mt-0.5 ${balanced ? 'text-emerald-700' : 'text-red-700'}`}>
              {balanced ? 'Balanced ✓' : 'Out of Balance'}
            </div>
            {!balanced && (
              <div className="text-[11px] text-red-500">Diff: ₹{inr(Math.abs(Math.abs(trialDebit) - Math.abs(trialCredit)))}</div>
            )}
          </div>
        </div>
      </div>

      {/* Controls row */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-3 items-center flex-wrap">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search accounts…"
              className="pl-8 pr-4 py-2 text-sm border border-gray-200 rounded-xl w-52 focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-white"/>
          </div>
          <select value={projectId} onChange={e => onProjectChange(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 w-64">
            <option value="">All Projects (company-wide)</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.project_code ? `${p.project_code} — ` : ''}{p.name}</option>)}
          </select>
          {projectId && (
            <span className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
              Scoped to selected project
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={onExportCsv}
            className="flex items-center gap-1.5 px-4 py-2 text-sm border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50 bg-white">
            <Download size={13}/> CSV
          </button>
          <button onClick={onExportPdf}
            className="flex items-center gap-1.5 px-4 py-2 text-sm border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50 bg-white">
            <FileDown size={13}/> PDF
          </button>
        </div>
      </div>

      {/* Main trial balance table */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden"
        style={{boxShadow:'0 4px 20px rgba(10,31,92,0.07)'}}>

        {/* Table header */}
        <div className="grid grid-cols-[3rem_1fr_8rem_8rem] md:grid-cols-[4rem_1fr_10rem_10rem] bg-[#0A1F5C] text-white">
          <div className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider">Code</div>
          <div className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider">Account Name</div>
          <div className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-right">Debit (₹)</div>
          <div className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-right">Credit (₹)</div>
        </div>

        {/* Groups */}
        {TB_GROUPS.map((group, gi) => {
          const rows = filterRows(byType[group.key] || []);
          const subtotal = groupSum(group.key, group.side);
          const isCollapsed = collapsed[group.key];
          const allRows = byType[group.key] || [];

          return (
            <div key={group.key} className={gi > 0 ? 'border-t border-gray-100' : ''}>
              {/* Group header row */}
              <button onClick={() => toggle(group.key)}
                className="w-full grid grid-cols-[3rem_1fr_8rem_8rem] md:grid-cols-[4rem_1fr_10rem_10rem] items-center hover:brightness-95 transition-all"
                style={{background: group.bg}}>
                <div className="px-4 py-3 flex items-center justify-center">
                  {isCollapsed
                    ? <ChevronRight size={14} style={{color: group.accent}}/>
                    : <ChevronDown  size={14} style={{color: group.accent}}/>}
                </div>
                <div className="px-4 py-3 flex items-center gap-2.5">
                  <span className="font-black text-sm" style={{color: group.accent}}>{group.label.toUpperCase()}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${group.pill}`}>
                    {allRows.length} accounts
                  </span>
                </div>
                <div className="px-4 py-3 text-right font-black text-sm" style={{color: group.side === 'debit' ? group.accent : 'transparent'}}>
                  {group.side === 'debit' ? `₹${inr(subtotal)}` : ''}
                </div>
                <div className="px-4 py-3 text-right font-black text-sm" style={{color: group.side === 'credit' ? group.accent : 'transparent'}}>
                  {group.side === 'credit' ? `₹${inr(subtotal)}` : ''}
                </div>
              </button>

              {/* Account rows */}
              {!isCollapsed && (
                <div>
                  {rows.length === 0 && search && (
                    <div className="px-8 py-3 text-xs text-gray-400 italic border-t border-gray-50">No accounts match "{search}"</div>
                  )}
                  {rows.map((r, ri) => {
                    const bal = Math.abs(Number(r.balance || 0));
                    return (
                      <div key={r.id}
                        className={`grid grid-cols-[3rem_1fr_8rem_8rem] md:grid-cols-[4rem_1fr_10rem_10rem] border-t border-gray-50 hover:bg-gray-50/60 transition-colors ${ri % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                        <div className="px-4 py-2.5 text-[11px] font-mono text-gray-400 truncate">{r.code}</div>
                        <div className="px-4 py-2.5 text-sm text-gray-800 truncate">{r.name}</div>
                        <div className="px-4 py-2.5 text-right font-mono text-sm font-semibold text-blue-800">
                          {group.side === 'debit' && bal > 0 ? inr(bal) : <span className="text-gray-200">—</span>}
                        </div>
                        <div className="px-4 py-2.5 text-right font-mono text-sm font-semibold text-emerald-800">
                          {group.side === 'credit' && bal > 0 ? inr(bal) : <span className="text-gray-200">—</span>}
                        </div>
                      </div>
                    );
                  })}

                  {/* Subtotal row */}
                  <div className="grid grid-cols-[3rem_1fr_8rem_8rem] md:grid-cols-[4rem_1fr_10rem_10rem] border-t border-dashed"
                    style={{borderColor: group.accent + '40', background: group.bg + 'cc'}}>
                    <div/>
                    <div className="px-4 py-2 text-xs font-bold" style={{color: group.accent}}>
                      Total {group.label}
                    </div>
                    <div className="px-4 py-2 text-right font-mono font-black text-sm" style={{color: group.side === 'debit' ? group.accent : 'transparent'}}>
                      {group.side === 'debit' ? `₹${inr(subtotal)}` : ''}
                    </div>
                    <div className="px-4 py-2 text-right font-mono font-black text-sm" style={{color: group.side === 'credit' ? group.accent : 'transparent'}}>
                      {group.side === 'credit' ? `₹${inr(subtotal)}` : ''}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Grand total */}
        <div className="grid grid-cols-[3rem_1fr_8rem_8rem] md:grid-cols-[4rem_1fr_10rem_10rem] border-t-2 border-gray-900 bg-[#0A1F5C] text-white">
          <div/>
          <div className="px-4 py-4 font-black text-sm tracking-wide">GRAND TOTAL</div>
          <div className="px-4 py-4 text-right font-mono font-black text-base">₹{inr(Math.abs(trialDebit))}</div>
          <div className="px-4 py-4 text-right font-mono font-black text-base">₹{inr(Math.abs(trialCredit))}</div>
        </div>

        {/* Balance status footer */}
        <div className={`px-5 py-3 flex items-center justify-between ${balanced ? 'bg-emerald-50 border-t border-emerald-100' : 'bg-red-50 border-t border-red-100'}`}>
          <div className={`flex items-center gap-2 text-sm font-semibold ${balanced ? 'text-emerald-700' : 'text-red-700'}`}>
            {balanced
              ? <><CheckCircle2 size={16}/> Trial Balance is balanced — Debit equals Credit</>
              : <><AlertCircle size={16}/> Out of balance by ₹{inr(Math.abs(Math.abs(trialDebit) - Math.abs(trialCredit)))}</>}
          </div>
          <div className="text-[11px] text-gray-400">As of {dayjs().format('DD MMM YYYY')}</div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, rows, total, totalLabel }) {
  return (
    <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
      <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</p>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-slate-400 text-center">No accounts</p>
      ) : (
        <table className="w-full text-sm">
          <tbody className="divide-y divide-slate-50">
            {rows.map(r => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="px-4 py-2 text-slate-600 text-xs font-mono">{r.code}</td>
                <td className="px-4 py-2 text-black">{r.name}</td>
                <td className="px-4 py-2 text-right font-mono">{inr(Math.abs(Number(r.balance || 0)))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-100 bg-slate-50">
        <span className="text-sm font-semibold text-black">{totalLabel}</span>
        <span className="text-sm font-mono font-semibold text-black">{inr(Math.abs(total))}</span>
      </div>
    </div>
  );
}

function DayBookView({ entries, from, to, onFrom, onTo }) {
  const grandDebit = entries.reduce((s, e) => s + Number(e.total_debit || 0), 0);
  const grandCredit = entries.reduce((s, e) => s + Number(e.total_credit || 0), 0);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <label className="text-xs text-slate-500">From</label>
        <input type="date" value={from} onChange={e => onFrom(e.target.value)}
          className="border border-slate-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
        <label className="text-xs text-slate-500">To</label>
        <input type="date" value={to} onChange={e => onTo(e.target.value)}
          className="border border-slate-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
      </div>
      {entries.length === 0 ? (
        <p className="px-4 py-10 text-sm text-slate-400 text-center bg-white border border-slate-200 rounded-md">No posted journal entries for this period</p>
      ) : (
        <div className="space-y-3">
          {entries.map(e => (
            <div key={e.id} className="bg-white border border-slate-200 rounded-md overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between flex-wrap gap-1">
                <div>
                  <span className="font-mono text-xs font-semibold text-blue-700">{e.entry_no}</span>
                  <span className="text-xs text-slate-400 ml-2">{dayjs(e.entry_date).format('DD MMM YYYY')}</span>
                  {e.reference && <span className="text-xs text-slate-400 ml-2">Ref: {e.reference}</span>}
                </div>
                <span className="text-xs text-slate-500">{e.narration}</span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    {['Account', 'Description', 'Debit', 'Credit'].map(h => (
                      <th key={h} className="px-4 py-1.5 text-left text-[11px] font-medium uppercase tracking-wider text-slate-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {e.lines.map(l => (
                    <tr key={l.id}>
                      <td className="px-4 py-1.5 text-black">{l.account_code} — {l.account_name}</td>
                      <td className="px-4 py-1.5 text-slate-500 text-xs">{l.description || '—'}</td>
                      <td className="px-4 py-1.5 text-right font-mono">{Number(l.debit) > 0 ? inr(l.debit) : ''}</td>
                      <td className="px-4 py-1.5 text-right font-mono">{Number(l.credit) > 0 ? inr(l.credit) : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          <div className="bg-slate-50 border border-slate-200 rounded-md p-4 flex items-center justify-between">
            <span className="text-sm font-semibold text-black">Total</span>
            <span className="text-sm font-mono font-semibold text-black">Dr {inr(grandDebit)} &nbsp;|&nbsp; Cr {inr(grandCredit)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AccountingReportsPage({ initialTab }) {
  const [tab, setTab] = useState(initialTab || 'trial-balance');
  const [dbFrom, setDbFrom] = useState(dayjs().format('YYYY-MM-DD'));
  const [dbTo, setDbTo] = useState(dayjs().format('YYYY-MM-DD'));
  const [projectId, setProjectId] = useState('');

  const { data: projects = [] } = useQuery({
    queryKey: ['reports-projects'],
    queryFn: () => projectAPI.list().then(r => r.data?.data ?? r.data ?? []),
    staleTime: 5 * 60 * 1000,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['chart-of-accounts', 'reports', projectId],
    queryFn: () => chartOfAccountsAPI.list({ project_id: projectId || undefined }).then(r => r.data),
    enabled: !['ar-aging', 'ap-aging', 'day-book'].includes(tab),
  });

  const { data: dayBookData, isLoading: dayBookLoading } = useQuery({
    queryKey: ['day-book', dbFrom, dbTo],
    queryFn: () => journalEntryAPI.dayBook({ from: dbFrom, to: dbTo }).then(r => r.data?.data ?? []),
    enabled: tab === 'day-book',
  });
  const dayBookEntries = dayBookData ?? [];
  const rows = (data?.data ?? []).filter(a => a.is_active !== false);

  const { data: arData, isLoading: arLoading } = useQuery({
    queryKey: ['ar-aging'],
    queryFn: () => reportAPI.arAging().then(r => r.data),
    enabled: tab === 'ar-aging',
  });
  const { data: apData, isLoading: apLoading } = useQuery({
    queryKey: ['ap-aging'],
    queryFn: () => reportAPI.apAging().then(r => r.data),
    enabled: tab === 'ap-aging',
  });

  const arRows = (arData?.data ?? []).map(r => ({
    id: r.id, party: r.client_name || r.project_name, ref: r.bill_number,
    date: r.bill_date, age_days: r.age_days, bucket: r.bucket, amount: r.net_payable,
  }));
  const apRows = (apData?.data ?? []).map(r => ({
    id: r.id, party: r.vendor_name || r.project_name, ref: r.invoice_number,
    date: r.due_date || r.invoice_date, age_days: r.age_days, bucket: r.bucket, amount: r.total_amount,
  }));

  const byType = useMemo(() => {
    const g = { asset: [], liability: [], equity: [], income: [], expense: [] };
    rows.forEach(a => { (g[a.account_type] ||= []).push(a); });
    return g;
  }, [rows]);

  const sum = (list) => list.reduce((s, r) => s + Number(r.balance || 0), 0);

  const totalIncome = sum(byType.income);     // negative balance for income accounts
  const totalExpense = sum(byType.expense);
  const netProfit = Math.abs(totalIncome) - Math.abs(totalExpense);

  const totalAssets = sum(byType.asset);
  const totalLiabilities = sum(byType.liability);
  const totalEquity = sum(byType.equity);
  const retainedEarnings = netProfit;

  const trialDebit = sum(byType.asset) + sum(byType.expense);
  const trialCredit = -(sum(byType.liability) + sum(byType.equity) + sum(byType.income));

  const reportTitle = TABS.find(t => t.key === tab)?.label || 'Report';

  const buildRows = () => {
    const stamp = dayjs().format('YYYY-MM-DD');
    if (tab === 'trial-balance') {
      const lines = [['Code', 'Name', 'Type', 'Amount']];
      [...byType.asset, ...byType.expense].forEach(r => lines.push([r.code, r.name, 'Debit', Math.abs(Number(r.balance || 0))]));
      [...byType.liability, ...byType.equity, ...byType.income].forEach(r => lines.push([r.code, r.name, 'Credit', Math.abs(Number(r.balance || 0))]));
      lines.push(['', 'Total Debit', '', trialDebit]);
      lines.push(['', 'Total Credit', '', Math.abs(trialCredit)]);
      return { lines, filename: `trial-balance-${stamp}` };
    }
    if (tab === 'pnl') {
      const lines = [['Code', 'Name', 'Section', 'Amount']];
      byType.income.forEach(r => lines.push([r.code, r.name, 'Income', Math.abs(Number(r.balance || 0))]));
      byType.expense.forEach(r => lines.push([r.code, r.name, 'Expense', Math.abs(Number(r.balance || 0))]));
      lines.push(['', netProfit >= 0 ? 'Net Profit' : 'Net Loss', '', Math.abs(netProfit)]);
      return { lines, filename: `profit-and-loss-${stamp}` };
    }
    if (tab === 'balance-sheet') {
      const lines = [['Code', 'Name', 'Section', 'Amount']];
      byType.asset.forEach(r => lines.push([r.code, r.name, 'Asset', Math.abs(Number(r.balance || 0))]));
      byType.liability.forEach(r => lines.push([r.code, r.name, 'Liability', Math.abs(Number(r.balance || 0))]));
      byType.equity.forEach(r => lines.push([r.code, r.name, 'Equity', Math.abs(Number(r.balance || 0))]));
      lines.push(['', 'Retained Earnings (Net Profit/Loss)', 'Equity', Math.abs(retainedEarnings)]);
      lines.push(['', 'Total Assets', '', Math.abs(totalAssets)]);
      lines.push(['', 'Total Liabilities + Equity', '', Math.abs(totalLiabilities) + Math.abs(totalEquity) + Math.abs(retainedEarnings)]);
      return { lines, filename: `balance-sheet-${stamp}` };
    }
    if (tab === 'ar-aging') {
      const lines = [['Customer / Project', 'Bill Number', 'Bill Date', 'Age (days)', 'Bucket', 'Amount']];
      arRows.forEach(r => lines.push([r.party, r.ref, dayjs(r.date).format('DD MMM YYYY'), r.age_days, AGE_LABELS[r.bucket], r.amount]));
      lines.push(['', '', '', '', 'Total', arRows.reduce((s, r) => s + Number(r.amount || 0), 0)]);
      return { lines, filename: `aged-receivables-${stamp}` };
    }
    if (tab === 'ap-aging') {
      const lines = [['Vendor / Project', 'Invoice Number', 'Due Date', 'Age (days)', 'Bucket', 'Amount']];
      apRows.forEach(r => lines.push([r.party, r.ref, dayjs(r.date).format('DD MMM YYYY'), r.age_days, AGE_LABELS[r.bucket], r.amount]));
      lines.push(['', '', '', '', 'Total', apRows.reduce((s, r) => s + Number(r.amount || 0), 0)]);
      return { lines, filename: `aged-payables-${stamp}` };
    }
    const lines = [['Entry No', 'Date', 'Reference', 'Account', 'Description', 'Debit', 'Credit']];
    dayBookEntries.forEach(e => e.lines.forEach(l => lines.push([
      e.entry_no, dayjs(e.entry_date).format('DD MMM YYYY'), e.reference || '',
      `${l.account_code} — ${l.account_name}`, l.description || '', Number(l.debit) || '', Number(l.credit) || '',
    ])));
    return { lines, filename: `day-book-${dbFrom}-to-${dbTo}` };
  };

  const exportCsv = () => {
    const { lines, filename } = buildRows();
    downloadCsv(`${filename}.csv`, lines);
  };
  const exportPdf = () => {
    const { lines, filename } = buildRows();
    downloadPdf(`${filename}.pdf`, reportTitle, lines);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-blue-50 flex items-center justify-center">
              <FileBarChart className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-black">Financial Reports</h1>
              <p className="text-xs text-slate-400">Trial Balance, Profit &amp; Loss and Balance Sheet from posted journal entries</p>
            </div>
          </div>
          {tab !== 'trial-balance' && (
            <div className="flex items-center gap-2">
              <button onClick={exportCsv}
                className="flex items-center gap-1.5 px-4 py-2 text-sm border border-slate-200 rounded-md text-slate-700 hover:bg-slate-50">
                <Download className="w-3.5 h-3.5" /> CSV
              </button>
              <button onClick={exportPdf}
                className="flex items-center gap-1.5 px-4 py-2 text-sm border border-slate-200 rounded-md text-slate-700 hover:bg-slate-50">
                <FileDown className="w-3.5 h-3.5" /> PDF
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="px-6 pt-4">
        <div className="flex gap-1 border-b border-slate-200">
          {TABS.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={clsx('flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px',
                  tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700')}>
                <Icon className="w-3.5 h-3.5" /> {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {!['ar-aging', 'ap-aging', 'day-book', 'trial-balance'].includes(tab) && (
        <div className="px-6 pt-4 flex flex-wrap items-center gap-2">
          <select className="border border-slate-200 rounded-md px-3 py-2 text-sm bg-white w-64 focus:outline-none focus:ring-2 focus:ring-blue-200"
            value={projectId} onChange={e => setProjectId(e.target.value)}>
            <option value="">All Projects (company-wide)</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.project_code ? `${p.project_code} — ` : ''}{p.name}</option>)}
          </select>
          {projectId && (
            <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-100 rounded-md px-3 py-1.5">
              Scoped to this project — opening balances excluded (company-wide, not per-project).
            </p>
          )}
        </div>
      )}

      <div className="px-6 py-5">
        {(tab === 'ar-aging' && arLoading) || (tab === 'ap-aging' && apLoading) || (tab === 'day-book' && dayBookLoading) || (!['ar-aging','ap-aging','day-book'].includes(tab) && isLoading) ? (
          <div className="flex justify-center py-16">
            <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : tab === 'ar-aging' ? (
          <AgingTable rows={arRows} buckets={arData?.buckets} total={arData?.total || 0}
            dateLabel="Bill Date" nameLabel="Customer / Project" amountLabel="Net Payable (₹)" />
        ) : tab === 'ap-aging' ? (
          <AgingTable rows={apRows} buckets={apData?.buckets} total={apData?.total || 0}
            dateLabel="Due Date" nameLabel="Vendor / Project" amountLabel="Amount (₹)" />
        ) : tab === 'day-book' ? (
          <DayBookView entries={dayBookEntries} from={dbFrom} to={dbTo} onFrom={setDbFrom} onTo={setDbTo} />
        ) : tab === 'trial-balance' ? (
          <TrialBalanceView
            byType={byType}
            trialDebit={trialDebit}
            trialCredit={trialCredit}
            projectId={projectId}
            projects={projects}
            onProjectChange={setProjectId}
            onExportCsv={exportCsv}
            onExportPdf={exportPdf}
          />
        ) : tab === 'pnl' ? (
          <div className="space-y-4 max-w-3xl">
            <Section title="Income" rows={byType.income} total={totalIncome} totalLabel="Total Income" />
            <Section title="Expenses" rows={byType.expense} total={totalExpense} totalLabel="Total Expenses" />
            <div className={clsx('rounded-md border p-4 flex items-center justify-between',
              netProfit >= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100')}>
              <span className="text-sm font-semibold text-black">{netProfit >= 0 ? 'Net Profit' : 'Net Loss'}</span>
              <span className="text-lg font-mono font-bold text-black">{inr(Math.abs(netProfit))}</span>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Section title="Assets" rows={byType.asset} total={totalAssets} totalLabel="Total Assets" />
            <div className="space-y-4">
              <Section title="Liabilities" rows={byType.liability} total={totalLiabilities} totalLabel="Total Liabilities" />
              <Section title="Equity" rows={[...byType.equity, { id: 'retained', code: '', name: 'Retained Earnings (Net Profit/Loss)', balance: retainedEarnings }]}
                total={Math.abs(totalEquity) + Math.abs(retainedEarnings)} totalLabel="Total Equity" />
            </div>
            <div className={clsx('lg:col-span-2 rounded-md border p-4 flex items-center justify-between',
              Math.abs(Math.abs(totalAssets) - (Math.abs(totalLiabilities) + Math.abs(totalEquity) + Math.abs(retainedEarnings))) < 0.01
                ? 'bg-emerald-50 border-emerald-100' : 'bg-amber-50 border-amber-100')}>
              <span className="text-sm font-medium text-slate-700">Assets = Liabilities + Equity</span>
              <span className="text-sm font-mono font-semibold text-black">
                {inr(Math.abs(totalAssets))} = {inr(Math.abs(totalLiabilities) + Math.abs(totalEquity) + Math.abs(retainedEarnings))}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
