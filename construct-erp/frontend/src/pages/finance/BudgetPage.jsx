// src/pages/finance/BudgetPage.jsx  — Zoho ERP-style redesign
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  TrendingUp, AlertTriangle, X, ChevronDown, PieChart, Zap,
  Warehouse, Package, RefreshCw, ChevronRight, Search, Wrench,
  Plus, MoreVertical, Edit2, Trash2, CheckCircle, AlertCircle,
  BarChart3, DollarSign, TrendingDown, ArrowUpRight,
} from 'lucide-react';
import { clsx } from 'clsx';
import api, { projectAPI, inventoryAPI, budgetAPI } from '../../api/client';
import toast from 'react-hot-toast';
import DataToolbar from '../../components/common/DataToolbar';
import useAuthStore from '../../store/authStore';

const inr = (v) =>
  '₹' + parseFloat(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const COST_HEADS = [
  { group: 'Material', items: ['Material — Formworks','Material — Reinforcement','Material — Concrete & Aggregates','Material — Other Materials'] },
  { group: 'Plant & Machinery (P & M)', items: ['P & M — Equipment (General)','P & M — Formwork Equipment','P & M — Reinforcement Equipment (Bar Bending / Cutting)','P & M — Survey Equipment','P & M — Lab Equipment (QAQC)'] },
  { group: 'Safety', items: ['Safety — PPE & Protective Gear','Safety — Signages & Barricading','Safety — Fire Fighting & First Aid'] },
  { group: 'Electrical', items: ['Electrical — Cables & Wiring','Electrical — Lighting (LED / Flood)','Electrical — Distribution & Switchgear'] },
  { group: 'Consumables', items: ['Consumables — Hand Tools','Consumables — Maintenance Tools','Consumables — Formwork Tools'] },
  { group: 'Infra (Camp & Office)', items: ['Infra — Labour Camp Construction','Infra — Camp Facilities & Maintenance','Infra — Site Office & Furniture','Infra — Utilities (Water & Power)','Infra — Security & Transport'] },
  { group: 'Labour', items: ['Labour — Skilled','Labour — Unskilled','Labour — Supervisory'] },
  { group: 'Subcontracting', items: ['Subcontracting — Civil','Subcontracting — MEP','Subcontracting — Structural','Subcontracting — Finishing'] },
  { group: 'Overhead & Provisional', items: ['Overhead — Site Overhead','Overhead — Head Office','Contingency','Provisional Sum'] },
];

/* ── Thin progress bar ─────────────────────────────────────────── */
function ProgressBar({ pct, className = '' }) {
  const color = pct > 100 ? 'bg-red-500' : pct > 85 ? 'bg-amber-500' : 'bg-blue-500';
  return (
    <div className={clsx('flex items-center gap-2', className)}>
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden min-w-[64px]">
        <div className={clsx('h-full rounded-full', color)} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className={clsx('text-xs tabular-nums w-10 text-right',
        pct > 100 ? 'text-red-600' : pct > 85 ? 'text-amber-600' : 'text-slate-600'
      )}>{pct.toFixed(1)}%</span>
    </div>
  );
}

/* ── Status badge ──────────────────────────────────────────────── */
function StatusBadge({ pct, budgeted }) {
  if (!budgeted) return <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-600">Unbudgeted</span>;
  if (pct > 100) return <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded bg-red-100 text-red-700"><AlertCircle size={11}/>Overrun</span>;
  if (pct > 85)  return <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded bg-amber-100 text-amber-700"><AlertTriangle size={11}/>At risk</span>;
  return <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded bg-green-100 text-green-700"><CheckCircle size={11}/>On track</span>;
}

/* ── Compact KPI card ──────────────────────────────────────────── */
function KpiCard({ label, value, sub, valueColor = 'text-slate-900', icon: Icon, iconColor = 'text-blue-600', iconBg = 'bg-blue-50' }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4 flex items-start gap-3">
      <div className={clsx('w-9 h-9 rounded-lg flex items-center justify-center shrink-0', iconBg)}>
        <Icon size={18} className={iconColor} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-slate-500 mb-0.5">{label}</p>
        <p className={clsx('text-lg font-semibold tabular-nums leading-tight', valueColor)}>{value}</p>
        {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

/* ── Tab underline ─────────────────────────────────────────────── */
function TabBar({ active, onChange }) {
  const tabs = [
    { key: 'budget',     label: 'Budget vs Actual',  icon: BarChart3 },
    { key: 'commitment', label: 'Committed Costs',   icon: TrendingUp },
    { key: 'stock',      label: 'Stock on Hand',     icon: Warehouse },
  ];
  return (
    <div className="flex border-b border-slate-200 bg-white">
      {tabs.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={clsx(
            'flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap',
            active === key
              ? 'border-blue-600 text-blue-700'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          )}
        >
          <Icon size={15} />
          {label}
        </button>
      ))}
    </div>
  );
}

/* ── Section card wrapper ──────────────────────────────────────── */
function SectionCard({ children, className = '' }) {
  return (
    <div className={clsx('bg-white border border-slate-200 rounded-lg overflow-hidden', className)}>
      {children}
    </div>
  );
}

function SectionHeader({ title, sub, action }) {
  return (
    <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
      <div>
        <p className="text-sm font-semibold text-slate-800">{title}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

/* ── Project selector ──────────────────────────────────────────── */
function ProjectSelect({ value, onChange, projects, placeholder = '— Select project —' }) {
  return (
    <div className="relative inline-block">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="appearance-none bg-white border border-slate-200 rounded-lg pl-3 pr-8 py-2 text-sm text-slate-700 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 cursor-pointer min-w-[220px]"
      >
        <option value="">{placeholder}</option>
        {(projects ?? []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
    </div>
  );
}

export default function BudgetPage() {
  const [activeTab, setActiveTab]     = useState('budget');
  const [projectId, setProjectId]     = useState('');
  const [showForm, setShowForm]       = useState(false);
  const [form, setForm]               = useState({ cost_head: '', budgeted_amount: '', budget_pct: '', remarks: '' });
  const [editId, setEditId]           = useState(null);
  const [drillHead, setDrillHead]     = useState(null);
  const [drillSearch, setDrillSearch] = useState('');
  const [drillType, setDrillType]     = useState('all');
  const [openMenuId, setOpenMenuId]   = useState(null);
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const isAdmin = ['super_admin', 'admin'].includes(user?.role);

  const repairStockMutation = useMutation({
    mutationFn: () => inventoryAPI.repairDoubleStock(projectId || undefined),
    onSuccess: (res) => { toast.success(res.data?.message || 'Stock recalculated'); qc.invalidateQueries({ queryKey: ['stock-valuation'] }); },
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

  const { data: commitmentData = [], isLoading: commitLoading } = useQuery({
    queryKey: ['budget-commitment', projectId],
    queryFn: () => budgetAPI.commitment({ project_id: projectId }).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    enabled: activeTab === 'commitment' && !!projectId,
    staleTime: 0,
  });

  const { data: valuationRows = [], isLoading: valLoading, refetch: valRefetch } = useQuery({
    queryKey: ['stock-valuation', activeTab === 'stock' ? projectId : '__skip__'],
    queryFn: () => inventoryAPI.valuation(projectId ? { project_id: projectId } : {}).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    enabled: activeTab === 'stock',
  });

  const selectedProject = (projects ?? []).find(p => p.id === projectId);
  const contractValue   = parseFloat(selectedProject?.contract_value || 0);

  const createMutation = useMutation({
    mutationFn: (d) => api.post('/budget', { ...d, project_id: projectId }),
    onSuccess: () => { toast.success('Budget line saved'); setShowForm(false); setForm({ cost_head: '', budgeted_amount: '', budget_pct: '', remarks: '' }); qc.invalidateQueries({ queryKey: ['tqs-bills', 'budget'] }); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, d }) => api.put(`/budget/${id}`, d),
    onSuccess: () => { toast.success('Updated'); setShowForm(false); setEditId(null); qc.invalidateQueries({ queryKey: ['tqs-bills', 'budget'] }); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed'),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/budget/${id}`),
    onSuccess: () => { toast.success('Deleted'); qc.invalidateQueries({ queryKey: ['tqs-bills', 'budget'] }); },
    onError: () => toast.error('Failed to delete'),
  });

  const allItems   = budgetData ?? [];
  const budgeted   = allItems.filter(i => !i.unbudgeted);
  const unbudgeted = allItems.filter(i => i.unbudgeted);
  const totals = {
    budget: budgeted.reduce((s, i) => s + parseFloat(i.budgeted_amount || 0), 0),
    actual: allItems.reduce((s, i) => s + parseFloat(i.actual_amount || 0), 0),
  };
  const overrun      = totals.actual > totals.budget;
  const overrunItems = budgeted.filter(i => parseFloat(i.actual_amount) > parseFloat(i.budgeted_amount));
  const resetForm    = () => { setShowForm(false); setEditId(null); setForm({ cost_head: '', budgeted_amount: '', budget_pct: '', remarks: '' }); };

  const totalStockValue = valuationRows.reduce((s, r) => s + parseFloat(r.stock_value || 0), 0);
  const totalStockItems = valuationRows.reduce((s, r) => s + parseInt(r.item_count || 0), 0);
  const projectRollup   = Object.values(
    valuationRows.reduce((acc, r) => {
      if (!acc[r.project_id]) acc[r.project_id] = { project_id: r.project_id, project_name: r.project_name, item_count: 0, stock_value: 0 };
      acc[r.project_id].item_count  += parseInt(r.item_count || 0);
      acc[r.project_id].stock_value += parseFloat(r.stock_value || 0);
      return acc;
    }, {})
  ).sort((a, b) => b.stock_value - a.stock_value);
  const matBudgetTotal = (budgetData ?? []).filter(i => i.cost_head?.toLowerCase().startsWith('material'))
    .reduce((s, i) => s + parseFloat(i.budgeted_amount || 0), 0);

  return (
    <div className="min-h-screen bg-slate-50">

      {/* ── Page header ─────────────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div>
            <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
              <span>Procurement</span>
              <ChevronRight size={12} />
              <span className="text-slate-600">Budget Control</span>
            </div>
            <h1 className="text-xl font-semibold text-slate-900">Budget Control</h1>
          </div>
          <div className="flex items-center gap-2">
            {activeTab === 'budget' && projectId && (
              <button
                onClick={() => setShowForm(true)}
                className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3.5 py-2 rounded-lg transition-colors"
              >
                <Plus size={15} /> Add budget line
              </button>
            )}
            {activeTab === 'budget' && (
              <DataToolbar data={allItems} fileName="Budget_Analysis_Export" hideAdd />
            )}
          </div>
        </div>
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-6">
        <TabBar active={activeTab} onChange={v => { setActiveTab(v); setDrillHead(null); }} />
      </div>

      <div className="max-w-7xl mx-auto px-6 py-5 space-y-4">

        {/* ══════════════ BUDGET TAB ══════════════ */}
        {activeTab === 'budget' && (
          <>
            {/* Toolbar */}
            <div className="flex items-center gap-3 flex-wrap">
              <ProjectSelect value={projectId} onChange={setProjectId} projects={projects} />
              {projectId && (
                <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 font-medium bg-emerald-50 border border-emerald-100 rounded-md px-2.5 py-1.5">
                  <Zap size={11} />
                  Actual spend — paid bills only (live)
                </div>
              )}
              {contractValue > 0 && (
                <div className="text-xs text-slate-500">
                  Contract value: <span className="font-semibold text-slate-700">{inr(contractValue)}</span>
                </div>
              )}
            </div>

            {!projectId && (
              <div className="py-24 text-center">
                <BarChart3 className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                <p className="text-sm text-slate-500">Select a project to view its budget</p>
              </div>
            )}

            {projectId && (
              <>
                {/* KPI strip */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <KpiCard label="Total budget" value={inr(totals.budget)} icon={DollarSign} />
                  <KpiCard
                    label="Actual spend (paid)"
                    value={inr(totals.actual)}
                    valueColor={overrun ? 'text-red-600' : 'text-blue-700'}
                    icon={TrendingUp}
                    iconColor={overrun ? 'text-red-600' : 'text-blue-600'}
                    iconBg={overrun ? 'bg-red-50' : 'bg-blue-50'}
                    sub={`${totals.budget > 0 ? ((totals.actual / totals.budget) * 100).toFixed(1) : 0}% of budget`}
                  />
                  <KpiCard
                    label={overrun ? 'Over budget' : 'Balance remaining'}
                    value={inr(Math.abs(totals.budget - totals.actual))}
                    valueColor={overrun ? 'text-red-600' : 'text-green-600'}
                    icon={overrun ? TrendingDown : TrendingUp}
                    iconColor={overrun ? 'text-red-600' : 'text-green-600'}
                    iconBg={overrun ? 'bg-red-50' : 'bg-green-50'}
                  />
                  <KpiCard
                    label="Overrun items"
                    value={overrunItems.length}
                    valueColor={overrunItems.length > 0 ? 'text-red-600' : 'text-green-600'}
                    icon={AlertTriangle}
                    iconColor={overrunItems.length > 0 ? 'text-red-600' : 'text-green-600'}
                    iconBg={overrunItems.length > 0 ? 'bg-red-50' : 'bg-green-50'}
                    sub={overrunItems.length > 0 ? 'Needs attention' : 'All within budget'}
                  />
                </div>

                {/* Overall utilization */}
                <SectionCard>
                  <div className="px-5 py-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-slate-700">Overall budget utilization</span>
                      <span className={clsx('text-sm font-semibold tabular-nums', overrun ? 'text-red-600' : 'text-slate-700')}>
                        {totals.budget > 0 ? ((totals.actual / totals.budget) * 100).toFixed(1) : 0}%
                      </span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={clsx('h-full rounded-full transition-all', overrun ? 'bg-red-500' : totals.actual / totals.budget > 0.85 ? 'bg-amber-500' : 'bg-blue-500')}
                        style={{ width: `${Math.min(100, totals.budget > 0 ? (totals.actual / totals.budget) * 100 : 0)}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-slate-400 mt-1.5">
                      <span>₹0</span>
                      <span>Budget: {inr(totals.budget)}</span>
                    </div>
                  </div>
                </SectionCard>

                {/* Alerts */}
                {overrunItems.length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-start gap-3">
                    <AlertTriangle size={16} className="text-red-500 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-red-700 mb-1">Budget overrun — {overrunItems.length} cost head{overrunItems.length > 1 ? 's' : ''}</p>
                      <div className="flex flex-wrap gap-2">
                        {overrunItems.map(i => {
                          const over = parseFloat(i.actual_amount) - parseFloat(i.budgeted_amount);
                          return (
                            <span key={i.id} className="text-[11px] bg-red-100 text-red-700 px-2 py-0.5 rounded font-medium">
                              {i.cost_head} (+{inr(over)})
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {unbudgeted.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-start gap-3">
                    <AlertTriangle size={16} className="text-amber-500 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-amber-700 mb-1">Unbudgeted spend — {unbudgeted.length} cost head{unbudgeted.length > 1 ? 's' : ''} with no budget line</p>
                      <div className="flex flex-wrap gap-2">
                        {unbudgeted.map((u, i) => (
                          <span key={i} className="text-[11px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-medium">
                            {u.cost_head} ({inr(u.actual_amount)})
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Budget table */}
                <SectionCard>
                  <SectionHeader
                    title="Budget lines"
                    sub="Click a cost head to see individual paid bills"
                  />
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                          <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">Cost head</th>
                          <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500">% of contract</th>
                          <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500">Budgeted</th>
                          <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500">Actual paid</th>
                          <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500">Variance</th>
                          <th className="px-5 py-3 text-left   text-xs font-semibold text-slate-500 min-w-[160px]">Utilization</th>
                          <th className="px-5 py-3 text-left   text-xs font-semibold text-slate-500">Status</th>
                          <th className="px-2 py-3 w-8" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {isLoading && (
                          <tr><td colSpan={8} className="py-10 text-center text-sm text-slate-400">Loading…</td></tr>
                        )}
                        {budgeted.map(item => {
                          const budget   = parseFloat(item.budgeted_amount || 0);
                          const actual   = parseFloat(item.actual_amount || 0);
                          const variance = budget - actual;
                          const pct      = budget > 0 ? (actual / budget) * 100 : 0;
                          return (
                            <tr key={item.id} className={clsx('hover:bg-slate-50 transition-colors', pct > 100 && 'bg-red-50/40')}>
                              <td className="px-5 py-3">
                                <button
                                  onClick={() => { setDrillHead(item.cost_head); setDrillSearch(''); setDrillType('all'); }}
                                  className="text-blue-600 hover:text-blue-800 font-medium hover:underline flex items-center gap-1"
                                >
                                  {item.cost_head}
                                  <ArrowUpRight size={12} className="opacity-50" />
                                </button>
                              </td>
                              <td className="px-5 py-3 text-right text-slate-500 tabular-nums">
                                {item.budget_pct
                                  ? <span className="text-violet-600 font-medium">{parseFloat(item.budget_pct).toFixed(1)}%</span>
                                  : '—'}
                              </td>
                              <td className="px-5 py-3 text-right font-medium tabular-nums text-slate-700">{inr(budget)}</td>
                              <td className="px-5 py-3 text-right tabular-nums">
                                <span className={clsx('font-medium', actual > budget ? 'text-red-600' : 'text-blue-700')}>{inr(actual)}</span>
                              </td>
                              <td className="px-5 py-3 text-right tabular-nums">
                                <span className={clsx('font-medium', variance < 0 ? 'text-red-500' : 'text-green-600')}>
                                  {variance < 0 ? '−' : '+'}{inr(Math.abs(variance))}
                                </span>
                              </td>
                              <td className="px-5 py-3">
                                {budget > 0 ? <ProgressBar pct={pct} /> : <span className="text-xs text-slate-400">No budget</span>}
                              </td>
                              <td className="px-5 py-3">
                                <StatusBadge pct={pct} budgeted={budget > 0} />
                              </td>
                              <td className="px-2 py-3 relative">
                                <button
                                  onClick={() => setOpenMenuId(openMenuId === item.id ? null : item.id)}
                                  className="text-slate-300 hover:text-slate-600 p-1 rounded transition-colors"
                                >
                                  <MoreVertical size={14} />
                                </button>
                                {openMenuId === item.id && (
                                  <div className="absolute right-4 top-8 z-20 bg-white border border-slate-200 rounded-lg shadow-lg py-1 min-w-[130px]">
                                    <button
                                      onClick={() => { setForm({ cost_head: item.cost_head, budgeted_amount: item.budgeted_amount, budget_pct: item.budget_pct || '', remarks: item.remarks || '' }); setEditId(item.id); setShowForm(true); setOpenMenuId(null); }}
                                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                                    >
                                      <Edit2 size={13} /> Edit
                                    </button>
                                    <button
                                      onClick={() => { if (window.confirm('Delete this budget line?')) deleteMut.mutate(item.id); setOpenMenuId(null); }}
                                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                                    >
                                      <Trash2 size={13} /> Delete
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                        {budgeted.length > 0 && (
                          <tr className="bg-slate-50 border-t border-slate-200">
                            <td className="px-5 py-3 text-xs font-semibold text-slate-600">Total ({budgeted.length} heads)</td>
                            <td className="px-5 py-3 text-right text-xs font-medium text-violet-600 tabular-nums">
                              {contractValue > 0 ? ((totals.budget / contractValue) * 100).toFixed(1) + '%' : ''}
                            </td>
                            <td className="px-5 py-3 text-right font-semibold tabular-nums text-blue-700">{inr(totals.budget)}</td>
                            <td className="px-5 py-3 text-right font-semibold tabular-nums">
                              <span className={overrun ? 'text-red-600' : 'text-blue-700'}>{inr(totals.actual)}</span>
                            </td>
                            <td className="px-5 py-3 text-right font-semibold tabular-nums">
                              <span className={overrun ? 'text-red-600' : 'text-green-600'}>
                                {overrun ? '−' : '+'}{inr(Math.abs(totals.budget - totals.actual))}
                              </span>
                            </td>
                            <td className="px-5 py-3"><ProgressBar pct={totals.budget > 0 ? (totals.actual / totals.budget) * 100 : 0} /></td>
                            <td /><td />
                          </tr>
                        )}
                        {!isLoading && budgeted.length === 0 && (
                          <tr>
                            <td colSpan={8} className="py-16 text-center">
                              <PieChart className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                              <p className="text-sm text-slate-500 mb-1">No budget lines yet</p>
                              <p className="text-xs text-slate-400">Click "Add budget line" to set cost head limits</p>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </SectionCard>
              </>
            )}
          </>
        )}

        {/* ══════════════ COMMITTED COSTS TAB ══════════════ */}
        {activeTab === 'commitment' && (() => {
          const totalCommitted = commitmentData.reduce((s, r) => s + parseFloat(r.committed || 0), 0);
          const totalActual    = commitmentData.reduce((s, r) => s + parseFloat(r.actual || 0), 0);
          const totalBudgeted  = commitmentData.reduce((s, r) => s + parseFloat(r.budgeted || 0), 0);
          const netExposure    = totalCommitted - totalActual;
          const utilPct        = totalBudgeted > 0 ? ((totalCommitted + totalActual) / totalBudgeted) * 100 : 0;
          return (
            <div className="space-y-4">
              <div className="flex items-center gap-3 flex-wrap">
                <ProjectSelect value={projectId} onChange={setProjectId} projects={projects} />
                <div className="text-xs text-slate-400">Auto-mapped from vendor type · tag POs to a cost head for finer control</div>
              </div>

              {!projectId && (
                <div className="py-24 text-center">
                  <TrendingUp className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                  <p className="text-sm text-slate-500">Select a project to view committed costs</p>
                </div>
              )}

              {projectId && (
                <>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <KpiCard label="Committed (POs)" value={inr(totalCommitted)} icon={TrendingUp} iconColor="text-violet-600" iconBg="bg-violet-50" valueColor="text-violet-700" />
                    <KpiCard label="Actual paid" value={inr(totalActual)} icon={CheckCircle} iconColor="text-blue-600" iconBg="bg-blue-50" valueColor="text-blue-700" />
                    <KpiCard
                      label="Net exposure"
                      value={inr(Math.abs(netExposure))}
                      sub={netExposure > 0 ? 'Committed minus paid' : 'Fully settled'}
                      icon={netExposure > 0 ? AlertCircle : CheckCircle}
                      iconColor={netExposure > 0 ? 'text-amber-600' : 'text-green-600'}
                      iconBg={netExposure > 0 ? 'bg-amber-50' : 'bg-green-50'}
                      valueColor={netExposure > 0 ? 'text-amber-700' : 'text-green-700'}
                    />
                    <KpiCard
                      label="Budget utilization"
                      value={totalBudgeted > 0 ? utilPct.toFixed(1) + '%' : '—'}
                      sub="(Committed + Paid) / Budgeted"
                      icon={BarChart3}
                      iconColor={utilPct > 100 ? 'text-red-600' : utilPct > 85 ? 'text-amber-600' : 'text-green-600'}
                      iconBg={utilPct > 100 ? 'bg-red-50' : utilPct > 85 ? 'bg-amber-50' : 'bg-green-50'}
                      valueColor={utilPct > 100 ? 'text-red-600' : utilPct > 85 ? 'text-amber-700' : 'text-green-700'}
                    />
                  </div>

                  <SectionCard>
                    <SectionHeader title="Committed vs budgeted vs actual — by cost head" sub="Active POs only (draft & cancelled excluded)" />
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-100">
                            {['Cost head', 'Budgeted', 'Committed (POs)', 'POs', 'Actual paid', 'Net exposure', 'Status'].map((h, i) => (
                              <th key={h} className={clsx('px-5 py-3 text-xs font-semibold text-slate-500', i > 0 && i < 6 ? 'text-right' : 'text-left')}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {commitLoading && <tr><td colSpan={7} className="py-10 text-center text-sm text-slate-400">Loading…</td></tr>}
                          {!commitLoading && commitmentData.length === 0 && (
                            <tr><td colSpan={7} className="py-14 text-center text-sm text-slate-400">No POs found for this project</td></tr>
                          )}
                          {commitmentData.map((row, i) => {
                            const budg      = parseFloat(row.budgeted || 0);
                            const committed = parseFloat(row.committed || 0);
                            const actual    = parseFloat(row.actual || 0);
                            const exposure  = committed - actual;
                            const totalSpend= committed + actual;
                            const pct       = budg > 0 ? (totalSpend / budg) * 100 : committed > 0 ? 999 : 0;
                            return (
                              <tr key={i} className={clsx('hover:bg-slate-50', pct > 100 && 'bg-red-50/30')}>
                                <td className="px-5 py-3 font-medium text-slate-800">{row.cost_head}</td>
                                <td className="px-5 py-3 text-right tabular-nums text-slate-600">{budg > 0 ? inr(budg) : '—'}</td>
                                <td className="px-5 py-3 text-right tabular-nums font-medium text-violet-700">{inr(committed)}</td>
                                <td className="px-5 py-3 text-right tabular-nums text-slate-600">{row.po_count}</td>
                                <td className="px-5 py-3 text-right tabular-nums font-medium text-blue-700">{inr(actual)}</td>
                                <td className="px-5 py-3 text-right tabular-nums">
                                  <span className={exposure > 0 ? 'text-amber-600 font-medium' : 'text-green-600 font-medium'}>{inr(Math.abs(exposure))}</span>
                                </td>
                                <td className="px-5 py-3"><StatusBadge pct={pct} budgeted={budg > 0} /></td>
                              </tr>
                            );
                          })}
                          {commitmentData.length > 0 && (
                            <tr className="bg-slate-50 border-t border-slate-200 font-semibold text-sm">
                              <td className="px-5 py-3 text-slate-700">Total</td>
                              <td className="px-5 py-3 text-right tabular-nums text-blue-700">{inr(totalBudgeted)}</td>
                              <td className="px-5 py-3 text-right tabular-nums text-violet-700">{inr(totalCommitted)}</td>
                              <td className="px-5 py-3 text-right tabular-nums text-slate-600">{commitmentData.reduce((s, r) => s + parseInt(r.po_count || 0), 0)}</td>
                              <td className="px-5 py-3 text-right tabular-nums text-blue-700">{inr(totalActual)}</td>
                              <td className="px-5 py-3 text-right tabular-nums text-amber-600">{inr(Math.abs(netExposure))}</td>
                              <td />
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </SectionCard>
                </>
              )}
            </div>
          );
        })()}

        {/* ══════════════ STOCK ON HAND TAB ══════════════ */}
        {activeTab === 'stock' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <ProjectSelect value={projectId} onChange={setProjectId} projects={projects} placeholder="— All projects —" />
              <button
                onClick={() => valRefetch()}
                className="border border-slate-200 bg-white rounded-lg p-2 text-slate-500 hover:text-blue-600 hover:border-blue-300 transition-colors"
                title="Refresh"
              >
                <RefreshCw size={15} className={valLoading ? 'animate-spin' : ''} />
              </button>
              {isAdmin && (
                <button
                  onClick={() => {
                    if (window.confirm(projectId
                      ? 'Recalculate stock for selected project from transaction history?'
                      : 'Recalculate stock for ALL projects from transaction history?'
                    )) repairStockMutation.mutate();
                  }}
                  disabled={repairStockMutation.isPending}
                  className="flex items-center gap-1.5 border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 rounded-lg px-3 py-2 text-xs font-medium transition-colors"
                >
                  <Wrench size={13} />
                  {repairStockMutation.isPending ? 'Repairing…' : 'Repair stock'}
                </button>
              )}
              <div className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                <Zap size={11} /> Live from Store Ledger
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              <KpiCard label="Total stock value" value={inr(totalStockValue)} icon={Package} iconColor="text-blue-600" iconBg="bg-blue-50" valueColor="text-blue-700" />
              <KpiCard label="Distinct items" value={totalStockItems} icon={Package} iconColor="text-slate-600" iconBg="bg-slate-100" />
              {projectId && matBudgetTotal > 0 ? (
                <KpiCard
                  label="% of material budget"
                  value={((totalStockValue / matBudgetTotal) * 100).toFixed(0) + '%'}
                  sub={`Budget: ${inr(matBudgetTotal)}`}
                  icon={BarChart3}
                  iconColor={totalStockValue > matBudgetTotal ? 'text-amber-600' : 'text-green-600'}
                  iconBg={totalStockValue > matBudgetTotal ? 'bg-amber-50' : 'bg-green-50'}
                  valueColor={totalStockValue > matBudgetTotal ? 'text-amber-700' : 'text-green-700'}
                />
              ) : (
                <KpiCard label="Projects with stock" value={projectRollup.length} icon={Warehouse} iconColor="text-slate-600" iconBg="bg-slate-100" />
              )}
            </div>

            {/* All-projects table */}
            {!projectId && (
              <SectionCard>
                <SectionHeader title="Stock value by project" sub="Closing stock × unit rate" />
                {valLoading ? (
                  <div className="py-12 text-center text-sm text-slate-400">Loading…</div>
                ) : projectRollup.length === 0 ? (
                  <div className="py-12 text-center">
                    <Warehouse className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                    <p className="text-sm text-slate-500">No inventory data — import stock in Store Ledger first</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                          {['Project', 'Items', 'Stock value', '% of total', ''].map((h, i) => (
                            <th key={h} className={clsx('px-5 py-3 text-xs font-semibold text-slate-500', [1,2].includes(i) ? 'text-right' : 'text-left')}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {projectRollup.map(p => {
                          const pct = totalStockValue > 0 ? (p.stock_value / totalStockValue) * 100 : 0;
                          return (
                            <tr key={p.project_id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setProjectId(p.project_id)}>
                              <td className="px-5 py-3 font-medium text-slate-800">{p.project_name}</td>
                              <td className="px-5 py-3 text-right tabular-nums text-slate-600">{p.item_count}</td>
                              <td className="px-5 py-3 text-right tabular-nums font-medium text-blue-700">{inr(p.stock_value)}</td>
                              <td className="px-5 py-3 min-w-[160px]">
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                    <div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.min(pct, 100)}%` }} />
                                  </div>
                                  <span className="text-xs tabular-nums text-slate-500 w-10 text-right">{pct.toFixed(1)}%</span>
                                </div>
                              </td>
                              <td className="px-3 py-3 text-slate-300 hover:text-blue-500"><ChevronRight size={15} /></td>
                            </tr>
                          );
                        })}
                        <tr className="bg-slate-50 border-t border-slate-200 font-semibold text-sm">
                          <td className="px-5 py-3 text-slate-700">Total</td>
                          <td className="px-5 py-3 text-right tabular-nums text-slate-600">{totalStockItems}</td>
                          <td className="px-5 py-3 text-right tabular-nums text-blue-700">{inr(totalStockValue)}</td>
                          <td /><td />
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </SectionCard>
            )}

            {/* Category breakdown */}
            {projectId && (
              <SectionCard>
                <SectionHeader
                  title="Category breakdown"
                  sub={selectedProject?.name}
                  action={
                    <button onClick={() => setProjectId('')} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                      ← All projects
                    </button>
                  }
                />
                {valLoading ? (
                  <div className="py-12 text-center text-sm text-slate-400">Loading…</div>
                ) : valuationRows.length === 0 ? (
                  <div className="py-12 text-center">
                    <Package className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                    <p className="text-sm text-slate-500">No stock data for this project</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                          {['Category', 'Items', 'Total qty', 'Stock value', '% of total'].map((h, i) => (
                            <th key={h} className={clsx('px-5 py-3 text-xs font-semibold text-slate-500', i > 0 ? 'text-right' : 'text-left')}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {valuationRows.map((row, i) => {
                          const pct = totalStockValue > 0 ? (parseFloat(row.stock_value) / totalStockValue) * 100 : 0;
                          const colors = ['bg-blue-500','bg-violet-500','bg-emerald-500','bg-amber-500','bg-rose-500','bg-cyan-500'];
                          return (
                            <tr key={i} className="hover:bg-slate-50">
                              <td className="px-5 py-3 font-medium text-slate-800">{row.category}</td>
                              <td className="px-5 py-3 text-right tabular-nums text-slate-600">{row.item_count}</td>
                              <td className="px-5 py-3 text-right tabular-nums text-slate-600">{Number(row.total_qty || 0).toFixed(2)}</td>
                              <td className="px-5 py-3 text-right tabular-nums font-medium text-blue-700">{inr(row.stock_value)}</td>
                              <td className="px-5 py-3 min-w-[160px]">
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                    <div className={clsx('h-full rounded-full', colors[i % colors.length])} style={{ width: `${Math.min(pct, 100)}%` }} />
                                  </div>
                                  <span className="text-xs tabular-nums text-slate-500 w-10 text-right">{pct.toFixed(1)}%</span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                        <tr className="bg-slate-50 border-t border-slate-200 font-semibold text-sm">
                          <td className="px-5 py-3 text-slate-700">Total</td>
                          <td className="px-5 py-3 text-right tabular-nums text-slate-600">{totalStockItems}</td>
                          <td className="px-5 py-3 text-right tabular-nums text-slate-600">{valuationRows.reduce((s, r) => s + parseFloat(r.total_qty || 0), 0).toFixed(2)}</td>
                          <td className="px-5 py-3 text-right tabular-nums text-blue-700">{inr(totalStockValue)}</td>
                          <td />
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </SectionCard>
            )}

            <p className="text-xs text-slate-400 text-center pb-2">
              Stock values are read-only — sourced from Store Ledger (closing qty × unit rate).
            </p>
          </div>
        )}
      </div>

      {/* ── DQS Bill Drill-down Slide Panel ─────────────────────────── */}
      {drillHead && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/30 backdrop-blur-[2px]" onClick={() => setDrillHead(null)} />
          <div className="w-full max-w-2xl bg-white flex flex-col shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
              <div>
                <p className="text-xs text-slate-400 mb-0.5">DQS paid bills — drill-down</p>
                <h2 className="text-base font-semibold text-slate-900">{drillHead}</h2>
                {!drillLoading && (
                  <p className="text-xs text-slate-500 mt-0.5">
                    {filteredDrillData.length}{filteredDrillData.length !== drillData.length ? ` of ${drillData.length}` : ''} bills ·
                    Total: <span className="text-blue-600 font-medium">{inr(filteredDrillData.reduce((s, r) => s + parseFloat(r.total_amount || 0), 0))}</span>
                  </p>
                )}
              </div>
              <button onClick={() => setDrillHead(null)} className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors">
                <X size={16} />
              </button>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 shrink-0 bg-slate-50">
              <div className="relative flex-1">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  className="w-full border border-slate-200 rounded-md pl-8 pr-3 py-1.5 text-sm bg-white focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 placeholder:text-slate-400"
                  placeholder="Search vendor or invoice…"
                  value={drillSearch}
                  onChange={e => setDrillSearch(e.target.value)}
                />
              </div>
              <div className="flex gap-1">
                {[['all','All'], ['po','PO'], ['wo','WO']].map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => setDrillType(val)}
                    className={clsx(
                      'px-3 py-1.5 rounded-md text-xs font-medium transition-colors border',
                      drillType === val
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
                    )}
                  >{label}</button>
                ))}
              </div>
            </div>

            {/* Bill list */}
            <div className="flex-1 overflow-y-auto">
              {drillLoading ? (
                <div className="py-12 text-center text-sm text-slate-400">Loading bills…</div>
              ) : filteredDrillData.length === 0 ? (
                <div className="py-12 text-center text-sm text-slate-400">No bills match your filter</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-100 sticky top-0">
                    <tr>
                      {['Invoice', 'Vendor', 'Description', 'Date', 'Amount'].map((h, i) => (
                        <th key={h} className={clsx('py-2.5 px-4 text-xs font-semibold text-slate-500', h === 'Amount' ? 'text-right' : 'text-left')}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredDrillData.map((bill, i) => (
                      <tr key={i} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-800 text-xs font-mono">{bill.inv_number || '—'}</div>
                          <div className="text-[11px] text-slate-400 mt-0.5">{bill.sl_number}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-700 text-xs truncate max-w-[140px]">{bill.vendor_name}</div>
                          <span className={clsx('text-[10px] font-medium', bill.bill_type === 'wo' ? 'text-violet-500' : 'text-blue-400')}>
                            {bill.bill_type === 'wo' ? 'Work Order' : 'PO Bill'}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-xs text-slate-600 truncate max-w-[140px]">{bill.work_desc || bill.po_number || '—'}</div>
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-500 whitespace-nowrap">
                          {bill.inv_date ? new Date(bill.inv_date).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'2-digit' }) : '—'}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="font-medium text-blue-700 tabular-nums">{inr(bill.total_amount)}</div>
                          {parseFloat(bill.gst_amount) > 0 && (
                            <div className="text-[10px] text-slate-400">GST: {inr(bill.gst_amount)}</div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 border-t border-slate-200 sticky bottom-0">
                    <tr>
                      <td colSpan={4} className="py-3 px-4 text-xs font-semibold text-slate-600">Total</td>
                      <td className="py-3 px-4 text-right font-semibold text-blue-700 tabular-nums">
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

      {/* ── Add / Edit Modal ─────────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-900">
                {editId ? 'Edit budget line' : 'Add budget line'}
              </h2>
              <button onClick={resetForm} className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Cost head *</label>
                <select
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
                  value={form.cost_head}
                  onChange={e => setForm(p => ({ ...p, cost_head: e.target.value }))}
                  disabled={!!editId}
                >
                  <option value="">Select cost head…</option>
                  {COST_HEADS.map(g => (
                    <optgroup key={g.group} label={g.group}>
                      {g.items.map(item => <option key={item} value={item}>{item}</option>)}
                    </optgroup>
                  ))}
                </select>
                {editId && <p className="text-[11px] text-slate-400 mt-1">Cost head cannot be changed after creation.</p>}
              </div>

              <div className={clsx('grid gap-4', contractValue > 0 ? 'grid-cols-2' : 'grid-cols-1')}>
                {contractValue > 0 && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">% of contract value</label>
                    <input
                      type="number" step="0.1" min="0" max="100"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-violet-700 font-medium focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
                      placeholder="e.g. 22"
                      value={form.budget_pct}
                      onChange={e => {
                        const pct = e.target.value;
                        const amt = pct !== '' ? ((parseFloat(pct) / 100) * contractValue).toFixed(2) : '';
                        setForm(p => ({ ...p, budget_pct: pct, budgeted_amount: amt }));
                      }}
                    />
                    <p className="text-[11px] text-slate-400 mt-1">Contract: {inr(contractValue)}</p>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Budget amount (₹) *</label>
                  <input
                    type="number"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-blue-700 font-medium focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
                    placeholder="0.00"
                    value={form.budgeted_amount}
                    onChange={e => {
                      const amt = e.target.value;
                      const pct = (amt !== '' && contractValue > 0) ? ((parseFloat(amt) / contractValue) * 100).toFixed(2) : '';
                      setForm(p => ({ ...p, budgeted_amount: amt, budget_pct: pct }));
                    }}
                  />
                  {contractValue > 0 && form.budgeted_amount && (
                    <p className="text-[11px] text-slate-400 mt-1">= {((parseFloat(form.budgeted_amount || 0) / contractValue) * 100).toFixed(2)}% of contract</p>
                  )}
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2.5 text-xs text-blue-700">
                Actual spend is calculated automatically from paid bills tagged to this cost head.
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Remarks</label>
                <input
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
                  placeholder="Optional notes…"
                  value={form.remarks}
                  onChange={e => setForm(p => ({ ...p, remarks: e.target.value }))}
                />
              </div>

              <div className="flex gap-3 pt-2 border-t border-slate-100">
                <button onClick={resetForm} className="flex-1 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 font-medium transition-colors">
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const payload = { ...form, budget_pct: form.budget_pct !== '' ? parseFloat(form.budget_pct) : null };
                    editId ? updateMutation.mutate({ id: editId, d: payload }) : createMutation.mutate(payload);
                  }}
                  disabled={createMutation.isPending || updateMutation.isPending || !form.cost_head || !form.budgeted_amount}
                  className="flex-[2] py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium text-sm rounded-lg transition-colors"
                >
                  {(createMutation.isPending || updateMutation.isPending) ? 'Saving…' : 'Save budget line'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* close open menus on outside click */}
      {openMenuId && <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />}
    </div>
  );
}
