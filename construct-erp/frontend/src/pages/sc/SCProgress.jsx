// src/pages/sc/SCProgress.jsx — Measurement Book (MB) Entry & Approval
import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { scAPI, projectAPI } from '../../api/client';
import useAuthStore from '../../store/authStore';
import { PageHeader, KpiCard as ThemeKpiCard, Theme } from '../../theme';
import {
  Plus, Search, RefreshCw, X, Eye, CheckCircle2,
  Clock, FileText, MapPin, Layers, Send, ThumbsUp,
  ThumbsDown, ChevronRight, BookOpen, Trash2, ChevronLeft, Link2,
} from 'lucide-react';
import SCMeasurementBook from './mb/SCMeasurementBook';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import dayjs from 'dayjs';

const num = (v) => parseFloat(v||0);
const fmt = (n) => `₹${Number(n||0).toLocaleString('en-IN',{maximumFractionDigits:0})}`;
const inp = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 transition';

const STATUS_META = {
  draft:     { bg:'bg-slate-100',   text:'text-slate-600',   label:'Draft' },
  submitted: { bg:'bg-blue-100',    text:'text-blue-700',    label:'Submitted' },
  checked:   { bg:'bg-amber-100',   text:'text-amber-700',   label:'Checked' },
  approved:  { bg:'bg-emerald-100', text:'text-emerald-700', label:'Approved' },
  rejected:  { bg:'bg-red-100',     text:'text-red-700',     label:'Rejected' },
};

const Field = ({ label, required, children }) => (
  <div>
    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
      {label}{required && <span className="text-red-400 ml-0.5">*</span>}
    </label>
    {children}
  </div>
);

