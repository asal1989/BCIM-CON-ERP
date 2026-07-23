// src/pages/procurement/WOAmendmentLogPage.jsx
// Register of every amendment/variation logged against vendor Work Orders.
// Mirrors the "PO Amendment Log" page's layout/pattern (StatCards, boxed
// filter bar, card-list history) — WO amendments are a simpler running
// value-change ledger (no approve/reject workflow exists on the backend
// for these, unlike PO amendments), so actions here are limited to
// viewing the WO and deleting an entry.
import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import dayjs from 'dayjs';
import toast from 'react-hot-toast';
import {
  FileSignature, Search, FileText, Calendar, Building2, ExternalLink,
  Plus, X, RefreshCw, Filter, ClipboardList, CalendarDays, BadgeIndianRupee,
  TrendingUp, Trash2,
} from 'lucide-react';
import { clsx } from 'clsx';
import { subcontractorAPI, projectAPI } from '../../api/client';
import useAuthStore from '../../store/authStore';

const inr = v => Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
const money = v => `₹${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmt = v => (v ? dayjs(v).format('DD-MM-YYYY') : '—');
const clean = v => String(v || '').trim().toLowerCase();

// Same gate as WorkOrderPage's canAmendWO — procurement roles + admins.
const WO_AMEND_ROLES = ['admin', 'management', 'project_manager', 'purchase_executive', 'contracts_manager'];
function canAmendWO(user) {
  if (!user) return false;
  const role = (user.role || '').toLowerCase();
  return role === 'super_admin' || role === 'managing_director'
    || role.includes('procurement') || WO_AMEND_ROLES.includes(role);
}

function StatCard({ label, value, sub, icon: Icon, tone = 'indigo' }) {
  const tones = {
    indigo: 'bg-indigo-50 text-indigo-600 border-indigo-100',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
    rose: 'bg-rose-50 text-rose-600 border-rose-100',
  };
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className={clsx('w-9 h-9 rounded-lg border flex items-center justify-center', tones[tone])}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div className="text-2xl font-medium text-slate-900">{value}</div>
      <div className="text-[11px] font-medium tracking-[0.18em] text-slate-900 uppercase mt-1">{label}</div>
      <div className="text-xs text-slate-500 font-medium mt-1.5 leading-tight">{sub}</div>
    </div>
  );
}

/* ── Add Amendment modal with WO picker ─────────────────────────────────── */
const EMPTY_FORM = { wo_id: '', description: '', amount_change: '', amendment_date: '' };
function AddAmendmentModal({ open, onClose, onSaved }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [woSearch, setWoSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const { data: workOrders = [] } = useQuery({
    queryKey: ['work-orders-for-amendment'],
    queryFn: () => subcontractorAPI.listWorkOrders().then(r => r.data?.data || []),
    enabled: open,
  });

  const filteredWOs = useMemo(() => {
    const q = woSearch.toLowerCase();
    return !q ? workOrders : workOrders.filter(w =>
      String(w.wo_number || '').toLowerCase().includes(q) ||
      String(w.vendor_name || '').toLowerCase().includes(q) ||
      String(w.project_name || '').toLowerCase().includes(q));
  }, [workOrders, woSearch]);

  const selectedWO   = workOrders.find(w => String(w.id) === String(form.wo_id));
  const currentValue = Number(selectedWO?.total_value || selectedWO?.contract_amount || 0);
  const newTotal     = currentValue + Number(form.amount_change || 0);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.wo_id) return toast.error('Select a work order');
    if (!form.description.trim()) return toast.error('Description required');
    setSaving(true);
    try {
      await subcontractorAPI.addWOAmendment(form.wo_id, {
        description: form.description,
        amount_change: Number(form.amount_change) || 0,
        amendment_date: form.amendment_date || null,
      });
      toast.success('Amendment added');
      setForm(EMPTY_FORM); setWoSearch('');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to add amendment');
    } finally { setSaving(false); }
  }

  if (!open) return null;
  const inp = 'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 bg-white';
  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md my-6">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div>
            <h2 className="text-base font-medium text-slate-900">New WO Amendment</h2>
            <p className="text-xs text-slate-500 mt-0.5">Revise the order value against a live work order</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Work Order *</label>
            <input className={inp + ' mb-2'} placeholder="Search WO number, vendor, project…"
              value={woSearch} onChange={e => setWoSearch(e.target.value)} />
            <select required className={inp} value={form.wo_id} onChange={set('wo_id')}>
              <option value="">Select work order…</option>
              {filteredWOs.map(w => (
                <option key={w.id} value={w.id}>
                  {w.wo_number || '(no number)'} — {w.vendor_name || 'Unknown vendor'} — ₹{inr(w.total_value || w.contract_amount)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Description *</label>
            <textarea required rows={3} className={inp + ' resize-none'}
              placeholder="Describe the variation, scope change, or extension…"
              value={form.description} onChange={set('description')} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Amount Change (₹)</label>
              <input type="number" step="0.01" className={inp} placeholder="+/- amount"
                value={form.amount_change} onChange={set('amount_change')} />
              <p className="text-[11px] text-slate-400 mt-1">Use negative for deductions</p>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Amendment Date</label>
              <input type="date" className={inp} value={form.amendment_date} onChange={set('amendment_date')} />
            </div>
          </div>
          {selectedWO && (
            <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-100 text-sm">
              <div className="flex justify-between text-slate-600 mb-1">
                <span>Current Order Value</span><span className="font-semibold">₹{inr(currentValue)}</span>
              </div>
              <div className="flex justify-between text-slate-600 mb-2">
                <span>Change Amount</span>
                <span className={clsx('font-semibold', Number(form.amount_change) < 0 ? 'text-rose-600' : 'text-emerald-600')}>
                  {Number(form.amount_change) >= 0 ? '+' : ''}₹{inr(form.amount_change || 0)}
                </span>
              </div>
              <div className="flex justify-between text-slate-900 font-bold border-t border-indigo-200 pt-2">
                <span>Revised Value</span><span>₹{inr(newTotal)}</span>
              </div>
            </div>
          )}
        </form>
        <div className="flex gap-3 px-5 pb-5">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 bg-slate-100 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-200 transition-all">Cancel</button>
          <button onClick={handleSubmit} disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 shadow-sm transition-all disabled:opacity-60">
            {saving ? 'Saving…' : 'Submit Amendment'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function WOAmendmentLogPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const user = useAuthStore(s => s.user);
  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [showDetail, setShowDetail] = useState(null);

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectAPI.list().then(r => r.data?.data || []),
  });

  const amendmentQuery = useQuery({
    queryKey: ['wo-amendments', projectFilter],
    queryFn: () => subcontractorAPI.listWOAmendments({
      project_id: projectFilter || undefined,
    }).then(r => r.data?.data || []),
  });

  const deleteMut = useMutation({
    mutationFn: ({ woId, aid }) => subcontractorAPI.delWOAmendment(woId, aid),
    onSuccess: () => {
      toast.success('Amendment deleted');
      qc.invalidateQueries({ queryKey: ['wo-amendments'] });
    },
    onError: err => toast.error(err?.response?.data?.error || 'Unable to delete'),
  });

  const amendments = useMemo(() => (amendmentQuery.data || []).map(row => ({
    ...row,
    searchText: [row.wo_number, row.vendor_name, row.project_name, row.description, row.created_by_name]
      .map(clean).join(' '),
  })), [amendmentQuery.data]);

  const filtered = useMemo(() => {
    const q = clean(search);
    if (!q) return amendments;
    return amendments.filter(row => clean(row.searchText).includes(q));
  }, [amendments, search]);

  const stats = useMemo(() => {
    const increases = amendments.filter(a => Number(a.amount_change) > 0);
    const decreases = amendments.filter(a => Number(a.amount_change) < 0);
    const totalImpact = amendments.reduce((s, a) => s + Number(a.amount_change || 0), 0);
    return {
      total: amendments.length,
      wosAmended: new Set(amendments.map(a => a.wo_id)).size,
      increases: increases.length,
      decreases: decreases.length,
      impact: totalImpact,
    };
  }, [amendments]);

  const refresh = async () => {
    await Promise.all([amendmentQuery.refetch()]);
    toast.success('WO amendments refreshed');
  };

  return (
    <div className="p-6 md:p-7 max-w-7xl mx-auto min-h-screen bg-[#f4f6f9]">
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4 mb-5">
        <div>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.28em] text-indigo-500 font-medium mb-1.5">
            <FileSignature className="w-3.5 h-3.5" />
            Procurement
          </div>
          <h1 className="text-2xl md:text-[28px] font-medium text-slate-900 leading-tight">WO Amendment Log</h1>
          <p className="text-sm text-slate-500 font-medium mt-1.5 max-w-2xl">
            Register of every variation, extension or scope change logged against vendor work orders.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refresh}
            className="inline-flex items-center gap-2 px-4 h-10 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-medium hover:border-indigo-300 hover:text-indigo-700 transition-all shadow-sm"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          {canAmendWO(user) && (
            <button
              onClick={() => setAddOpen(true)}
              className="inline-flex items-center gap-2 px-4 h-10 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-all shadow-sm"
            >
              <Plus className="w-4 h-4" />
              New Amendment
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatCard label="Amendments" value={stats.total} sub="Live records only" icon={ClipboardList} tone="indigo" />
        <StatCard label="WOs Amended" value={stats.wosAmended} sub="Distinct work orders" icon={Building2} tone="amber" />
        <StatCard label="Increases / Decreases" value={`${stats.increases} / ${stats.decreases}`} sub="Scope-up vs scope-down" icon={TrendingUp} tone="emerald" />
        <StatCard label="Net Impact" value={money(stats.impact)} sub="Increase minus decrease" icon={BadgeIndianRupee} tone="rose" />
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-3 md:p-4 shadow-sm mb-5">
        <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_0.9fr_auto] gap-3 items-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search WO number, vendor, description…"
              className="w-full h-10 bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-indigo-400"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium tracking-[0.18em] uppercase text-slate-500 mb-1">Project</label>
            <select
              value={projectFilter}
              onChange={e => setProjectFilter(e.target.value)}
              className="w-full h-10 bg-slate-50 border border-slate-200 rounded-xl px-3 text-sm text-slate-900 outline-none focus:border-indigo-400"
            >
              <option value="">All Projects</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          <div className="flex items-end gap-2">
            <button
              onClick={() => { setSearch(''); setProjectFilter(''); }}
              className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-slate-700 font-medium text-sm hover:text-indigo-700 hover:border-indigo-300 transition-all"
            >
              <Filter className="w-4 h-4 inline mr-1.5" />
              Reset
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-medium text-slate-900">Amendment History</h2>
            <p className="text-xs text-slate-500 mt-0.5">Linked to real work orders and vendors</p>
          </div>
          <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">
            {filtered.length} row{filtered.length === 1 ? '' : 's'}
          </span>
        </div>

        {amendmentQuery.isLoading ? (
          <div className="p-5 space-y-2">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-14 rounded-xl bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-14 text-center">
            <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-600">No amendments logged yet</p>
            <p className="text-xs text-slate-500 mt-1">Create the first amendment against a live work order.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {filtered.map(a => {
              const isIncrease = Number(a.amount_change) >= 0;
              return (
                <div key={a.id} className="p-4 hover:bg-slate-50/70 transition-colors">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className={clsx('mt-1 w-3 h-3 rounded-full shrink-0', isIncrease ? 'bg-emerald-500' : 'bg-rose-400')} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-medium text-sm text-indigo-700">{a.wo_number || 'WO'}</span>
                          <span className="text-slate-400 text-xs">—</span>
                          <span className="text-sm font-medium">Amdt #{a.amendment_number}</span>
                          <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                            {a.project_name || 'Project'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mb-2">
                          {a.vendor_name || 'Vendor'} · {fmt(a.amendment_date)} · Raised by: {a.created_by_name || '—'}
                        </p>
                        <div className="bg-slate-50 border-l-2 border-indigo-600 rounded px-3 py-2 text-xs text-slate-700">
                          {a.description}
                          <span className={clsx('ml-2 font-medium', isIncrease ? 'text-emerald-700' : 'text-rose-600')}>
                            · Value Impact: {isIncrease ? '+' : ''}{money(a.amount_change)}
                          </span>
                          <span className="ml-2 font-medium text-slate-600">
                            · Revised: {money(a.revised_order_value)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 items-center" onClick={e => e.stopPropagation()}>
                      <button onClick={() => setShowDetail(a)} className="text-xs border border-slate-200 rounded px-2 py-1 hover:bg-slate-100">Details</button>
                      <button
                        onClick={() => navigate('/procurement/work-orders', { state: { viewId: a.wo_id } })}
                        className="text-xs border border-indigo-200 text-indigo-700 rounded px-2 py-1 hover:bg-indigo-50 inline-flex items-center gap-1">
                        <ExternalLink className="w-3 h-3" /> View WO
                      </button>
                      {canAmendWO(user) && (
                        <button
                          onClick={() => window.confirm(`Delete amendment #${a.amendment_number} on ${a.wo_number}? This cannot be undone.`) && deleteMut.mutate({ woId: a.wo_id, aid: a.id })}
                          disabled={deleteMut.isPending}
                          className="text-xs border border-slate-200 text-slate-500 rounded px-2 py-1 hover:bg-red-50 hover:border-red-200 hover:text-red-600 disabled:opacity-50 inline-flex items-center gap-1">
                          <Trash2 className="w-3 h-3" /> Delete
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <AddAmendmentModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSaved={() => qc.invalidateQueries({ queryKey: ['wo-amendments'] })}
      />

      {showDetail && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md my-6">
            <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-medium text-slate-900">Amdt #{showDetail.amendment_number}</h2>
                <p className="text-xs text-slate-500 mt-0.5">{showDetail.wo_number}</p>
              </div>
              <button onClick={() => setShowDetail(null)} className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:text-slate-900 transition-all">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-2 text-sm">
              {[
                ['Project', showDetail.project_name],
                ['Vendor', showDetail.vendor_name],
                ['Description', showDetail.description],
                ['Amount Change', `${Number(showDetail.amount_change) >= 0 ? '+' : ''}${money(showDetail.amount_change)}`],
                ['Revised Order Value', money(showDetail.revised_order_value)],
                ['Date', fmt(showDetail.amendment_date)],
                ['Raised By', showDetail.created_by_name || '—'],
              ].map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <span className="text-slate-500 w-36 shrink-0">{k}</span>
                  <span className="font-medium text-slate-800">{v}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-end px-5 pb-5">
              <button onClick={() => setShowDetail(null)} className="px-4 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
