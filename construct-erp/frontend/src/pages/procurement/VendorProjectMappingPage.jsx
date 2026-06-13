// src/pages/procurement/VendorProjectMappingPage.jsx
// Admin page — map vendors to projects so scoped users only see relevant vendors
import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Building2, Users, Plus, Trash2, Search, ChevronDown,
  Link2, Link2Off, Loader2, AlertCircle, CheckCircle2, RefreshCw,
} from 'lucide-react';
import { vendorAPI, projectAPI } from '../../api/client';
import toast from 'react-hot-toast';

const VENDOR_TYPE_LABEL = {
  material_supplier:  'Material Supplier',
  subcontractor:      'Subcontractor',
  'Sub-contractor':   'Subcontractor',
  labour_contractor:  'Labour Contractor',
  equipment_supplier: 'Equipment Supplier',
  service_provider:   'Service Provider',
  Contractor:         'Contractor',
  Supplier:           'Supplier',
  Consultant:         'Consultant',
};
const typeLabel = (t) => VENDOR_TYPE_LABEL[t] || t || '—';

function Badge({ children, color = 'blue' }) {
  const cls = {
    blue:   'bg-blue-50   text-blue-700   border-blue-200',
    green:  'bg-green-50  text-green-700  border-green-200',
    amber:  'bg-amber-50  text-amber-700  border-amber-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
    slate:  'bg-slate-100 text-slate-600  border-slate-200',
  }[color] || 'bg-slate-100 text-slate-600 border-slate-200';
  return (
    <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cls}`}>
      {children}
    </span>
  );
}

export default function VendorProjectMappingPage() {
  const qc = useQueryClient();
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [search, setSearch] = useState('');
  const [unmappedSearch, setUnmappedSearch] = useState('');
  const [selectedToAdd, setSelectedToAdd] = useState(new Set());

  // Load all projects
  const { data: projectsData, isLoading: loadingProjects } = useQuery({
    queryKey: ['projects-all'],
    queryFn: () => projectAPI.list({ status: 'active' }),
    select: (r) => r.data?.data || r.data || [],
  });
  const projects = projectsData || [];

  // Load mapped vendors for selected project
  const { data: mappedData, isLoading: loadingMapped } = useQuery({
    queryKey: ['project-vendors-mapped', selectedProjectId],
    queryFn: () => vendorAPI.projectMap({ project_id: selectedProjectId }),
    enabled: !!selectedProjectId,
    select: (r) => r.data?.data || [],
  });
  const mapped = mappedData || [];

  // Load unmapped vendors for selected project
  const { data: unmappedData, isLoading: loadingUnmapped } = useQuery({
    queryKey: ['project-vendors-unmapped', selectedProjectId],
    queryFn: () => vendorAPI.unmapped({ project_id: selectedProjectId }),
    enabled: !!selectedProjectId,
    select: (r) => r.data?.data || [],
  });
  const unmapped = unmappedData || [];

  // Add mutation
  const addMut = useMutation({
    mutationFn: (vendorIds) => vendorAPI.mapToProject({ project_id: selectedProjectId, vendor_ids: vendorIds }),
    onSuccess: (_, vendorIds) => {
      toast.success(`${vendorIds.length} vendor(s) mapped`);
      setSelectedToAdd(new Set());
      qc.invalidateQueries({ queryKey: ['project-vendors-mapped', selectedProjectId] });
      qc.invalidateQueries({ queryKey: ['project-vendors-unmapped', selectedProjectId] });
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed to map vendors'),
  });

  // Remove mutation
  const removeMut = useMutation({
    mutationFn: ({ project_id, vendor_id }) => vendorAPI.unmapFromProject({ project_id, vendor_id }),
    onSuccess: () => {
      toast.success('Vendor removed from project');
      qc.invalidateQueries({ queryKey: ['project-vendors-mapped', selectedProjectId] });
      qc.invalidateQueries({ queryKey: ['project-vendors-unmapped', selectedProjectId] });
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed to remove vendor'),
  });

  // Backfill mutation — populate project_vendors from existing PO history
  const backfillMut = useMutation({
    mutationFn: () => vendorAPI.backfillProjectMap(),
    onSuccess: (r) => {
      toast.success(r?.data?.message || 'Vendor-project mappings synced from PO history');
      qc.invalidateQueries({ queryKey: ['project-vendors-mapped'] });
      qc.invalidateQueries({ queryKey: ['project-vendors-unmapped'] });
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed to sync mappings'),
  });

  const selectedProject = projects.find(p => p.id === selectedProjectId);

  const filteredMapped = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return mapped;
    return mapped.filter(v =>
      v.name?.toLowerCase().includes(q) ||
      v.vendor_code?.toLowerCase().includes(q) ||
      v.vendor_type?.toLowerCase().includes(q) ||
      v.city?.toLowerCase().includes(q)
    );
  }, [mapped, search]);

  const filteredUnmapped = useMemo(() => {
    const q = unmappedSearch.trim().toLowerCase();
    if (!q) return unmapped;
    return unmapped.filter(v =>
      v.name?.toLowerCase().includes(q) ||
      v.vendor_code?.toLowerCase().includes(q) ||
      v.vendor_type?.toLowerCase().includes(q) ||
      v.city?.toLowerCase().includes(q)
    );
  }, [unmapped, unmappedSearch]);

  const toggleSelect = (id) => {
    setSelectedToAdd(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleAddSelected = () => {
    if (selectedToAdd.size === 0) return;
    addMut.mutate([...selectedToAdd]);
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Link2 className="w-5 h-5 text-indigo-600" />
            Vendor–Project Mapping
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Assign vendors to projects so each project team sees only their relevant vendors.
          </p>
        </div>
        <button
          onClick={() => backfillMut.mutate()}
          disabled={backfillMut.isPending}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-slate-200 bg-white text-slate-700 hover:border-indigo-300 hover:text-indigo-600 transition-all disabled:opacity-50"
          title="Map vendors to projects based on their existing purchase order history"
        >
          {backfillMut.isPending
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <RefreshCw className="w-3.5 h-3.5" />}
          Sync from PO History
        </button>
      </div>

      {/* Project Selector */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">
          Select Project
        </label>
        {loadingProjects ? (
          <div className="flex items-center gap-2 text-slate-400 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading projects…
          </div>
        ) : (
          <div className="relative max-w-md">
            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <select
              className="w-full pl-9 pr-8 py-2.5 border border-slate-200 rounded-lg text-sm bg-white text-slate-800 outline-none focus:border-indigo-400 appearance-none"
              value={selectedProjectId}
              onChange={(e) => {
                setSelectedProjectId(e.target.value);
                setSelectedToAdd(new Set());
                setSearch('');
                setUnmappedSearch('');
              }}
            >
              <option value="">— Choose a project —</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name} {p.project_code ? `(${p.project_code})` : ''}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>
        )}
      </div>

      {!selectedProjectId && (
        <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-12 text-center text-slate-400">
          <Building2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Select a project above to manage its vendors</p>
        </div>
      )}

      {selectedProjectId && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* LEFT — Mapped vendors */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-slate-800 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  Assigned Vendors
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {loadingMapped ? '…' : mapped.length} vendor{mapped.length !== 1 ? 's' : ''} mapped to{' '}
                  <span className="font-medium text-slate-600">{selectedProject?.name}</span>
                </p>
              </div>
            </div>

            <div className="p-3 border-b border-slate-100">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search assigned vendors…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-xs bg-slate-50 outline-none focus:border-indigo-400"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto max-h-[480px]">
              {loadingMapped ? (
                <div className="flex items-center justify-center py-16 text-slate-400 gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading…
                </div>
              ) : filteredMapped.length === 0 ? (
                <div className="py-16 text-center text-slate-400">
                  <Link2Off className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">{search ? 'No matches' : 'No vendors assigned yet'}</p>
                  <p className="text-xs mt-1 text-slate-300">Add vendors from the right panel</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="text-left text-[11px] font-semibold text-slate-500 px-4 py-2">Vendor</th>
                      <th className="text-left text-[11px] font-semibold text-slate-500 px-3 py-2">Type</th>
                      <th className="text-center text-[11px] font-semibold text-slate-500 px-3 py-2">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMapped.map((v, idx) => (
                      <tr key={v.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                        <td className="px-4 py-2.5">
                          <div className="font-medium text-slate-800 text-xs leading-tight">{v.name}</div>
                          <div className="text-[10px] text-slate-400">{v.vendor_code || '—'} {v.city ? `· ${v.city}` : ''}</div>
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge color="blue">{typeLabel(v.vendor_type)}</Badge>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <button
                            onClick={() => removeMut.mutate({ project_id: selectedProjectId, vendor_id: v.id })}
                            disabled={removeMut.isPending}
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-red-600 hover:bg-red-50 px-2 py-1 rounded-lg transition-colors"
                            title="Remove from project"
                          >
                            <Trash2 className="w-3 h-3" /> Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* RIGHT — Unmapped vendors (to add) */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-slate-800 flex items-center gap-2">
                  <Users className="w-4 h-4 text-indigo-500" />
                  Available Vendors
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {loadingUnmapped ? '…' : unmapped.length} vendor{unmapped.length !== 1 ? 's' : ''} not yet assigned
                </p>
              </div>
              {selectedToAdd.size > 0 && (
                <button
                  onClick={handleAddSelected}
                  disabled={addMut.isPending}
                  className="flex items-center gap-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60"
                >
                  {addMut.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Plus className="w-3.5 h-3.5" />
                  )}
                  Add {selectedToAdd.size} selected
                </button>
              )}
            </div>

            <div className="p-3 border-b border-slate-100">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search available vendors…"
                  value={unmappedSearch}
                  onChange={e => setUnmappedSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-xs bg-slate-50 outline-none focus:border-indigo-400"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto max-h-[480px]">
              {loadingUnmapped ? (
                <div className="flex items-center justify-center py-16 text-slate-400 gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading…
                </div>
              ) : filteredUnmapped.length === 0 ? (
                <div className="py-16 text-center text-slate-400">
                  <CheckCircle2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">{unmappedSearch ? 'No matches' : 'All vendors are assigned'}</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="text-left text-[11px] font-semibold text-slate-500 px-4 py-2 w-8">
                        <input
                          type="checkbox"
                          className="rounded"
                          checked={selectedToAdd.size === filteredUnmapped.length && filteredUnmapped.length > 0}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedToAdd(new Set(filteredUnmapped.map(v => v.id)));
                            else setSelectedToAdd(new Set());
                          }}
                        />
                      </th>
                      <th className="text-left text-[11px] font-semibold text-slate-500 px-3 py-2">Vendor</th>
                      <th className="text-left text-[11px] font-semibold text-slate-500 px-3 py-2">Type</th>
                      <th className="text-center text-[11px] font-semibold text-slate-500 px-3 py-2">Add</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUnmapped.map((v, idx) => (
                      <tr
                        key={v.id}
                        className={`cursor-pointer ${selectedToAdd.has(v.id) ? 'bg-indigo-50' : idx % 2 === 0 ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/50 hover:bg-slate-100'}`}
                        onClick={() => toggleSelect(v.id)}
                      >
                        <td className="px-4 py-2.5">
                          <input
                            type="checkbox"
                            className="rounded pointer-events-none"
                            checked={selectedToAdd.has(v.id)}
                            readOnly
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="font-medium text-slate-800 text-xs leading-tight">{v.name}</div>
                          <div className="text-[10px] text-slate-400">{v.vendor_code || '—'} {v.city ? `· ${v.city}` : ''}</div>
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge color="slate">{typeLabel(v.vendor_type)}</Badge>
                        </td>
                        <td className="px-3 py-2.5 text-center" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => addMut.mutate([v.id])}
                            disabled={addMut.isPending}
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded-lg transition-colors"
                            title="Add to project"
                          >
                            <Plus className="w-3 h-3" /> Add
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
