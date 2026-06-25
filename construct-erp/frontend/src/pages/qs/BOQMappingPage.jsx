// src/pages/qs/BOQMappingPage.jsx — Client BOQ vs SC Allocation Comparative Register
import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { boqMappingAPI, projectAPI, scAPI } from '../../api/client';
import { PageHeader, KpiCard as ThemeKpiCard, Theme } from '../../theme';
import {
  Plus, X, RefreshCw, Search, ChevronDown, ChevronRight,
  AlertTriangle, IndianRupee, Layers, Download,
  CheckCircle2, Building2, HardHat, Link2, Edit2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import * as XLSX from 'xlsx';

const fmt  = (n) => `₹${Number(n||0).toLocaleString('en-IN',{maximumFractionDigits:0})}`;
const fmt2 = (n) => `₹${Number(n||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const pct  = (n) => `${Number(n||0).toFixed(1)}%`;
const num  = (v) => parseFloat(v||0);
const inp  = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-300 transition';
const boqDesc = (item) => item?.boq_description || item?.description || '';

function marginColor(p) {
  if (p < 0)   return { bg:'bg-red-100',   text:'text-red-700',   bar:'#DC2626' };
  if (p < 10)  return { bg:'bg-orange-100', text:'text-orange-700', bar:'#EA580C' };
  if (p < 20)  return { bg:'bg-amber-100',  text:'text-amber-700',  bar:'#D97706' };
  return              { bg:'bg-emerald-100', text:'text-emerald-700', bar:'#059669' };
}

// ─── Allocation Modal (create + edit) ─────────────────────────────────────────
function AllocationModal({ boqItem, balance, scList, onClose, existing }) {
  const qc = useQueryClient();
  const isEdit = !!existing;

  const [form, setForm] = useState(isEdit ? {
    execution_type: existing.execution_type || 'subcontractor',
    sc_id:          existing.sc_id || '',
    sc_name_override: existing.sc_name_override || '',
    allocated_qty:  existing.allocated_qty,
    sc_rate:        existing.sc_rate,
    notes:          existing.notes || '',
  } : {
    execution_type: 'subcontractor',
    sc_id: '',
    sc_name_override: '',
    allocated_qty: Math.max(0, num(balance)),
    sc_rate: '',
    notes: '',
  });
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  const clientAmt = num(form.allocated_qty) * num(boqItem.rate);
  const scAmt     = num(form.allocated_qty) * num(form.sc_rate);
  const margin    = clientAmt - scAmt;
  const marginPct = clientAmt > 0 ? ((margin / clientAmt) * 100) : 0;
  const mc        = marginColor(marginPct);

  const mut = useMutation({
    mutationFn: () => isEdit
      ? boqMappingAPI.updateMapping(existing.id, {
          allocated_qty:    num(form.allocated_qty),
          sc_rate:          num(form.sc_rate),
          notes:            form.notes || null,
          sc_id:            form.execution_type === 'subcontractor' ? (form.sc_id || null) : null,
          sc_name_override: form.execution_type === 'own_team' ? 'BCIM Own Team' : (form.sc_name_override || null),
        })
      : boqMappingAPI.createMapping({
          boq_item_id:      boqItem.id,
          sc_id:            form.execution_type === 'subcontractor' ? form.sc_id || null : null,
          execution_type:   form.execution_type,
          sc_name_override: form.execution_type === 'own_team' ? 'BCIM Own Team' : form.sc_name_override || null,
          allocated_qty:    num(form.allocated_qty),
          sc_rate:          num(form.sc_rate),
          notes:            form.notes,
        }),
    onSuccess: () => {
      toast.success(isEdit ? 'Allocation updated' : 'Allocation created');
      qc.invalidateQueries({ queryKey:['boq-mappings'] });
      qc.invalidateQueries({ queryKey:['boq-balance'] });
      onClose();
    },
    onError: e => toast.error(e?.response?.data?.error || 'Failed'),
  });

  const labourSCs = scList.filter(s => s.contractor_type === 'labour_contractor' && s.status === 'active');
  const subSCs    = scList.filter(s => s.contractor_type !== 'labour_contractor' && s.status === 'active');
  const canSave = form.allocated_qty > 0 && form.sc_rate !== '' && num(form.sc_rate) >= 0 &&
                  (form.execution_type === 'own_team' || form.sc_id);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4"
          style={{background:`linear-gradient(135deg, ${Theme.navy} 0%, ${Theme.navyDark} 100%)`}}>
          <div>
            <p className="font-bold text-white text-sm">
              {isEdit ? 'Edit Allocation' : 'Allocate BOQ Item to SC'}
            </p>
            <p className="text-[11px] mt-0.5" style={{color:'rgba(255,255,255,0.65)'}}>
              Item {boqItem.item_no} · {boqItem.description?.slice(0,50)}
            </p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-white" style={{background:'rgba(255,255,255,0.10)'}}>
            <X className="w-4 h-4"/>
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* BOQ item summary */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 grid grid-cols-3 gap-3">
            {[
              ['Client Rate', fmt2(boqItem.rate)],
              ['Total Qty',   `${boqItem.quantity} ${boqItem.unit}`],
              ['Balance Qty', `${Number(balance).toFixed(3)} ${boqItem.unit}`],
            ].map(([l,v])=>(
              <div key={l}><p className="text-[9px] font-bold text-slate-400 uppercase">{l}</p>
              <p className="text-sm font-bold text-slate-800">{v}</p></div>
            ))}
          </div>

          {/* Execution type — locked in edit mode */}
          {!isEdit && (
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Execution Type</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  {k:'subcontractor', label:'Sub-Contractor', icon: Building2, color:'#EA580C'},
                  {k:'own_team',      label:'BCIM Own Team',  icon: HardHat,    color:'#1D4ED8'},
                ].map(({k,label,icon:Icon,color})=>(
                  <button key={k} type="button" onClick={()=>set('execution_type',k)}
                    className={clsx('flex items-center gap-2 p-3 rounded-xl border-2 text-left transition-all text-sm font-semibold',
                      form.execution_type===k ? 'border-indigo-400 bg-indigo-50 text-indigo-800' : 'border-slate-200 text-slate-600 hover:border-slate-300')}>
                    <Icon className="w-4 h-4 flex-shrink-0" style={{color: form.execution_type===k ? color : '#94A3B8'}}/>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Vendor selector */}
          {form.execution_type === 'subcontractor' && (
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">SC Vendor *</label>
              <select value={form.sc_id} onChange={e=>set('sc_id',e.target.value)} className={inp}>
                <option value="">— Select vendor —</option>
                {labourSCs.length > 0 && <optgroup label="── Labour Contractors ──">
                  {labourSCs.map(s=><option key={s.id} value={s.id}>{s.sc_code} — {s.name}</option>)}
                </optgroup>}
                {subSCs.length > 0 && <optgroup label="── Sub-Contractors ──">
                  {subSCs.map(s=><option key={s.id} value={s.id}>{s.sc_code} — {s.name}</option>)}
                </optgroup>}
              </select>
            </div>
          )}

          {/* Qty + Rate */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                Allocated Qty ({boqItem.unit}) *
              </label>
              <input type="number" value={form.allocated_qty} min={0} max={num(balance)}
                onChange={e=>set('allocated_qty',e.target.value)} className={inp}/>
              <p className="text-[10px] text-slate-400 mt-0.5">Max: {Number(balance).toFixed(3)}</p>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                SC Rate (₹/{boqItem.unit}) *
              </label>
              <input type="number" value={form.sc_rate} min={0}
                onChange={e=>set('sc_rate',e.target.value)} className={inp} placeholder="Enter SC rate"/>
              {form.sc_rate && num(form.sc_rate) >= num(boqItem.rate) && (
                <p className="text-[10px] text-red-500 mt-0.5 font-semibold">
                  ⚠ SC rate ≥ client rate — loss making!
                </p>
              )}
            </div>
          </div>

          {/* Live margin preview */}
          {form.sc_rate && form.allocated_qty > 0 && (
            <div className={clsx('rounded-xl p-4 border-2', mc.bg, marginPct < 0 ? 'border-red-300' : 'border-emerald-300')}>
              <p className={clsx('text-[10px] font-bold uppercase tracking-widest mb-2', mc.text)}>Live Margin Preview</p>
              <div className="grid grid-cols-3 gap-3">
                {[
                  ['Client Amount', fmt(clientAmt), 'text-slate-800'],
                  ['SC Amount',     fmt(scAmt),     mc.text],
                  ['Margin',        `${fmt(margin)} (${pct(marginPct)})`, mc.text],
                ].map(([l,v,c])=>(
                  <div key={l}><p className="text-[9px] text-slate-500 uppercase font-bold">{l}</p>
                  <p className={clsx('text-sm font-bold', c)}>{v}</p></div>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Notes</label>
            <textarea value={form.notes} onChange={e=>set('notes',e.target.value)} rows={2}
              className={inp+' resize-none'} placeholder="Optional notes…"/>
          </div>
        </div>

        <div className="flex justify-end gap-3 px-5 py-4 border-t bg-slate-50/60">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600">Cancel</button>
          <button onClick={()=>mut.mutate()} disabled={!canSave || mut.isPending}
            className="px-5 py-2 text-white text-sm font-bold rounded-lg disabled:opacity-40"
            style={{background:`linear-gradient(135deg, ${Theme.navyLight} 0%, ${Theme.navyDark} 100%)`}}>
            {mut.isPending ? (isEdit ? 'Updating…' : 'Creating…') : (isEdit ? 'Update Allocation' : 'Create Allocation')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Own-Team Cost Modal ──────────────────────────────────────────────────────
function OwnTeamCostModal({ mappingId, boqItem, onClose }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    cost_date:  new Date().toISOString().slice(0, 10),
    cost_type:  'labour',
    description: '',
    qty:        1,
    rate:       '',
    floor_ref:  '',
    remarks:    '',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const { data, isLoading } = useQuery({
    queryKey: ['own-team-costs', mappingId],
    queryFn:  () => boqMappingAPI.listOwnCosts(mappingId).then(r => r.data),
    staleTime: 0,
    enabled: !!mappingId,
  });
  const costs     = data?.data || [];
  const totalCost = parseFloat(data?.total_cost || 0);
  const amount    = num(form.qty) * num(form.rate);

  const mut = useMutation({
    mutationFn: () => boqMappingAPI.addOwnCost({
      mapping_id:  mappingId,
      cost_date:   form.cost_date,
      cost_type:   form.cost_type,
      description: form.description,
      qty:         num(form.qty),
      rate:        num(form.rate),
      floor_ref:   form.floor_ref || undefined,
      remarks:     form.remarks   || undefined,
    }),
    onSuccess: () => {
      toast.success('Cost recorded');
      qc.invalidateQueries({ queryKey: ['own-team-costs', mappingId] });
      qc.invalidateQueries({ queryKey: ['boq-mappings'] });
      setForm(f => ({ ...f, description: '', qty: 1, rate: '', floor_ref: '', remarks: '' }));
    },
    onError: e => toast.error(e?.response?.data?.error || 'Failed to record cost'),
  });

  const canSave = form.description && form.rate && num(form.rate) > 0;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4"
          style={{background:`linear-gradient(135deg, ${Theme.navy} 0%, ${Theme.navyDark} 100%)`}}>
          <div>
            <p className="font-bold text-white text-sm">Own-Team Cost Tracking</p>
            <p className="text-[11px] mt-0.5 text-white/65">
              {boqItem.item_no} · {boqDesc(boqItem).slice(0, 60)}
            </p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-white bg-white/10">
            <X className="w-4 h-4"/>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Total */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center justify-between">
            <span className="text-sm font-bold text-amber-800">Total Cost Recorded</span>
            <span className="text-lg font-bold text-amber-700">{fmt(totalCost)}</span>
          </div>

          {/* Add cost form */}
          <div className="border border-slate-200 rounded-xl p-4 space-y-3">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Record New Cost</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Date</label>
                <input type="date" value={form.cost_date} onChange={e=>set('cost_date',e.target.value)} className={inp}/>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Cost Type</label>
                <select value={form.cost_type} onChange={e=>set('cost_type',e.target.value)} className={inp}>
                  <option value="labour">Labour</option>
                  <option value="material">Material</option>
                  <option value="equipment">Equipment</option>
                  <option value="overhead">Overhead</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Description *</label>
              <input value={form.description} onChange={e=>set('description',e.target.value)}
                className={inp} placeholder="e.g. Mason labour — 2nd floor slab"/>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Qty</label>
                <input type="number" value={form.qty} min={0} onChange={e=>set('qty',e.target.value)} className={inp}/>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Rate (₹) *</label>
                <input type="number" value={form.rate} min={0} onChange={e=>set('rate',e.target.value)}
                  className={inp} placeholder="0"/>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Amount</label>
                <div className="border border-slate-100 rounded-lg px-3 py-2 text-sm font-bold text-slate-700 bg-slate-50">
                  {fmt(amount)}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Floor / Location</label>
                <input value={form.floor_ref} onChange={e=>set('floor_ref',e.target.value)}
                  className={inp} placeholder="e.g. 2nd Floor, Block A"/>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Remarks</label>
                <input value={form.remarks} onChange={e=>set('remarks',e.target.value)}
                  className={inp} placeholder="Optional"/>
              </div>
            </div>
            <div className="flex justify-end">
              <button onClick={()=>mut.mutate()} disabled={!canSave || mut.isPending}
                className="px-4 py-2 text-white text-sm font-bold rounded-lg disabled:opacity-40"
                style={{background:`linear-gradient(135deg, ${Theme.navyLight} 0%, ${Theme.navyDark} 100%)`}}>
                {mut.isPending ? 'Saving…' : '+ Record Cost'}
              </button>
            </div>
          </div>

          {/* Cost history */}
          <div>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2">
              Cost History ({costs.length})
            </p>
            {isLoading && <div className="h-16 bg-slate-100 rounded-xl animate-pulse"/>}
            {!isLoading && costs.length === 0 && (
              <div className="text-center py-8 text-slate-400 text-sm">No costs recorded yet</div>
            )}
            {!isLoading && costs.length > 0 && (
              <div className="space-y-2">
                {costs.map(c => (
                  <div key={c.id} className="flex items-start justify-between bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-slate-800">{c.description}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {c.cost_date?.slice(0,10)} · <span className="capitalize">{c.cost_type}</span>
                        {c.floor_ref && ` · ${c.floor_ref}`}
                        {c.recorded_by_name && ` · by ${c.recorded_by_name}`}
                      </p>
                      {c.remarks && <p className="text-[10px] text-slate-400 mt-0.5 italic">{c.remarks}</p>}
                    </div>
                    <div className="text-right ml-4 flex-shrink-0">
                      <p className="text-sm font-bold text-slate-800">{fmt(c.amount)}</p>
                      <p className="text-[10px] text-slate-400">{c.qty} × ₹{c.rate}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end px-5 py-4 border-t bg-slate-50/60">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Link Existing WO Modal ───────────────────────────────────────────────────
function ExistingWOLinkModal({ projectId, boqItems, onClose }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ wo_item_id: '', boq_item_id: '', allocated_qty: '', notes: '' });
  const [search, setSearch] = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const { data: woItems = [], isLoading } = useQuery({
    queryKey: ['boq-unlinked-wo-items', projectId],
    queryFn: async () => {
      await scAPI.listWO({ project_id: projectId }).catch(() => null);
      const r = await boqMappingAPI.unlinkedWOItems(projectId);
      return r.data?.data || [];
    },
    enabled: !!projectId,
    staleTime: 0,
  });

  const selectedWO  = woItems.find(i => i.wo_item_id === form.wo_item_id);
  const selectedBOQ = boqItems.find(i => i.boq_item_id === form.boq_item_id);
  const woAmount    = num(selectedWO?.qty || 0) * num(selectedWO?.rate || 0);
  const boqAmount   = num(selectedBOQ?.client_qty || 0) * num(selectedBOQ?.client_rate || 0);
  const margin      = boqAmount - woAmount;
  const marginPct   = boqAmount > 0 ? (margin / boqAmount) * 100 : 0;
  const mc          = marginColor(marginPct);

  const filteredBOQ = boqItems.filter(i => !search ||
    [i.item_no, boqDesc(i), i.chapter_name].some(v => v?.toLowerCase().includes(search.toLowerCase())));

  const mut = useMutation({
    mutationFn: () => boqMappingAPI.linkExistingWOItem({
      wo_item_id:   form.wo_item_id,
      boq_item_id:  form.boq_item_id,
      notes:         form.notes,
    }),
    onSuccess: () => {
      toast.success('WO linked to BOQ by amount');
      qc.invalidateQueries({ queryKey: ['boq-mappings', projectId] });
      qc.invalidateQueries({ queryKey: ['boq-unlinked-wo-items', projectId] });
      qc.invalidateQueries({ queryKey: ['boq-balance'] });
      onClose();
    },
    onError: e => toast.error(e?.response?.data?.error || 'Failed to link WO'),
  });

  const canSave = form.wo_item_id && form.boq_item_id && woAmount > 0;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4"
          style={{background:`linear-gradient(135deg, ${Theme.navy} 0%, ${Theme.navyDark} 100%)`}}>
          <div>
            <p className="font-bold text-white text-sm">Link Existing Work Order to BOQ</p>
            <p className="text-[11px] mt-0.5 text-white/65">Use already-created SC WOs for margin tracking</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-white bg-white/10">
            <X className="w-4 h-4"/>
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[72vh] overflow-y-auto">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Existing WO Item *</label>
              <select value={form.wo_item_id} onChange={e => {
                const item = woItems.find(i => i.wo_item_id === e.target.value);
                setForm(f => ({ ...f, wo_item_id: e.target.value, allocated_qty: item?.qty || '' }));
              }} className={inp}>
                <option value="">Select WO item...</option>
                {isLoading && <option>Loading...</option>}
                {woItems.map(i => (
                  <option key={i.wo_item_id} value={i.wo_item_id}>
                    {i.wo_number} - {i.sc_name} - {i.description?.slice(0, 80)}
                  </option>
                ))}
              </select>
              {selectedWO && (
                <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
                  <p className="font-bold text-slate-800">{selectedWO.wo_number} - {selectedWO.sc_name}</p>
                  <p className="text-slate-600 mt-1">{selectedWO.description}</p>
                  <p className="mt-2 font-semibold text-slate-700">
                    Qty: {selectedWO.qty || 0} {selectedWO.unit || ''} | WO Rate: {fmt2(selectedWO.rate)} | Amount: {fmt(selectedWO.amount)}
                  </p>
                </div>
              )}
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Search BOQ</label>
              <input value={search} onChange={e => setSearch(e.target.value)} className={inp} placeholder="Search BOQ item/code..."/>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-3 mb-1.5">Client BOQ Item *</label>
              <select value={form.boq_item_id} onChange={e => set('boq_item_id', e.target.value)} className={inp}>
                <option value="">Select BOQ item...</option>
                {filteredBOQ.map(i => (
                  <option key={i.boq_item_id} value={i.boq_item_id}>
                    {i.item_no} - {boqDesc(i).slice(0, 90)}
                  </option>
                ))}
              </select>
              {selectedBOQ && (
                <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
                  <p className="font-bold text-slate-800">{selectedBOQ.item_no}</p>
                  <p className="text-slate-600 mt-1">{boqDesc(selectedBOQ)}</p>
                  <p className="mt-2 font-semibold text-slate-700">
                    BOQ Qty: {selectedBOQ.client_qty || 0} {selectedBOQ.unit || ''} | Client Rate: {fmt2(selectedBOQ.client_rate)}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Remarks (Optional)</label>
            <input value={form.notes} onChange={e => set('notes', e.target.value)} className={inp} placeholder="e.g., Partial allocation, split coverage, etc."/>
          </div>

          {selectedWO && selectedBOQ && woAmount > 0 && (
            <div className={clsx('rounded-xl p-4 border-2', mc.bg, marginPct < 0 ? 'border-red-300' : 'border-emerald-300')}>
              <p className={clsx('text-[10px] font-bold uppercase tracking-widest mb-3', mc.text)}>Amount-Based Linking</p>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center">
                  <p className="text-[9px] text-slate-500 uppercase font-bold mb-1">BOQ Amount</p>
                  <p className="text-lg font-bold text-slate-800">{fmt(boqAmount)}</p>
                  <p className="text-[9px] text-slate-500 mt-1">Total BOQ value</p>
                </div>
                <div className="text-center">
                  <p className="text-[9px] text-slate-500 uppercase font-bold mb-1">WO Amount</p>
                  <p className="text-lg font-bold text-emerald-700">{fmt(woAmount)}</p>
                  <p className="text-[9px] text-slate-500 mt-1">This WO value</p>
                </div>
                <div className="text-center">
                  <p className="text-[9px] text-slate-500 uppercase font-bold mb-1">Margin</p>
                  <p className={clsx('text-lg font-bold', mc.text)}>{fmt(margin)}</p>
                  <p className={clsx('text-[9px] mt-1', mc.text)}>{pct(marginPct)}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 px-5 py-4 border-t bg-slate-50/60">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600">Cancel</button>
          <button onClick={() => mut.mutate()} disabled={!canSave || mut.isPending}
            className="px-5 py-2 text-white text-sm font-bold rounded-lg disabled:opacity-40"
            style={{background:`linear-gradient(135deg, ${Theme.navyLight} 0%, ${Theme.navyDark} 100%)`}}>
            {mut.isPending ? 'Linking...' : 'Link & Update Margin'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function BOQMappingPage() {
  const qc = useQueryClient();
  const [projectId,  setProjectId]  = useState('');
  const [search,     setSearch]     = useState('');
  const [collapsed,  setCollapsed]  = useState({});
  const [allocModal, setAllocModal] = useState(null); // { boqItem, balance } — create
  const [editModal,  setEditModal]  = useState(null); // { boqItem, balance, existing } — edit
  const [costModal,  setCostModal]  = useState(null); // { mappingId, boqItem } — own-team costs
  const [showWOLink, setShowWOLink] = useState(false);

  const { data: projects=[] } = useQuery({ queryKey:['projects'], queryFn:()=>projectAPI.list().then(r=>r.data?.data??[]) });
  const { data: scList=[]   } = useQuery({ queryKey:['sc-list-all'], queryFn:()=>scAPI.listSC().then(r=>r.data?.data||[]), staleTime:0 });

  const { data: register=[], isLoading, refetch } = useQuery({
    queryKey: ['boq-mappings', projectId],
    queryFn:  () => boqMappingAPI.marginRegister(projectId).then(r=>r.data?.data||[]),
    staleTime: 0, enabled: !!projectId,
  });

  const cancelMut = useMutation({
    mutationFn: id => boqMappingAPI.cancelMapping(id),
    onSuccess: () => { toast.success('Allocation cancelled'); qc.invalidateQueries({queryKey:['boq-mappings']}); qc.invalidateQueries({queryKey:['boq-balance']}); },
    onError: e => toast.error(e?.response?.data?.error||'Failed'),
  });
  const confirmMut = useMutation({
    mutationFn: id => boqMappingAPI.confirmMapping(id),
    onSuccess: () => { toast.success('Allocation confirmed'); qc.invalidateQueries({queryKey:['boq-mappings']}); },
    onError: e => toast.error(e?.response?.data?.error||'Failed'),
  });
  const createWOMut = useMutation({
    mutationFn: id => boqMappingAPI.createWOFromMap(id),
    onSuccess: (r) => { toast.success(`Work Order ${r.data.data.wo.wo_number} created`); qc.invalidateQueries({queryKey:['boq-mappings']}); },
    onError: e => toast.error(e?.response?.data?.error||'Failed'),
  });

  // Group register by chapter
  const grouped = useMemo(() => {
    const filtered = register.filter(r => !search ||
      [r.item_no, boqDesc(r), r.chapter_name].some(v=>v?.toLowerCase().includes(search.toLowerCase())));
    const chapters = {};
    for (const item of filtered) {
      const ch = item.chapter_name || 'General';
      if (!chapters[ch]) chapters[ch] = { name: ch, items: [], totals: { clientAmt:0, scAmt:0, margin:0 } };
      chapters[ch].items.push(item);
      chapters[ch].totals.clientAmt += num(item.client_amount);
      chapters[ch].totals.scAmt    += num(item.sc_amount);
      chapters[ch].totals.margin   += num(item.margin_amount);
    }
    return Object.values(chapters);
  }, [register, search]);

  const totals = useMemo(() => ({
    clientAmt: register.reduce((s,r)=>s+num(r.client_amount),0),
    scAmt:     register.reduce((s,r)=>s+num(r.sc_amount),0),
    margin:    register.reduce((s,r)=>s+num(r.margin_amount),0),
    items:     register.length,
    mapped:    register.filter(r=>r.allocations?.filter(Boolean).length>0).length,
  }), [register]);

  const exportExcel = () => {
    const rows = [];
    for (const item of register) {
      const allocs = (item.allocations||[]).filter(Boolean);
      if (!allocs.length) {
        rows.push({ 'BOQ No.':item.item_no,'Description':boqDesc(item),'Unit':item.unit,
          'Client Qty':item.client_qty,'Client Rate':item.client_rate,'Client Amount':item.client_amount,
          'SC Vendor':'— Not mapped —','SC Qty':'','SC Rate':'','SC Amount':'','Advance Paid':'','Billed Amt':'','Balance':'',
          'Margin ₹':'','Margin %':'' });
      } else {
        for (const a of allocs) {
          const allocated_amt = num(a.allocated_qty) * num(a.sc_rate);
          const advance_paid = num(a.advance_paid) || 0;
          const billed_amt = num(a.billed_amount) || 0;
          const balance = allocated_amt - advance_paid - billed_amt;
          rows.push({ 'BOQ No.':item.item_no,'Description':boqDesc(item),'Unit':item.unit,
            'Client Qty':item.client_qty,'Client Rate':item.client_rate,'Client Amount':item.client_amount,
            'SC Vendor':a.sc_name,'SC Qty':a.allocated_qty,'SC Rate':a.sc_rate,'SC Amount':a.sc_amount,
            'Advance Paid':advance_paid,'Billed Amt':billed_amt,'Balance':balance,
            'Margin ₹':a.margin_amount,'Margin %':item.margin_pct });
        }
      }
    }
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'BOQ Mapping');
    XLSX.writeFile(wb, `BOQ_SC_Mapping_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  return (
    <div style={{ background: Theme.pageBg, minHeight:'100vh' }}>
      <PageHeader
        title="BOQ SC Mapping — Margin Register"
        subtitle="Client BOQ vs Subcontractor allocation — track revenue, cost and margin per item"
        breadcrumbs={[{label:'QS & Billing'},{label:'BOQ SC Mapping'}]}
        actions={
          <div className="flex items-center gap-2">
            <button onClick={() => setShowWOLink(true)} disabled={!projectId}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg transition disabled:opacity-50"
              style={{background:'rgba(255,255,255,0.16)',border:'1px solid rgba(255,255,255,0.25)',color:'#fff'}}>
              <Link2 className="w-3.5 h-3.5"/> Link Existing WO
            </button>
            <button onClick={exportExcel} disabled={!projectId || !register.length}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg transition"
              style={{background:'rgba(255,255,255,0.12)',border:'1px solid rgba(255,255,255,0.25)',color:'#fff'}}>
              <Download className="w-3.5 h-3.5"/> Export Excel
            </button>
          </div>
        }
      />

      <div className="p-5 md:p-6 max-w-[1600px] mx-auto space-y-5">

        {/* Project selector + search */}
        <div className="flex flex-wrap gap-3">
          <select value={projectId} onChange={e=>setProjectId(e.target.value)}
            className="border border-slate-200 bg-white rounded-xl px-3 py-2 text-sm shadow-sm focus:outline-none min-w-64">
            <option value="">— Select Project —</option>
            {projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {projectId && (
            <div className="relative flex-1 min-w-52">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400"/>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search BOQ items…"
                className="pl-9 pr-3 py-2 border border-slate-200 bg-white rounded-xl text-sm w-full focus:outline-none shadow-sm"/>
            </div>
          )}
          {projectId && (
            <button onClick={()=>refetch()} className="p-2 border border-slate-200 bg-white rounded-xl hover:bg-slate-50 shadow-sm">
              <RefreshCw className="w-4 h-4 text-slate-500"/>
            </button>
          )}
        </div>

        {!projectId && (
          <div className="bg-white rounded-2xl border border-slate-200 py-20 text-center shadow-sm">
            <Layers className="w-12 h-12 text-slate-200 mx-auto mb-4"/>
            <p className="text-slate-500 font-semibold">Select a project to view the BOQ Mapping Register</p>
            <p className="text-xs text-slate-400 mt-1">Compare client BOQ rates with subcontractor rates and track margin</p>
          </div>
        )}

        {projectId && isLoading && (
          <div className="space-y-2">{[1,2,3].map(n=><div key={n} className="h-12 bg-white border border-slate-200 rounded-xl animate-pulse"/>)}</div>
        )}

        {projectId && !isLoading && register.length > 0 && (
          <>
            {/* Summary KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <ThemeKpiCard icon={IndianRupee} label="Client BOQ Value"  value={fmt(totals.clientAmt)} color="blue"    sub="Total revenue"/>
              <ThemeKpiCard icon={IndianRupee} label="SC Committed"      value={fmt(totals.scAmt)}     color="orange"  sub="Total SC cost"/>
              <ThemeKpiCard icon={IndianRupee} label="Net Margin"        value={fmt(totals.margin)}    color={totals.margin>=0?"emerald":"red"} sub={pct(totals.clientAmt>0?(totals.margin/totals.clientAmt)*100:0)+' margin'}/>
              <ThemeKpiCard icon={CheckCircle2} label="Mapped Items"     value={`${totals.mapped}/${totals.items}`} color="teal"   sub="BOQ items allocated"/>
              <ThemeKpiCard icon={AlertTriangle} label="Unmapped Items"  value={totals.items-totals.mapped} color="amber" sub="Need SC allocation"/>
            </div>

            {/* Chapter-grouped table */}
            {grouped.map(chapter => {
              const isOpen = !collapsed[chapter.name];
              const chMarginPct = chapter.totals.clientAmt > 0
                ? (chapter.totals.margin / chapter.totals.clientAmt) * 100 : 0;
              const cmc = marginColor(chMarginPct);
              return (
                <div key={chapter.name} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                  {/* Chapter header */}
                  <button onClick={()=>setCollapsed(c=>({...c,[chapter.name]:!c[chapter.name]}))}
                    className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-colors"
                    style={{background:`linear-gradient(90deg, ${Theme.navy}08 0%, transparent 100%)`}}>
                    <div className="flex items-center gap-3">
                      {isOpen ? <ChevronDown className="w-4 h-4 text-slate-400"/> : <ChevronRight className="w-4 h-4 text-slate-400"/>}
                      <span className="font-bold text-slate-800 text-sm">{chapter.name}</span>
                      <span className="text-[11px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{chapter.items.length} items</span>
                    </div>
                    <div className="flex items-center gap-6 text-xs">
                      <span className="text-slate-500">Client: <span className="font-bold text-slate-800">{fmt(chapter.totals.clientAmt)}</span></span>
                      <span className="text-slate-500">SC: <span className="font-bold text-orange-700">{fmt(chapter.totals.scAmt)}</span></span>
                      <span className={clsx('px-2 py-0.5 rounded-full font-bold', cmc.bg, cmc.text)}>
                        Margin: {fmt(chapter.totals.margin)} ({pct(chMarginPct)})
                      </span>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr style={{background:`linear-gradient(90deg, ${Theme.navy} 0%, ${Theme.navyDark} 100%)`}}>
                            {['BOQ No.','Description','Unit','Client Qty','Client Rate','Client Amt',
                              'SC Vendor','SC Qty','SC Rate','SC Amt','Advance Paid','Billed Amt','Balance','Margin ₹','Margin %','Actions'].map(h=>(
                              <th key={h} className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-white/80 whitespace-nowrap">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {chapter.items.map((item, ii) => {
                            const allocs    = (item.allocations||[]).filter(Boolean);
                            const allocated = allocs.reduce((s,a)=>s+num(a.allocated_qty),0);
                            const balance   = num(item.client_qty) - allocated;
                            const imc       = marginColor(num(item.margin_pct));

                            if (!allocs.length) {
                              return (
                                <tr key={item.boq_item_id} className={clsx('border-b border-slate-50', ii%2===0?'bg-white':'bg-amber-50/30')}>
                                  <td className="px-3 py-2.5 font-mono text-xs font-bold text-slate-600">{item.item_no}</td>
                                  <td className="px-3 py-2.5 max-w-[200px] text-slate-700 font-medium truncate">{boqDesc(item)}</td>
                                  <td className="px-3 py-2.5 text-slate-500">{item.unit}</td>
                                  <td className="px-3 py-2.5 text-right">{item.client_qty}</td>
                                  <td className="px-3 py-2.5 text-right font-mono">{fmt2(item.client_rate)}</td>
                                  <td className="px-3 py-2.5 text-right font-semibold">{fmt(item.client_amount)}</td>
                                  <td colSpan={7} className="px-3 py-2.5 text-center">
                                    <span className="text-amber-600 font-semibold flex items-center gap-1 justify-center">
                                      <AlertTriangle className="w-3.5 h-3.5"/> Not allocated
                                    </span>
                                  </td>
                                  <td className="px-3 py-2.5"/>
                                  <td className="px-3 py-2.5">
                                    <button
                                      onClick={()=>setAllocModal({
                                        boqItem:{...item,id:item.boq_item_id,rate:item.client_rate,description:boqDesc(item),quantity:item.client_qty},
                                        balance: num(item.client_qty)
                                      })}
                                      className="flex items-center gap-1 px-2.5 py-1 bg-indigo-600 text-white rounded-lg text-[10px] font-bold hover:bg-indigo-700">
                                      <Plus className="w-3 h-3"/> Allocate
                                    </button>
                                  </td>
                                </tr>
                              );
                            }

                            return allocs.map((alloc, ai) => {
                              const allocated_amt = num(alloc.allocated_qty) * num(alloc.sc_rate);
                              const advance_paid = num(alloc.advance_paid) || 0;
                              const billed_amt = num(alloc.billed_amount) || 0;
                              const balance = allocated_amt - advance_paid - billed_amt;
                              const isOverBilled = billed_amt > allocated_amt + 0.01;

                              const amc = marginColor(
                                alloc.margin_amount > 0 && num(alloc.sc_amount) > 0
                                  ? (alloc.margin_amount / (num(alloc.allocated_qty)*num(item.client_rate)))*100 : 0
                              );
                              const canCancel  = alloc.status === 'draft' || alloc.status === 'confirmed';
                              const canEdit    = alloc.status === 'draft';
                              const canConfirm = alloc.status === 'draft' && !alloc.wo_id;
                              const canCreateWO = (alloc.status === 'draft' || alloc.status === 'confirmed') && !alloc.wo_id && alloc.execution_type !== 'own_team';

                              return (
                                <tr key={alloc.id} className={clsx('border-b border-slate-50', ai===0 && ii%2===0?'bg-white':ai===0?'bg-slate-50/30':'bg-blue-50/20')}>
                                  {ai === 0 ? (
                                    <>
                                      <td className="px-3 py-2.5 font-mono text-xs font-bold text-indigo-700">{item.item_no}</td>
                                      <td className="px-3 py-2.5 max-w-[200px] text-slate-700 font-medium truncate">{boqDesc(item)}</td>
                                      <td className="px-3 py-2.5 text-slate-500">{item.unit}</td>
                                      <td className="px-3 py-2.5 text-right">{item.client_qty}</td>
                                      <td className="px-3 py-2.5 text-right font-mono">{fmt2(item.client_rate)}</td>
                                      <td className="px-3 py-2.5 text-right font-semibold">{fmt(item.client_amount)}</td>
                                    </>
                                  ) : (
                                    <td colSpan={6} className="px-3 py-2.5">
                                      <span className="text-[10px] text-slate-400 italic pl-2">↳ split allocation</span>
                                    </td>
                                  )}
                                  <td className="px-3 py-2.5">
                                    <p className="font-semibold text-slate-800 text-[11px]">{alloc.sc_name}</p>
                                    {alloc.wo_number && <p className="text-[9px] font-mono text-slate-500 mt-0.5">{alloc.wo_number}</p>}
                                    <span className={clsx('text-[9px] px-1.5 py-0.5 rounded-full font-bold',
                                      alloc.execution_type==='own_team'?'bg-blue-100 text-blue-700':'bg-orange-100 text-orange-700')}>
                                      {alloc.execution_type==='own_team'?'Own Team':'SC'}
                                    </span>
                                    {alloc.status==='confirmed' && (
                                      <span className="ml-1 text-[9px] px-1.5 py-0.5 rounded-full font-bold bg-blue-100 text-blue-700">
                                        Confirmed
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2.5 text-right font-mono">{alloc.allocated_qty}</td>
                                  <td className="px-3 py-2.5 text-right font-mono">{fmt2(alloc.sc_rate)}</td>
                                  <td className="px-3 py-2.5 text-right font-semibold text-orange-700">{fmt(alloc.sc_amount)}</td>
                                  <td className="px-3 py-2.5 text-right font-semibold text-purple-600">{fmt(advance_paid)}</td>
                                  <td className={clsx('px-3 py-2.5 text-right font-semibold', isOverBilled ? 'text-red-600 bg-red-50' : 'text-green-600')}>{fmt(billed_amt)}</td>
                                  <td className={clsx('px-3 py-2.5 text-right font-bold', balance < 0 ? 'text-red-600' : 'text-emerald-600')}>{fmt(balance)}</td>
                                  <td className={clsx('px-3 py-2.5 text-right font-bold', amc.text)}>{fmt(alloc.margin_amount)}</td>
                                  <td className="px-3 py-2.5">
                                    {ai === allocs.length - 1 && (
                                      <span className={clsx('text-[10px] px-2 py-0.5 rounded-full font-bold', imc.bg, imc.text)}>
                                        {pct(item.margin_pct)}
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2.5">
                                    <div className="flex gap-1 items-center flex-wrap">
                                      {/* Edit — draft only */}
                                      {canEdit && (
                                        <button
                                          title="Edit allocation"
                                          onClick={()=>setEditModal({
                                            boqItem:{...item,id:item.boq_item_id,rate:item.client_rate,description:boqDesc(item),quantity:item.client_qty},
                                            balance: balance + num(alloc.allocated_qty),
                                            existing: alloc,
                                          })}
                                          className="p-1 text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 rounded">
                                          <Edit2 className="w-3 h-3"/>
                                        </button>
                                      )}
                                      {/* Confirm — draft, no WO yet */}
                                      {canConfirm && (
                                        <button
                                          onClick={()=>confirmMut.mutate(alloc.id)}
                                          disabled={confirmMut.isPending}
                                          title="Confirm allocation"
                                          className="px-2 py-0.5 bg-blue-600 text-white rounded text-[10px] font-bold hover:bg-blue-700 disabled:opacity-40">
                                          Confirm
                                        </button>
                                      )}
                                      {/* Create WO — draft or confirmed, no wo yet, not own_team */}
                                      {canCreateWO && (
                                        <button
                                          onClick={()=>createWOMut.mutate(alloc.id)}
                                          disabled={createWOMut.isPending}
                                          className="px-2 py-0.5 bg-emerald-600 text-white rounded text-[10px] font-bold hover:bg-emerald-700 disabled:opacity-40">
                                          +WO
                                        </button>
                                      )}
                                      {/* WO issued badge */}
                                      {alloc.wo_id && (
                                        <span className="px-2 py-0.5 bg-teal-100 text-teal-700 rounded text-[10px] font-bold">WO ✓</span>
                                      )}
                                      {/* Own-team cost tracking */}
                                      {alloc.execution_type === 'own_team' && (
                                        <button
                                          title="Track own-team costs"
                                          onClick={()=>setCostModal({
                                            mappingId: alloc.id,
                                            boqItem: {...item, id:item.boq_item_id, description:boqDesc(item)},
                                          })}
                                          className="p-1 text-amber-500 hover:text-amber-700 hover:bg-amber-50 rounded">
                                          <IndianRupee className="w-3 h-3"/>
                                        </button>
                                      )}
                                      {/* Cancel — draft or confirmed (not wo_issued) */}
                                      {canCancel && !alloc.wo_id && (
                                        <button
                                          onClick={()=>{ if(window.confirm('Cancel this allocation?')) cancelMut.mutate(alloc.id); }}
                                          className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded">
                                          <X className="w-3 h-3"/>
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            });
                          })}

                          {/* Add another allocation row if balance remains */}
                          {chapter.items.map(item => {
                            const allocs    = (item.allocations||[]).filter(Boolean);
                            const allocated = allocs.reduce((s,a)=>s+num(a.allocated_qty),0);
                            const balance   = num(item.client_qty) - allocated;
                            if (allocs.length > 0 && balance > 0.001) {
                              return (
                                <tr key={`add-${item.boq_item_id}`} className="border-b border-slate-50 bg-indigo-50/20">
                                  <td colSpan={13} className="px-3 py-2">
                                    <button
                                      onClick={()=>setAllocModal({
                                        boqItem:{...item,id:item.boq_item_id,rate:item.client_rate,description:boqDesc(item),quantity:item.client_qty},
                                        balance
                                      })}
                                      className="flex items-center gap-1 text-indigo-600 text-[11px] font-semibold hover:text-indigo-800">
                                      <Plus className="w-3 h-3"/> Add another allocation — {Number(balance).toFixed(3)} {item.unit} remaining
                                    </button>
                                  </td>
                                </tr>
                              );
                            }
                            return null;
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Grand total */}
            <div className="bg-slate-900 rounded-xl p-4 flex items-center justify-between">
              <span className="font-bold text-white text-sm uppercase tracking-wider">Grand Total</span>
              <div className="flex items-center gap-6 text-sm">
                <span className="text-slate-400">Client: <span className="font-bold text-white font-mono">{fmt(totals.clientAmt)}</span></span>
                <span className="text-slate-400">SC Cost: <span className="font-bold text-orange-400 font-mono">{fmt(totals.scAmt)}</span></span>
                <span className={clsx('font-bold font-mono text-base', totals.margin>=0?'text-emerald-400':'text-red-400')}>
                  Margin: {fmt(totals.margin)} ({pct(totals.clientAmt>0?(totals.margin/totals.clientAmt)*100:0)})
                </span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Modals */}
      {allocModal && (
        <AllocationModal
          boqItem={allocModal.boqItem}
          balance={allocModal.balance}
          scList={scList}
          onClose={()=>setAllocModal(null)}
        />
      )}
      {editModal && (
        <AllocationModal
          boqItem={editModal.boqItem}
          balance={editModal.balance}
          scList={scList}
          existing={editModal.existing}
          onClose={()=>setEditModal(null)}
        />
      )}
      {costModal && (
        <OwnTeamCostModal
          mappingId={costModal.mappingId}
          boqItem={costModal.boqItem}
          onClose={()=>setCostModal(null)}
        />
      )}
      {showWOLink && projectId && (
        <ExistingWOLinkModal
          projectId={projectId}
          boqItems={register}
          onClose={() => setShowWOLink(false)}
        />
      )}
    </div>
  );
}
