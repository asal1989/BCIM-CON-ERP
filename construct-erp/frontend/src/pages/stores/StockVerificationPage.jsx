// src/pages/stores/StockVerificationPage.jsx
import React, { useState, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import dayjs from 'dayjs';
import toast from 'react-hot-toast';
import {
  CheckCircle2, ChevronRight, ClipboardList, Package, Plus, Save,
  Search, Trash2, X, AlertTriangle, Check,
} from 'lucide-react';
import { stockVerifAPI, projectAPI, inventoryAPI } from '../../api/client';

const STATUS_CFG = {
  draft:     { cls: 'bg-amber-50  text-amber-700  border-amber-200',   label: 'Draft' },
  completed: { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'Completed' },
};

const ADJ_CFG = {
  pending:   { cls: 'bg-slate-100 text-slate-600',   label: 'Pending' },
  adjusted:  { cls: 'bg-green-100 text-green-700',   label: 'Adjusted' },
  no_action: { cls: 'bg-blue-50   text-blue-600',    label: 'No Action' },
};

const num = (v) => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 });

// ── create/edit header form ───────────────────────────────────────────────────
function HeaderForm({ projects, onSave, onCancel, initial, isPending }) {
  const [form, setForm] = useState({
    project_id: initial?.project_id || '',
    verification_date: initial?.verification_date ? dayjs(initial.verification_date).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
    location: initial?.location || '',
    verified_by: initial?.verified_by || '',
    notes: initial?.notes || '',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="p-5 space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-[11px] font-medium text-slate-500 mb-1">Project *</label>
          <select
            value={form.project_id}
            onChange={e => set('project_id', e.target.value)}
            className="w-full h-9 rounded-lg border border-slate-200 px-2.5 text-[12px] focus:outline-none focus:border-[#1e3a8a]"
          >
            <option value="">Select project</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-500 mb-1">Verification Date *</label>
          <input
            type="date"
            value={form.verification_date}
            onChange={e => set('verification_date', e.target.value)}
            className="w-full h-9 rounded-lg border border-slate-200 px-2.5 text-[12px] focus:outline-none focus:border-[#1e3a8a]"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-500 mb-1">Location / Store</label>
          <input
            value={form.location}
            onChange={e => set('location', e.target.value)}
            placeholder="e.g. Site Store, Block A"
            className="w-full h-9 rounded-lg border border-slate-200 px-2.5 text-[12px] focus:outline-none focus:border-[#1e3a8a]"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-500 mb-1">Verified By</label>
          <input
            value={form.verified_by}
            onChange={e => set('verified_by', e.target.value)}
            placeholder="Name of verifier"
            className="w-full h-9 rounded-lg border border-slate-200 px-2.5 text-[12px] focus:outline-none focus:border-[#1e3a8a]"
          />
        </div>
      </div>
      <div>
        <label className="block text-[11px] font-medium text-slate-500 mb-1">Notes</label>
        <textarea
          value={form.notes}
          onChange={e => set('notes', e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-[12px] focus:outline-none focus:border-[#1e3a8a] resize-none"
        />
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="h-8 px-4 rounded-lg border border-slate-200 text-[12px] hover:bg-slate-50">Cancel</button>
        <button
          onClick={() => {
            if (!form.project_id || !form.verification_date) { toast.error('Project and date required'); return; }
            onSave(form);
          }}
          disabled={isPending}
          className="h-8 px-4 rounded-lg bg-[#1e3a8a] text-white text-[12px] hover:bg-[#163172] disabled:opacity-60"
        >
          {isPending ? 'Saving…' : (initial ? 'Update' : 'Create & Enter Counts')}
        </button>
      </div>
    </div>
  );
}

// ── items entry table ─────────────────────────────────────────────────────────
function ItemsForm({ verificationId, projectId, onDone }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [counts, setCounts] = useState({});   // { inventoryId: { physical_stock, reason, adjustment_status } }
  const [saving, setSaving] = useState(false);

  // Load existing verification items (book stock comes from backend)
  const { data: svData } = useQuery({
    queryKey: ['stock-verif-detail', verificationId],
    queryFn: () => stockVerifAPI.get(verificationId).then(r => r.data),
    enabled: !!verificationId,
  });

  // Load all inventory items for the project to allow adding new ones
  const { data: invData } = useQuery({
    queryKey: ['inventory-list', projectId],
    queryFn: () => inventoryAPI.list({ project_id: projectId }).then(r => r.data),
    enabled: !!projectId,
  });

  // Merge: existing items with any inventory items not yet added
  const existingMap = useMemo(() => {
    const m = {};
    (svData?.items || []).forEach(i => { m[i.inventory_id] = i; });
    return m;
  }, [svData]);

  const allInventory = useMemo(() => {
    const inv = invData || [];
    return inv.map(i => ({
      inventory_id: i.id,
      material_name: i.material_name,
      unit: i.unit,
      unit_rate: i.unit_rate || 0,
      book_stock: existingMap[i.id]?.book_stock ?? i.closing_stock ?? 0,
      physical_stock: existingMap[i.id]?.physical_stock,
      reason: existingMap[i.id]?.reason || '',
      adjustment_status: existingMap[i.id]?.adjustment_status || 'pending',
    }));
  }, [invData, existingMap]);

  const filtered = useMemo(() => {
    if (!search.trim()) return allInventory;
    const q = search.toLowerCase();
    return allInventory.filter(i => i.material_name.toLowerCase().includes(q));
  }, [allInventory, search]);

  const getCount = (inv_id) => counts[inv_id] ?? {};
  const setCount = (inv_id, key, val) => setCounts(c => ({ ...c, [inv_id]: { ...c[inv_id], [key]: val } }));

  const getPhysical = (row) => {
    const c = getCount(row.inventory_id);
    return c.physical_stock !== undefined ? c.physical_stock : row.physical_stock;
  };

  const variance = (row) => {
    const p = getPhysical(row);
    return p !== undefined && p !== '' ? Number(p) - Number(row.book_stock) : null;
  };

  const handleSave = async (andComplete = false) => {
    setSaving(true);
    try {
      const items = allInventory
        .filter(row => {
          const c = getCount(row.inventory_id);
          return c.physical_stock !== undefined || row.physical_stock !== undefined;
        })
        .map(row => {
          const c = getCount(row.inventory_id);
          return {
            inventory_id: row.inventory_id,
            book_stock: Number(row.book_stock),
            physical_stock: Number(c.physical_stock !== undefined ? c.physical_stock : row.physical_stock ?? 0),
            reason: c.reason !== undefined ? c.reason : (row.reason || ''),
            adjustment_status: c.adjustment_status !== undefined ? c.adjustment_status : (row.adjustment_status || 'pending'),
          };
        });

      await stockVerifAPI.saveItems(verificationId, items);
      if (andComplete) {
        await stockVerifAPI.update(verificationId, { status: 'completed' });
        toast.success('Verification completed');
      } else {
        toast.success('Counts saved');
      }
      qc.invalidateQueries({ queryKey: ['stock-verifications'] });
      qc.invalidateQueries({ queryKey: ['stock-verif-detail', verificationId] });
      if (andComplete) onDone();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-5 py-3 border-b bg-slate-50">
        <div className="relative flex-1 max-w-xs">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search material..."
            className="w-full pl-7 pr-3 h-8 rounded-lg border border-slate-200 text-[12px] focus:outline-none focus:border-[#1e3a8a]"
          />
        </div>
        <span className="text-[11px] text-slate-400">{filtered.length} items</span>
        <div className="ml-auto flex gap-2">
          <button
            onClick={() => handleSave(false)}
            disabled={saving}
            className="h-8 px-3 rounded-lg border border-slate-200 bg-white text-[12px] hover:bg-slate-50 flex items-center gap-1.5"
          >
            <Save size={13} /> Save Draft
          </button>
          <button
            onClick={() => handleSave(true)}
            disabled={saving}
            className="h-8 px-3 rounded-lg bg-emerald-600 text-white text-[12px] hover:bg-emerald-700 flex items-center gap-1.5"
          >
            <CheckCircle2 size={13} /> Complete
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-[11.5px]">
          <thead className="bg-slate-50 border-b sticky top-0">
            <tr>
              <th className="px-3 py-2.5 text-left font-medium text-slate-500">Material</th>
              <th className="px-3 py-2.5 text-center font-medium text-slate-500 w-16">Unit</th>
              <th className="px-3 py-2.5 text-right font-medium text-slate-500 w-28">Book Stock</th>
              <th className="px-3 py-2.5 text-right font-medium text-slate-500 w-28">Physical Count *</th>
              <th className="px-3 py-2.5 text-right font-medium text-slate-500 w-28">Variance</th>
              <th className="px-3 py-2.5 text-left font-medium text-slate-500 w-40">Reason</th>
              <th className="px-3 py-2.5 text-center font-medium text-slate-500 w-32">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filtered.map(row => {
              const v = variance(row);
              const physical = getPhysical(row);
              return (
                <tr key={row.inventory_id} className="hover:bg-slate-50/60">
                  <td className="px-3 py-2 font-medium text-slate-800">{row.material_name}</td>
                  <td className="px-3 py-2 text-center text-slate-500">{row.unit}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-600">{num(row.book_stock)}</td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      step="0.001"
                      value={physical ?? ''}
                      onChange={e => setCount(row.inventory_id, 'physical_stock', e.target.value)}
                      placeholder="Enter count"
                      className="w-full h-7 rounded-md border border-slate-200 px-2 text-right text-[11.5px] focus:outline-none focus:border-[#1e3a8a]"
                    />
                  </td>
                  <td className={clsx(
                    'px-3 py-2 text-right tabular-nums font-medium',
                    v === null ? 'text-slate-300'
                      : v < 0  ? 'text-red-600'
                      : v > 0  ? 'text-amber-600'
                      : 'text-emerald-600'
                  )}>
                    {v === null ? '—' : (v > 0 ? '+' : '') + num(v)}
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={getCount(row.inventory_id).reason ?? row.reason ?? ''}
                      onChange={e => setCount(row.inventory_id, 'reason', e.target.value)}
                      placeholder="Reason (optional)"
                      className="w-full h-7 rounded-md border border-slate-200 px-2 text-[11.5px] focus:outline-none focus:border-[#1e3a8a]"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={getCount(row.inventory_id).adjustment_status ?? row.adjustment_status ?? 'pending'}
                      onChange={e => setCount(row.inventory_id, 'adjustment_status', e.target.value)}
                      className="w-full h-7 rounded-md border border-slate-200 px-1 text-[11px] focus:outline-none focus:border-[#1e3a8a]"
                    >
                      <option value="pending">Pending</option>
                      <option value="adjusted">Adjusted</option>
                      <option value="no_action">No Action</option>
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="text-center py-16 text-slate-400 text-[12px]">
            {search ? 'No matching items' : 'No inventory items found for this project'}
          </div>
        )}
      </div>
    </div>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────
export default function StockVerificationPage() {
  const qc = useQueryClient();
  const [view, setView] = useState('list');            // 'list' | 'new' | 'items'
  const [activeId, setActiveId] = useState(null);
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [deleteId, setDeleteId] = useState(null);

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectAPI.list().then(r => r.data),
  });

  const { data: verifications = [], isLoading } = useQuery({
    queryKey: ['stock-verifications'],
    queryFn: () => stockVerifAPI.list().then(r => r.data),
  });

  const createMut = useMutation({
    mutationFn: stockVerifAPI.create,
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['stock-verifications'] });
      setActiveId(res.data.id);
      setActiveProjectId(res.data.project_id);
      setView('items');
      toast.success('Verification session created');
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => stockVerifAPI.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock-verifications'] });
      setDeleteId(null);
      toast.success('Deleted');
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });

  if (view === 'items' && activeId) {
    const sv = verifications.find(v => v.id === activeId);
    return (
      <div className="flex flex-col h-screen bg-white">
        <div className="flex items-center gap-3 px-5 py-3 border-b">
          <button
            onClick={() => { setView('list'); setActiveId(null); }}
            className="text-[12px] text-slate-500 hover:text-slate-800 flex items-center gap-1"
          >
            <X size={13} /> Close
          </button>
          <div className="h-4 w-px bg-slate-200" />
          <ClipboardList size={15} className="text-teal-600" />
          <span className="text-[13px] font-semibold text-slate-800">
            Stock Verification — {sv?.project_name} &middot; {sv?.verification_date ? dayjs(sv.verification_date).format('DD MMM YYYY') : ''}
          </span>
          <span className={clsx(
            'ml-2 px-2 py-0.5 rounded-full text-[10px] font-medium border',
            STATUS_CFG[sv?.status || 'draft']?.cls
          )}>
            {STATUS_CFG[sv?.status || 'draft']?.label}
          </span>
        </div>
        <div className="flex-1 overflow-hidden">
          <ItemsForm
            verificationId={activeId}
            projectId={sv?.project_id || activeProjectId}
            onDone={() => { setView('list'); setActiveId(null); }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <CheckCircle2 size={20} className="text-teal-600" />
          <h1 className="text-[17px] font-bold text-slate-800">Stock Verification</h1>
        </div>
        <button
          onClick={() => setView('new')}
          className="h-9 px-4 rounded-xl bg-[#1e3a8a] text-white text-[12px] font-medium hover:bg-[#163172] flex items-center gap-1.5"
        >
          <Plus size={14} /> New Verification
        </button>
      </div>

      {/* New header form */}
      {view === 'new' && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="px-5 py-3 border-b bg-teal-50">
            <span className="text-[12px] font-semibold text-teal-800">New Verification Session</span>
          </div>
          <HeaderForm
            projects={projects}
            onSave={(d) => createMut.mutate(d)}
            onCancel={() => setView('list')}
            isPending={createMut.isPending}
          />
        </div>
      )}

      {/* Verifications list */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b bg-slate-50 flex items-center justify-between">
          <span className="text-[12px] font-semibold text-slate-700">Verification History</span>
          <span className="text-[11px] text-slate-400">{verifications.length} sessions</span>
        </div>
        {isLoading ? (
          <div className="text-center py-12 text-slate-400 text-[12px]">Loading…</div>
        ) : verifications.length === 0 ? (
          <div className="text-center py-16 text-slate-400 text-[12px]">
            No verification sessions yet. Create one above to get started.
          </div>
        ) : (
          <table className="w-full text-[11.5px]">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium text-slate-500">Date</th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-500">Project</th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-500">Location</th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-500">Verified By</th>
                <th className="px-4 py-2.5 text-center font-medium text-slate-500">Items</th>
                <th className="px-4 py-2.5 text-center font-medium text-slate-500">Status</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {verifications.map(sv => (
                <tr key={sv.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {dayjs(sv.verification_date).format('DD MMM YYYY')}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{sv.project_name}</td>
                  <td className="px-4 py-3 text-slate-500">{sv.location || '—'}</td>
                  <td className="px-4 py-3 text-slate-500">{sv.verified_by || '—'}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex items-center gap-1 text-slate-600">
                      <Package size={12} className="text-slate-400" />
                      {sv.item_count}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={clsx(
                      'inline-block px-2 py-0.5 rounded-full text-[10px] font-medium border',
                      STATUS_CFG[sv.status || 'draft']?.cls
                    )}>
                      {STATUS_CFG[sv.status || 'draft']?.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => { setActiveId(sv.id); setActiveProjectId(sv.project_id); setView('items'); }}
                        className="h-7 px-2.5 rounded-md bg-teal-50 text-teal-700 text-[11px] hover:bg-teal-100 flex items-center gap-1"
                      >
                        <ClipboardList size={12} />
                        {sv.status === 'completed' ? 'View' : 'Enter Counts'}
                      </button>
                      <button
                        onClick={() => setDeleteId(sv.id)}
                        className="h-7 w-7 rounded-md text-slate-400 hover:bg-red-50 hover:text-red-500 flex items-center justify-center"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Delete confirm */}
      {deleteId && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-xl p-6 w-80">
            <div className="flex items-center gap-2.5 mb-3">
              <AlertTriangle size={18} className="text-red-500" />
              <span className="font-semibold text-slate-800">Delete verification?</span>
            </div>
            <p className="text-[12px] text-slate-500 mb-4">This will permanently delete the verification and all recorded counts.</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeleteId(null)} className="h-8 px-4 rounded-lg border text-[12px]">Cancel</button>
              <button
                onClick={() => deleteMut.mutate(deleteId)}
                disabled={deleteMut.isPending}
                className="h-8 px-4 rounded-lg bg-red-600 text-white text-[12px] hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
