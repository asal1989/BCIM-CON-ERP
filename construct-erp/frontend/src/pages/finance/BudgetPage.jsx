// src/pages/finance/BudgetPage.jsx
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { TrendingUp, AlertTriangle, X, ChevronDown, PieChart, Zap, Warehouse, Package, RefreshCw, ChevronRight, Search, Wrench } from 'lucide-react';
import { clsx } from 'clsx';
import api, { projectAPI, inventoryAPI, budgetAPI } from '../../api/client';
import toast from 'react-hot-toast';
import DataToolbar from '../../components/common/DataToolbar';
import TableActions from '../../components/common/TableActions';
import useAuthStore from '../../store/authStore';

const inr  = (v) => `₹${parseFloat(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const inrL = inr;

const COST_HEADS = [
  { group: 'Material', items: [
    'Material — Formworks',
    'Material — Reinforcement',
    'Material — Concrete & Aggregates',
    'Material — Other Materials',
  ]},
  { group: 'Plant & Machinery (P & M)', items: [
    'P & M — Equipment (General)',
    'P & M — Formwork Equipment',
    'P & M — Reinforcement Equipment (Bar Bending / Cutting)',
    'P & M — Survey Equipment',
    'P & M — Lab Equipment (QAQC)',
  ]},
  { group: 'Safety', items: [
    'Safety — PPE & Protective Gear',
    'Safety — Signages & Barricading',
    'Safety — Fire Fighting & First Aid',
  ]},
  { group: 'Electrical', items: [
    'Electrical — Cables & Wiring',
    'Electrical — Lighting (LED / Flood)',
    'Electrical — Distribution & Switchgear',
  ]},
  { group: 'Consumables', items: [
    'Consumables — Hand Tools',
    'Consumables — Maintenance Tools',
    'Consumables — Formwork Tools',
  ]},
  { group: 'Infra (Camp & Office)', items: [
    'Infra — Labour Camp Construction',
    'Infra — Camp Facilities & Maintenance',
    'Infra — Site Office & Furniture',
    'Infra — Utilities (Water & Power)',
    'Infra — Security & Transport',
  ]},
  { group: 'Labour', items: [
    'Labour — Skilled',
    'Labour — Unskilled',
    'Labour — Supervisory',
  ]},
  { group: 'Subcontracting', items: [
    'Subcontracting — Civil',
    'Subcontracting — MEP',
    'Subcontracting — Structural',
    'Subcontracting — Finishing',
  ]},
  { group: 'Overhead & Provisional', items: [
    'Overhead — Site Overhead',
    'Overhead — Head Office',
    'Contingency',
    'Provisional Sum',
  ]},
];

function UtilBar({ pct }) {
  const color = pct > 100 ? 'bg-red-500' : pct > 85 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden min-w-[80px] shadow-inner">
        <div className={clsx('h-full rounded-full transition-all', color)} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className={clsx('text-[10px] font-mono w-12 text-right font-medium tracking-tighter',
        pct > 100 ? 'text-red-600' : pct > 85 ? 'text-amber-600' : 'text-emerald-600'
      )}>{pct.toFixed(1)}%</span>
    </div>
  );
}

// ValueBar — horizontal fill bar for stock tables
function ValueBar({ pct, color = 'bg-indigo-500' }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden min-w-[60px]">
        <div className={clsx('h-full rounded-full', color)} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className="text-[10px] font-mono font-medium text-slate-900 font-medium w-10 text-right">{pct.toFixed(1)}%</span>
    </div>
  );
}

export default function BudgetPage() {
  const [activeTab, setActiveTab]  = useState('budget');
  const [projectId, setProjectId]  = useState('');
  const [showForm, setShowForm]    = useState(false);
  const [form, setForm]            = useState({ cost_head: '', budgeted_amount: '', budget_pct: '', remarks: '' });
  const [editId, setEditId]        = useState(null);
  const [drillHead, setDrillHead]  = useState(null);
  const [drillSearch, setDrillSearch] = useState('');
  const [drillType, setDrillType]     = useState('all');
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const isAdmin = ['super_admin', 'admin'].includes(user?.role);

  const repairStockMutation = useMutation({
    mutationFn: () => inventoryAPI.repairDoubleStock(projectId || undefined),
    onSuccess: (res) => {
      toast.success(res.data?.message || 'Stock balances recalculated');
      qc.invalidateQueries({ queryKey: ['stock-valuation'] });
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Repair failed'),
  });

  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectAPI.list().then(r => r.data?.data).catch(() => []),
  });

  const { data: budgetData, isLoading } = useQuery({
    queryKey: ['tqs-bills', 'budget', projectId],
    queryFn: () => api.get(`/budget?project_id=${projectId}`).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    enabled: !!projectId,
    staleTime: 0,
  });

  // Drill-down: individual DQS paid bills for a clicked cost head
  // Key starts with 'tqs-bills' so it auto-invalidates when any bill is paid/updated
  const { data: drillData = [], isFetching: drillLoading } = useQuery({
    queryKey: ['tqs-bills', 'budget-actuals', projectId, drillHead],
    queryFn: () => budgetAPI.actuals({ project_id: projectId, cost_head: drillHead }).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    enabled: !!projectId && !!drillHead,
    staleTime: 0,
  });

  const filteredDrillData = drillData.filter(b => {
    if (drillType !== 'all' && b.bill_type !== drillType) return false;
    if (drillSearch) {
      const q = drillSearch.toLowerCase();
      if (!`${b.vendor_name} ${b.inv_number} ${b.sl_number} ${b.po_number}`.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // Committed costs (POs vs budget vs actual)
  const { data: commitmentData = [], isLoading: commitLoading } = useQuery({
    queryKey: ['budget-commitment', projectId],
    queryFn: () => budgetAPI.commitment({ project_id: projectId }).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    enabled: activeTab === 'commitment' && !!projectId,
    staleTime: 0,
  });

  // Stock valuation — all projects (no filter) for the overview; filtered when project selected
  const { data: valuationRows = [], isLoading: valLoading, refetch: valRefetch } = useQuery({
    queryKey: ['stock-valuation', activeTab === 'stock' ? projectId : '__skip__'],
    queryFn: () => inventoryAPI.valuation(projectId ? { project_id: projectId } : {}).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    enabled: activeTab === 'stock',
  });

  const selectedProject = (projects ?? []).find(p => p.id === projectId);
  const contractValue   = parseFloat(selectedProject?.contract_value || 0);

  const createMutation = useMutation({
    mutationFn: (d) => api.post('/budget', { ...d, project_id: projectId }),
    onSuccess: () => {
      toast.success('Budget line saved');
      setShowForm(false);
      setForm({ cost_head: '', budgeted_amount: '', remarks: '' });
      qc.invalidateQueries({ queryKey: ['tqs-bills', 'budget'] });
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, d }) => api.put(`/budget/${id}`, d),
    onSuccess: () => {
      toast.success('Updated');
      setShowForm(false);
      setEditId(null);
      qc.invalidateQueries({ queryKey: ['tqs-bills', 'budget'] });
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed'),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/budget/${id}`),
    onSuccess: () => { toast.success('Deleted'); qc.invalidateQueries({ queryKey: ['tqs-bills', 'budget'] }); },
    onError: () => toast.error('Failed to delete'),
  });

  const allItems     = budgetData ?? [];
  const budgeted     = allItems.filter(i => !i.unbudgeted);
  const unbudgeted   = allItems.filter(i => i.unbudgeted);

  const totals = {
    budget: budgeted.reduce((s, i) => s + parseFloat(i.budgeted_amount || 0), 0),
    actual: allItems.reduce((s, i) => s + parseFloat(i.actual_amount || 0), 0),
  };
  const overrun      = totals.actual > totals.budget;
  const overrunItems = budgeted.filter(i => parseFloat(i.actual_amount) > parseFloat(i.budgeted_amount));

  const resetForm = () => { setShowForm(false); setEditId(null); setForm({ cost_head: '', budgeted_amount: '', budget_pct: '', remarks: '' }); };

  // ── Stock valuation derived values ─────────────────────────────────────────
  const totalStockValue  = valuationRows.reduce((s, r) => s + parseFloat(r.stock_value || 0), 0);
  const totalStockItems  = valuationRows.reduce((s, r) => s + parseInt(r.item_count || 0), 0);

  // per-project rollup (for "all projects" view)
  const projectRollup = Object.values(
    valuationRows.reduce((acc, r) => {
      if (!acc[r.project_id]) acc[r.project_id] = { project_id: r.project_id, project_name: r.project_name, item_count: 0, stock_value: 0 };
      acc[r.project_id].item_count  += parseInt(r.item_count || 0);
      acc[r.project_id].stock_value += parseFloat(r.stock_value || 0);
      return acc;
    }, {})
  ).sort((a, b) => b.stock_value - a.stock_value);

  // Material budget lines for comparison
  const matBudgetTotal = (budgetData ?? [])
    .filter(i => i.cost_head && i.cost_head.toLowerCase().startsWith('material'))
    .reduce((s, i) => s + parseFloat(i.budgeted_amount || 0), 0);

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-7xl mx-auto bg-slate-50 min-h-screen">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 flex items-center justify-center shadow-sm">
            <PieChart className="w-6 h-6 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-2xl font-medium text-slate-900 uppercase tracking-tight italic">
              {activeTab === 'budget' ? 'Budget vs Actual' : activeTab === 'commitment' ? 'Committed Costs' : 'Stock on Hand'}
            </h1>
            <p className="text-[10px] text-slate-900 font-medium uppercase tracking-widest mt-1">
              {activeTab === 'budget'
                ? 'Actual spend from Bill Tracker paid bills — live'
                : activeTab === 'commitment'
                ? 'Budgeted vs committed (open POs) vs actual payments — by cost head'
                : 'Current inventory valuation — qty × unit rate per project'}
            </p>
          </div>
        </div>
        {activeTab === 'budget' && (
          <DataToolbar data={allItems} fileName="Budget_Analysis_Export" onAdd={() => setShowForm(true)} addLabel="Add Budget Line" />
        )}
        {activeTab === 'commitment' && (
          <DataToolbar data={commitmentData} fileName="Committed_Costs_Export" />
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 bg-white border border-slate-200 rounded-2xl p-1.5 shadow-sm w-fit">
        {[['budget', PieChart, 'Budget vs Actual'], ['commitment', TrendingUp, 'Committed Costs'], ['stock', Warehouse, 'Stock on Hand']].map(([key, Icon, label]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={clsx(
              'flex items-center gap-2 px-5 py-2.5 rounded-xl text-[11px] font-medium uppercase tracking-widest italic transition-all',
              activeTab === key
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                : 'text-slate-900 font-medium hover:text-slate-900 hover:bg-slate-50'
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* ══════════════ BUDGET TAB ══════════════ */}
      {activeTab === 'budget' && <>

      {/* Project selector */}
      <div className="bg-white border border-slate-200 rounded-[2.5rem] p-6 shadow-sm relative">
        <select
          className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 pl-5 pr-10 text-xs font-medium text-slate-900 uppercase tracking-widest outline-none focus:border-indigo-400 transition-all shadow-sm appearance-none italic"
          value={projectId}
          onChange={e => setProjectId(e.target.value)}
        >
          <option value="">— Select Project —</option>
          {(projects ?? []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <ChevronDown className="absolute right-10 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-900 font-medium pointer-events-none" />
      </div>

      {projectId && (
        <>
          {/* Live indicator + contract value */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2 text-[10px] font-medium text-emerald-600 uppercase tracking-widest italic">
              <Zap size={12} className="text-emerald-500" />
              Actual spend sourced from Bill Tracker — bills with <span className="bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-md">Paid</span> status only
            </div>
            {contractValue > 0 && (
              <div className="flex items-center gap-2 bg-violet-50 border border-violet-100 rounded-xl px-4 py-2">
                <TrendingUp size={12} className="text-violet-500" />
                <span className="text-[10px] font-medium text-violet-600 uppercase tracking-widest italic">
                  Contract Value: {inrL(contractValue)} ({inr(contractValue)})
                </span>
              </div>
            )}
          </div>

          {/* KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-[2rem] p-6 text-center shadow-sm">
              <div className="text-3xl font-medium text-slate-900 font-mono tracking-tighter italic">{inrL(totals.budget)}</div>
              <div className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest mt-2 italic">Total Budget</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-[2rem] p-6 text-center shadow-sm">
              <div className={clsx('text-3xl font-medium font-mono tracking-tighter italic', overrun ? 'text-red-500' : 'text-indigo-600')}>{inrL(totals.actual)}</div>
              <div className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest mt-2 italic">Actual Spend (Live)</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-[2rem] p-6 text-center shadow-sm">
              <div className={clsx('text-3xl font-medium font-mono tracking-tighter italic', overrun ? 'text-red-500' : 'text-emerald-600')}>{inrL(Math.abs(totals.budget - totals.actual))}</div>
              <div className={clsx('text-[10px] font-medium uppercase tracking-widest mt-2 italic', overrun ? 'text-red-500' : 'text-emerald-600')}>
                {overrun ? 'Over Budget' : 'Balance Remaining'}
              </div>
            </div>
            <div className={clsx('border rounded-[2rem] p-6 text-center shadow-sm', overrunItems.length > 0 ? 'bg-red-50 border-red-100' : 'bg-emerald-50 border-emerald-100')}>
              <div className={clsx('text-3xl font-medium font-mono tracking-tighter italic', overrunItems.length > 0 ? 'text-red-600' : 'text-emerald-600')}>{overrunItems.length}</div>
              <div className={clsx('text-[10px] font-medium uppercase tracking-widest mt-2 italic', overrunItems.length > 0 ? 'text-red-500' : 'text-emerald-600')}>Overrun Items</div>
            </div>
          </div>

          {/* Overall utilization bar */}
          <div className="bg-white border border-slate-200 rounded-[2.5rem] p-8 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-medium text-slate-900 uppercase tracking-widest italic">Overall Budget Utilization</span>
              <span className={clsx('text-xl font-mono font-medium italic tracking-tighter', overrun ? 'text-red-600' : 'text-emerald-600')}>
                {totals.budget > 0 ? ((totals.actual / totals.budget) * 100).toFixed(1) : 0}%
              </span>
            </div>
            <div className="h-4 bg-slate-100 rounded-full overflow-hidden border border-slate-200 shadow-inner">
              <div
                className={clsx('h-full rounded-full transition-all',
                  overrun ? 'bg-red-500' : totals.actual / totals.budget > 0.85 ? 'bg-amber-500' : 'bg-emerald-500')}
                style={{ width: `${Math.min(100, totals.budget > 0 ? (totals.actual / totals.budget) * 100 : 0)}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest mt-3">
              <span>₹0</span><span>{inrL(totals.budget)} Budget</span>
            </div>
          </div>

          {/* Overrun alert */}
          {overrunItems.length > 0 && (
            <div className="bg-red-50 border border-red-100 rounded-[2.5rem] p-8 space-y-4 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 right-0 p-8 text-red-500/10 pointer-events-none scale-150 rotate-12">
                <AlertTriangle size={120} />
              </div>
              <div className="flex items-center gap-3 text-red-600 text-sm font-medium uppercase tracking-widest italic relative z-10">
                <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-sm text-red-500"><AlertTriangle className="w-5 h-5" /></div>
                Budget Overrun — {overrunItems.length} Cost Head{overrunItems.length > 1 ? 's' : ''}
              </div>
              <div className="space-y-2 relative z-10">
                {overrunItems.map(i => {
                  const over = parseFloat(i.actual_amount) - parseFloat(i.budgeted_amount);
                  return (
                    <div key={i.id} className="flex items-center justify-between text-xs bg-white/60 p-3 rounded-xl border border-red-100">
                      <span className="text-red-800 font-medium uppercase tracking-tight italic">{i.cost_head}</span>
                      <div className="text-right">
                        <span className="text-red-500 font-mono font-medium italic">+{inr(over)} over</span>
                        <div className="text-[10px] text-red-400">Budget {inr(i.budgeted_amount)} · Actual {inr(i.actual_amount)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Unbudgeted spend warning */}
          {unbudgeted.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-[2.5rem] p-6 shadow-sm">
              <div className="flex items-center gap-3 text-amber-700 text-[11px] font-medium uppercase tracking-widest italic mb-4">
                <AlertTriangle size={16} className="text-amber-500" />
                Unbudgeted Spend — payments recorded with no budget line ({unbudgeted.length} cost heads)
              </div>
              <div className="space-y-2">
                {unbudgeted.map((u, i) => (
                  <div key={i} className="flex items-center justify-between bg-white/70 p-3 rounded-xl border border-amber-100 text-xs">
                    <span className="font-medium text-amber-800 uppercase italic">{u.cost_head}</span>
                    <span className="font-mono font-medium text-amber-600">{inr(u.actual_amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Budget Table */}
          <div className="bg-white border border-slate-200 rounded-[2.5rem] overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <span className="text-[11px] font-medium text-slate-900 font-medium uppercase tracking-widest italic">Budget Lines</span>
              <span className="text-[10px] font-medium text-emerald-600 italic flex items-center gap-1">
                <Zap size={10} /> Actual column updates automatically as payments are recorded
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    {['Cost Head', '%', 'Budgeted', 'Actual Paid (DQS)', 'Variance', 'Utilization', ''].map(h => (
                      <th key={h} className={clsx('py-5 px-6 text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest italic',
                        ['%', 'Budgeted', 'Actual (Live)', 'Variance'].includes(h) ? 'text-right' : '')}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {isLoading && (
                    <tr><td colSpan={7} className="py-12 text-center text-slate-900 font-medium uppercase tracking-widest italic text-[10px]">Loading...</td></tr>
                  )}
                  {budgeted.map(item => {
                    const budget   = parseFloat(item.budgeted_amount || 0);
                    const actual   = parseFloat(item.actual_amount || 0);
                    const variance = budget - actual;
                    const pct      = budget > 0 ? (actual / budget) * 100 : 0;
                    return (
                      <tr key={item.id} className={clsx('hover:bg-slate-50/50 transition-colors', pct > 100 && 'bg-red-50/30')}>
                        <td className="py-5 px-6">
                          <button
                            onClick={() => { setDrillHead(item.cost_head); setDrillSearch(''); setDrillType('all'); }}
                            className="text-slate-900 font-medium text-xs uppercase italic tracking-tight hover:text-indigo-600 transition-colors flex items-center gap-1.5 group"
                          >
                            {item.cost_head}
                            <ChevronRight className="w-3 h-3 text-slate-300 group-hover:text-indigo-400 transition-colors" />
                          </button>
                        </td>
                        <td className="py-5 px-6 text-right">
                          {item.budget_pct
                            ? <span className="text-[11px] font-medium font-mono text-violet-600 italic">{parseFloat(item.budget_pct).toFixed(1)}%</span>
                            : <span className="text-slate-300 text-[10px]">—</span>}
                        </td>
                        <td className="py-5 px-6 font-mono text-slate-900 font-medium text-sm text-right whitespace-nowrap">{inr(budget)}</td>
                        <td className="py-5 px-6 text-right whitespace-nowrap">
                          <div className={clsx('font-mono font-medium text-sm', actual > budget ? 'text-red-600' : 'text-indigo-600')}>{inr(actual)}</div>
                          <div className="text-[9px] text-emerald-500 font-medium italic">DQS paid</div>
                        </td>
                        <td className="py-5 px-6 font-mono font-medium text-sm text-right whitespace-nowrap">
                          <span className={variance < 0 ? 'text-red-500 font-medium' : 'text-emerald-500'}>
                            {variance < 0 ? '−' : '+'}{inr(Math.abs(variance))}
                          </span>
                        </td>
                        <td className="py-5 px-6 min-w-[200px]">
                          {budget > 0
                            ? <UtilBar pct={pct} />
                            : <span className="text-slate-900 font-medium text-[10px] font-medium uppercase italic tracking-widest">— No budget —</span>}
                        </td>
                        <td className="py-5 px-6" onClick={e => e.stopPropagation()}>
                          <TableActions
                            onEdit={() => {
                              setForm({ cost_head: item.cost_head, budgeted_amount: item.budgeted_amount, budget_pct: item.budget_pct || '', remarks: item.remarks || '' });
                              setEditId(item.id);
                              setShowForm(true);
                            }}
                            onDelete={() => deleteMut.mutate(item.id)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                  {/* Total row */}
                  {budgeted.length > 0 && (
                    <tr className="bg-slate-50 border-t-2 border-slate-200">
                      <td className="py-5 px-6 text-slate-900 font-medium uppercase text-xs tracking-widest italic">Total</td>
                      <td className="py-5 px-6 text-right">
                        <span className="text-[11px] font-medium font-mono text-violet-600 italic">
                          {contractValue > 0
                            ? ((totals.budget / contractValue) * 100).toFixed(1) + '%'
                            : ''}
                        </span>
                      </td>
                      <td className="py-5 px-6 font-mono font-medium text-indigo-600 text-base text-right italic">{inr(totals.budget)}</td>
                      <td className="py-5 px-6 font-mono font-medium text-base text-right italic">
                        <span className={totals.actual > totals.budget ? 'text-red-600' : 'text-indigo-600'}>{inr(totals.actual)}</span>
                      </td>
                      <td className="py-5 px-6 font-mono font-medium text-base text-right italic">
                        <span className={totals.actual > totals.budget ? 'text-red-600' : 'text-emerald-600'}>
                          {totals.actual > totals.budget ? '−' : '+'}{inr(Math.abs(totals.budget - totals.actual))}
                        </span>
                      </td>
                      <td className="py-5 px-6"><UtilBar pct={totals.budget > 0 ? (totals.actual / totals.budget) * 100 : 0} /></td>
                      <td />
                    </tr>
                  )}
                  {!isLoading && budgeted.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-24 text-center">
                        <PieChart className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                        <div className="text-slate-900 font-medium uppercase tracking-[0.3em] italic text-sm">No budget lines yet</div>
                        <div className="text-[10px] text-slate-900 font-medium uppercase tracking-widest mt-2">Click "Add Budget Line" to set cost head limits</div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {!projectId && (
        <div className="py-32 text-center">
          <PieChart className="w-16 h-16 text-slate-200 mx-auto mb-6" />
          <div className="text-slate-900 font-medium uppercase tracking-[0.3em] italic">Select a project to view budget</div>
        </div>
      )}

      {/* ── end budget tab ── */}
      </>}

      {/* ══════════════ COMMITTED COSTS TAB ══════════════ */}
      {activeTab === 'commitment' && (() => {
        const totalCommitted  = commitmentData.reduce((s, r) => s + parseFloat(r.committed || 0), 0);
        const totalActual     = commitmentData.reduce((s, r) => s + parseFloat(r.actual || 0), 0);
        const totalBudgeted   = commitmentData.reduce((s, r) => s + parseFloat(r.budgeted || 0), 0);
        const netExposure     = totalCommitted - totalActual;
        const utilPct         = totalBudgeted > 0 ? ((totalCommitted + totalActual) / totalBudgeted) * 100 : 0;

        return (
          <div className="space-y-8">
            {/* Project selector */}
            <div className="bg-white border border-slate-200 rounded-[2.5rem] p-6 shadow-sm relative">
              <select
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 pl-5 pr-10 text-xs font-medium text-slate-900 uppercase tracking-widest outline-none focus:border-indigo-400 transition-all shadow-sm appearance-none italic"
                value={projectId}
                onChange={e => setProjectId(e.target.value)}
              >
                <option value="">— Select Project —</option>
                {(projects ?? []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <ChevronDown className="absolute right-10 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-900 font-medium pointer-events-none" />
            </div>

            {!projectId && (
              <div className="py-32 text-center">
                <TrendingUp className="w-16 h-16 text-slate-200 mx-auto mb-6" />
                <div className="text-slate-900 font-medium uppercase tracking-[0.3em] italic">Select a project to view committed costs</div>
              </div>
            )}

            {projectId && (
              <>
                {/* Note */}
                <div className="bg-indigo-50 border border-indigo-100 rounded-2xl px-5 py-3 text-[11px] text-indigo-600 font-medium italic flex items-center gap-2">
                  <TrendingUp size={13} />
                  Committed costs are auto-mapped from vendor type. Tag individual POs with a cost head for finer control.
                </div>

                {/* KPI cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-white border border-slate-200 rounded-[2rem] p-6 text-center shadow-sm">
                    <div className="text-3xl font-medium text-violet-600 font-mono tracking-tighter italic">{inrL(totalCommitted)}</div>
                    <div className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest mt-2 italic">Total Committed (POs)</div>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-[2rem] p-6 text-center shadow-sm">
                    <div className="text-3xl font-medium text-indigo-600 font-mono tracking-tighter italic">{inrL(totalActual)}</div>
                    <div className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest mt-2 italic">Actual Paid</div>
                  </div>
                  <div className={clsx('border rounded-[2rem] p-6 text-center shadow-sm', netExposure > 0 ? 'bg-amber-50 border-amber-100' : 'bg-emerald-50 border-emerald-100')}>
                    <div className={clsx('text-3xl font-medium font-mono tracking-tighter italic', netExposure > 0 ? 'text-amber-600' : 'text-emerald-600')}>{inrL(Math.abs(netExposure))}</div>
                    <div className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest mt-2 italic">Net Exposure</div>
                    <div className={clsx('text-[10px] font-medium italic', netExposure > 0 ? 'text-amber-500' : 'text-emerald-500')}>{netExposure > 0 ? 'Committed − Paid' : 'Fully settled'}</div>
                  </div>
                  <div className={clsx('border rounded-[2rem] p-6 text-center shadow-sm', utilPct > 100 ? 'bg-red-50 border-red-100' : utilPct > 85 ? 'bg-amber-50 border-amber-100' : 'bg-white border-slate-200')}>
                    <div className={clsx('text-3xl font-medium font-mono tracking-tighter italic', utilPct > 100 ? 'text-red-600' : utilPct > 85 ? 'text-amber-600' : 'text-emerald-600')}>
                      {totalBudgeted > 0 ? utilPct.toFixed(1) : '—'}%
                    </div>
                    <div className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest mt-2 italic">Budget Utilisation</div>
                    <div className="text-[10px] text-slate-900 font-medium italic">(Committed + Paid) / Budgeted</div>
                  </div>
                </div>

                {/* Committed costs table */}
                <div className="bg-white border border-slate-200 rounded-[2.5rem] overflow-hidden shadow-sm">
                  <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                    <span className="text-[11px] font-medium text-slate-900 font-medium uppercase tracking-widest italic">Committed vs Budgeted vs Actual — by Cost Head</span>
                    <span className="text-[10px] text-slate-900 font-medium italic">Active POs only (draft &amp; cancelled excluded)</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 border-b border-slate-100">
                        <tr>
                          {['Cost Head', 'Budgeted (₹)', 'Committed — POs (₹)', 'POs', 'Actual Paid (₹)', 'Net Exposure (₹)', 'Status'].map(h => (
                            <th key={h} className={clsx('py-5 px-5 text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest italic',
                              ['Budgeted (₹)', 'Committed — POs (₹)', 'Actual Paid (₹)', 'Net Exposure (₹)', 'POs'].includes(h) && 'text-right'
                            )}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {commitLoading && (
                          <tr><td colSpan={7} className="py-12 text-center text-slate-900 font-medium uppercase tracking-widest italic text-[10px]">Loading...</td></tr>
                        )}
                        {!commitLoading && commitmentData.length === 0 && (
                          <tr>
                            <td colSpan={7} className="py-24 text-center">
                              <TrendingUp className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                              <div className="text-slate-900 font-medium uppercase tracking-[0.3em] italic text-sm">No POs found for this project</div>
                            </td>
                          </tr>
                        )}
                        {commitmentData.map((row, i) => {
                          const budgeted   = parseFloat(row.budgeted || 0);
                          const committed  = parseFloat(row.committed || 0);
                          const actual     = parseFloat(row.actual || 0);
                          const exposure   = committed - actual;
                          const totalSpend = committed + actual;
                          const pct        = budgeted > 0 ? (totalSpend / budgeted) * 100 : committed > 0 ? 999 : 0;
                          const isOver     = pct > 100;
                          const isRisk     = !isOver && pct > 85;
                          return (
                            <tr key={i} className={clsx('hover:bg-slate-50/50 transition-colors', isOver && 'bg-red-50/30')}>
                              <td className="py-5 px-5 text-slate-900 font-medium text-xs uppercase italic tracking-tight">{row.cost_head}</td>
                              <td className="py-5 px-5 font-mono text-slate-900 font-medium text-sm text-right whitespace-nowrap">
                                {budgeted > 0 ? inr(budgeted) : <span className="text-slate-300 text-[10px]">—</span>}
                              </td>
                              <td className="py-5 px-5 font-mono font-medium text-violet-600 text-sm text-right whitespace-nowrap">{inr(committed)}</td>
                              <td className="py-5 px-5 font-mono text-slate-900 font-medium text-sm text-right">{row.po_count}</td>
                              <td className="py-5 px-5 font-mono font-medium text-indigo-600 text-sm text-right whitespace-nowrap">{inr(actual)}</td>
                              <td className="py-5 px-5 font-mono font-medium text-sm text-right whitespace-nowrap">
                                <span className={exposure > 0 ? 'text-amber-600' : 'text-emerald-600'}>{inr(Math.abs(exposure))}</span>
                              </td>
                              <td className="py-5 px-5">
                                {isOver
                                  ? <span className="px-2 py-1 rounded-lg bg-red-100 text-red-700 text-[10px] font-medium uppercase italic">Over Budget</span>
                                  : isRisk
                                  ? <span className="px-2 py-1 rounded-lg bg-amber-100 text-amber-700 text-[10px] font-medium uppercase italic">At Risk</span>
                                  : budgeted > 0
                                  ? <span className="px-2 py-1 rounded-lg bg-emerald-100 text-emerald-700 text-[10px] font-medium uppercase italic">OK</span>
                                  : <span className="px-2 py-1 rounded-lg bg-slate-100 text-slate-900 font-medium text-[10px] font-medium uppercase italic">Unbudgeted</span>
                                }
                              </td>
                            </tr>
                          );
                        })}
                        {commitmentData.length > 0 && (
                          <tr className="bg-slate-50 border-t-2 border-slate-200">
                            <td className="py-5 px-5 font-medium text-slate-900 uppercase text-xs italic tracking-widest">Total</td>
                            <td className="py-5 px-5 font-mono font-medium text-indigo-600 text-base text-right italic">{inr(totalBudgeted)}</td>
                            <td className="py-5 px-5 font-mono font-medium text-violet-600 text-base text-right italic">{inr(totalCommitted)}</td>
                            <td className="py-5 px-5 font-mono font-medium text-slate-900 text-sm text-right">
                              {commitmentData.reduce((s, r) => s + parseInt(r.po_count || 0), 0)}
                            </td>
                            <td className="py-5 px-5 font-mono font-medium text-indigo-600 text-base text-right italic">{inr(totalActual)}</td>
                            <td className="py-5 px-5 font-mono font-medium text-amber-600 text-base text-right italic">{inr(Math.abs(netExposure))}</td>
                            <td />
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        );
      })()}

      {/* ══════════════ STOCK ON HAND TAB ══════════════ */}
      {activeTab === 'stock' && (
        <div className="space-y-8">

          {/* Project filter + refresh */}
          <div className="flex gap-3 items-center">
            <div className="relative flex-1 max-w-xs">
              <select
                className="w-full bg-white border border-slate-200 rounded-2xl p-4 pl-5 pr-10 text-xs font-medium text-slate-900 uppercase tracking-widest outline-none focus:border-indigo-400 transition-all shadow-sm appearance-none italic"
                value={projectId}
                onChange={e => setProjectId(e.target.value)}
              >
                <option value="">— All Projects —</option>
                {(projects ?? []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-900 font-medium pointer-events-none" />
            </div>
            <button
              onClick={() => valRefetch()}
              className="w-12 h-12 bg-white border border-slate-200 rounded-2xl flex items-center justify-center shadow-sm text-slate-900 font-medium hover:text-indigo-600 transition-all"
            >
              <RefreshCw className={clsx('w-4 h-4', valLoading && 'animate-spin')} />
            </button>
            {isAdmin && (
              <button
                onClick={() => {
                  if (window.confirm(
                    projectId
                      ? 'Recalculate stock balances for the selected project from transaction history? This fixes phantom stock caused by double-posting.'
                      : 'Recalculate stock balances for ALL projects from transaction history? This fixes phantom stock caused by double-posting.'
                  )) repairStockMutation.mutate();
                }}
                disabled={repairStockMutation.isPending}
                title="Fix phantom stock caused by double-posting (bill_receipt + QC both counted)"
                className="flex items-center gap-2 px-4 py-2.5 bg-red-50 border border-red-200 rounded-2xl text-xs font-medium text-red-700 hover:bg-red-100 transition-all shadow-sm"
              >
                <Wrench className="w-3.5 h-3.5" />
                {repairStockMutation.isPending ? 'Repairing…' : 'Repair Stock'}
              </button>
            )}
            <div className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest italic flex items-center gap-1">
              <Zap size={10} className="text-emerald-500" /> Live from Store Ledger
            </div>
          </div>

          {/* KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200 rounded-[2rem] p-6 text-center shadow-sm">
              <div className="text-3xl font-medium text-indigo-600 font-mono tracking-tighter italic">{inrL(totalStockValue)}</div>
              <div className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest mt-2 italic">Total Stock Value</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-[2rem] p-6 text-center shadow-sm">
              <div className="text-3xl font-medium text-slate-900 font-mono tracking-tighter italic">{totalStockItems}</div>
              <div className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest mt-2 italic">Distinct Items</div>
            </div>
            {projectId && matBudgetTotal > 0 ? (
              <div className={clsx('border rounded-[2rem] p-6 text-center shadow-sm',
                totalStockValue > matBudgetTotal ? 'bg-amber-50 border-amber-100' : 'bg-emerald-50 border-emerald-100'
              )}>
                <div className={clsx('text-3xl font-medium font-mono tracking-tighter italic',
                  totalStockValue > matBudgetTotal ? 'text-amber-600' : 'text-emerald-600'
                )}>
                  {matBudgetTotal > 0 ? ((totalStockValue / matBudgetTotal) * 100).toFixed(0) : 0}%
                </div>
                <div className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest mt-2 italic">of Material Budget</div>
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-[2rem] p-6 text-center shadow-sm">
                <div className="text-3xl font-medium text-slate-900 font-mono tracking-tighter italic">
                  {projectRollup.length}
                </div>
                <div className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest mt-2 italic">Projects with Stock</div>
              </div>
            )}
          </div>

          {/* Material Budget vs Stock Value — shown when project is selected and has material budget */}
          {projectId && matBudgetTotal > 0 && (
            <div className="bg-white border border-slate-200 rounded-[2.5rem] p-8 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <span className="text-[11px] font-medium text-slate-900 uppercase tracking-widest italic">Material Budget vs Stock on Hand</span>
                <div className="flex gap-4 text-[10px] font-medium uppercase tracking-widest">
                  <span className="flex items-center gap-1.5 text-slate-500"><span className="w-3 h-1.5 rounded bg-slate-200 inline-block" />Budget {inrL(matBudgetTotal)}</span>
                  <span className="flex items-center gap-1.5 text-indigo-600"><span className="w-3 h-1.5 rounded bg-indigo-500 inline-block" />Stock {inrL(totalStockValue)}</span>
                </div>
              </div>
              <div className="space-y-3">
                {/* Budget bar */}
                <div>
                  <div className="flex justify-between text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest italic mb-1.5">
                    <span>Material Budget</span><span>{inr(matBudgetTotal)}</span>
                  </div>
                  <div className="h-3 bg-slate-100 rounded-full overflow-hidden"><div className="h-full rounded-full bg-slate-300" style={{ width: '100%' }} /></div>
                </div>
                {/* Stock bar */}
                <div>
                  <div className="flex justify-between text-[10px] font-medium text-indigo-500 uppercase tracking-widest italic mb-1.5">
                    <span>Current Stock Value</span><span>{inr(totalStockValue)}</span>
                  </div>
                  <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                    <div className={clsx('h-full rounded-full transition-all', totalStockValue > matBudgetTotal ? 'bg-amber-500' : 'bg-indigo-500')}
                      style={{ width: `${Math.min(100, matBudgetTotal > 0 ? (totalStockValue / matBudgetTotal) * 100 : 0)}%` }}
                    />
                  </div>
                </div>
              </div>
              <p className="text-[10px] text-slate-900 font-medium italic mt-4">
                Stock on Hand is the current inventory value from Store Ledger. Material Budget is the sum of all Material cost head budgets for this project.
              </p>
            </div>
          )}

          {/* All-projects table (when no project selected) */}
          {!projectId && (
            <div className="bg-white border border-slate-200 rounded-[2.5rem] overflow-hidden shadow-sm">
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                <span className="text-[11px] font-medium text-slate-900 font-medium uppercase tracking-widest italic">Stock Value by Project</span>
                <span className="text-[10px] text-slate-900 font-medium italic">All projects · closing stock × unit rate</span>
              </div>
              {valLoading ? (
                <div className="py-16 text-center text-slate-900 font-medium uppercase tracking-widest italic text-[10px]">Loading...</div>
              ) : projectRollup.length === 0 ? (
                <div className="py-16 text-center">
                  <Warehouse className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                  <div className="text-slate-900 font-medium uppercase tracking-widest italic text-sm">No inventory data found</div>
                  <div className="text-[10px] text-slate-900 font-medium mt-2">Import stock data in Store Ledger first</div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr>
                        {['Project', 'Items', 'Stock Value', '% of Total', ''].map(h => (
                          <th key={h} className={clsx('py-4 px-6 text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest italic',
                            ['Items', 'Stock Value'].includes(h) && 'text-right')}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {projectRollup.map(p => {
                        const pct = totalStockValue > 0 ? (p.stock_value / totalStockValue) * 100 : 0;
                        return (
                          <tr key={p.project_id} className="hover:bg-slate-50/50 transition-colors cursor-pointer"
                            onClick={() => setProjectId(p.project_id)}>
                            <td className="py-4 px-6 text-slate-900 font-medium text-xs uppercase italic tracking-tight">{p.project_name}</td>
                            <td className="py-4 px-6 font-mono text-slate-900 font-medium text-sm text-right">{p.item_count}</td>
                            <td className="py-4 px-6 font-mono font-medium text-indigo-600 text-sm text-right whitespace-nowrap">{inr(p.stock_value)}</td>
                            <td className="py-4 px-6 min-w-[160px]"><ValueBar pct={pct} /></td>
                            <td className="py-4 px-6 text-slate-300 hover:text-indigo-500 transition-colors"><ChevronRight className="w-4 h-4" /></td>
                          </tr>
                        );
                      })}
                      <tr className="bg-slate-50 border-t-2 border-slate-200">
                        <td className="py-4 px-6 font-medium text-slate-900 uppercase text-xs italic tracking-widest">Total</td>
                        <td className="py-4 px-6 font-mono font-medium text-slate-900 text-sm text-right">{totalStockItems}</td>
                        <td className="py-4 px-6 font-mono font-medium text-indigo-600 text-base text-right italic">{inr(totalStockValue)}</td>
                        <td /><td />
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Category breakdown (when project selected) */}
          {projectId && (
            <div className="bg-white border border-slate-200 rounded-[2.5rem] overflow-hidden shadow-sm">
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                <span className="text-[11px] font-medium text-slate-900 font-medium uppercase tracking-widest italic">Category Breakdown</span>
                <button onClick={() => setProjectId('')} className="text-[10px] font-medium text-indigo-500 hover:text-indigo-700 uppercase tracking-widest italic">
                  ← All Projects
                </button>
              </div>
              {valLoading ? (
                <div className="py-16 text-center text-slate-900 font-medium uppercase tracking-widest italic text-[10px]">Loading...</div>
              ) : valuationRows.length === 0 ? (
                <div className="py-16 text-center">
                  <Package className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                  <div className="text-slate-900 font-medium uppercase tracking-widest italic text-sm">No stock data for this project</div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr>
                        {['Category', 'Items', 'Total Qty', 'Stock Value', '% of Total', ''].map(h => (
                          <th key={h} className={clsx('py-4 px-6 text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest italic',
                            ['Items', 'Total Qty', 'Stock Value'].includes(h) && 'text-right')}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {valuationRows.map((row, i) => {
                        const pct = totalStockValue > 0 ? (parseFloat(row.stock_value) / totalStockValue) * 100 : 0;
                        const colors = ['bg-indigo-500','bg-violet-500','bg-emerald-500','bg-amber-500','bg-rose-500','bg-cyan-500'];
                        return (
                          <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                            <td className="py-4 px-6 text-slate-900 font-medium text-xs uppercase italic tracking-tight">{row.category}</td>
                            <td className="py-4 px-6 font-mono text-slate-900 font-medium text-sm text-right">{row.item_count}</td>
                            <td className="py-4 px-6 font-mono text-slate-900 font-medium text-sm text-right">{Number(row.total_qty || 0).toFixed(2)}</td>
                            <td className="py-4 px-6 font-mono font-medium text-indigo-600 text-sm text-right whitespace-nowrap">{inr(row.stock_value)}</td>
                            <td className="py-4 px-6 min-w-[160px]"><ValueBar pct={pct} color={colors[i % colors.length]} /></td>
                            <td />
                          </tr>
                        );
                      })}
                      <tr className="bg-slate-50 border-t-2 border-slate-200">
                        <td className="py-4 px-6 font-medium text-slate-900 uppercase text-xs italic tracking-widest">Total</td>
                        <td className="py-4 px-6 font-mono font-medium text-slate-900 text-sm text-right">{totalStockItems}</td>
                        <td className="py-4 px-6 font-mono font-medium text-slate-900 text-sm text-right">
                          {valuationRows.reduce((s, r) => s + parseFloat(r.total_qty || 0), 0).toFixed(2)}
                        </td>
                        <td className="py-4 px-6 font-mono font-medium text-indigo-600 text-base text-right italic">{inr(totalStockValue)}</td>
                        <td /><td />
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <p className="text-[10px] text-slate-900 font-medium italic text-center pb-4">
            Stock values are read-only — sourced directly from Store Ledger (closing qty × unit rate). No journal entries are posted automatically at this stage.
          </p>
        </div>
      )}

      {/* ── DQS Bill Drill-down Panel ─────────────────────────────────────────── */}
      {drillHead && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white">

          {/* Full-screen panel */}
          <div className="relative w-full h-full flex flex-col overflow-hidden">

            {/* Panel Header */}
            <div className="flex items-center justify-between px-6 py-5 bg-slate-50 border-b border-slate-200 flex-shrink-0">
              <div>
                <div className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest italic mb-1">DQS Paid Bills — Splitup</div>
                <h2 className="text-base font-medium text-slate-900 uppercase italic tracking-tight">{drillHead}</h2>
                {!drillLoading && (
                  <div className="text-[11px] text-slate-900 font-medium mt-0.5">
                    {filteredDrillData.length}{filteredDrillData.length !== drillData.length ? ` of ${drillData.length}` : ''} bills · Total: <span className="text-indigo-600 font-medium">{inr(filteredDrillData.reduce((s, r) => s + parseFloat(r.total_amount || 0), 0))}</span>
                  </div>
                )}
              </div>
              <button onClick={() => setDrillHead(null)} className="w-10 h-10 bg-white border border-slate-200 rounded-xl flex items-center justify-center text-slate-900 font-medium hover:text-slate-900 shadow-sm transition-all">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 bg-white flex-shrink-0">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3 py-2 text-xs font-medium text-slate-900 placeholder:text-slate-900 font-medium outline-none focus:border-indigo-400 transition-all"
                  placeholder="Search vendor or invoice…"
                  value={drillSearch}
                  onChange={e => setDrillSearch(e.target.value)}
                />
              </div>
              <div className="flex gap-1.5">
                {[['all','All'], ['po','PO Bills'], ['wo','WO Bills']].map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => setDrillType(val)}
                    className={clsx(
                      'px-3 py-1.5 rounded-xl text-[10px] font-medium uppercase tracking-widest italic transition-all border',
                      drillType === val
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white text-slate-900 font-medium border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
                    )}
                  >{label}</button>
                ))}
              </div>
            </div>

            {/* Bill list */}
            <div className="flex-1 overflow-y-auto">
              {drillLoading ? (
                <div className="py-16 text-center text-slate-900 font-medium uppercase tracking-widest italic text-[10px]">Loading bills…</div>
              ) : filteredDrillData.length === 0 ? (
                <div className="py-16 text-center">
                  <div className="text-slate-900 font-medium uppercase tracking-widest italic text-sm">No bills match your filter</div>
                </div>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 border-b border-slate-100 sticky top-0">
                    <tr>
                      {['Invoice No', 'Vendor', 'Description', 'Date', 'Amount'].map(h => (
                        <th key={h} className={clsx('py-3 px-4 text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest italic',
                          h === 'Amount' && 'text-right')}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredDrillData.map((bill, i) => (
                      <tr key={i} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3 px-4">
                          <div className="text-[11px] font-medium font-mono text-slate-800">
                            {bill.inv_number || '—'}
                          </div>
                          <div className="text-[10px] text-slate-900 font-medium mt-0.5">{bill.sl_number}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-xs font-medium text-slate-900 font-medium truncate max-w-[160px]">{bill.vendor_name}</div>
                          <div className={clsx('text-[10px] mt-0.5', bill.bill_type === 'wo' ? 'text-violet-500' : 'text-indigo-400')}>
                            {bill.bill_type === 'wo' ? 'Work Order Bill' : 'PO Bill'}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-[11px] text-slate-900 truncate max-w-[160px]">
                            {bill.work_desc || bill.po_number || '—'}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-[11px] text-slate-900 font-medium whitespace-nowrap">
                          {bill.inv_date ? new Date(bill.inv_date).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'2-digit' }) : '—'}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="font-mono font-medium text-sm text-indigo-600">{inr(bill.total_amount)}</div>
                          {parseFloat(bill.gst_amount) > 0 && (
                            <div className="text-[10px] text-slate-400">Basic: {inr(bill.basic_amount)} + GST: {inr(bill.gst_amount)}</div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {/* Footer total */}
                  <tfoot className="bg-slate-50 border-t-2 border-slate-200 sticky bottom-0">
                    <tr>
                      <td colSpan={4} className="py-4 px-4 font-medium text-slate-900 uppercase text-xs italic tracking-widest">Total</td>
                      <td className="py-4 px-4 text-right font-mono font-medium text-indigo-600 text-base italic">
                        {inr(filteredDrillData.reduce((s, r) => s + parseFloat(r.total_amount || 0), 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md">
          <div className="bg-white border border-slate-200 rounded-[3.5rem] w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in duration-300">
            <div className="flex items-center justify-between p-8 bg-slate-50 border-b border-slate-100">
              <h2 className="font-medium text-xl text-slate-900 uppercase tracking-tight italic">
                {editId ? 'Edit Budget Line' : 'Add Budget Line'}
              </h2>
              <button onClick={resetForm} className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm border border-slate-200 text-slate-900 font-medium hover:text-slate-900 transition-all">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-10 space-y-6">
              <div className="space-y-2">
                <label className="text-[9px] font-medium text-slate-900 font-medium uppercase tracking-widest italic">Cost Head *</label>
                <select
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs font-medium text-slate-900 uppercase tracking-widest outline-none focus:border-indigo-400 transition-all shadow-sm appearance-none italic"
                  value={form.cost_head}
                  onChange={e => setForm(p => ({ ...p, cost_head: e.target.value }))}
                  disabled={!!editId}
                >
                  <option value="">Select cost head</option>
                  {COST_HEADS.map(g => (
                    <optgroup key={g.group} label={g.group}>
                      {g.items.map(item => <option key={item} value={item}>{item}</option>)}
                    </optgroup>
                  ))}
                </select>
                {editId && <p className="text-[10px] text-slate-900 font-medium italic">Cost head cannot be changed after creation.</p>}
              </div>
              {/* % and ₹ linked inputs */}
              <div className="grid grid-cols-2 gap-4">
                {contractValue > 0 && (
                  <div className="space-y-2">
                    <label className="text-[9px] font-medium text-slate-900 font-medium uppercase tracking-widest italic">% of Contract Value</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      className="w-full bg-violet-50 border border-violet-200 rounded-2xl p-4 text-sm font-mono font-medium text-violet-600 outline-none focus:border-violet-400 transition-all shadow-sm"
                      placeholder="e.g. 22"
                      value={form.budget_pct}
                      onChange={e => {
                        const pct = e.target.value;
                        const amt = pct !== '' ? ((parseFloat(pct) / 100) * contractValue).toFixed(2) : '';
                        setForm(p => ({ ...p, budget_pct: pct, budgeted_amount: amt }));
                      }}
                    />
                    <div className="text-[10px] text-violet-500 italic font-bold">
                      Contract: {inrL(contractValue)}
                    </div>
                  </div>
                )}
                <div className={clsx('space-y-2', contractValue > 0 ? '' : 'col-span-2')}>
                  <label className="text-[9px] font-medium text-slate-900 font-medium uppercase tracking-widest italic">Budget Amount (₹) *</label>
                  <input
                    type="number"
                    className="w-full bg-white border border-slate-200 rounded-2xl p-4 text-sm font-mono font-medium text-indigo-600 outline-none focus:border-indigo-400 transition-all shadow-sm"
                    placeholder="0.00"
                    value={form.budgeted_amount}
                    onChange={e => {
                      const amt = e.target.value;
                      const pct = (amt !== '' && contractValue > 0) ? ((parseFloat(amt) / contractValue) * 100).toFixed(2) : '';
                      setForm(p => ({ ...p, budgeted_amount: amt, budget_pct: pct }));
                    }}
                  />
                  {contractValue > 0 && form.budgeted_amount && (
                    <div className="text-[10px] text-slate-900 font-medium italic">
                      = {((parseFloat(form.budgeted_amount || 0) / contractValue) * 100).toFixed(2)}% of contract
                    </div>
                  )}
                </div>
              </div>
              <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 text-[11px] text-indigo-600 font-medium italic">
                ⚡ Actual spend will be calculated automatically from payments tagged to this cost head — no manual entry needed.
              </div>
              <div className="space-y-2">
                <label className="text-[9px] font-medium text-slate-900 font-medium uppercase tracking-widest italic">Remarks</label>
                <input
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs font-medium text-slate-900 outline-none focus:border-indigo-400 transition-all shadow-sm"
                  placeholder="Optional notes..."
                  value={form.remarks}
                  onChange={e => setForm(p => ({ ...p, remarks: e.target.value }))}
                />
              </div>
              <div className="flex gap-4 pt-4 border-t border-slate-100">
                <button onClick={resetForm} className="flex-1 py-5 bg-white border border-slate-200 text-slate-900 hover:text-slate-900 font-medium text-[11px] uppercase tracking-[0.2em] rounded-2xl transition-all shadow-sm italic">
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const payload = { ...form, budget_pct: form.budget_pct !== '' ? parseFloat(form.budget_pct) : null };
                    editId ? updateMutation.mutate({ id: editId, d: payload }) : createMutation.mutate(payload);
                  }}
                  disabled={createMutation.isPending || updateMutation.isPending || !form.cost_head || !form.budgeted_amount}
                  className="flex-[2] py-5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium text-[11px] uppercase tracking-[0.2em] rounded-2xl transition-all shadow-xl shadow-indigo-600/30 italic"
                >
                  {(createMutation.isPending || updateMutation.isPending) ? 'Saving...' : 'Save Budget Line'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
