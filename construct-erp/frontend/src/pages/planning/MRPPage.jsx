// MRP — Material Requirements Plan: shortage alerts, ordering status, linked to activities
import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Package, Plus, Edit2, Trash2, X, Search, AlertTriangle, CheckCircle2,
} from 'lucide-react';
import { planningP6API, projectAPI, planningAPI } from '../../api/client';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import { FIELD_HL } from '../../constants/fieldStyles';
import SearchableSelect from '../../components/shared/SearchableSelect';

const MRP_INP = `w-full h-10 rounded-lg px-3 text-sm font-medium outline-none transition-all border ${FIELD_HL}`;

const STATUSES = ['pending','ordered','partial','received','consumed'];
const STATUS_CFG = {
  pending:  { cls:'bg-red-50 text-red-700 border-red-200',    label:'Pending Order' },
  ordered:  { cls:'bg-blue-50 text-blue-700 border-blue-200',  label:'Ordered' },
  partial:  { cls:'bg-yellow-50 text-yellow-700 border-yellow-200', label:'Partial Receipt' },
  received: { cls:'bg-green-50 text-green-700 border-green-200', label:'Received' },
  consumed: { cls:'bg-slate-100 text-slate-600 border-slate-200', label:'Consumed' },
};

const fmt  = v => Number(v||0).toLocaleString('en-IN',{maximumFractionDigits:2});
const fmtC = v => `₹${Number(v||0).toLocaleString('en-IN',{maximumFractionDigits:0})}`;

