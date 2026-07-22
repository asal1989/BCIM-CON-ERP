// src/pages/procurement/WOAmendmentLogPage.jsx
// Register of every amendment/variation logged against vendor Work Orders.
// Amendments themselves are added/removed from the WO detail panel
// (WorkOrderPage.jsx) — this page is the cross-WO browse/search view,
// mirroring the "PO Amendments" register.
import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import toast from 'react-hot-toast';
import { Search, FileText, Calendar, Building2, ExternalLink, Plus, X } from 'lucide-react';
import { clsx } from 'clsx';
import { subcontractorAPI, projectAPI } from '../../api/client';
import useAuthStore from '../../store/authStore';
import { PageHeader } from '../../theme';

const inr = v => Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });

// Same gate as WorkOrderPage's canAmendWO — procurement roles + admins.
const WO_AMEND_ROLES = ['admin', 'management', 'project_manager', 'purchase_executive', 'contracts_manager'];
function canAmendWO(user) {
  if (!user) return false;
  const role = (user.role || '').toLowerCase();
  return role === 'super_admin' || role === 'managing_director'
    || role.includes('procurement') || WO_AMEND_ROLES.includes(role);
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
  const inp = 'w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200 bg-white';
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="font-bold text-gray-900">Add Amendment / Variation</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Work Order *</label>
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
            <label className="block text-xs font-semibold text-gray-600 mb-1">Description *</label>
            <textarea required rows={3} className={inp + ' resize-none'}
              placeholder="Describe the variation, scope change, or extension…"
              value={form.description} onChange={set('description')} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Amount Change (₹)</label>
              <input type="number" step="0.01" className={inp} placeholder="+/- amount"
                value={form.amount_change} onChange={set('amount_change')} />
              <p className="text-xs text-gray-400 mt-1">Use negative for deductions</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Amendment Date</label>
              <input type="date" className={inp} value={form.amendment_date} onChange={set('amendment_date')} />
            </div>
          </div>
          {selectedWO && (
            <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-100 text-sm">
              <div className="flex justify-between text-gray-600 mb-1">
                <span>Current Order Value</span><span className="font-semibold">₹{inr(currentValue)}</span>
              </div>
              <div className="flex justify-between text-gray-600 mb-2">
                <span>Change Amount</span>
                <span className={clsx('font-semibold', Number(form.amount_change) < 0 ? 'text-red-600' : 'text-emerald-600')}>
                  {Number(form.amount_change) >= 0 ? '+' : ''}₹{inr(form.amount_change || 0)}
                </span>
              </div>
              <div className="flex justify-between text-gray-900 font-bold border-t border-indigo-200 pt-2">
                <span>Revised Value</span><span>₹{inr(newTotal)}</span>
              </div>
            </div>
          )}
        </form>
        <div className="px-5 py-4 border-t flex justify-end gap-3">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-200 hover:bg-gray-50">Cancel</button>
          <button onClick={handleSubmit} disabled={saving}
            className="px-5 py-2 text-sm font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60">
            {saving ? 'Saving…' : 'Add Amendment'}
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

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectAPI.list().then(r => r.data?.data || []),
  });

  const { data: amendments = [], isLoading } = useQuery({
    queryKey: ['wo-amendments', search, projectFilter],
    queryFn: () => subcontractorAPI.listWOAmendments({
      search: search || undefined,
      project_id: projectFilter || undefined,
    }).then(r => r.data?.data || []),
  });

  const totalImpact = amendments.reduce((s, a) => s + Number(a.amount_change || 0), 0);

  return (
    <div className="min-h-screen bg-[#f4f6fb]">
      <PageHeader
        title="Work Order Amendments"
        subtitle="Register of every variation, extension or scope change logged against vendor work orders"
      />
      <div className="p-6 md:p-8 max-w-[1400px] mx-auto space-y-5">

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold mb-1">Total Amendments</p>
            <p className="text-2xl font-bold text-slate-900">{amendments.length}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold mb-1">Work Orders Amended</p>
            <p className="text-2xl font-bold text-slate-900">{new Set(amendments.map(a => a.wo_id)).size}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold mb-1">Net Value Impact</p>
            <p className={clsx('text-2xl font-bold', totalImpact < 0 ? 'text-red-600' : 'text-emerald-600')}>
              {totalImpact >= 0 ? '+' : ''}₹{inr(totalImpact)}
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              className="pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-sm w-full shadow-sm"
              placeholder="Search WO number, vendor, description…" />
          </div>
          <select value={projectFilter} onChange={e => setProjectFilter(e.target.value)}
            className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm shadow-sm">
            <option value="">All Projects</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {canAmendWO(user) && (
            <button onClick={() => setAddOpen(true)}
              className="flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm transition-colors whitespace-nowrap">
              <Plus size={15} /> Add Amendment
            </button>
          )}
        </div>

        <AddAmendmentModal
          open={addOpen}
          onClose={() => setAddOpen(false)}
          onSaved={() => qc.invalidateQueries({ queryKey: ['wo-amendments'] })}
        />

        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b">
                <tr>{['WO Number', 'Project', 'Vendor', 'Amdt #', 'Date', 'Description', 'Change', 'Revised Value', 'Raised By'].map(h => (
                  <th key={h} className="text-left py-3 px-3 text-xs font-medium text-slate-500 whitespace-nowrap">{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={9} className="text-center py-10 text-slate-400">Loading…</td></tr>
                ) : amendments.length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-10 text-slate-400">
                    <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />No amendments logged yet
                  </td></tr>
                ) : amendments.map(a => (
                  <tr key={a.id} className="border-b last:border-0 hover:bg-slate-50 cursor-pointer"
                    onClick={() => navigate('/procurement/work-orders', { state: { viewId: a.wo_id } })}>
                    <td className="py-2.5 px-3 font-mono text-xs text-indigo-600 whitespace-nowrap hover:underline">
                      <span className="inline-flex items-center gap-1">{a.wo_number || '—'} <ExternalLink className="w-3 h-3 opacity-50" /></span>
                    </td>
                    <td className="py-2.5 px-3 text-xs text-slate-600 max-w-[160px] truncate"><Building2 className="w-3 h-3 inline mr-1 text-slate-300" />{a.project_name}</td>
                    <td className="py-2.5 px-3 text-xs text-slate-600 max-w-[140px] truncate">{a.vendor_name || '—'}</td>
                    <td className="py-2.5 px-3 text-xs font-bold text-indigo-600">#{a.amendment_number}</td>
                    <td className="py-2.5 px-3 text-xs text-slate-500 whitespace-nowrap">
                      {a.amendment_date ? <><Calendar className="w-3 h-3 inline mr-1 text-slate-300" />{dayjs(a.amendment_date).format('DD MMM YYYY')}</> : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-xs text-slate-700 max-w-[280px] truncate" title={a.description}>{a.description}</td>
                    <td className={clsx('py-2.5 px-3 text-xs font-semibold whitespace-nowrap', Number(a.amount_change) < 0 ? 'text-red-600' : 'text-emerald-600')}>
                      {Number(a.amount_change) >= 0 ? '+' : ''}₹{inr(a.amount_change)}
                    </td>
                    <td className="py-2.5 px-3 text-xs font-semibold text-slate-800 whitespace-nowrap">₹{inr(a.revised_order_value)}</td>
                    <td className="py-2.5 px-3 text-xs text-slate-500 whitespace-nowrap">{a.created_by_name || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
