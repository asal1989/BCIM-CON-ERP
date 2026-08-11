// src/pages/sc/SCDeductions.jsx — Advances, Material Recovery & Retention Management
import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { scAPI, projectAPI } from '../../api/client';
import useAuthStore from '../../store/authStore';
import { PageHeader, KpiCard as ThemeKpiCard, Theme } from '../../theme';
import {
  Plus, RefreshCw, X, IndianRupee, Shield, Package,
  AlertTriangle, CheckCircle2, ChevronRight, Wallet,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import dayjs from 'dayjs';

const fmt  = (n) => `₹${Number(n||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const num  = (v) => parseFloat(v||0);
const inp  = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-300 transition';
const Field = ({label,required,children}) => (
  <div>
    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
      {label}{required&&<span className="text-red-400 ml-0.5">*</span>}
    </label>
    {children}
  </div>
);

// ── Tab labels ────────────────────────────────────────────────────────────────
const TABS = [
  { k:'advances',   label:'Advance Management',    icon: Wallet },
  { k:'materials',  label:'Material Recovery',     icon: Package },
  { k:'retention',  label:'Retention Management',  icon: Shield },
];

// ── Advance Form ──────────────────────────────────────────────────────────────
function AdvanceForm({ wos, onClose }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ wo_id:'', advance_date: dayjs().format('YYYY-MM-DD'), amount:'', recovery_pct:10, payment_mode:'bank_transfer', reference_no:'', remarks:'' });
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  const mut = useMutation({
    mutationFn: d => scAPI.createAdvance(d),
    onSuccess:()=>{ toast.success('Advance recorded'); qc.invalidateQueries({queryKey:['sc-advances']}); qc.invalidateQueries({queryKey:['sc-dashboard']}); onClose(); },
    onError:e=>toast.error(e?.response?.data?.error||'Failed'),
  });

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col overflow-hidden">
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-4" style={{background:`linear-gradient(135deg, ${Theme.navy} 0%, ${Theme.navyDark} 100%)`}}>
          <h2 className="font-bold text-white text-base">Record Advance Payment</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-white" style={{background:'rgba(255,255,255,0.10)',border:'1px solid rgba(255,255,255,0.20)'}}><X className="w-4 h-4"/></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-4">
          <Field label="Work Order" required>
            <select value={form.wo_id} onChange={e=>set('wo_id',e.target.value)} className={inp}>
              <option value="">— Select work order —</option>
              {wos.map(w=><option key={w.id} value={w.id}>{w.wo_number} · {w.sc_name} · {w.project_name}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Advance Date"><input type="date" value={form.advance_date} onChange={e=>set('advance_date',e.target.value)} className={inp}/></Field>
            <Field label="Amount (₹)" required><input type="number" value={form.amount} onChange={e=>set('amount',e.target.value)} className={inp} placeholder="0.00"/></Field>
            <Field label="Recovery % per Bill"><input type="number" value={form.recovery_pct} onChange={e=>set('recovery_pct',e.target.value)} className={inp} min={1} max={100}/></Field>
            <Field label="Payment Mode">
              <select value={form.payment_mode} onChange={e=>set('payment_mode',e.target.value)} className={inp}>
                {['bank_transfer','neft','rtgs','cheque','cash','upi'].map(m=><option key={m} value={m}>{m.replace('_',' ').toUpperCase()}</option>)}
              </select>
            </Field>
            <div className="col-span-2"><Field label="Reference / UTR No."><input value={form.reference_no} onChange={e=>set('reference_no',e.target.value)} className={inp} placeholder="UTR / Cheque No."/></Field></div>
            <div className="col-span-2"><Field label="Remarks"><textarea value={form.remarks} onChange={e=>set('remarks',e.target.value)} rows={2} className={inp+' resize-none'}/></Field></div>
          </div>
        </div>
        <div className="flex-shrink-0 flex justify-end gap-3 px-6 py-4 border-t bg-slate-50/60">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600">Cancel</button>
          <button onClick={()=>mut.mutate(form)} disabled={!form.wo_id||!form.amount||mut.isPending}
            className="px-5 py-2 text-white text-sm font-bold rounded-lg disabled:opacity-40"
            style={{background:`linear-gradient(135deg, ${Theme.navyLight} 0%, ${Theme.navyDark} 100%)`}}>
            {mut.isPending?'Recording…':'Record Advance'}
          </button>
        </div>
    </div>
  );
}

// ── Material Recovery Form ────────────────────────────────────────────────────
function MaterialForm({ wos, onClose }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ wo_id:'', recovery_date: dayjs().format('YYYY-MM-DD'), material_name:'', material_code:'', unit:'', quantity:'', rate:'', amount:'', recovery_type:'actual', remarks:'' });
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  // Auto-compute amount
  const autoAmount = (num(form.quantity)*num(form.rate)).toFixed(2);

  const mut = useMutation({
    mutationFn: d => scAPI.createMaterialRec({...d, amount: d.amount||autoAmount}),
    onSuccess:()=>{ toast.success('Recovery recorded'); qc.invalidateQueries({queryKey:['sc-material-rec']}); onClose(); },
    onError:e=>toast.error(e?.response?.data?.error||'Failed'),
  });

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col overflow-hidden">
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-4" style={{background:`linear-gradient(135deg, ${Theme.navy} 0%, ${Theme.navyDark} 100%)`}}>
          <h2 className="font-bold text-white text-base">Record Material Recovery</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-white" style={{background:'rgba(255,255,255,0.10)',border:'1px solid rgba(255,255,255,0.20)'}}><X className="w-4 h-4"/></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-4">
          <Field label="Work Order" required>
            <select value={form.wo_id} onChange={e=>set('wo_id',e.target.value)} className={inp}>
              <option value="">— Select work order —</option>
              {wos.map(w=><option key={w.id} value={w.id}>{w.wo_number} · {w.sc_name}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Recovery Date"><input type="date" value={form.recovery_date} onChange={e=>set('recovery_date',e.target.value)} className={inp}/></Field>
            <Field label="Recovery Type">
              <select value={form.recovery_type} onChange={e=>set('recovery_type',e.target.value)} className={inp}>
                <option value="actual">Actual Consumption</option>
                <option value="fixed">Fixed Amount</option>
                <option value="market_rate">Market Rate</option>
              </select>
            </Field>
            <Field label="Material Name" required><input value={form.material_name} onChange={e=>set('material_name',e.target.value)} className={inp} placeholder="e.g. Cement, TMT Steel…"/></Field>
            <Field label="Material Code"><input value={form.material_code} onChange={e=>set('material_code',e.target.value)} className={inp} placeholder="MAT-001"/></Field>
            <Field label="Quantity"><input type="number" value={form.quantity} onChange={e=>set('quantity',e.target.value)} className={inp} min={0}/></Field>
            <Field label="Unit"><select value={form.unit} onChange={e=>set('unit',e.target.value)} className={inp}><option value="">Select</option>{['Bags','MT','Nos','Kg','Sqm','Rmt','Ltrs'].map(u=><option key={u}>{u}</option>)}</select></Field>
            <Field label="Rate (₹)"><input type="number" value={form.rate} onChange={e=>set('rate',e.target.value)} className={inp} min={0}/></Field>
            <div className="flex flex-col justify-end">
              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 text-center">
                <p className="text-[10px] text-indigo-400 font-bold uppercase">Auto Amount</p>
                <p className="text-lg font-bold text-indigo-800">{fmt(autoAmount)}</p>
              </div>
            </div>
            <div className="col-span-2"><Field label="Remarks"><textarea value={form.remarks} onChange={e=>set('remarks',e.target.value)} rows={2} className={inp+' resize-none'}/></Field></div>
          </div>
        </div>
        <div className="flex-shrink-0 flex justify-end gap-3 px-6 py-4 border-t bg-slate-50/60">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600">Cancel</button>
          <button onClick={()=>mut.mutate(form)} disabled={!form.wo_id||!form.material_name||mut.isPending}
            className="px-5 py-2 text-white text-sm font-bold rounded-lg disabled:opacity-40"
            style={{background:`linear-gradient(135deg, ${Theme.navyLight} 0%, ${Theme.navyDark} 100%)`}}>
            {mut.isPending?'Recording…':'Record Recovery'}
          </button>
        </div>
    </div>
  );
}

// ── Retention Release Form ────────────────────────────────────────────────────
function RetentionReleaseForm({ wos, retSummary, onClose }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ wo_id:'', release_date: dayjs().format('YYYY-MM-DD'), release_amount:'', remarks:'' });
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  const selectedWO = useMemo(()=>retSummary.find(r=>r.wo_id===form.wo_id),[retSummary,form.wo_id]);

  const mut = useMutation({
    mutationFn: d => scAPI.createRetentionRel(d),
    onSuccess:()=>{ toast.success('Retention release created'); qc.invalidateQueries({queryKey:['sc-retention-sum']}); qc.invalidateQueries({queryKey:['sc-retention-rel']}); onClose(); },
    onError:e=>toast.error(e?.response?.data?.error||'Failed'),
  });

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col overflow-hidden">
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-4" style={{background:`linear-gradient(135deg, ${Theme.navy} 0%, ${Theme.navyDark} 100%)`}}>
          <h2 className="font-bold text-white text-base">Create Retention Release</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-white" style={{background:'rgba(255,255,255,0.10)',border:'1px solid rgba(255,255,255,0.20)'}}><X className="w-4 h-4"/></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-4">
          <Field label="Work Order" required>
            <select value={form.wo_id} onChange={e=>set('wo_id',e.target.value)} className={inp}>
              <option value="">— Select work order with retention —</option>
              {retSummary.map(r=>(
                <option key={r.wo_id} value={r.wo_id}>
                  {r.wo_number} · {r.sc_name} · Retained: ₹{num(r.total_retained-r.total_released).toFixed(0)}
                </option>
              ))}
            </select>
          </Field>
          {selectedWO && (
            <div className="grid grid-cols-3 gap-3 bg-amber-50 border border-amber-100 rounded-xl p-3">
              {[['Total Retained',selectedWO.total_retained],['Released',selectedWO.total_released],['Net Pending',num(selectedWO.total_retained)-num(selectedWO.total_released)]].map(([l,v])=>(
                <div key={l}><p className="text-[9px] text-amber-500 font-bold uppercase">{l}</p><p className="text-sm font-bold text-amber-900">{fmt(v)}</p></div>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Release Date"><input type="date" value={form.release_date} onChange={e=>set('release_date',e.target.value)} className={inp}/></Field>
            <Field label="Release Amount (₹)" required>
              <input type="number" value={form.release_amount} onChange={e=>set('release_amount',e.target.value)} className={inp}
                max={selectedWO ? num(selectedWO.total_retained)-num(selectedWO.total_released) : undefined} min={0}/>
            </Field>
            <div className="col-span-2"><Field label="Remarks"><textarea value={form.remarks} onChange={e=>set('remarks',e.target.value)} rows={2} className={inp+' resize-none'}/></Field></div>
          </div>
        </div>
        <div className="flex-shrink-0 flex justify-end gap-3 px-6 py-4 border-t bg-slate-50/60">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600">Cancel</button>
          <button onClick={()=>mut.mutate(form)} disabled={!form.wo_id||!form.release_amount||mut.isPending}
            className="px-5 py-2 text-white text-sm font-bold rounded-lg disabled:opacity-40"
            style={{background:`linear-gradient(135deg, ${Theme.navyLight} 0%, ${Theme.navyDark} 100%)`}}>
            {mut.isPending?'Creating…':'Create Release'}
          </button>
        </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function SCDeductions() {
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  // Deep-link from the sidebar's "Retention (Subcontract)" / "Recoveries
  // (Subcontract)" links, e.g. /sc/deductions?tab=retention.
  const initialTab = TABS.some(t => t.k === searchParams.get('tab')) ? searchParams.get('tab') : 'advances';
  const [activeTab, setTab]  = useState(initialTab);
  const { selectedProjectId } = useAuthStore();
  const [projFilt,  setProj] = useState(selectedProjectId || '');
  useEffect(() => { setProj(selectedProjectId || ''); }, [selectedProjectId]);
  const [modal,     setModal]= useState(null);

  const { data: projects=[] } = useQuery({ queryKey:['projects'], queryFn:()=>projectAPI.list().then(r=>r.data?.data??[]) });
  const { data: wos=[] }      = useQuery({ queryKey:['sc-wo-all'], queryFn:()=>scAPI.listWO().then(r=>r.data?.data||[]), staleTime:0 });
  const { data: advances=[],    refetch:rA } = useQuery({ queryKey:['sc-advances', projFilt],    queryFn:()=>scAPI.listAdvances({project_id:projFilt||undefined}).then(r=>r.data?.data||[]),    staleTime:0 });
  const { data: materials=[],   refetch:rM } = useQuery({ queryKey:['sc-material-rec', projFilt],queryFn:()=>scAPI.listMaterialRec({project_id:projFilt||undefined}).then(r=>r.data?.data||[]), staleTime:0 });
  const { data: retSummary=[],  refetch:rRS }= useQuery({ queryKey:['sc-retention-sum', projFilt],queryFn:()=>scAPI.retentionSummary({project_id:projFilt||undefined}).then(r=>r.data?.data||[]),staleTime:0 });
  const { data: retReleases=[], refetch:rR } = useQuery({ queryKey:['sc-retention-rel', projFilt],queryFn:()=>scAPI.listRetentionRel({project_id:projFilt||undefined}).then(r=>r.data?.data||[]),staleTime:0 });

  const approveMut = useMutation({
    mutationFn: id => scAPI.approveRetention(id),
    onSuccess:()=>{ toast.success('Approved'); rR(); rRS(); },
    onError:e=>toast.error(e?.response?.data?.error||'Failed'),
  });
  const releaseMut = useMutation({
    mutationFn: id => scAPI.releaseRetention(id),
    onSuccess:()=>{ toast.success('Released'); rR(); rRS(); },
    onError:e=>toast.error(e?.response?.data?.error||'Failed'),
  });

  const kpi = useMemo(()=>({
    advTotal:    advances.reduce((s,a)=>s+num(a.amount),0),
    advRecovered:advances.reduce((s,a)=>s+num(a.recovered_amount),0),
    advBalance:  advances.reduce((s,a)=>s+num(a.balance_amount),0),
    matTotal:    materials.reduce((s,m)=>s+num(m.amount),0),
    retHeld:     retSummary.reduce((s,r)=>s+Math.max(0,num(r.total_retained)-num(r.total_released)),0),
    retReleased: retSummary.reduce((s,r)=>s+num(r.total_released),0),
  }),[advances,materials,retSummary]);

  const activeWOs = wos.filter(w=>['active','approved'].includes(w.status));

  return (
    <div style={{ background: Theme.pageBg, minHeight:'100vh' }}>
      <PageHeader
        title="Deductions & Recovery"
        subtitle="Advance management, material recoveries and retention releases"
        breadcrumbs={[{label:'Subcontractors'},{label:'Deductions'}]}
        actions={
          <select value={projFilt} onChange={e=>setProj(e.target.value)}
            className="text-xs border border-white/30 bg-white/10 text-white rounded-lg px-3 py-2 focus:outline-none min-w-40">
            <option value="">All Projects</option>
            {projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        }
      />

      <div className="p-5 md:p-6 max-w-[1400px] mx-auto space-y-5">

        {/* KPI Row */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <ThemeKpiCard icon={Wallet}       label="Advance Given"    value={fmt(kpi.advTotal)}     color="blue"    sub="Total advances"/>
          <ThemeKpiCard icon={CheckCircle2} label="Adv. Recovered"   value={fmt(kpi.advRecovered)} color="emerald" sub="Recovered to date"/>
          <ThemeKpiCard icon={AlertTriangle}label="Adv. Outstanding" value={fmt(kpi.advBalance)}   color="amber"   sub="Pending recovery"/>
          <ThemeKpiCard icon={Package}      label="Material Recovery" value={fmt(kpi.matTotal)}    color="orange"  sub="Total recovered"/>
          <ThemeKpiCard icon={Shield}       label="Retention Held"   value={fmt(kpi.retHeld)}      color="slate"   sub="Net pending"/>
          <ThemeKpiCard icon={CheckCircle2} label="Retention Released"value={fmt(kpi.retReleased)} color="emerald" sub="Released to date"/>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="flex border-b border-slate-100">
            {TABS.map(({ k, label, icon: Icon }) => (
              <button key={k} onClick={()=>setTab(k)}
                className={clsx('flex items-center gap-2 px-5 py-3.5 text-sm font-semibold border-b-2 transition-colors',
                  activeTab===k ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50' : 'border-transparent text-slate-500 hover:text-slate-700')}>
                <Icon className="w-4 h-4"/> {label}
              </button>
            ))}
          </div>

          {/* ── Advances Tab ── */}
          {activeTab==='advances' && (
            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-bold text-slate-700">Advance Payments ({advances.length})</h2>
                <button onClick={()=>setModal('advance')}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-white rounded-lg"
                  style={{background:`linear-gradient(135deg, ${Theme.navyLight} 0%, ${Theme.navyDark} 100%)`}}>
                  <Plus className="w-3.5 h-3.5"/> Record Advance
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{background:`linear-gradient(90deg, ${Theme.navy} 0%, ${Theme.navyDark} 100%)`}}>
                      {['Advance No.','Date','WO Number','Subcontractor','Project','Amount','Recovery %','Recovered','Balance','Status'].map(h=>(
                        <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-white/80 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {advances.length===0 ? (
                      <tr><td colSpan={10} className="py-10 text-center text-slate-400 text-xs">No advances recorded</td></tr>
                    ) : advances.map((a,i)=>(
                      <tr key={a.id} className={clsx('border-b border-slate-50',i%2===0?'bg-white':'bg-slate-50/30')}>
                        <td className="px-4 py-2.5"><span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">{a.advance_number}</span></td>
                        <td className="px-4 py-2.5 text-xs text-slate-500">{dayjs(a.advance_date).format('DD MMM YY')}</td>
                        <td className="px-4 py-2.5 font-mono text-xs text-slate-600">{a.wo_number}</td>
                        <td className="px-4 py-2.5 text-xs font-semibold text-black">{a.sc_name}</td>
                        <td className="px-4 py-2.5 text-xs text-slate-500">{a.project_name}</td>
                        <td className="px-4 py-2.5 text-right text-sm font-bold text-black">{fmt(a.amount)}</td>
                        <td className="px-4 py-2.5 text-right text-xs text-slate-500">{a.recovery_pct}%</td>
                        <td className="px-4 py-2.5 text-right text-xs font-bold text-emerald-600">{fmt(a.recovered_amount)}</td>
                        <td className="px-4 py-2.5 text-right text-xs font-bold text-amber-600">{fmt(a.balance_amount)}</td>
                        <td className="px-4 py-2.5">
                          <span className={clsx('text-[10px] px-2 py-0.5 rounded-full font-bold',
                            a.recovery_status==='fully_recovered'?'bg-emerald-100 text-emerald-700':a.recovery_status==='partially_recovered'?'bg-amber-100 text-amber-700':'bg-blue-100 text-blue-700')}>
                            {a.recovery_status==='fully_recovered'?'Recovered':a.recovery_status==='partially_recovered'?'Partial':'Active'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Material Recovery Tab ── */}
          {activeTab==='materials' && (
            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-bold text-slate-700">Material Recoveries ({materials.length})</h2>
                <button onClick={()=>setModal('material')}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-white rounded-lg"
                  style={{background:`linear-gradient(135deg, ${Theme.navyLight} 0%, ${Theme.navyDark} 100%)`}}>
                  <Plus className="w-3.5 h-3.5"/> Record Recovery
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{background:`linear-gradient(90deg, ${Theme.navy} 0%, ${Theme.navyDark} 100%)`}}>
                      {['Date','WO Number','Subcontractor','Material','Code','Qty','Unit','Rate','Amount','Type'].map(h=>(
                        <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-white/80 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {materials.length===0 ? (
                      <tr><td colSpan={10} className="py-10 text-center text-slate-400 text-xs">No material recoveries recorded</td></tr>
                    ) : materials.map((m,i)=>(
                      <tr key={m.id} className={clsx('border-b border-slate-50',i%2===0?'bg-white':'bg-slate-50/30')}>
                        <td className="px-4 py-2.5 text-xs text-slate-500">{dayjs(m.recovery_date).format('DD MMM YY')}</td>
                        <td className="px-4 py-2.5 font-mono text-xs text-slate-600">{m.wo_number}</td>
                        <td className="px-4 py-2.5 text-xs font-semibold text-black">{m.sc_name}</td>
                        <td className="px-4 py-2.5 text-xs font-semibold text-black">{m.material_name}</td>
                        <td className="px-4 py-2.5 text-xs text-slate-400 font-mono">{m.material_code||'—'}</td>
                        <td className="px-4 py-2.5 text-right text-xs text-slate-600">{m.quantity||'—'}</td>
                        <td className="px-4 py-2.5 text-xs text-slate-500">{m.unit||'—'}</td>
                        <td className="px-4 py-2.5 text-right text-xs text-slate-600">{m.rate?fmt(m.rate):'—'}</td>
                        <td className="px-4 py-2.5 text-right text-sm font-bold text-orange-700">{fmt(m.amount)}</td>
                        <td className="px-4 py-2.5"><span className="text-[10px] bg-orange-50 text-orange-700 px-2 py-0.5 rounded-full font-semibold capitalize">{m.recovery_type?.replace('_',' ')}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Retention Tab ── */}
          {activeTab==='retention' && (
            <div className="p-5 space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-700">Retention by Work Order</h2>
                <button onClick={()=>setModal('retention')}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-white rounded-lg"
                  style={{background:`linear-gradient(135deg, ${Theme.navyLight} 0%, ${Theme.navyDark} 100%)`}}>
                  <Plus className="w-3.5 h-3.5"/> Create Release
                </button>
              </div>
              {/* Retention Summary */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{background:`linear-gradient(90deg, ${Theme.navy} 0%, ${Theme.navyDark} 100%)`}}>
                      {['WO Number','Subcontractor','Project','Total Retained','Released','Net Pending','WO Status'].map(h=>(
                        <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-white/80 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {retSummary.length===0 ? (
                      <tr><td colSpan={7} className="py-10 text-center text-slate-400 text-xs">No retention data</td></tr>
                    ) : retSummary.map((r,i)=>{
                      const net = Math.max(0,num(r.total_retained)-num(r.total_released));
                      return (
                        <tr key={r.wo_id} className={clsx('border-b border-slate-50',i%2===0?'bg-white':'bg-slate-50/30')}>
                          <td className="px-4 py-2.5 font-mono text-xs font-bold text-indigo-700">{r.wo_number}</td>
                          <td className="px-4 py-2.5 text-xs font-semibold text-black">{r.sc_name}</td>
                          <td className="px-4 py-2.5 text-xs text-slate-500">{r.project_name}</td>
                          <td className="px-4 py-2.5 text-right text-xs font-bold text-amber-700">{fmt(r.total_retained)}</td>
                          <td className="px-4 py-2.5 text-right text-xs font-bold text-emerald-600">{fmt(r.total_released)}</td>
                          <td className="px-4 py-2.5 text-right text-sm font-bold" style={{color: net>0?'#b45309':'#64748b'}}>{fmt(net)}</td>
                          <td className="px-4 py-2.5"><span className={clsx('text-[10px] px-2 py-0.5 rounded-full font-bold capitalize',
                            r.wo_status==='completed'?'bg-teal-100 text-teal-700':r.wo_status==='active'?'bg-emerald-100 text-emerald-700':'bg-slate-100 text-slate-600')}>
                            {r.wo_status}
                          </span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Retention Releases */}
              {retReleases.length>0 && (
                <div>
                  <h3 className="text-sm font-bold text-slate-700 mb-3">Release History ({retReleases.length})</h3>
                  <div className="space-y-2">
                    {retReleases.map(r=>(
                      <div key={r.id} className="flex items-center justify-between bg-white border border-slate-100 rounded-xl px-4 py-3">
                        <div>
                          <p className="text-xs font-bold text-indigo-700 font-mono">{r.release_number}</p>
                          <p className="text-[11px] text-slate-500">{r.wo_number} · {r.sc_name}</p>
                          <p className="text-[10px] text-slate-400">{dayjs(r.release_date).format('DD MMM YYYY')}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="text-sm font-bold text-amber-700">{fmt(r.release_amount)}</p>
                            <span className={clsx('text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase',
                              r.status==='released'?'bg-emerald-100 text-emerald-700':r.status==='approved'?'bg-blue-100 text-blue-700':'bg-slate-100 text-slate-600')}>
                              {r.status}
                            </span>
                          </div>
                          {r.status==='pending' && (
                            <button onClick={()=>approveMut.mutate(r.id)} disabled={approveMut.isPending}
                              className="px-2 py-1 bg-blue-600 text-white rounded text-xs font-bold hover:bg-blue-700">Approve</button>
                          )}
                          {r.status==='approved' && (
                            <button onClick={()=>releaseMut.mutate(r.id)} disabled={releaseMut.isPending}
                              className="px-2 py-1 bg-emerald-600 text-white rounded text-xs font-bold hover:bg-emerald-700">Release</button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {modal==='advance'   && <AdvanceForm wos={activeWOs} onClose={()=>setModal(null)}/>}
      {modal==='material'  && <MaterialForm wos={activeWOs} onClose={()=>setModal(null)}/>}
      {modal==='retention' && <RetentionReleaseForm wos={activeWOs} retSummary={retSummary} onClose={()=>setModal(null)}/>}
    </div>
  );
}