function MBForm({ onClose }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    wo_id:'', wo_item_id:'', mb_date: dayjs().format('YYYY-MM-DD'),
    tower_block:'', floor_number:'', location_detail:'', drawing_ref:'',
    description:'', unit:'', executed_qty:0, remarks:'',
  });
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const [woDetail, setWoDetail] = useState(null);

  const { data: wos=[] } = useQuery({
    queryKey:['sc-wo-active-mb'],
    // MB entries can be recorded against any WO regardless of workflow status
    // (draft/active/approved) — a status filter here was silently hiding WOs.
    queryFn:()=>scAPI.listWO({}).then(r=>r.data?.data||[]),
  });

  const loadWO = async (id) => {
    set('wo_id',id); set('wo_item_id',''); setWoDetail(null);
    if (!id) return;
    try { const r = await scAPI.getWO(id); setWoDetail(r.data?.data); }
    catch { toast.error('Failed to load WO'); }
  };

  const selectedItem = useMemo(()=>(woDetail?.items||[]).find(it=>it.id===form.wo_item_id),[woDetail,form.wo_item_id]);

  const createMut = useMutation({
    mutationFn: d => scAPI.createMB(d),
    onSuccess:()=>{ toast.success('MB entry created'); qc.invalidateQueries({queryKey:['sc-mb']}); onClose(); },
    onError:e=>toast.error(e?.response?.data?.error||'Failed'),
  });

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col overflow-hidden">
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-4"
          style={{background:`linear-gradient(135deg, ${Theme.navy} 0%, ${Theme.navyDark} 100%)`}}>
          <div>
            <h2 className="font-bold text-white text-base">New Measurement Book Entry</h2>
            <p className="text-xs mt-0.5" style={{color:'rgba(255,255,255,0.6)'}}>Record executed work quantities on site</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-white"
            style={{background:'rgba(255,255,255,0.10)',border:'1px solid rgba(255,255,255,0.20)'}}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-4">
          <div className="col-span-2">
            <Field label="Work Order" required>
              <select value={form.wo_id} onChange={e=>loadWO(e.target.value)} className={inp}>
                <option value="">— Select active work order —</option>
                {wos.map(w=><option key={w.id} value={w.id}>{w.wo_number} · {w.sc_name} · {w.project_name}</option>)}
              </select>
            </Field>
          </div>

          {woDetail && (
            <div>
              <Field label="BOQ Item">
                <select value={form.wo_item_id} onChange={e=>set('wo_item_id',e.target.value)} className={inp}>
                  <option value="">— Select BOQ item (optional) —</option>
                  {(woDetail.items||[]).map(it=>(
                    <option key={it.id} value={it.id}>
                      {it.description} · {it.unit} · Balance: {Math.max(0,num(it.qty)-num(it.billed_qty))}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          )}

          {selectedItem && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 grid grid-cols-4 gap-3">
              {[['WO Qty',selectedItem.qty],['Billed',selectedItem.billed_qty],['Balance',Math.max(0,num(selectedItem.qty)-num(selectedItem.billed_qty))],['Rate',`₹${selectedItem.rate}`]].map(([l,v])=>(
                <div key={l}><p className="text-[9px] text-indigo-400 uppercase font-bold">{l}</p><p className="text-sm font-bold text-indigo-900">{v}</p></div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Field label="MB Date"><input type="date" value={form.mb_date} onChange={e=>set('mb_date',e.target.value)} className={inp}/></Field>
            <Field label="Drawing Reference"><input value={form.drawing_ref} onChange={e=>set('drawing_ref',e.target.value)} className={inp} placeholder="DWG-001-A"/></Field>
            <Field label="Tower / Block"><input value={form.tower_block} onChange={e=>set('tower_block',e.target.value)} className={inp} placeholder="Tower A"/></Field>
            <Field label="Floor"><input value={form.floor_number} onChange={e=>set('floor_number',e.target.value)} className={inp} placeholder="Ground Floor"/></Field>
            <div className="col-span-2">
              <Field label="Location Detail"><input value={form.location_detail} onChange={e=>set('location_detail',e.target.value)} className={inp} placeholder="e.g. Column C1–C6, Grid 3–7"/></Field>
            </div>
            <div className="col-span-2">
              <Field label="Work Description" required>
                <input value={form.description} onChange={e=>set('description',e.target.value)} className={inp} placeholder="Describe work measured…"/>
              </Field>
            </div>
            <Field label="Executed Quantity" required>
              <input type="number" value={form.executed_qty} onChange={e=>set('executed_qty',e.target.value)} className={inp} min={0}/>
            </Field>
            <Field label="Unit">
              <select value={form.unit} onChange={e=>set('unit',e.target.value)} className={inp}>
                <option value="">Select unit</option>
                {['Sqm','Sqft','Cum','Rmt','Nos','Kg','MT','LS','Bags','Ltrs'].map(u=><option key={u}>{u}</option>)}
              </select>
            </Field>
            <div className="col-span-2">
              <Field label="Remarks"><textarea value={form.remarks} onChange={e=>set('remarks',e.target.value)} rows={2} className={inp+' resize-none'}/></Field>
            </div>
          </div>
        </div>

        <div className="flex-shrink-0 flex justify-end gap-3 px-6 py-4 border-t bg-slate-50/60">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-100">Cancel</button>
          <button onClick={()=>createMut.mutate(form)}
            disabled={!form.wo_id||!form.description||!form.executed_qty||createMut.isPending}
            className="px-5 py-2 text-white text-sm font-bold rounded-lg disabled:opacity-40"
            style={{background:`linear-gradient(135deg, ${Theme.navyLight} 0%, ${Theme.navyDark} 100%)`}}>
            {createMut.isPending?'Creating…':'Create MB Entry'}
          </button>
        </div>
    </div>
  );
}

function MBDrawer({ mbId, onClose }) {
  const qc = useQueryClient();
  const [comment, setComment] = useState('');
  const { data: mb, isLoading } = useQuery({
    queryKey:['sc-mb-detail', mbId],
    queryFn:()=>scAPI.getMB(mbId).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    staleTime:0, enabled:!!mbId,
  });

  // Fetch all approved MB entries for the same WO so we can show the count
  const { data: siblingMBs = [] } = useQuery({
    queryKey:['sc-mb-siblings', mb?.wo_id],
    queryFn:()=>scAPI.listMB({ wo_id: mb.wo_id, status: 'approved' }).then(r=>r.data?.data||[]),
    enabled: !!mb?.wo_id && mb?.status === 'approved',
    staleTime: 30_000,
  });
  const siblingCount = siblingMBs.length;
  const siblingTotalQty = siblingMBs.reduce((s,m)=>s+num(m.executed_qty),0);

  const mutOpts = (msg) => ({
    onSuccess:()=>{ toast.success(msg); qc.invalidateQueries({queryKey:['sc-mb']}); qc.invalidateQueries({queryKey:['sc-mb-detail',mbId]}); setComment(''); },
    onError:e=>toast.error(e?.response?.data?.error||'Failed'),
  });
  const submitMut  = useMutation({ mutationFn:()=>scAPI.submitMB(mbId), ...mutOpts('Submitted') });
  const checkMut   = useMutation({ mutationFn:()=>scAPI.checkMB(mbId,{remarks:comment}), ...mutOpts('Checked') });
  const approveMut = useMutation({ mutationFn:()=>scAPI.approveMB(mbId,{remarks:comment}), ...mutOpts('Approved') });
  const rejectMut  = useMutation({ mutationFn:()=>scAPI.rejectMB(mbId,{remarks:comment}), ...mutOpts('Rejected') });
  const deleteMut  = useMutation({
    mutationFn:()=>scAPI.deleteMB(mbId),
    onSuccess:()=>{ toast.success('MB entry deleted'); qc.invalidateQueries({queryKey:['sc-mb']}); onClose(); },
    onError:e=>toast.error(e?.response?.data?.error||'Failed to delete'),
  });
  const handleDelete = () => {
    if (window.confirm(`Delete ${mb?.mb_number}? This cannot be undone.`)) deleteMut.mutate();
  };

  const sm = STATUS_META[mb?.status] || STATUS_META.draft;

  const handleLinkToBill = () => {
    if (mb?.wo_id) {
      window.location.href = `/sc/bill-preparation?wo_id=${mb.wo_id}&open=1`;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{background: Theme.pageBg}}>
      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-6 py-4 flex-shrink-0 shadow-lg"
        style={{background:`linear-gradient(135deg, ${Theme.navy} 0%, ${Theme.navyDark} 100%)`}}>
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-white hover:bg-white/10 transition-colors">
            <ChevronLeft className="w-5 h-5"/>
          </button>
          <div>
            <p className="text-[10px] tracking-widest text-blue-300 uppercase">Measurement Book Entry</p>
            <p className="font-bold text-white text-base leading-tight">{mb?.mb_number||'…'}</p>
            <p className="text-[11px] mt-0.5" style={{color:'rgba(255,255,255,0.6)'}}>{mb?.sc_name} · {mb?.project_name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {mb?.status === 'approved' && (
            <button onClick={handleLinkToBill}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-white transition-colors"
              style={{background:'#10b981'}}>
              <Link2 className="w-4 h-4"/> Link to Bill
            </button>
          )}
          <button onClick={handleDelete} disabled={deleteMut.isPending} title="Delete MB entry"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white disabled:opacity-50 hover:bg-red-500/30 transition-colors" style={{background:'rgba(239,68,68,0.20)'}}>
            <Trash2 className="w-4 h-4"/>
          </button>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-white hover:bg-white/10 transition-colors">
            <X className="w-4 h-4"/>
          </button>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
          {isLoading ? (
            <div className="space-y-4">{[1,2,3,4].map(n=><div key={n} className="h-20 bg-white rounded-2xl animate-pulse shadow-sm"/>)}</div>
          ) : mb && (
            <>
              {/* Status + meta grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  {l:'Status',    v:<span className={clsx('text-xs px-2.5 py-1 rounded-full font-bold',sm.bg,sm.text)}>{sm.label}</span>},
                  {l:'MB Date',   v: dayjs(mb.mb_date).format('DD MMM YYYY')},
                  {l:'WO Number', v: mb.wo_number},
                  {l:'Project',   v: mb.project_name},
                ].map(({l,v})=>(
                  <div key={l} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">{l}</p>
                    <p className="text-sm font-semibold text-slate-800">{v}</p>
                  </div>
                ))}
              </div>

              {/* Measurement details card */}
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="px-5 py-3" style={{background:`linear-gradient(90deg, ${Theme.navy}ee 0%, ${Theme.navyDark}ee 100%)`}}>
                  <span className="text-sm font-bold text-white">Measurement Details</span>
                </div>
                <div className="p-5 space-y-3">
                  {[
                    {l:'Description',  v: mb.description},
                    {l:'Executed Qty', v:`${mb.executed_qty} ${mb.unit||''}`, bold:true, color:'text-emerald-700'},
                    {l:'Previous Qty', v:`${mb.previous_qty||0} ${mb.unit||''}`},
                    mb.tower_block     && {l:'Tower / Block', v: mb.tower_block},
                    mb.floor_number    && {l:'Floor',         v: mb.floor_number},
                    mb.location_detail && {l:'Location',      v: mb.location_detail},
                    mb.drawing_ref     && {l:'Drawing Ref',   v: mb.drawing_ref},
                  ].filter(Boolean).map(({l,v,bold,color})=>(
                    <div key={l} className="flex justify-between border-b border-slate-50 pb-3 last:border-0 last:pb-0">
                      <span className="text-sm text-slate-500">{l}</span>
                      <span className={clsx('text-sm font-semibold', bold ? color||'text-indigo-700':'text-slate-800')}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Estimated amount */}
              {mb.wo_rate && (
                <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-5 flex justify-between items-center shadow-sm">
                  <span className="text-sm text-indigo-600 font-medium">Estimated Amount (Qty × Rate)</span>
                  <span className="text-xl font-bold text-indigo-800">{fmt(num(mb.executed_qty)*num(mb.wo_rate))}</span>
                </div>
              )}

              {/* Remarks */}
              {mb.remarks && (
                <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 text-sm text-slate-700 italic shadow-sm">{mb.remarks}</div>
              )}

              {/* Action buttons for non-approved statuses */}
              {['draft','submitted','checked'].includes(mb.status) && (
                <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm">
                  <p className="text-sm font-semibold text-slate-700">Actions</p>
                  <Field label="Remarks">
                    <textarea value={comment} onChange={e=>setComment(e.target.value)} rows={3} className={inp+' resize-none'} placeholder="Add comments…"/>
                  </Field>
                  <div className="flex gap-3 flex-wrap">
                    {mb.status==='draft' && (
                      <button onClick={()=>submitMut.mutate()} disabled={submitMut.isPending}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 transition-colors">
                        <Send className="w-4 h-4"/> Submit
                      </button>
                    )}
                    {mb.status==='submitted' && (
                      <button onClick={()=>checkMut.mutate()} disabled={checkMut.isPending}
                        className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-bold hover:bg-amber-600 transition-colors">
                        <CheckCircle2 className="w-4 h-4"/> Mark Checked
                      </button>
                    )}
                    {['submitted','checked'].includes(mb.status) && (
                      <>
                        <button onClick={()=>approveMut.mutate()} disabled={approveMut.isPending}
                          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700 transition-colors">
                          <ThumbsUp className="w-4 h-4"/> Approve
                        </button>
                        <button onClick={()=>rejectMut.mutate()} disabled={rejectMut.isPending}
                          className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-bold hover:bg-red-700 transition-colors">
                          <ThumbsDown className="w-4 h-4"/> Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Approved — Link to Bill CTA */}
              {mb.status === 'approved' && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl overflow-hidden shadow-sm">
                  <div className="px-5 py-3 flex items-center justify-between" style={{background:'#059669'}}>
                    <p className="text-sm font-bold text-white">✓ Approved — Ready to Bill</p>
                    <button onClick={handleLinkToBill}
                      className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-bold text-emerald-800 transition-colors"
                      style={{background:'#fff'}}>
                      <Link2 className="w-4 h-4"/> Link to Bill
                    </button>
                  </div>
                  <div className="px-5 py-4">
                    {siblingCount > 1 ? (
                      <>
                        <p className="text-sm font-semibold text-emerald-800">
                          {siblingCount} approved MB entries for <span className="font-bold">{mb.wo_number}</span> will be combined into one bill.
                        </p>
                        <p className="text-xs text-emerald-600 mt-1">
                          Total executed qty across all entries: <span className="font-bold">{siblingTotalQty.toLocaleString('en-IN')} {mb.unit||''}</span>
                        </p>
                        <div className="mt-3 space-y-1.5">
                          {siblingMBs.map(s=>(
                            <div key={s.id} className={clsx(
                              'flex justify-between text-xs px-3 py-1.5 rounded-lg',
                              s.id === mbId ? 'bg-emerald-200 font-bold text-emerald-900' : 'bg-white border border-emerald-100 text-emerald-700'
                            )}>
                              <span>{s.mb_number} — {s.description}</span>
                              <span className="font-semibold">{num(s.executed_qty).toLocaleString('en-IN')} {s.unit||''}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-emerald-700">
                        Click <strong>Link to Bill</strong> to raise a bill for WO <strong>{mb.wo_number}</strong>.
                      </p>
                    )}
                    {mb.approve_remarks && <p className="text-xs text-emerald-600 mt-2 italic">Approval note: {mb.approve_remarks}</p>}
                  </div>
                </div>
              )}

              {mb.status==='rejected' && mb.rejection_remarks && (
                <div className="bg-red-50 border border-red-100 rounded-2xl p-4 text-sm text-red-700 shadow-sm">✗ {mb.rejection_remarks}</div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SCProgress() {
  const qc = useQueryClient();
  const [search,  setSearch]  = useState('');
  const { selectedProjectId } = useAuthStore();
  const [projFilt,setProj]    = useState(selectedProjectId || '');
  useEffect(() => { setProj(selectedProjectId || ''); }, [selectedProjectId]);
  const [statFilt,setStat]    = useState('');
  const [showForm,setShowForm]= useState(false);
  const [drawer,  setDrawer]  = useState(null);
  const [mbWoId,  setMbWoId]  = useState('');   // WO selected for "Open Measurement Book"
  const [openMB,  setOpenMB]  = useState(false);

  const { data: projects=[] } = useQuery({ queryKey:['projects'], queryFn:()=>projectAPI.list().then(r=>r.data?.data??[]) });
  const { data: wos=[] } = useQuery({
    queryKey:['sc-wo-mb-picker', projFilt],
    queryFn:()=>scAPI.listWO({project_id:projFilt||undefined}).then(r=>r.data?.data||[]),
  });
  const { data: mbs=[], isLoading, refetch } = useQuery({
    queryKey:['sc-mb', projFilt, statFilt],
    queryFn:()=>scAPI.listMB({project_id:projFilt||undefined, status:statFilt||undefined}).then(r=>r.data?.data||[]),
    staleTime:0, gcTime:0, refetchOnMount:'always',
  });

  const filtered = useMemo(()=>{
    if (!search) return mbs;
    const q=search.toLowerCase();
    return mbs.filter(m=>[m.mb_number,m.sc_name,m.wo_number,m.description,m.project_name].some(v=>v?.toLowerCase().includes(q)));
  },[mbs,search]);

  const kpi = useMemo(()=>({
    total:    mbs.length,
    draft:    mbs.filter(m=>m.status==='draft').length,
    pending:  mbs.filter(m=>['submitted','checked'].includes(m.status)).length,
    approved: mbs.filter(m=>m.status==='approved').length,
    totalQty: mbs.filter(m=>m.status==='approved').reduce((s,m)=>s+num(m.executed_qty),0),
  }),[mbs]);

  const deleteMut = useMutation({
    mutationFn:(id)=>scAPI.deleteMB(id),
    onSuccess:()=>{ toast.success('MB entry deleted'); qc.invalidateQueries({queryKey:['sc-mb']}); },
    onError:e=>toast.error(e?.response?.data?.error||'Failed to delete'),
  });
  const handleRowDelete = (m) => {
    if (window.confirm(`Delete ${m.mb_number}? This cannot be undone.`)) deleteMut.mutate(m.id);
  };

  return (
    <div style={{ background: Theme.pageBg, minHeight:'100vh' }}>
      <PageHeader
        title="Measurement Book (MB)"
        subtitle="Record, verify and approve executed work quantities on site"
        breadcrumbs={[{label:'Subcontractors'},{label:'Measurement Book'}]}
        actions={
          <div className="flex items-center gap-2">
            <select value={mbWoId} onChange={e=>setMbWoId(e.target.value)}
              className="px-3 py-2 text-xs font-semibold rounded-lg border-none min-w-[220px]"
              style={{background:'rgba(255,255,255,0.15)', color:'#fff'}}>
              <option value="" style={{color:'#1e293b'}}>— Select WO to open Measurement Book —</option>
              {wos.map(w=><option key={w.id} value={w.id} style={{color:'#1e293b'}}>{w.wo_number} · {w.sc_name}</option>)}
            </select>
            <button onClick={()=>setOpenMB(true)} disabled={!mbWoId}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg shadow-sm disabled:opacity-40"
              style={{background:'rgba(255,255,255,0.15)', color:'#fff'}}>
              <BookOpen className="w-3.5 h-3.5"/> Open Measurement Book
            </button>
            <button onClick={()=>setShowForm(true)}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg shadow-sm"
              style={{background:'#fff', color: Theme.navyDark}}>
              <Plus className="w-3.5 h-3.5"/> New MB Entry
            </button>
          </div>
        }
      />

      <div className="p-5 md:p-6 max-w-[1400px] mx-auto space-y-5">

        {/* Workflow */}
        <div className="bg-white border border-slate-200 rounded-xl px-5 py-4 shadow-sm">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">MB Workflow</p>
          <div className="flex items-center gap-2 flex-wrap">
            {[
              {icon:FileText,    label:'Create MB',    color:'bg-slate-100 text-slate-700'},
              {icon:Send,        label:'Submit',       color:'bg-blue-100 text-blue-700'},
              {icon:CheckCircle2,label:'Site Check',   color:'bg-amber-100 text-amber-700'},
              {icon:ThumbsUp,    label:'QS Approval',  color:'bg-emerald-100 text-emerald-700'},
              {icon:FileText,    label:'Link to Bill', color:'bg-indigo-100 text-indigo-700'},
            ].map(({icon:Icon,label,color},i,arr)=>(
              <React.Fragment key={label}>
                <div className={clsx('flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold',color)}>
                  <Icon className="w-3.5 h-3.5"/> {label}
                </div>
                {i<arr.length-1 && <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0"/>}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <ThemeKpiCard icon={FileText}    label="Total Entries"  value={kpi.total}    color="blue"    sub="All MB entries"/>
          <ThemeKpiCard icon={FileText}    label="Drafts"         value={kpi.draft}    color="slate"   sub="Not submitted"/>
          <ThemeKpiCard icon={Clock}       label="Pending Review" value={kpi.pending}  color="amber"   sub="Awaiting check/approval"/>
          <ThemeKpiCard icon={CheckCircle2}label="Approved"       value={kpi.approved} color="emerald" sub="Verified entries"/>
          <ThemeKpiCard icon={Layers}      label="Approved Qty"   value={kpi.totalQty.toFixed(2)} color="orange" sub="Total executed"/>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-52">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400"/>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search MB No., WO, subcontractor…"
              className="pl-9 pr-3 py-2 border border-slate-200 bg-white rounded-xl text-sm w-full focus:outline-none shadow-sm"/>
          </div>
          <select value={projFilt} onChange={e=>setProj(e.target.value)} className="border border-slate-200 bg-white rounded-xl px-3 py-2 text-sm shadow-sm min-w-40">
            <option value="">All Projects</option>
            {projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={statFilt} onChange={e=>setStat(e.target.value)} className="border border-slate-200 bg-white rounded-xl px-3 py-2 text-sm shadow-sm">
            <option value="">All Status</option>
            {Object.entries(STATUS_META).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
          </select>
          <button onClick={()=>refetch()} className="p-2 border border-slate-200 bg-white rounded-xl hover:bg-slate-50 shadow-sm">
            <RefreshCw className="w-4 h-4 text-slate-500"/>
          </button>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          {isLoading ? (
            <div className="p-5 space-y-2">{[1,2,3,4,5].map(n=><div key={n} className="h-10 bg-slate-100 rounded-xl animate-pulse"/>)}</div>
          ) : filtered.length===0 ? (
            <div className="py-20 text-center">
              <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <FileText className="w-8 h-8 text-slate-300"/>
              </div>
              <p className="text-slate-500 font-semibold">No measurement entries</p>
              <p className="text-xs text-slate-400 mt-1">{search||projFilt||statFilt?'Try adjusting filters':'Create your first MB entry'}</p>
              {!search&&!projFilt&&!statFilt&&(
                <button onClick={()=>setShowForm(true)}
                  className="mt-4 flex items-center gap-2 px-4 py-2 text-sm font-bold text-white rounded-xl mx-auto"
                  style={{background:`linear-gradient(135deg, ${Theme.navyLight} 0%, ${Theme.navyDark} 100%)`}}>
                  <Plus className="w-4 h-4"/> New MB Entry
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{background:`linear-gradient(90deg, ${Theme.navy} 0%, ${Theme.navyDark} 100%)`}}>
                    {['MB Number','Date','WO Number','Subcontractor','Description','Location','Executed Qty','Status',''].map(h=>(
                      <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-white/80 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((m,i)=>{
                    const sm=STATUS_META[m.status]||STATUS_META.draft;
                    return (
                      <tr key={m.id}
                        className={clsx('border-b border-slate-50 hover:bg-indigo-50/30 transition-colors cursor-pointer',i%2===0?'bg-white':'bg-slate-50/30')}
                        onClick={()=>setDrawer(m.id)}>
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">{m.mb_number}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{dayjs(m.mb_date).format('DD MMM YY')}</td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-600">{m.wo_number}</td>
                        <td className="px-4 py-3 text-xs font-semibold text-slate-800">{m.sc_name}</td>
                        <td className="px-4 py-3 text-xs text-slate-600 max-w-[180px] truncate">{m.description}</td>
                        <td className="px-4 py-3">
                          {(m.tower_block||m.floor_number)?(
                            <p className="text-xs text-slate-500 flex items-center gap-1">
                              <MapPin className="w-3 h-3 flex-shrink-0"/>{[m.tower_block,m.floor_number].filter(Boolean).join(' · ')}
                            </p>
                          ):<span className="text-slate-300 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm font-bold text-emerald-700">{m.executed_qty}</p>
                          <p className="text-[10px] text-slate-400">{m.unit}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className={clsx('text-[10px] px-2 py-0.5 rounded-full font-bold',sm.bg,sm.text)}>{sm.label}</span>
                        </td>
                        <td className="px-4 py-3" onClick={e=>e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            <button onClick={()=>setDrawer(m.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50">
                              <Eye className="w-4 h-4"/>
                            </button>
                            <button onClick={()=>handleRowDelete(m)} disabled={deleteMut.isPending} title="Delete"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-50">
                              <Trash2 className="w-4 h-4"/>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showForm && <MBForm onClose={()=>setShowForm(false)}/>}
      {drawer   && <MBDrawer mbId={drawer} onClose={()=>setDrawer(null)}/>}
      {openMB && mbWoId && <SCMeasurementBook wo_id={mbWoId} onClose={()=>setOpenMB(false)}/>}
    </div>
  );
}
