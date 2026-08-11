// WBS Editor — hierarchical tree, inline edit, add/delete nodes, link to activities
import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ChevronRight, ChevronDown, Plus, Trash2, Edit2, Save, X,
  Layers, Package, FolderOpen, Folder,
} from 'lucide-react';
import { planningP6API, projectAPI } from '../../api/client';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';

const fmt = (v) => v ? `₹${Number(v).toLocaleString('en-IN',{maximumFractionDigits:0})}` : '—';

// Build tree from flat array
function buildTree(items) {
  const map = {};
  const roots = [];
  items.forEach(item => { map[item.id] = { ...item, children: [] }; });
  items.forEach(item => {
    if (item.parent_id && map[item.parent_id]) map[item.parent_id].children.push(map[item.id]);
    else roots.push(map[item.id]);
  });
  return roots;
}

function WBSNode({ node, depth = 0, projectId, phases, onRefresh }) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(depth < 2);
  const [editing, setEditing]   = useState(false);
  const [form, setForm]         = useState({ wbs_name: node.wbs_name, description: node.description || '' });
  const [addingChild, setAddingChild] = useState(false);
  const [newChild, setNewChild] = useState({ wbs_code: '', wbs_name: '' });

  const updateMut = useMutation({
    mutationFn: d => planningP6API.updateWBS(node.id, d),
    onSuccess: () => { toast.success('Updated'); setEditing(false); onRefresh(); },
    onError: e => toast.error(e?.response?.data?.error || 'Failed'),
  });
  const deleteMut = useMutation({
    mutationFn: () => planningP6API.deleteWBS(node.id),
    onSuccess: () => { toast.success('Deleted'); onRefresh(); },
    onError: e => toast.error(e?.response?.data?.error || 'Failed'),
  });
  const addChildMut = useMutation({
    mutationFn: d => planningP6API.createWBS(d),
    onSuccess: () => { toast.success('Added'); setAddingChild(false); setNewChild({ wbs_code: '', wbs_name: '' }); onRefresh(); },
    onError: e => toast.error(e?.response?.data?.error || 'Failed'),
  });

  const hasChildren = node.children?.length > 0;
  const indent = depth * 20;

  return (
    <div>
      <div className={clsx(
        'flex items-center gap-2 py-2 px-3 rounded-lg group hover:bg-slate-50 transition-colors',
        node.is_critical_path && 'border-l-2 border-red-400'
      )} style={{ marginLeft: indent }}>

        {/* Expand toggle */}
        <button onClick={() => setExpanded(e => !e)} className="w-5 h-5 flex-shrink-0 flex items-center justify-center">
          {hasChildren
            ? (expanded ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />)
            : <span className="w-3.5" />}
        </button>

        {/* Folder icon */}
        {hasChildren
          ? (expanded ? <FolderOpen className="w-4 h-4 text-indigo-500 flex-shrink-0" /> : <Folder className="w-4 h-4 text-indigo-400 flex-shrink-0" />)
          : <Package className="w-4 h-4 text-slate-400 flex-shrink-0" />}

        {/* WBS Code */}
        <span className="font-mono text-xs text-indigo-600 w-20 flex-shrink-0">{node.wbs_code}</span>

        {/* Name — edit inline */}
        {editing ? (
          <input value={form.wbs_name} onChange={e => setForm(f => ({ ...f, wbs_name: e.target.value }))}
            className="flex-1 text-sm border border-indigo-300 rounded px-2 py-0.5 outline-none"
            autoFocus onKeyDown={e => { if (e.key === 'Enter') updateMut.mutate(form); if (e.key === 'Escape') setEditing(false); }} />
        ) : (
          <span className="flex-1 text-sm text-black font-medium">{node.wbs_name}</span>
        )}

        {/* Stats */}
        <span className="text-xs text-slate-400 hidden md:block w-16 text-right">{node.activity_count} acts</span>
        <span className="text-xs text-slate-400 hidden lg:block w-24 text-right">{fmt(node.planned_cost)}</span>

        {/* Actions — show on hover */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          {editing ? (
            <>
              <button onClick={() => updateMut.mutate(form)} className="p-1 text-emerald-600 hover:bg-emerald-50 rounded" title="Save">
                <Save className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => setEditing(false)} className="p-1 text-slate-400 hover:bg-slate-100 rounded">
                <X className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <>
              <button onClick={() => { setEditing(true); setForm({ wbs_name: node.wbs_name, description: node.description||'' }); }}
                className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded" title="Edit">
                <Edit2 className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => setAddingChild(a => !a)}
                className="p-1 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded" title="Add child">
                <Plus className="w-3.5 h-3.5" />
              </button>
              {!hasChildren && (
                <button onClick={() => { if (window.confirm('Delete this WBS item?')) deleteMut.mutate(); }}
                  className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded" title="Delete">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Add child form */}
      {addingChild && (
        <div className="flex items-center gap-2 py-1.5 px-3 bg-emerald-50 border border-emerald-100 rounded-lg mx-3"
          style={{ marginLeft: indent + 20 }}>
          <input value={newChild.wbs_code} onChange={e => setNewChild(c => ({ ...c, wbs_code: e.target.value }))}
            className="w-24 text-xs border border-emerald-300 rounded px-2 py-1 outline-none font-mono"
            placeholder="Code" />
          <input value={newChild.wbs_name} onChange={e => setNewChild(c => ({ ...c, wbs_name: e.target.value }))}
            className="flex-1 text-xs border border-emerald-300 rounded px-2 py-1 outline-none"
            placeholder="WBS name…"
            onKeyDown={e => { if (e.key === 'Enter') addChildMut.mutate({ project_id: projectId, parent_id: node.id, ...newChild }); }} />
          <button onClick={() => addChildMut.mutate({ project_id: projectId, parent_id: node.id, ...newChild })}
            className="px-2 py-1 bg-emerald-600 text-white text-xs rounded hover:bg-emerald-700">Add</button>
          <button onClick={() => setAddingChild(false)} className="p-1 text-slate-400 hover:text-red-500">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Children */}
      {expanded && node.children?.map(child => (
        <WBSNode key={child.id} node={child} depth={depth + 1}
          projectId={projectId} phases={phases} onRefresh={onRefresh} />
      ))}
    </div>
  );
}

export default function WBSEditorPage() {
  const qc = useQueryClient();
  const [projectId, setProjectId] = useState('');
  const [showAddRoot, setShowAddRoot] = useState(false);
  const [newRoot, setNewRoot] = useState({ wbs_code: '', wbs_name: '' });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectAPI.list().then(r => r.data?.data ?? []),
  });
  const { data: wbsItems = [], refetch } = useQuery({
    queryKey: ['planning-wbs', projectId],
    queryFn: () => planningP6API.listWBS({ project_id: projectId }).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    enabled: !!projectId,
  });
  const { data: phases = [] } = useQuery({
    queryKey: ['planning-phases', projectId],
    queryFn: () => planningP6API.listPhases({ project_id: projectId }).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    enabled: !!projectId,
  });

  const addRootMut = useMutation({
    mutationFn: d => planningP6API.createWBS(d),
    onSuccess: () => { toast.success('Root WBS added'); setShowAddRoot(false); setNewRoot({ wbs_code:'', wbs_name:'' }); refetch(); },
    onError: e => toast.error(e?.response?.data?.error || 'Failed'),
  });

  const tree = useMemo(() => buildTree(wbsItems), [wbsItems]);

  const totalCost   = wbsItems.filter(w => !w.parent_id).reduce((s, w) => s + parseFloat(w.planned_cost||0), 0);
  const totalActs   = wbsItems.reduce((s, w) => s + parseInt(w.activity_count||0), 0);

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto min-h-screen bg-[#f4f6f9]">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
            <Layers className="w-3.5 h-3.5" /> Planning
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">WBS Editor</h1>
          <p className="text-sm text-slate-500 mt-0.5">Work Breakdown Structure — hierarchical scope decomposition</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={projectId} onChange={e => setProjectId(e.target.value)}
            className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none w-64 shadow-sm">
            <option value="">— Select project —</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {projectId && (
            <button onClick={() => setShowAddRoot(s => !s)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 shadow-sm">
              <Plus className="w-4 h-4" /> Add Root WBS
            </button>
          )}
        </div>
      </div>

      {!projectId ? (
        <div className="bg-white border border-slate-200 rounded-xl p-16 text-center shadow-sm">
          <Layers className="w-10 h-10 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-400">Select a project to edit its WBS</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          {/* Header row */}
          <div className="flex items-center gap-2 px-3 py-2.5 bg-slate-50 border-b text-xs font-medium text-slate-500 uppercase tracking-wider">
            <span className="w-5" />
            <span className="w-4" />
            <span className="w-20">Code</span>
            <span className="flex-1">WBS Name</span>
            <span className="hidden md:block w-16 text-right">Activities</span>
            <span className="hidden lg:block w-24 text-right">Planned Cost</span>
            <span className="w-20" />
          </div>

          {/* Add Root form */}
          {showAddRoot && (
            <div className="flex items-center gap-2 p-3 bg-indigo-50 border-b border-indigo-100">
              <input value={newRoot.wbs_code} onChange={e => setNewRoot(r => ({ ...r, wbs_code: e.target.value }))}
                className="w-28 text-sm border border-indigo-300 rounded px-2 py-1.5 outline-none font-mono"
                placeholder="Code e.g. 1" />
              <input value={newRoot.wbs_name} onChange={e => setNewRoot(r => ({ ...r, wbs_name: e.target.value }))}
                className="flex-1 text-sm border border-indigo-300 rounded px-2 py-1.5 outline-none"
                placeholder="Root WBS name…"
                onKeyDown={e => { if (e.key === 'Enter') addRootMut.mutate({ project_id: projectId, ...newRoot }); }} />
              <button onClick={() => addRootMut.mutate({ project_id: projectId, ...newRoot })}
                className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700">Add</button>
              <button onClick={() => setShowAddRoot(false)} className="p-1.5 text-slate-400 hover:text-red-500">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* WBS Tree */}
          <div className="p-2">
            {tree.length === 0 ? (
              <div className="text-center py-16 text-slate-400 text-sm">
                <Layers className="w-10 h-10 mx-auto mb-3 opacity-30" />
                No WBS defined. Click "Add Root WBS" to start.
              </div>
            ) : tree.map(node => (
              <WBSNode key={node.id} node={node} depth={0}
                projectId={projectId} phases={phases}
                onRefresh={refetch} />
            ))}
          </div>

          {/* Footer summary */}
          {tree.length > 0 && (
            <div className="px-5 py-3 border-t bg-slate-50 flex justify-between text-xs text-slate-500">
              <span>{wbsItems.length} WBS items · {totalActs} activities</span>
              <span>Total Planned: <strong className="text-slate-700">{fmt(totalCost)}</strong></span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
