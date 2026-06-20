// src/pages/qs/VariationPage.jsx
import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeftRight, Plus, X, CheckCircle2, XCircle, Search,
  RefreshCw, ChevronDown, FileText, Clock, AlertCircle,
  User, Calendar, Trash2, Eye, FileSpreadsheet,
} from 'lucide-react';
import { variationAPI, projectAPI, boqAPI } from '../../api/client';
import useAuthStore from '../../store/authStore';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import dayjs from 'dayjs';
import VariationStatementTab from './VariationStatementTab';

// ── helpers ───────────────────────────────────────────────────────────────────

const inr = v =>
  `₹${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS_CONFIG = {
  pending:  { label: 'Pending',  bg: 'bg-amber-50',   text: 'text-amber-600',   border: 'border-amber-200'   },
  approved: { label: 'Approved', bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200' },
  rejected: { label: 'Rejected', bg: 'bg-red-50',     text: 'text-red-500',     border: 'border-red-200'     },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  return (
    <span className={clsx(
      'inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-medium border',
      cfg.bg, cfg.text, cfg.border,
    )}>
      {cfg.label}
    </span>
  );
}

const TABS = [
  { key: 'all',      label: 'All'      },
  { key: 'pending',  label: 'Pending'  },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
];

// ── MAIN PAGE ─────────────────────────────────────────────────────────────────

export default function VariationPage() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const canApprove = ['super_admin', 'admin', 'project_manager'].includes(user?.role);

  const [outerTab,  setOuterTab]  = useState('orders');   // 'orders' | 'statements'
  const [projectId, setProjectId] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [search,    setSearch]    = useState('');
  const [showForm,  setShowForm]  = useState(false);
  const [selected,  setSelected]  = useState(null);

  // ── Queries ─────────────────────────────────────────────────────────────────
  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn:  () => projectAPI.list().then(r => r.data?.data || []),
  });

  const { data: vos = [], isLoading, refetch } = useQuery({
    queryKey: ['variations', projectId],
    queryFn:  () => variationAPI.list({ project_id: projectId || undefined }).then(r => r.data?.data || []),
  });

  // ── Stats ────────────────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total:    vos.length,
    pending:  vos.filter(v => v.status === 'pending').length,
    approved: vos.filter(v => v.status === 'approved').length,
    value:    vos.filter(v => v.status === 'approved').reduce((s, v) => s + Number(v.total_variation_amount || 0), 0),
  }), [vos]);

  // ── Filtered list ────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = vos;
    if (activeTab !== 'all') list = list.filter(v => v.status === activeTab);
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter(v =>
        (v.vo_number || '').toLowerCase().includes(s) ||
        (v.description || '').toLowerCase().includes(s) ||
        (v.project_name || '').toLowerCase().includes(s)
      );
    }
    return list;
  }, [vos, activeTab, search]);

  return (
    <div className="min-h-screen bg-[#f4f6f9]">

      {/* ── Sticky Header ── */}
      <div className="sticky top-0 z-30 bg-white border-b border-[#e2e6ec] shadow-sm">
        <div className="px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center shadow">
              <ArrowLeftRight className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-[15px] font-medium text-[#1a1c21] leading-none">Variations</h1>
              <p className="text-[10px] text-[#8e94a3] font-medium uppercase tracking-wider mt-0.5">
                Extra items &amp; scope changes
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {outerTab === 'orders' && (
              <>
                {/* Project filter */}
                <div className="relative">
                  <select
                    className="h-9 pl-3 pr-8 rounded-xl border border-[#d8dce1] bg-white text-[12px] text-[#1a1c21] outline-none focus:border-indigo-400 appearance-none cursor-pointer"
                    value={projectId}
                    onChange={e => setProjectId(e.target.value)}
                  >
                    <option value="">All Projects</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#8e94a3] pointer-events-none" />
                </div>

                <button
                  onClick={() => refetch()}
                  className="h-9 w-9 flex items-center justify-center rounded-xl border border-[#e2e6ec] bg-white text-[#6a6f7d] hover:bg-[#f4f6f9] transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>

                <button
                  onClick={() => setShowForm(true)}
                  className="h-9 flex items-center gap-1.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium transition-colors shadow"
                >
                  <Plus className="w-4 h-4" />
                  New Variation
                </button>
              </>
            )}
          </div>
        </div>

        {/* Outer tab bar */}
        <div className="px-6 flex gap-0 border-t border-[#e2e6ec]">
          {[
            { key: 'orders',     label: 'Variation Orders',     Icon: ArrowLeftRight   },
            { key: 'statements', label: 'Variation Statements', Icon: FileSpreadsheet  },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setOuterTab(t.key)}
              className={clsx(
                'flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors',
                outerTab === t.key
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-[#6a6f7d] hover:text-[#1a1c21] hover:border-[#d8dce1]',
              )}
            >
              <t.Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Variation Statements tab ── */}
      {outerTab === 'statements' && (
        <div className="px-6 py-5">
          <VariationStatementTab />
        </div>
      )}

      {outerTab === 'orders' && <div className="px-6 py-5 space-y-5">

        {/* ── Stats ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total VOs',       val: stats.total,               color: 'text-indigo-600'  },
            { label: 'Pending Approval',val: stats.pending,             color: 'text-amber-500'   },
            { label: 'Approved',        val: stats.approved,            color: 'text-emerald-500' },
            { label: 'Approved Value',  val: inr(stats.value),          color: 'text-blue-600'    },
          ].map(st => (
            <div key={st.label} className="bg-white border border-[#e2e6ec] rounded-2xl shadow-sm px-4 py-4 text-center">
              <div className={clsx('text-2xl font-medium', st.color)}>{st.val}</div>
              <div className="text-[10px] text-[#8e94a3] font-medium uppercase tracking-wider mt-1">{st.label}</div>
            </div>
          ))}
        </div>

        {/* ── Tab pills + Search ── */}
        <div className="flex flex-col md:flex-row gap-3 items-start md:items-center justify-between">
          <div className="flex gap-1 bg-white border border-[#e2e6ec] rounded-xl p-1">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={clsx(
                  'px-4 py-1.5 rounded-lg text-[11px] font-medium transition-all',
                  activeTab === t.key
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-[#6a6f7d] hover:text-[#1a1c21] hover:bg-[#f4f6f9]',
                )}
              >
                {t.label}
                <span className={clsx(
                  'ml-1.5 text-[9px] font-bold',
                  activeTab === t.key ? 'text-indigo-200' : 'text-[#8e94a3]',
                )}>
                  {t.key === 'all' ? vos.length : vos.filter(v => v.status === t.key).length}
                </span>
              </button>
            ))}
          </div>

          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8e94a3]" />
            <input
              className="w-full h-9 pl-9 pr-4 rounded-xl border border-[#d8dce1] bg-white text-[12px] text-[#1a1c21] outline-none focus:border-indigo-400 transition-colors"
              placeholder="Search VO number, description…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* ── Table ── */}
        <div className="bg-white border border-[#e2e6ec] rounded-2xl shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="py-16 text-center text-[#8e94a3] text-sm">Loading variation orders…</div>
          ) : filtered.length === 0 ? (
            <div className="py-16 flex flex-col items-center gap-2 text-[#8e94a3]">
              <AlertCircle className="w-10 h-10 text-slate-300" />
              <p className="text-sm font-medium">No variation orders found</p>
              <p className="text-xs">Click "New Variation" to raise one</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#e2e6ec] bg-[#f8f9fb]">
                    {['VO Number', 'Project', 'Description', 'Requested By', 'Date', 'Items', 'Amount', 'Status', ''].map((h, i) => (
                      <th key={i} className={clsx(
                        'py-3 px-4 text-[10px] font-medium text-[#6a6f7d] uppercase tracking-wider',
                        i >= 5 ? 'text-right' : 'text-left',
                        i === 7 ? 'text-center' : '',
                      )}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f3f6]">
                  {filtered.map(vo => (
                    <tr
                      key={vo.id}
                      className="hover:bg-[#f8f9fb] transition-colors cursor-pointer group"
                      onClick={() => setSelected(vo.id)}
                    >
                      {/* VO Number */}
                      <td className="py-3 px-4">
                        <span className="font-medium text-indigo-600 font-mono text-xs">{vo.vo_number}</span>
                      </td>
                      {/* Project */}
                      <td className="py-3 px-4 max-w-[150px]">
                        <span className="text-[12px] text-[#1a1c21] truncate block">{vo.project_name || '—'}</span>
                      </td>
                      {/* Description */}
                      <td className="py-3 px-4 max-w-[220px]">
                        <span className="text-[12px] font-medium text-[#1a1c21] truncate block">{vo.description}</span>
                        {vo.remarks && <span className="text-[10px] text-[#8e94a3] truncate block">{vo.remarks}</span>}
                      </td>
                      {/* Requested By */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-[#8e94a3]" />
                          <span className="text-[12px] text-[#6a6f7d]">{vo.requested_by_name || '—'}</span>
                        </div>
                      </td>
                      {/* Date */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-[#8e94a3]" />
                          <span className="text-[12px] text-[#6a6f7d]">
                            {dayjs(vo.created_at).format('DD MMM YYYY')}
                          </span>
                        </div>
                      </td>
                      {/* Items count — filled from detail */}
                      <td className="py-3 px-4 text-right">
                        <span className="text-[12px] text-[#6a6f7d]">—</span>
                      </td>
                      {/* Amount */}
                      <td className="py-3 px-4 text-right">
                        <span className="text-[12px] font-medium font-mono text-[#1a1c21]">
                          {inr(vo.total_variation_amount)}
                        </span>
                      </td>
                      {/* Status */}
                      <td className="py-3 px-4 text-center">
                        <StatusBadge status={vo.status} />
                      </td>
                      {/* Action */}
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={e => { e.stopPropagation(); setSelected(vo.id); }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity h-7 w-7 rounded-lg border border-[#e2e6ec] bg-white flex items-center justify-center hover:bg-indigo-50 hover:border-indigo-200"
                        >
                          <Eye className="w-3.5 h-3.5 text-indigo-600" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>

      {/* ── Modals ── */}
      {showForm && (
        <CreateVOModal
          onClose={() => setShowForm(false)}
          project_id={projectId}
          projects={projects}
        />
      )}
      {selected && (
        <VODetailPanel
          id={selected}
          onClose={() => setSelected(null)}
          canApprove={canApprove}
        />
      )}
      </div>}
    </div>
  );
}

// ── CREATE MODAL ──────────────────────────────────────────────────────────────

function CreateVOModal({ onClose, project_id, projects }) {
  const qc = useQueryClient();
  const [selProject,   setSelProject]   = useState(project_id || '');
  const [description,  setDescription]  = useState('');
  const [remarks,      setRemarks]      = useState('');
  const [items,        setItems]        = useState([]);

  const inputCls = 'w-full border border-[#d8dce1] rounded-lg px-3 py-2 text-sm text-[#1a1c21] outline-none focus:ring-2 focus:ring-indigo-400 transition bg-white';
  const labelCls = 'text-[10px] font-medium text-[#8e94a3] uppercase tracking-wider block mb-1';

  const { data: boqItems = [] } = useQuery({
    queryKey:  ['boq', selProject],
    queryFn:   () => boqItems && selProject
      ? boqAPI.list({ project_id: selProject }).then(r => r.data?.data || [])
      : Promise.resolve([]),
    enabled: !!selProject,
  });

  const mutation = useMutation({
    mutationFn: (data) => variationAPI.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['variations'] });
      toast.success('Variation Order submitted');
      onClose();
    },
    onError: (err) => toast.error(err?.response?.data?.message || 'Failed to submit'),
  });

  const addItem = () => setItems(prev => [...prev, {
    boq_item_id: '', new_item_description: '', unit: '', quantity: '', rate: '', reason: '',
  }]);

  const removeItem = idx => setItems(prev => prev.filter((_, i) => i !== idx));

  const updateItem = (idx, field, val) => {
    setItems(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: val };
      if (field === 'boq_item_id' && val) {
        const boq = boqItems.find(b => b.id === val);
        if (boq) { next[idx].unit = boq.unit; next[idx].rate = boq.rate; }
      }
      return next;
    });
  };

  const total = items.reduce((s, it) => s + (parseFloat(it.quantity || 0) * parseFloat(it.rate || 0)), 0);
  const canSubmit = selProject && description.trim() && items.length > 0 &&
    items.every(it => (it.boq_item_id || it.new_item_description) && it.quantity && it.rate);

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-white w-full max-w-4xl max-h-[92vh] rounded-t-2xl md:rounded-2xl flex flex-col shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e2e6ec] bg-[#f8f9fb]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
              <Plus className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-[14px] font-medium text-[#1a1c21]">New Variation Order</h2>
              <p className="text-[10px] text-[#8e94a3]">Raise extra items or scope changes</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#f4f6f9] text-[#6a6f7d]">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* Top fields */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Project <span className="text-red-400">*</span></label>
              <div className="relative">
                <select
                  className={inputCls + ' appearance-none pr-8'}
                  value={selProject}
                  onChange={e => setSelProject(e.target.value)}
                >
                  <option value="">Select project…</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#8e94a3] pointer-events-none" />
              </div>
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>VO Title / Description <span className="text-red-400">*</span></label>
              <input
                className={inputCls}
                placeholder="e.g. Additional retaining wall extension – South face"
                value={description}
                onChange={e => setDescription(e.target.value)}
              />
            </div>
            <div className="md:col-span-3">
              <label className={labelCls}>Internal Remarks</label>
              <input
                className={inputCls}
                placeholder="Optional notes for approver…"
                value={remarks}
                onChange={e => setRemarks(e.target.value)}
              />
            </div>
          </div>

          {/* Line items */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[12px] font-medium text-[#1a1c21] uppercase tracking-wider">Line Items</h3>
              <button
                onClick={addItem}
                className="flex items-center gap-1 text-indigo-600 hover:text-indigo-800 text-[11px] font-medium uppercase tracking-wide"
              >
                <Plus className="w-3.5 h-3.5" /> Add Item
              </button>
            </div>

            {items.length === 0 ? (
              <div className="border-2 border-dashed border-[#e2e6ec] rounded-xl py-10 flex flex-col items-center gap-2 text-[#8e94a3]">
                <FileText className="w-8 h-8 text-slate-300" />
                <p className="text-sm">No items yet — click "Add Item" above</p>
              </div>
            ) : (
              <div className="space-y-3">
                {items.map((it, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-end bg-[#f8f9fb] border border-[#e2e6ec] rounded-xl p-3">

                    {/* BOQ or new description */}
                    <div className="col-span-12 md:col-span-4">
                      <label className={labelCls}>BOQ Item / New Description</label>
                      {selProject ? (
                        <div className="relative">
                          <select
                            className={inputCls + ' appearance-none pr-8 text-xs'}
                            value={it.boq_item_id}
                            onChange={e => updateItem(idx, 'boq_item_id', e.target.value)}
                          >
                            <option value="">— New / Non-BOQ Item —</option>
                            {boqItems.map(b => (
                              <option key={b.id} value={b.id}>{b.item_no} · {b.description}</option>
                            ))}
                          </select>
                          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[#8e94a3] pointer-events-none" />
                        </div>
                      ) : null}
                      {!it.boq_item_id && (
                        <input
                          className={inputCls + ' mt-1 text-xs'}
                          placeholder="Describe the new item…"
                          value={it.new_item_description}
                          onChange={e => updateItem(idx, 'new_item_description', e.target.value)}
                        />
                      )}
                    </div>

                    {/* Unit */}
                    <div className="col-span-3 md:col-span-1">
                      <label className={labelCls}>Unit</label>
                      <input className={inputCls + ' text-xs'} placeholder="Cum" value={it.unit} onChange={e => updateItem(idx, 'unit', e.target.value)} />
                    </div>

                    {/* Qty */}
                    <div className="col-span-3 md:col-span-2">
                      <label className={labelCls}>Quantity</label>
                      <input type="number" className={inputCls + ' text-xs text-right font-mono'} placeholder="0.000" value={it.quantity} onChange={e => updateItem(idx, 'quantity', e.target.value)} />
                    </div>

                    {/* Rate */}
                    <div className="col-span-3 md:col-span-2">
                      <label className={labelCls}>Rate (₹)</label>
                      <input type="number" className={inputCls + ' text-xs text-right font-mono'} placeholder="0.00" value={it.rate} onChange={e => updateItem(idx, 'rate', e.target.value)} />
                    </div>

                    {/* Amount (read-only) */}
                    <div className="col-span-3 md:col-span-2">
                      <label className={labelCls}>Amount (₹)</label>
                      <div className="border border-[#e2e6ec] rounded-lg px-3 py-2 text-sm font-mono text-right text-indigo-700 font-medium bg-indigo-50">
                        {inr((parseFloat(it.quantity || 0) * parseFloat(it.rate || 0)))}
                      </div>
                    </div>

                    {/* Reason */}
                    <div className="col-span-11 md:col-span-1 hidden md:block" />
                    <div className="col-span-12 md:col-span-11">
                      <label className={labelCls}>Reason / Justification</label>
                      <input className={inputCls + ' text-xs'} placeholder="Why is this extra item required?" value={it.reason} onChange={e => updateItem(idx, 'reason', e.target.value)} />
                    </div>

                    {/* Remove */}
                    <div className="col-span-12 md:col-span-1 flex justify-end items-end">
                      <button onClick={() => removeItem(idx)} className="h-9 w-9 flex items-center justify-center rounded-lg border border-red-100 text-red-400 hover:bg-red-50 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#e2e6ec] bg-[#f8f9fb] flex items-center justify-between">
          <div>
            <p className="text-[10px] text-[#8e94a3] uppercase font-medium tracking-wider">Total VO Value</p>
            <p className="text-xl font-medium text-[#1a1c21] font-mono">{inr(total)}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-5 py-2 rounded-lg border border-[#e2e6ec] text-[#6a6f7d] text-sm font-medium hover:bg-[#f4f6f9] transition-colors">
              Cancel
            </button>
            <button
              onClick={() => mutation.mutate({ project_id: selProject, description, items, remarks })}
              disabled={!canSubmit || mutation.isPending}
              className="px-6 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium transition-colors shadow"
            >
              {mutation.isPending ? 'Submitting…' : 'Submit Variation'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── DETAIL SIDE PANEL ─────────────────────────────────────────────────────────

function VODetailPanel({ id, onClose, canApprove }) {
  const qc = useQueryClient();

  const { data: vo, isLoading } = useQuery({
    queryKey: ['variation-detail', id],
    queryFn:  () => variationAPI.get(id).then(r => r.data?.data),
  });

  const approveMutation = useMutation({
    mutationFn: () => variationAPI.approve(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['variations'] });
      qc.invalidateQueries({ queryKey: ['variation-detail', id] });
      toast.success('Variation Order approved');
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white w-full max-w-xl h-full shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-300"
        onClick={e => e.stopPropagation()}
      >
        {/* Panel header */}
        <div className="px-6 py-4 border-b border-[#e2e6ec] bg-[#f8f9fb] flex items-start justify-between">
          {isLoading ? (
            <div className="h-10 w-48 bg-slate-200 rounded-lg animate-pulse" />
          ) : (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <StatusBadge status={vo?.status} />
                <span className="text-[10px] text-[#8e94a3] font-mono">{vo?.vo_number}</span>
              </div>
              <h2 className="text-[15px] font-medium text-[#1a1c21] leading-snug">{vo?.description}</h2>
              <p className="text-[11px] text-[#8e94a3] mt-0.5">{vo?.project_name}</p>
            </div>
          )}
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#f4f6f9] text-[#6a6f7d] ml-4 shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Panel body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {isLoading ? (
            <div className="space-y-3">
              {[1,2,3].map(i => <div key={i} className="h-12 bg-slate-100 rounded-xl animate-pulse" />)}
            </div>
          ) : (
            <>
              {/* Meta */}
              <div className="grid grid-cols-2 gap-4">
                {[
                  ['Requested By', vo?.requested_by_name || '—', User],
                  ['Date Raised',  dayjs(vo?.created_at).format('DD MMM YYYY'), Calendar],
                ].map(([lbl, val, Icon]) => (
                  <div key={lbl} className="bg-[#f8f9fb] border border-[#e2e6ec] rounded-xl px-4 py-3">
                    <p className="text-[9px] font-medium text-[#8e94a3] uppercase tracking-wider mb-1">{lbl}</p>
                    <div className="flex items-center gap-1.5">
                      <Icon className="w-3.5 h-3.5 text-[#8e94a3]" />
                      <span className="text-[13px] font-medium text-[#1a1c21]">{val}</span>
                    </div>
                  </div>
                ))}
              </div>

              {vo?.remarks && (
                <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
                  <p className="text-[9px] font-medium text-amber-600 uppercase tracking-wider mb-1">Remarks</p>
                  <p className="text-[12px] text-amber-800">{vo.remarks}</p>
                </div>
              )}

              {/* Items table */}
              <div>
                <p className="text-[10px] font-medium text-[#8e94a3] uppercase tracking-wider mb-2">Line Items</p>
                <div className="border border-[#e2e6ec] rounded-xl overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-[#f8f9fb] border-b border-[#e2e6ec]">
                      <tr>
                        {['Description', 'Unit', 'Qty', 'Rate', 'Amount'].map((h, i) => (
                          <th key={h} className={clsx('py-2 px-3 text-[10px] font-medium text-[#6a6f7d] uppercase tracking-wider', i >= 2 ? 'text-right' : 'text-left')}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#f1f3f6]">
                      {vo?.items?.map((it, i) => (
                        <tr key={i} className="hover:bg-[#f8f9fb]">
                          <td className="py-2.5 px-3">
                            <p className="font-medium text-[#1a1c21]">{it.boq_description || it.new_item_description || '—'}</p>
                            {it.reason && <p className="text-[10px] text-[#8e94a3] italic">{it.reason}</p>}
                          </td>
                          <td className="py-2.5 px-3 text-center text-[#6a6f7d]">{it.unit}</td>
                          <td className="py-2.5 px-3 text-right font-mono text-[#1a1c21]">{it.quantity}</td>
                          <td className="py-2.5 px-3 text-right font-mono text-[#1a1c21]">{inr(it.rate)}</td>
                          <td className="py-2.5 px-3 text-right font-mono font-medium text-indigo-700">{inr(it.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-[#f8f9fb] border-t border-[#e2e6ec]">
                      <tr>
                        <td colSpan={4} className="py-3 px-3 text-right text-[10px] font-medium text-[#6a6f7d] uppercase tracking-wider">
                          Total VO Value
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-medium text-[#1a1c21]">
                          {inr(vo?.total_variation_amount)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Approve / footer */}
        {vo?.status === 'pending' && canApprove && (
          <div className="px-6 py-4 border-t border-[#e2e6ec] bg-[#f8f9fb] flex justify-end gap-2">
            <button className="px-5 py-2 rounded-lg border border-red-200 text-red-500 text-sm font-medium hover:bg-red-50 transition-colors flex items-center gap-1.5">
              <XCircle className="w-4 h-4" /> Reject
            </button>
            <button
              onClick={() => approveMutation.mutate()}
              disabled={approveMutation.isPending}
              className="px-6 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-medium transition-colors shadow flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              {approveMutation.isPending ? 'Approving…' : 'Approve VO'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
