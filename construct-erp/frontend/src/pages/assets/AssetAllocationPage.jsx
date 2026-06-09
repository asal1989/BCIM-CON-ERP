import React, { useEffect, useState, useMemo } from 'react';
import { assetMgmtAPI, assetAPI, projectAPI } from '../../api/client';
import { Plus, CornerDownLeft, Search, CheckSquare, Square, Package, X, Loader } from 'lucide-react';
import toast from 'react-hot-toast';

const COND_OPTS = ['excellent', 'good', 'fair', 'poor'];

// ─── Multi-Asset Allocation Modal ─────────────────────────────────────────────
function AllocModal({ assets, projects, onSave, onClose }) {
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [form, setForm] = useState({
    allocation_type: 'project', project_id: '',
    employee_name: '', department: '',
    issue_date: new Date().toISOString().slice(0, 10),
    expected_return_date: '', issued_condition: 'good',
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const available = assets.filter(a => a.status === 'available');

  const assetTypes = useMemo(() => [...new Set(available.map(a => a.asset_type))].sort(), [available]);

  const filtered = useMemo(() => available.filter(a => {
    const q = search.toLowerCase();
    const matchSearch = !q || [a.asset_code, a.asset_name, a.brand, a.model].some(v => v?.toLowerCase().includes(q));
    const matchType = !typeFilter || a.asset_type === typeFilter;
    return matchSearch && matchType;
  }), [available, search, typeFilter]);

  const toggleId = (id) => setSelectedIds(prev => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  const toggleAll = () => {
    if (filtered.every(a => selectedIds.has(a.id))) {
      setSelectedIds(prev => { const n = new Set(prev); filtered.forEach(a => n.delete(a.id)); return n; });
    } else {
      setSelectedIds(prev => { const n = new Set(prev); filtered.forEach(a => n.add(a.id)); return n; });
    }
  };

  const allFilteredSelected = filtered.length > 0 && filtered.every(a => selectedIds.has(a.id));

  const handleSubmit = async () => {
    if (selectedIds.size === 0) { toast.error('Select at least one asset'); return; }
    if ((form.allocation_type === 'project' || form.allocation_type === 'site') && !form.project_id) {
      toast.error('Select a project'); return;
    }
    if (form.allocation_type === 'employee' && !form.employee_name.trim()) {
      toast.error('Enter employee name'); return;
    }
    if (form.allocation_type === 'department' && !form.department.trim()) {
      toast.error('Enter department'); return;
    }
    setSaving(true);
    let ok = 0, fail = 0;
    for (const asset_id of selectedIds) {
      try {
        await assetMgmtAPI.allocate({ ...form, asset_id });
        ok++;
      } catch { fail++; }
    }
    setSaving(false);
    if (ok > 0) toast.success(`${ok} asset${ok > 1 ? 's' : ''} issued successfully${fail > 0 ? `, ${fail} failed` : ''}`);
    else toast.error('All allocations failed');
    onSave();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl flex flex-col" style={{ maxHeight: '90vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0">
          <div>
            <h2 className="font-semibold text-gray-800 text-lg">Issue Assets</h2>
            <p className="text-xs text-gray-400 mt-0.5">Select one or more assets and allocate to a project or person</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex flex-1 overflow-hidden">

          {/* Left — Asset checklist */}
          <div className="flex flex-col w-[55%] border-r overflow-hidden">
            <div className="flex-shrink-0 p-4 border-b space-y-2">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                  <input value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="Search assets…"
                    className="pl-9 pr-3 py-2 border rounded-lg text-sm w-full outline-none focus:border-blue-400" />
                </div>
                <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
                  className="border rounded-lg px-3 py-2 text-sm text-gray-600 outline-none">
                  <option value="">All Types</option>
                  {assetTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              {/* Select-all row */}
              <div className="flex items-center justify-between px-1">
                <button onClick={toggleAll}
                  className="flex items-center gap-2 text-xs text-blue-600 hover:text-blue-800 font-medium">
                  {allFilteredSelected
                    ? <CheckSquare className="w-4 h-4" />
                    : <Square className="w-4 h-4" />}
                  {allFilteredSelected ? 'Deselect all' : `Select all (${filtered.length})`}
                </button>
                <span className="text-xs text-gray-400">
                  {selectedIds.size} selected · {available.length} available
                </span>
              </div>
            </div>

            {/* Asset list */}
            <div className="flex-1 overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                  <Package className="w-8 h-8 mb-2 opacity-40" />
                  <p className="text-sm">No available assets</p>
                </div>
              ) : filtered.map(a => {
                const checked = selectedIds.has(a.id);
                return (
                  <div key={a.id} onClick={() => toggleId(a.id)}
                    className={`flex items-center gap-3 px-4 py-3 border-b cursor-pointer transition-colors ${checked ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                    <div className={`w-5 h-5 rounded flex items-center justify-center border-2 flex-shrink-0 transition-colors ${checked ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`}>
                      {checked && <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-blue-600">{a.asset_code}</span>
                        <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded capitalize">{a.asset_type}</span>
                      </div>
                      <div className="text-sm text-gray-700 truncate mt-0.5">{a.asset_name}</div>
                      {(a.brand || a.model) && (
                        <div className="text-xs text-gray-400">{[a.brand, a.model].filter(Boolean).join(' · ')}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right — Allocation details */}
          <div className="flex flex-col w-[45%] overflow-y-auto">
            <div className="p-5 space-y-4 flex-1">
              {/* Selected summary */}
              {selectedIds.size > 0 && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm font-semibold text-blue-800">
                    {selectedIds.size} asset{selectedIds.size > 1 ? 's' : ''} selected
                  </p>
                  <p className="text-xs text-blue-600 mt-0.5">
                    {[...selectedIds].map(id => available.find(a => a.id === id)?.asset_code).filter(Boolean).join(', ')}
                  </p>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Allocation Type</label>
                <select value={form.allocation_type} onChange={e => set('allocation_type', e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400">
                  {['project', 'site', 'employee', 'department', 'store'].map(t => (
                    <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                  ))}
                </select>
              </div>

              {(form.allocation_type === 'project' || form.allocation_type === 'site') && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Project *</label>
                  <select value={form.project_id} onChange={e => set('project_id', e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400">
                    <option value="">Select project…</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              )}

              {form.allocation_type === 'employee' && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Employee Name *</label>
                  <input value={form.employee_name} onChange={e => set('employee_name', e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400"
                    placeholder="Full name" />
                </div>
              )}

              {form.allocation_type === 'department' && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Department *</label>
                  <input value={form.department} onChange={e => set('department', e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400"
                    placeholder="Department name" />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Issue Date</label>
                  <input type="date" value={form.issue_date} onChange={e => set('issue_date', e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Expected Return</label>
                  <input type="date" value={form.expected_return_date} onChange={e => set('expected_return_date', e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Condition at Issue</label>
                <select value={form.issued_condition} onChange={e => set('issued_condition', e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400">
                  {COND_OPTS.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                </select>
              </div>
            </div>

            {/* Footer */}
            <div className="flex-shrink-0 p-5 border-t bg-gray-50 rounded-br-xl flex justify-end gap-3">
              <button onClick={onClose}
                className="px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-100">Cancel</button>
              <button onClick={handleSubmit} disabled={saving || selectedIds.size === 0}
                className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
                {saving ? <Loader className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {saving ? 'Issuing…' : `Issue ${selectedIds.size > 0 ? selectedIds.size + ' ' : ''}Asset${selectedIds.size !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Return Modal ──────────────────────────────────────────────────────────────
function ReturnModal({ allocation, onSave, onClose }) {
  const [form, setForm] = useState({ return_condition: 'good', return_remarks: '' });
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="font-semibold text-gray-800">Return Asset</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="p-3 bg-gray-50 rounded-lg text-sm">
            <strong>{allocation.asset_code}</strong> — {allocation.asset_name}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Return Condition</label>
            <select value={form.return_condition}
              onChange={e => setForm(f => ({ ...f, return_condition: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm">
              {[...COND_OPTS, 'damaged'].map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Remarks</label>
            <textarea value={form.return_remarks}
              onChange={e => setForm(f => ({ ...f, return_remarks: e.target.value }))}
              rows={3} className="w-full border rounded-lg px-3 py-2 text-sm"
              placeholder="Any damage notes, observations…" />
          </div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t bg-gray-50 rounded-b-xl">
          <button onClick={onClose} className="px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-100">Cancel</button>
          <button onClick={() => onSave(form)} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">
            Confirm Return
          </button>
        </div>
      </div>
    </div>
  );
}

const STATUS_COLOR = {
  active: 'bg-green-100 text-green-700',
  returned: 'bg-gray-100 text-gray-600',
  overdue: 'bg-red-100 text-red-700',
};

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function AssetAllocationPage() {
  const [allocations, setAllocations] = useState([]);
  const [assets, setAssets] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');

  const load = async () => {
    setLoading(true);
    try {
      const [al, ast, pr] = await Promise.all([
        assetMgmtAPI.listAllocations({ status: statusFilter || undefined }),
        assetAPI.list(),
        projectAPI.list(),
      ]);
      setAllocations(al.data?.data || []);
      setAssets(ast.data?.data || []);
      setProjects(pr.data?.data || []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, [statusFilter]);

  const handleReturn = async (id, form) => {
    try {
      await assetMgmtAPI.returnAsset(id, form);
      setModal(null);
      toast.success('Asset returned');
      load();
    } catch (e) { toast.error(e.response?.data?.error || e.message); }
  };

  const filtered = allocations.filter(a =>
    [a.asset_code, a.asset_name, a.project_name, a.employee_name, a.department]
      .some(v => v?.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="p-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Asset Allocation</h1>
          <p className="text-sm text-gray-500">Issue assets to projects, employees &amp; departments</p>
        </div>
        <button onClick={() => setModal('new')}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
          <Plus className="w-4 h-4" /> Issue Assets
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            className="pl-9 pr-3 py-2 border rounded-lg text-sm w-full" placeholder="Search asset, project, employee…" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm">
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="returned">Returned</option>
          <option value="overdue">Overdue</option>
        </select>
      </div>

      {loading ? <div className="text-center py-12 text-gray-400">Loading…</div> : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {['Asset', 'Type', 'Allocated To', 'Issue Date', 'Expected Return', 'Condition', 'Status', 'Actions'].map(h => (
                    <th key={h} className="text-left py-3 px-4 text-xs font-medium text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(al => (
                  <tr key={al.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <div className="font-mono text-blue-600 text-xs">{al.asset_code}</div>
                      <div className="text-gray-700">{al.asset_name}</div>
                    </td>
                    <td className="py-3 px-4 text-xs capitalize">{al.allocation_type}</td>
                    <td className="py-3 px-4 text-xs">
                      {al.project_name || al.employee_name || al.department || '—'}
                    </td>
                    <td className="py-3 px-4 text-xs">{al.issue_date}</td>
                    <td className="py-3 px-4 text-xs">{al.expected_return_date || '—'}</td>
                    <td className="py-3 px-4 text-xs capitalize">{al.return_condition || al.issued_condition}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[al.status] || 'bg-gray-100 text-gray-600'}`}>
                        {al.status}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {al.status === 'active' && (
                        <button onClick={() => setModal({ return: true, allocation: al })}
                          className="flex items-center gap-1 px-3 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700">
                          <CornerDownLeft className="w-3 h-3" /> Return
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={8} className="text-center py-8 text-gray-400">No allocations found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modal === 'new' && (
        <AllocModal assets={assets} projects={projects}
          onSave={() => { setModal(null); load(); }}
          onClose={() => setModal(null)} />
      )}
      {modal?.return && (
        <ReturnModal allocation={modal.allocation}
          onSave={(form) => handleReturn(modal.allocation.id, form)}
          onClose={() => setModal(null)} />
      )}
    </div>
  );
}