function AddMRPModal({ projectId, activities, onClose }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    material_name:'', material_code:'', specification:'', unit:'nos',
    boq_qty:'', planned_qty:'', unit_rate:'', required_date:'',
    activity_id:'', vendor_name:'', notes:'',
  });
  const set = (k,v) => setForm(f => ({ ...f, [k]:v }));

  const mut = useMutation({
    mutationFn: d => planningP6API.createMRP({ ...d, project_id: projectId }),
    onSuccess: () => { toast.success('Material added'); qc.invalidateQueries({queryKey:['planning-mrp']}); onClose(); },
    onError: e => toast.error(e?.response?.data?.error||'Failed'),
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white">
          <h2 className="font-semibold text-gray-800">Add Material Requirement</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Material Name *</label>
              <input value={form.material_name} onChange={e => set('material_name', e.target.value)}
                className={MRP_INP} placeholder="e.g. TMT Steel Bars" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Material Code</label>
              <input value={form.material_code} onChange={e => set('material_code', e.target.value)}
                className={MRP_INP} placeholder="MAT-001" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Specification</label>
            <input value={form.specification} onChange={e => set('specification', e.target.value)}
              className={MRP_INP} placeholder="e.g. Fe 500D, 12mm dia" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Unit</label>
              <select value={form.unit} onChange={e => set('unit', e.target.value)}
                className={MRP_INP}>
                {['nos','MT','kg','m³','m²','LM','LS','bags','litres','sets'].map(u=><option key={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">BOQ Qty</label>
              <input type="number" value={form.boq_qty} onChange={e => set('boq_qty', e.target.value)}
                className={MRP_INP} min={0} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Planned Qty *</label>
              <input type="number" value={form.planned_qty} onChange={e => set('planned_qty', e.target.value)}
                className={MRP_INP} min={0} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Unit Rate (₹)</label>
              <input type="number" value={form.unit_rate} onChange={e => set('unit_rate', e.target.value)}
                className={MRP_INP} min={0} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Required By</label>
              <input type="date" value={form.required_date} onChange={e => set('required_date', e.target.value)}
                className={MRP_INP} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Linked Activity</label>
            <select value={form.activity_id} onChange={e => set('activity_id', e.target.value)}
              className={MRP_INP}>
              <option value="">None</option>
              {activities.map(a => <option key={a.id} value={a.id}>{a.activity_code} — {a.activity_name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Vendor</label>
            <input value={form.vendor_name} onChange={e => set('vendor_name', e.target.value)}
              className={MRP_INP} placeholder="Preferred vendor" />
          </div>
          {form.planned_qty && form.unit_rate && (
            <div className="p-3 bg-blue-50 rounded-lg text-sm text-blue-800">
              Estimated Value: <strong>{fmtC(form.planned_qty * form.unit_rate)}</strong>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-3 p-5 border-t bg-gray-50 sticky bottom-0">
          <button onClick={onClose} className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
          <button onClick={() => mut.mutate(form)} disabled={!form.material_name || !form.planned_qty || mut.isPending}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
            Add Material
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MRPPage() {
  const [projectId, setProjectId] = useState('');
  const [search, setSearch]       = useState('');
  const [statusFilter, setStatus] = useState('');
  const [showAdd, setShowAdd]     = useState(false);
  const [editing, setEditing]     = useState(null); // item being status-updated

  const { data: projects = [] }    = useQuery({ queryKey:['projects'], queryFn: () => projectAPI.list().then(r=>r.data?.data??[]) });
  const { data: mrpItems = [], refetch } = useQuery({
    queryKey: ['planning-mrp', projectId, statusFilter],
    queryFn: () => planningP6API.listMRP({ project_id: projectId, status: statusFilter||undefined }).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    enabled: !!projectId,
  });
  const { data: activities = [] } = useQuery({
    queryKey: ['planning-activities', projectId],
    queryFn: () => planningAPI.listActivities({ project_id: projectId }).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    enabled: !!projectId,
  });
  const qc = useQueryClient();

  const updateMut = useMutation({
    mutationFn: ({ id, ...d }) => planningP6API.updateMRP(id, d),
    onSuccess: () => { toast.success('Updated'); setEditing(null); refetch(); },
    onError: e => toast.error(e?.response?.data?.error||'Failed'),
  });
  const deleteMut = useMutation({
    mutationFn: id => planningP6API.deleteMRP(id),
    onSuccess: () => { toast.success('Deleted'); refetch(); },
  });

  const filtered = useMemo(() => mrpItems.filter(m => {
    if (!search) return true;
    return [m.material_name, m.material_code, m.specification, m.activity_code, m.vendor_name]
      .some(v => v?.toLowerCase().includes(search.toLowerCase()));
  }), [mrpItems, search]);

  const totalValue    = mrpItems.reduce((s,m) => s + parseFloat(m.total_value||0), 0);
  const shortageItems = mrpItems.filter(m => m.shortage_qty > 0).length;

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto min-h-screen bg-[#f4f6f9]">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1"><Package className="w-3.5 h-3.5" /> Planning</div>
          <h1 className="text-2xl font-semibold text-slate-900">Material Requirements Plan</h1>
          <p className="text-sm text-slate-500 mt-0.5">MRP — plan, track orders, receipts & consumption</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-64">
            <SearchableSelect
              value={projectId}
              onChange={v => setProjectId(v)}
              options={projects.map(p => ({ value: p.id, label: p.name }))}
              placeholder="— Select project —"
              searchPlaceholder="Search projects…"
            />
          </div>
          {projectId && (
            <button onClick={() => setShowAdd(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 shadow-sm">
              <Plus className="w-4 h-4" /> Add Material
            </button>
          )}
        </div>
      </div>

      {!projectId ? (
        <div className="bg-white border border-slate-200 rounded-xl p-16 text-center shadow-sm">
          <Package className="w-10 h-10 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-400">Select a project to view its material requirements</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Summary KPIs */}
          {shortageItems > 0 && (
            <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
              <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-semibold text-red-800">{shortageItems} material(s) not yet ordered</div>
                <div className="text-xs text-red-600 mt-0.5">Review and raise purchase orders for these items</div>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label:'Total Items', value: mrpItems.length, color:'text-slate-700' },
              { label:'Pending Order', value: mrpItems.filter(m=>m.status==='pending').length, color:'text-red-600' },
              { label:'Ordered/Received', value: mrpItems.filter(m=>['ordered','partial','received'].includes(m.status)).length, color:'text-blue-600' },
              { label:'Total Value', value: fmtC(totalValue), color:'text-green-700' },
            ].map(c => (
              <div key={c.label} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                <div className="text-xs text-slate-500 mb-1">{c.label}</div>
                <div className={`text-xl font-bold ${c.color}`}>{c.value}</div>
              </div>
            ))}
          </div>

          {/* Filters */}
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                className="pl-9 pr-3 py-2 border border-slate-200 bg-white rounded-lg text-sm w-full shadow-sm"
                placeholder="Search materials…" />
            </div>
            <div className="flex gap-1">
              {['', ...STATUSES].map(s => (
                <button key={s} onClick={() => setStatus(s)}
                  className={clsx('px-3 py-2 rounded-lg text-xs font-medium border transition-all',
                    statusFilter===s ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300')}>
                  {s ? STATUS_CFG[s]?.label : 'All'}
                </button>
              ))}
            </div>
          </div>

          {/* MRP Table */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    {['Material','Activity','Unit','BOQ','Planned','Ordered','Received','Shortage','Rate','Value','Req. Date','Status','Actions'].map(h => (
                      <th key={h} className="text-left py-3 px-3 text-xs font-medium text-slate-500 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(m => {
                    const cfg = STATUS_CFG[m.status] || STATUS_CFG.pending;
                    const isShort = m.shortage_qty > 0;
                    return (
                      <tr key={m.id} className={clsx('border-b last:border-0 hover:bg-slate-50', isShort && 'bg-red-50/50')}>
                        <td className="py-2 px-3">
                          <div className="font-medium text-xs text-slate-800">{m.material_name}</div>
                          {m.material_code && <div className="text-[10px] text-slate-400 font-mono">{m.material_code}</div>}
                          {m.specification && <div className="text-[10px] text-slate-400 truncate max-w-[140px]">{m.specification}</div>}
                        </td>
                        <td className="py-2 px-3 text-xs text-slate-500">{m.activity_code || '—'}</td>
                        <td className="py-2 px-3 text-xs">{m.unit}</td>
                        <td className="py-2 px-3 text-xs font-mono">{fmt(m.boq_qty)}</td>
                        <td className="py-2 px-3 text-xs font-mono">{fmt(m.planned_qty)}</td>
                        <td className="py-2 px-3 text-xs font-mono">{fmt(m.ordered_qty)}</td>
                        <td className="py-2 px-3 text-xs font-mono">{fmt(m.received_qty)}</td>
                        <td className="py-2 px-3 text-xs font-mono font-bold">
                          {m.shortage_qty > 0
                            ? <span className="text-red-600">-{fmt(m.shortage_qty)}</span>
                            : <span className="text-green-600">✓</span>}
                        </td>
                        <td className="py-2 px-3 text-xs">{fmtC(m.unit_rate)}</td>
                        <td className="py-2 px-3 text-xs font-medium">{fmtC(m.total_value)}</td>
                        <td className="py-2 px-3 text-xs whitespace-nowrap">{m.required_date || '—'}</td>
                        <td className="py-2 px-3">
                          {editing?.id === m.id ? (
                            <select value={editing.status}
                              onChange={e => setEditing(ed => ({ ...ed, status: e.target.value }))}
                              className={clsx('h-8 rounded text-xs px-2 outline-none transition-all border', FIELD_HL)}>
                              {STATUSES.map(s => <option key={s} value={s}>{STATUS_CFG[s]?.label}</option>)}
                            </select>
                          ) : (
                            <span className={`px-2 py-0.5 rounded-full text-xs border ${cfg.cls}`}>{cfg.label}</span>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          <div className="flex gap-1">
                            {editing?.id === m.id ? (
                              <>
                                <button onClick={() => updateMut.mutate({ id: m.id, status: editing.status, ordered_qty: editing.ordered_qty, received_qty: editing.received_qty })}
                                  className="p-1 text-green-600 hover:bg-green-50 rounded">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => setEditing(null)} className="p-1 text-slate-400 hover:bg-slate-100 rounded">
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </>
                            ) : (
                              <>
                                <button onClick={() => setEditing({ id: m.id, status: m.status, ordered_qty: m.ordered_qty, received_qty: m.received_qty })}
                                  className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded">
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => { if (window.confirm('Delete?')) deleteMut.mutate(m.id); }}
                                  className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr><td colSpan={13} className="text-center py-10 text-slate-400">
                      <Package className="w-8 h-8 mx-auto mb-2 opacity-30" />No materials found
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {showAdd && <AddMRPModal projectId={projectId} activities={activities} onClose={() => setShowAdd(false)} />}
    </div>
  );
}
