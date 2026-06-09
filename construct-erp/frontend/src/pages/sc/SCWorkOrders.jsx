// src/pages/sc/SCWorkOrders.jsx — Unified Work Order Management (Legacy + New SC Module)
import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { scAPI, projectAPI, boqAPI } from '../../api/client';
import { PageHeader, KpiCard as ThemeKpiCard, Theme } from '../../theme';
import {
  Plus, Search, Eye, Edit2, CheckCircle, X, RefreshCw,
  Briefcase, Trash2, AlertTriangle, Building2, IndianRupee,
  ChevronRight, Archive, Layers, FileText, Lock,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import dayjs from 'dayjs';

const fmt = v => `₹${Number(v||0).toLocaleString('en-IN',{maximumFractionDigits:0})}`;
const num = v => parseFloat(v||0);
const inp = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400 transition';
const Field = ({label,required,children}) => (
  <div>
    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
      {label}{required&&<span className="text-red-400 ml-0.5">*</span>}
    </label>
    {children}
  </div>
);

const STATUS_META = {
  draft:      { bg:'bg-slate-100',   text:'text-slate-600',   label:'Draft' },
  submitted:  { bg:'bg-blue-100',    text:'text-blue-700',    label:'Submitted' },
  approved:   { bg:'bg-indigo-100',  text:'text-indigo-700',  label:'Approved' },
  active:     { bg:'bg-emerald-100', text:'text-emerald-700', label:'Active' },
  completed:  { bg:'bg-teal-100',    text:'text-teal-700',    label:'Completed' },
  terminated: { bg:'bg-red-100',     text:'text-red-700',     label:'Terminated' },
  closed:     { bg:'bg-gray-100',    text:'text-gray-500',    label:'Closed' },
};

// Map both old vendor_type (legacy) and new contractor_type to display
const CT_META = {
  sub_contractor:    { label:'Sub-Contractor',    short:'SC', bg:'bg-orange-100', text:'text-orange-700', dot:'#EA580C' },
  labour_contractor: { label:'Labour Contractor', short:'LC', bg:'bg-blue-100',   text:'text-blue-700',   dot:'#1D4ED8' },
};
const VENDOR_TYPE_BADGE = {
  'subcontractor':    'bg-orange-100 text-orange-700',
  'Sub-contractor':   'bg-orange-100 text-orange-700',
  'Labour Contractor':'bg-blue-100 text-blue-700',
  'labour_contractor':'bg-blue-100 text-blue-700',
  'Labor Contractor': 'bg-blue-100 text-blue-700',
};

// ─── WO Final Account Modal ────────────────────────────────────────────────────
function WOFinalAccountModal({ wo, onClose }) {
  const { data, isLoading } = useQuery({
    queryKey: ['sc-wo-final-account', wo.id],
    queryFn:  () => scAPI.getWOFinalAccount(wo.id).then(r => r.data?.data),
    staleTime: 0,
  });
  const fa  = data?.summary;
  const bills = data?.bills || [];
  const w = data?.wo || wo;

  const row = (label, value, color='text-slate-800', border=false) => (
    <tr className={border ? 'border-t-2 border-slate-300 bg-slate-50 font-bold' : 'border-b border-slate-50'}>
      <td className="px-4 py-2 text-xs text-slate-500">{label}</td>
      <td className={`px-4 py-2 text-right text-xs font-semibold ${color}`}>{value}</td>
    </tr>
  );

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b"
          style={{background:'linear-gradient(135deg,#134e4a 0%,#065f46 100%)'}}>
          <div>
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-emerald-300"/>
              <span className="font-bold text-white">Final Account</span>
              <span className="font-mono text-emerald-300 text-sm">— {w.wo_number}</span>
            </div>
            <p className="text-emerald-200 text-xs mt-0.5">{w.sc_name} · {w.project_name}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10">
            <X className="w-4 h-4"/>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {isLoading ? (
            <div className="flex items-center justify-center h-48 text-slate-400">
              <RefreshCw className="w-5 h-5 animate-spin mr-2"/> Loading final account…
            </div>
          ) : (
            <>
              {/* KPI row */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { l:'Contract Value',   v: fmt(w.contract_amount),      c:'text-slate-800' },
                  { l:'Total Billed',     v: fmt(fa?.total_gross||0),      c:'text-indigo-700' },
                  { l:'Net Certified',    v: fmt(fa?.total_net||0),         c:'text-teal-700'  },
                  { l:'Utilisation',      v: `${fa?.utilisation_pct||0}%`, c: fa?.utilisation_pct>=100?'text-red-600':'text-emerald-700' },
                ].map(({l,v,c}) => (
                  <div key={l} className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-center">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">{l}</p>
                    <p className={`text-lg font-bold ${c}`}>{v}</p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Bill-wise table */}
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">RA Bills ({bills.length})</p>
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-xs">
                      <thead style={{background:`linear-gradient(90deg,#0f766e 0%,#065f46 100%)`}}>
                        <tr>{['Bill No.','Date','Gross','Net Pay','Paid','Status'].map(h=>(
                          <th key={h} className="px-3 py-2 text-left font-bold text-white/80 whitespace-nowrap">{h}</th>
                        ))}</tr>
                      </thead>
                      <tbody>
                        {bills.length===0 ? (
                          <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">No bills</td></tr>
                        ) : bills.map((b,i) => (
                          <tr key={i} className={clsx('border-t border-slate-100', i%2===0?'bg-white':'bg-slate-50/30')}>
                            <td className="px-3 py-2 font-mono text-indigo-600 font-bold">{b.bill_number}</td>
                            <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{dayjs(b.bill_date).format('DD MMM YY')}</td>
                            <td className="px-3 py-2 text-right">{fmt(b.gross_amount)}</td>
                            <td className="px-3 py-2 text-right text-teal-700 font-semibold">{fmt(b.net_payable)}</td>
                            <td className="px-3 py-2 text-right text-emerald-600">{fmt(b.paid_amount)}</td>
                            <td className="px-3 py-2">
                              <span className={clsx('text-[9px] px-1.5 py-0.5 rounded-full font-bold capitalize',
                                b.status==='paid'?'bg-emerald-100 text-emerald-700':b.status==='approved'?'bg-teal-100 text-teal-700':'bg-blue-100 text-blue-700')}>
                                {b.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Summary table */}
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Account Summary</p>
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-xs">
                      <tbody>
                        {row('Contract Value',           fmt(w.contract_amount))}
                        {row('Total Gross Billed',        fmt(fa?.total_gross||0),        'text-indigo-700')}
                        {row('Total GST',                 fmt(fa?.total_gst||0),           'text-slate-600')}
                        {row('Total TDS Deducted',        fmt(fa?.total_tds||0),           'text-red-600')}
                        {row('Total Retention Held',      fmt(fa?.total_retention||0),     'text-amber-600')}
                        {row('Total Advance Recovery',    fmt(fa?.total_adv_rec||0),       'text-orange-600')}
                        {row('Total Material Recovery',   fmt(fa?.total_mat_rec||0),       'text-orange-500')}
                        {fa?.total_penalty>0 && row('Penalty Deductions',     fmt(fa?.total_penalty||0),      'text-red-500')}
                        {fa?.total_labour_cess>0 && row('Labour Cess',        fmt(fa?.total_labour_cess||0),  'text-slate-500')}
                        {row('Net Certified Amount',      fmt(fa?.total_net||0),           'text-teal-700',  false)}
                        {row('Total Paid',                fmt(fa?.total_paid||0),          'text-emerald-700')}
                        {row('Net Balance Payable',       fmt(fa?.net_balance||0),         fa?.net_balance>0?'text-red-600':'text-emerald-600', true)}
                        {row('Retention Balance',         fmt(fa?.retention_balance||0),   'text-amber-600')}
                        {fa?.total_advanced>0 && row('Advance Given',         fmt(fa?.total_advanced||0),     'text-orange-600')}
                        {fa?.total_ret_released>0 && row('Retention Released', fmt(fa?.total_ret_released||0),'text-emerald-600')}
                      </tbody>
                    </table>
                  </div>
                  {w.dlp_end_date && (
                    <div className={clsx('mt-3 rounded-xl px-4 py-2.5 text-xs border flex items-center gap-2',
                      dayjs(w.dlp_end_date).isBefore(dayjs())
                        ? 'bg-red-50 border-red-200 text-red-700'
                        : 'bg-amber-50 border-amber-200 text-amber-700')}>
                      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0"/>
                      <span>DLP: {dayjs(w.dlp_end_date).format('DD MMM YYYY')}
                        {dayjs(w.dlp_end_date).isBefore(dayjs())
                          ? ' — Expired' : ` — ${dayjs(w.dlp_end_date).diff(dayjs(),'day')}d remaining`}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex-shrink-0 flex justify-end px-5 py-4 border-t bg-slate-50">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-100">Close</button>
        </div>
      </div>
    </div>
  );
}

// ─── Create / Edit WO Form ─────────────────────────────────────────────────────
function WOForm({ wo, projects, subcontractors, onClose }) {
  const qc = useQueryClient();
  const isEdit = !!wo;
  const [form, setForm] = useState(isEdit ? {...wo, items: wo.items||[]} : {
    project_id:'', sc_id:'', subject:'', description:'', scope_of_work:'', terms_conditions:'',
    tower_block:'', work_category:'',
    start_date:'', end_date:'',
    contract_amount:0, gst_pct:18, tds_pct:2, retention_pct:5, advance_amount:0,
    items:[{ item_code:'', description:'', unit:'Sqm', qty:0, rate:0, boq_item_id:'' }],
  });
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const setItem = (i,k,v) => setForm(f=>({...f, items: f.items.map((it,idx)=>idx===i?{...it,[k]:v}:it)}));
  const addItem = () => setForm(f=>({...f, items:[...f.items,{item_code:'',description:'',unit:'Sqm',qty:0,rate:0,boq_item_id:''}]}));
  const removeItem = i => setForm(f=>({...f, items: f.items.filter((_,idx)=>idx!==i)}));
  const totalAmt = form.items.reduce((s,it)=>s+num(it.qty)*num(it.rate),0);

  const mut = useMutation({
    mutationFn: d => isEdit ? scAPI.updateWO(wo.id,d) : scAPI.createWO({...d, contract_amount: totalAmt||d.contract_amount}),
    onSuccess: () => { toast.success(isEdit?'Updated':'Work order created'); qc.invalidateQueries({queryKey:['sc-wo-all-view']}); onClose(); },
    onError: e => toast.error(e?.response?.data?.error||'Failed'),
  });

  // BOQ items for the selected project — used to link SC items to client BOQ
  const { data: boqItems=[] } = useQuery({
    queryKey: ['boq-items-for-wo', form.project_id],
    queryFn:  () => boqAPI.list({ project_id: form.project_id }).then(r => r.data?.data || []),
    enabled:  !!form.project_id,
    staleTime: 60000,
  });

  const WORK_CATEGORIES = ['Civil','Structural','Waterproofing','Electrical','Plumbing','Painting','Carpentry','Tiles','Aluminium','Demolition','Earth Work','Fabrication','Interior','Landscaping','General'];

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col overflow-hidden">
      <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b"
        style={{background:'linear-gradient(135deg,#065f46 0%,#047857 100%)'}}>
        <div>
          <h2 className="font-bold text-white text-base">{isEdit?`Edit — ${wo.wo_number}`:'Create Work Order'}</h2>
          <p className="text-xs mt-0.5 text-emerald-200">{isEdit?wo.subject:'Fill in work order details and BOQ items'}</p>
        </div>
        <button onClick={onClose} className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"><X className="w-4 h-4"/></button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6">

        {/* Basic Info */}
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Work Order Details</p>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Project" required>
              <select value={form.project_id} onChange={e=>set('project_id',e.target.value)} className={inp}>
                <option value="">Select project…</option>
                {projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="Subcontractor / Labour Contractor" required>
              <select value={form.sc_id} onChange={e=>set('sc_id',e.target.value)} className={inp}>
                <option value="">Select contractor…</option>
                {/* Labour Contractors first */}
                {subcontractors.filter(s=>s.status==='active'&&s.contractor_type==='labour_contractor').length > 0 && (
                  <optgroup label="── Labour Contractors (Manpower) ──">
                    {subcontractors.filter(s=>s.status==='active'&&s.contractor_type==='labour_contractor').map(s=>(
                      <option key={s.id} value={s.id}>{s.sc_code} — {s.name} [{s.trade_type||'Labour'}]</option>
                    ))}
                  </optgroup>
                )}
                {/* Sub-Contractors */}
                {subcontractors.filter(s=>s.status==='active'&&s.contractor_type!=='labour_contractor').length > 0 && (
                  <optgroup label="── Sub-Contractors (Trade Work) ──">
                    {subcontractors.filter(s=>s.status==='active'&&s.contractor_type!=='labour_contractor').map(s=>(
                      <option key={s.id} value={s.id}>{s.sc_code} — {s.name} [{s.trade_type||'General'}]</option>
                    ))}
                  </optgroup>
                )}
              </select>
            </Field>
            <div className="col-span-2">
              <Field label="Subject / Title" required>
                <input value={form.subject} onChange={e=>set('subject',e.target.value)} className={inp} placeholder="e.g. Block Work & Plastering — Tower A, 11th–30th Floor"/>
              </Field>
            </div>
            <Field label="Work Category">
              <select value={form.work_category||''} onChange={e=>set('work_category',e.target.value)} className={inp}>
                <option value="">Select…</option>
                {WORK_CATEGORIES.map(c=><option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Tower / Block">
              <input value={form.tower_block||''} onChange={e=>set('tower_block',e.target.value)} className={inp} placeholder="e.g. Tower A / Block 1"/>
            </Field>
            <Field label="Start Date"><input type="date" value={form.start_date||''} onChange={e=>set('start_date',e.target.value)} className={inp}/></Field>
            <Field label="End Date"><input type="date" value={form.end_date||''} onChange={e=>set('end_date',e.target.value)} className={inp}/></Field>
            <Field label="DLP End Date">
              <input type="date" value={form.dlp_end_date||''} onChange={e=>set('dlp_end_date',e.target.value)} className={inp}/>
            </Field>
            <Field label="DLP (months)">
              <input type="number" value={form.dlp_months||12} min={0} max={60} onChange={e=>set('dlp_months',parseInt(e.target.value)||12)} className={inp}/>
            </Field>
            <div className="col-span-2">
              <Field label="Scope of Work">
                <textarea value={form.scope_of_work||''} onChange={e=>set('scope_of_work',e.target.value)} rows={3} className={inp+' resize-none'} placeholder="Detailed scope of work…"/>
              </Field>
            </div>
          </div>
        </div>

        {/* Rates */}
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Financial Terms</p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Field label="GST %"><input type="number" value={form.gst_pct} onChange={e=>set('gst_pct',e.target.value)} className={inp} min={0} max={100}/></Field>
            <Field label="TDS %"><input type="number" value={form.tds_pct} onChange={e=>set('tds_pct',e.target.value)} className={inp} min={0} max={100}/></Field>
            <Field label="Retention %"><input type="number" value={form.retention_pct} onChange={e=>set('retention_pct',e.target.value)} className={inp} min={0} max={100}/></Field>
            <Field label="Advance Amount (₹)"><input type="number" value={form.advance_amount||0} onChange={e=>set('advance_amount',e.target.value)} className={inp} min={0}/></Field>
          </div>
        </div>

        {/* BOQ Items */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">BOQ Items</p>
            <button onClick={addItem}
              className="flex items-center gap-1 px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-semibold hover:bg-emerald-100">
              <Plus className="w-3.5 h-3.5"/> Add Item
            </button>
          </div>
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead style={{background:`linear-gradient(90deg, ${Theme.navy} 0%, ${Theme.navyDark} 100%)`}}>
                <tr>
                  {['#','BOQ Link','Code','Description','Unit','Qty','Rate (₹)','Amount',''].map(h=>(
                    <th key={h} className="px-3 py-2.5 text-left font-bold text-white/80 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {form.items.map((it,i)=>(
                  <tr key={i} className={clsx('border-t border-slate-100', i%2===0?'bg-white':'bg-slate-50/30')}>
                    <td className="px-3 py-2 text-slate-400">{i+1}</td>
                    <td className="px-2 py-2">
                      <select value={it.boq_item_id||''} onChange={e=>setItem(i,'boq_item_id',e.target.value)}
                        className="w-36 border border-slate-200 rounded px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-emerald-300">
                        <option value="">— none —</option>
                        {boqItems.map(b=><option key={b.id} value={b.id}>{b.item_no||b.sr_no} — {(b.description||'').slice(0,28)}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-2"><input value={it.item_code} onChange={e=>setItem(i,'item_code',e.target.value)} className="w-16 border border-slate-200 rounded px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-emerald-300" placeholder="B-01"/></td>
                    <td className="px-2 py-2"><input value={it.description} onChange={e=>setItem(i,'description',e.target.value)} className="w-full min-w-[200px] border border-slate-200 rounded px-2 py-1 text-xs outline-none" placeholder="Description…"/></td>
                    <td className="px-2 py-2">
                      <select value={it.unit} onChange={e=>setItem(i,'unit',e.target.value)} className="w-20 border border-slate-200 rounded px-2 py-1 text-xs outline-none">
                        {['Sqm','Sqft','Cum','Rmt','Nos','Kg','MT','LS','Bags','Ltrs','Running Meter'].map(u=><option key={u}>{u}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-2"><input type="number" value={it.qty} onChange={e=>setItem(i,'qty',e.target.value)} className="w-20 border border-slate-200 rounded px-2 py-1 text-xs outline-none text-right" min={0}/></td>
                    <td className="px-2 py-2"><input type="number" value={it.rate} onChange={e=>setItem(i,'rate',e.target.value)} className="w-24 border border-slate-200 rounded px-2 py-1 text-xs outline-none text-right" min={0}/></td>
                    <td className="px-2 py-2 font-bold text-indigo-600 text-right">{fmt(num(it.qty)*num(it.rate))}</td>
                    <td className="px-2 py-2"><button onClick={()=>removeItem(i)} className="text-red-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5"/></button></td>
                  </tr>
                ))}
                <tr className="border-t-2 border-emerald-300 bg-emerald-50">
                  <td colSpan={7} className="px-4 py-2.5 text-right font-bold text-slate-700 text-xs uppercase tracking-wider">Total Contract Amount</td>
                  <td className="px-3 py-2.5 font-bold text-emerald-700 text-sm">{fmt(totalAmt)}</td>
                  <td/>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <Field label="Terms & Conditions">
          <textarea value={form.terms_conditions||''} onChange={e=>set('terms_conditions',e.target.value)} rows={3} className={inp+' resize-none'}/>
        </Field>
      </div>

      <div className="flex-shrink-0 flex justify-between items-center px-6 py-4 border-t bg-slate-50">
        <p className="text-xs text-slate-400">Total: <span className="font-bold text-slate-700">{fmt(totalAmt)}</span></p>
        <div className="flex gap-3">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-100">Cancel</button>
          <button onClick={()=>mut.mutate(form)} disabled={!form.project_id||!form.sc_id||!form.subject||mut.isPending}
            className="px-5 py-2 bg-emerald-600 text-white text-sm font-bold rounded-lg hover:bg-emerald-700 disabled:opacity-50">
            {mut.isPending?'Saving…':isEdit?'Update WO':'Create Work Order'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── New SC WO Detail Drawer ───────────────────────────────────────────────────
function NewWODrawer({ wo, onClose, onEdit }) {
  const qc = useQueryClient();
  const [showFA,       setShowFA]       = useState(false);
  const [closeRemarks, setCloseRemarks] = useState('');
  const [showCloseBox, setShowCloseBox] = useState(false);

  const { data } = useQuery({
    queryKey: ['sc-wo-detail', wo.id],
    queryFn: () => scAPI.getWO(wo.id).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    staleTime: 0,
  });
  const approveMut = useMutation({
    mutationFn: () => scAPI.approveWO(wo.id),
    onSuccess: () => { toast.success('Work order approved'); qc.invalidateQueries({queryKey:['sc-wo-all-view']}); onClose(); },
    onError: e => toast.error(e?.response?.data?.error||'Failed'),
  });
  const closeMut = useMutation({
    mutationFn: () => scAPI.closeWO(wo.id, { remarks: closeRemarks }),
    onSuccess: () => { toast.success('Work order closed'); qc.invalidateQueries({queryKey:['sc-wo-all-view']}); onClose(); },
    onError: e => toast.error(e?.response?.data?.error||'Failed'),
  });
  const d = data || wo;
  const sm = STATUS_META[d.status] || STATUS_META.draft;
  const canClose = ['active','approved'].includes(d.status);

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose}/>
      <div className="w-full max-w-2xl bg-white shadow-2xl flex flex-col overflow-hidden">
        <div className="flex-shrink-0 flex items-center justify-between px-5 py-4"
          style={{background:'linear-gradient(135deg,#065f46 0%,#047857 100%)'}}>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-emerald-300 text-xs font-bold">{d.wo_number}</span>
              <span className="text-[10px] bg-white/15 text-white px-2 py-0.5 rounded-full font-semibold">SC Module</span>
            </div>
            <p className="font-bold text-white text-sm mt-0.5 max-w-sm truncate">{d.subject}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={()=>{onClose(); onEdit(d);}}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-white"
              style={{background:'rgba(255,255,255,0.14)',border:'1px solid rgba(255,255,255,0.22)'}}>
              <Edit2 className="w-3 h-3"/> Edit
            </button>
            <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-white" style={{background:'rgba(255,255,255,0.10)'}}>
              <X className="w-4 h-4"/>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Status & Key info */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              {l:'Status',     v:<span className={clsx('text-xs px-2 py-0.5 rounded-full font-bold', sm.bg, sm.text)}>{sm.label}</span>},
              {l:'Project',    v: d.project_name},
              {l:'Vendor',     v: d.sc_name||d.vendor_name},
              {l:'Start Date', v: d.start_date ? dayjs(d.start_date).format('DD MMM YYYY') : '—'},
              {l:'End Date',   v: d.end_date   ? dayjs(d.end_date).format('DD MMM YYYY')   : '—'},
              {l:'Category',   v: d.work_category||d.vendor_type||'—'},
            ].map(({l,v})=>(
              <div key={l} className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">{l}</p>
                <div className="text-xs font-semibold text-slate-800">{v}</div>
              </div>
            ))}
          </div>

          {/* Financial summary */}
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Financial Summary</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {[
                {l:'Contract Value', v: fmt(d.contract_amount), color:'text-slate-800'},
                {l:'Total Billed',   v: fmt(d.total_billed),    color:'text-indigo-700'},
                {l:'Total Paid',     v: fmt(d.total_paid),      color:'text-emerald-700'},
                {l:'GST',            v: `${d.gst_pct||18}%`,   color:'text-slate-600'},
                {l:'TDS',            v: `${d.tds_pct||2}%`,    color:'text-red-600'},
                {l:'Retention',      v: `${d.retention_pct||5}%`, color:'text-orange-600'},
              ].map(({l,v,color})=>(
                <div key={l} className="border border-slate-100 rounded-xl p-3">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">{l}</p>
                  <p className={clsx('text-sm font-bold', color)}>{v}</p>
                </div>
              ))}
            </div>
          </div>

          {/* BOQ Items */}
          {data?.items?.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">BOQ Items ({data.items.length})</p>
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead style={{background:`linear-gradient(90deg, ${Theme.navy} 0%, ${Theme.navyDark} 100%)`}}>
                    <tr>{['Code','Description','Unit','WO Qty','Rate','Amount','Billed'].map(h=>(
                      <th key={h} className="px-3 py-2 text-left font-bold text-white/80">{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {data.items.map((it,i)=>(
                      <tr key={it.id} className={clsx('border-t border-slate-100', i%2===0?'bg-white':'bg-slate-50/30')}>
                        <td className="px-3 py-2 font-mono text-slate-400">{it.item_code||'—'}</td>
                        <td className="px-3 py-2 max-w-[180px] truncate">{it.description}</td>
                        <td className="px-3 py-2 text-slate-500">{it.unit}</td>
                        <td className="px-3 py-2 text-right">{it.qty}</td>
                        <td className="px-3 py-2 text-right">{fmt(it.rate)}</td>
                        <td className="px-3 py-2 text-right font-bold text-indigo-600">{fmt(it.amount)}</td>
                        <td className="px-3 py-2 text-right font-bold text-emerald-600">{it.billed_qty||0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {d.scope_of_work && <div><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Scope of Work</p><p className="text-sm text-slate-700 whitespace-pre-wrap bg-slate-50 rounded-xl p-3">{d.scope_of_work}</p></div>}
        </div>

        {/* Close WO confirmation box */}
        {showCloseBox && (
          <div className="flex-shrink-0 px-5 py-4 border-t bg-red-50 border-red-100 space-y-2">
            <p className="text-xs font-semibold text-red-700">Confirm WO Closure — all pending bills will be checked automatically.</p>
            <input
              value={closeRemarks}
              onChange={e=>setCloseRemarks(e.target.value)}
              placeholder="Closure remarks (optional)"
              className="w-full border border-red-200 bg-white rounded-lg px-3 py-2 text-xs outline-none"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={()=>setShowCloseBox(false)} className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-100">Cancel</button>
              <button onClick={()=>closeMut.mutate()} disabled={closeMut.isPending}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-red-600 text-white text-xs font-bold rounded-lg hover:bg-red-700 disabled:opacity-50">
                <Lock className="w-3 h-3"/>{closeMut.isPending?'Closing…':'Confirm Close WO'}
              </button>
            </div>
          </div>
        )}

        <div className="flex-shrink-0 flex justify-between items-center px-5 py-4 border-t bg-slate-50">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-100">Close</button>
          <div className="flex items-center gap-2">
            {/* Final Account button (always visible for SC module WOs) */}
            <button onClick={()=>setShowFA(true)}
              className="flex items-center gap-1.5 px-3 py-2 border border-teal-200 bg-teal-50 text-teal-700 text-xs font-semibold rounded-lg hover:bg-teal-100">
              <FileText className="w-3.5 h-3.5"/> Final Account
            </button>
            {/* Approve WO */}
            {['draft','submitted'].includes(d.status) && (
              <button onClick={()=>approveMut.mutate()} disabled={approveMut.isPending}
                className="flex items-center gap-2 px-5 py-2 bg-emerald-600 text-white text-sm font-bold rounded-lg hover:bg-emerald-700 disabled:opacity-50">
                <CheckCircle className="w-4 h-4"/>{approveMut.isPending?'Approving…':'Approve WO'}
              </button>
            )}
            {/* Close WO */}
            {canClose && !showCloseBox && (
              <button onClick={()=>setShowCloseBox(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-slate-700 text-white text-xs font-bold rounded-lg hover:bg-slate-800">
                <Lock className="w-3.5 h-3.5"/> Close WO
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
    {/* Final Account Modal */}
    {showFA && <WOFinalAccountModal wo={d} onClose={()=>setShowFA(false)} />}
  );
}

// ─── Legacy WO Detail Drawer ───────────────────────────────────────────────────
function LegacyWODrawer({ woId, woRow, onClose }) {
  const { data, isLoading } = useQuery({
    queryKey: ['sc-legacy-wo-detail', woId],
    queryFn: () => scAPI.getLegacyWO(woId).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    staleTime: 0, enabled: !!woId,
  });
  const d = data || woRow;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose}/>
      <div className="w-full max-w-2xl bg-white shadow-2xl flex flex-col overflow-hidden">
        <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 bg-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-indigo-300 text-xs font-bold">{d?.wo_number}</span>
              <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full font-semibold border border-amber-500/30">Legacy WO</span>
            </div>
            <p className="font-bold text-white text-sm mt-0.5 max-w-sm truncate">{d?.subject}</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-white bg-white/10">
            <X className="w-4 h-4"/>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {isLoading ? (
            <div className="space-y-3">{[1,2,3].map(n=><div key={n} className="h-16 bg-slate-100 rounded-xl animate-pulse"/>)}</div>
          ) : d && (
            <>
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-2.5 text-xs text-amber-800">
                <Archive className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-600"/>
                <span>This is a <strong>legacy work order</strong> from the QS module. It is read-only here. To raise new bills, create a new SC Work Order linked to the same vendor.</span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {[
                  {l:'Project',      v: d.project_name},
                  {l:'Vendor',       v: d.vendor_name},
                  {l:'Vendor Type',  v: d.vendor_type},
                  {l:'Status',       v: d.status},
                  {l:'Start Date',   v: d.start_date ? dayjs(d.start_date).format('DD MMM YYYY') : '—'},
                  {l:'Contract Amt', v: fmt(d.contract_amount||d.total_value), bold: true},
                ].map(({l,v,bold})=>(
                  <div key={l} className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">{l}</p>
                    <p className={clsx('text-xs text-slate-800', bold && 'font-bold text-base text-emerald-700')}>{v||'—'}</p>
                  </div>
                ))}
              </div>

              {/* Tax info */}
              {(d.vendor_gst || d.vendor_pan) && (
                <div className="bg-white border border-slate-100 rounded-xl p-4 space-y-2">
                  {d.vendor_gst && <div className="flex justify-between text-xs"><span className="text-slate-500">GST Number</span><span className="font-mono font-bold">{d.vendor_gst}</span></div>}
                  {d.vendor_pan && <div className="flex justify-between text-xs"><span className="text-slate-500">PAN Number</span><span className="font-mono font-bold">{d.vendor_pan}</span></div>}
                </div>
              )}

              {/* BOQ Items */}
              {data?.items?.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">BOQ Items ({data.items.length})</p>
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-700">
                        <tr>{['Description','Unit','Qty','Rate','Amount'].map(h=>(
                          <th key={h} className="px-3 py-2 text-left font-bold text-white/80">{h}</th>
                        ))}</tr>
                      </thead>
                      <tbody>
                        {data.items.map((it,i)=>(
                          <tr key={it.id} className={clsx('border-t border-slate-100', i%2===0?'bg-white':'bg-slate-50/30')}>
                            <td className="px-3 py-2 max-w-[200px]">{it.description}</td>
                            <td className="px-3 py-2 text-slate-500">{it.unit||'—'}</td>
                            <td className="px-3 py-2 text-right">{it.quantity||'—'}</td>
                            <td className="px-3 py-2 text-right">{it.rate ? fmt(it.rate) : '—'}</td>
                            <td className="px-3 py-2 text-right font-bold text-indigo-600">{it.amount ? fmt(it.amount) : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {d.scope_of_work && (
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Scope of Work</p>
                  <p className="text-sm text-slate-700 bg-slate-50 rounded-xl p-3 whitespace-pre-wrap">{d.scope_of_work||d.work_description}</p>
                </div>
              )}
              {!d.scope_of_work && d.work_description && (
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Work Description</p>
                  <p className="text-sm text-slate-700 bg-slate-50 rounded-xl p-3">{d.work_description}</p>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex-shrink-0 flex justify-end px-5 py-4 border-t bg-slate-50">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-100">Close</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function SCWorkOrders() {
  const [search,      setSearch]   = useState('');
  const [projFilt,    setProj]     = useState(sessionStorage.getItem('selectedProjectId')||'');
  const [sourceTab,   setSource]   = useState('all');   // all | sc_module | legacy
  const [statusFilt,  setStatus]   = useState('');
  const [typeFilt,    setType]     = useState('');
  const [modal,       setModal]    = useState(null);    // null | 'new' | wo_obj
  const [newDrawer,   setNewDrawer]= useState(null);
  const [legacyDrawer,setLegacy]   = useState(null);

  const { data: projects=[] } = useQuery({ queryKey:['projects'], queryFn:()=>projectAPI.list().then(r=>r.data?.data??[]) });
  const { data: subs=[]      } = useQuery({ queryKey:['sc-list-all'], queryFn:()=>scAPI.listSC().then(r=>r.data?.data||[]), staleTime:0 });

  const { data: allWOs=[], isLoading, refetch } = useQuery({
    queryKey: ['sc-wo-all-view', projFilt],
    queryFn: () => scAPI.listAllWO({ project_id: projFilt||undefined }).then(r=>r.data?.data||[]),
    staleTime: 0, gcTime: 0, refetchOnMount: 'always',
  });

  const filtered = useMemo(() => {
    let list = allWOs;
    if (sourceTab !== 'all') list = list.filter(w => w.source === sourceTab);
    if (statusFilt)          list = list.filter(w => w.status === statusFilt);
    if (typeFilt)            list = list.filter(w => w.vendor_type?.toLowerCase().includes(typeFilt.toLowerCase()));
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(w => [w.wo_number,w.subject,w.vendor_name,w.project_name,w.sc_code].some(v=>v?.toLowerCase().includes(q)));
    }
    return list;
  }, [allWOs, sourceTab, statusFilt, typeFilt, search]);

  const kpi = useMemo(() => ({
    total:    allWOs.length,
    newSC:    allWOs.filter(w=>w.source==='sc_module').length,
    legacy:   allWOs.filter(w=>w.source==='legacy').length,
    active:   allWOs.filter(w=>['active','approved'].includes(w.status)).length,
    totalVal: allWOs.reduce((s,w)=>s+num(w.contract_amount),0),
    totalBilled: allWOs.filter(w=>w.source==='sc_module').reduce((s,w)=>s+num(w.total_billed),0),
  }), [allWOs]);

  const uniqueTypes = useMemo(() => [...new Set(allWOs.map(w=>w.vendor_type).filter(Boolean))], [allWOs]);

  const handleRowClick = (w) => {
    if (w.source === 'legacy') setLegacy(w);
    else setNewDrawer(w);
  };

  return (
    <div style={{ background: Theme.pageBg, minHeight:'100vh' }}>
      <PageHeader
        title="Work Order Management"
        subtitle="All subcontractor & labour contractor work orders — project-wise"
        breadcrumbs={[{label:'Subcontractors'},{label:'Work Orders'}]}
        actions={
          <button onClick={()=>setModal('new')}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg shadow-sm"
            style={{background:'#fff', color: Theme.navyDark}}>
            <Plus className="w-3.5 h-3.5"/> New Work Order
          </button>
        }
      />

      <div className="p-5 md:p-6 max-w-[1400px] mx-auto space-y-5">

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <ThemeKpiCard icon={Briefcase}    label="Total WOs"       value={kpi.total}                  color="blue"    sub="All work orders"/>
          <ThemeKpiCard icon={Layers}       label="SC Module"       value={kpi.newSC}                  color="emerald" sub="New SC work orders"/>
          <ThemeKpiCard icon={Archive}      label="Legacy WOs"      value={kpi.legacy}                 color="amber"   sub="From QS module"/>
          <ThemeKpiCard icon={CheckCircle}  label="Active"          value={kpi.active}                 color="orange"  sub="Active + Approved"/>
          <ThemeKpiCard icon={IndianRupee}  label="Total WO Value"  value={fmt(kpi.totalVal)}          color="slate"   sub="Combined contract"/>
          <ThemeKpiCard icon={IndianRupee}  label="Total Billed"    value={fmt(kpi.totalBilled)}       color="emerald" sub="SC module bills"/>
        </div>

        {/* Source tabs */}
        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 w-fit shadow-sm">
          {[
            {k:'all',       label:`All WOs (${allWOs.length})`},
            {k:'sc_module', label:`SC Module (${kpi.newSC})`},
            {k:'legacy',    label:`Legacy QS (${kpi.legacy})`},
          ].map(({k,label})=>(
            <button key={k} onClick={()=>setSource(k)}
              className={clsx('px-4 py-2 rounded-lg text-xs font-semibold transition-all',
                sourceTab===k ? 'text-white shadow-sm' : 'text-slate-600 hover:text-slate-800 hover:bg-slate-50')}
              style={sourceTab===k ? {background:`linear-gradient(135deg, ${Theme.navyLight} 0%, ${Theme.navyDark} 100%)`} : {}}>
              {label}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-52">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400"/>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search WO number, vendor, subject…"
              className="pl-9 pr-3 py-2 border border-slate-200 bg-white rounded-xl text-sm w-full focus:outline-none shadow-sm"/>
          </div>
          <select value={projFilt} onChange={e=>setProj(e.target.value)}
            className="border border-slate-200 bg-white rounded-xl px-3 py-2 text-sm shadow-sm focus:outline-none min-w-48">
            <option value="">All Projects</option>
            {projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={statusFilt} onChange={e=>setStatus(e.target.value)}
            className="border border-slate-200 bg-white rounded-xl px-3 py-2 text-sm shadow-sm focus:outline-none">
            <option value="">All Status</option>
            {Object.entries(STATUS_META).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={typeFilt} onChange={e=>setType(e.target.value)}
            className="border border-slate-200 bg-white rounded-xl px-3 py-2 text-sm shadow-sm focus:outline-none">
            <option value="">All Types</option>
            {uniqueTypes.map(t=><option key={t} value={t}>{t}</option>)}
          </select>
          <button onClick={()=>refetch()} className="p-2 border border-slate-200 bg-white rounded-xl hover:bg-slate-50 shadow-sm">
            <RefreshCw className="w-4 h-4 text-slate-500"/>
          </button>
          <span className="flex items-center text-xs text-slate-400 ml-auto font-medium">{filtered.length} of {allWOs.length} records</span>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          {isLoading ? (
            <div className="p-5 space-y-2">{[1,2,3,4,5].map(n=><div key={n} className="h-12 bg-slate-100 rounded-xl animate-pulse"/>)}</div>
          ) : filtered.length===0 ? (
            <div className="py-20 text-center">
              <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Briefcase className="w-8 h-8 text-slate-300"/>
              </div>
              <p className="text-slate-500 font-semibold">No work orders found</p>
              <p className="text-xs text-slate-400 mt-1">{search||projFilt||statusFilt?'Try adjusting filters':'Create the first work order'}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{background:`linear-gradient(90deg, ${Theme.navy} 0%, ${Theme.navyDark} 100%)`}}>
                    {['','WO Number','Project','Vendor / Subcontractor','Subject','Category','Contract Amt','Billed','Status','DLP','Actions'].map(h=>(
                      <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-white/80 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((w,i)=>{
                    const sm = STATUS_META[w.status] || STATUS_META.draft;
                    const isLegacy = w.source === 'legacy';
                    return (
                      <tr key={w.id}
                        className={clsx('border-b border-slate-50 hover:bg-emerald-50/30 transition-colors cursor-pointer', i%2===0?'bg-white':'bg-slate-50/30')}
                        onClick={()=>handleRowClick(w)}>
                        {/* Source badge */}
                        <td className="px-3 py-3">
                          <span className={clsx('text-[9px] px-1.5 py-0.5 rounded font-bold uppercase',
                            isLegacy ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'bg-emerald-100 text-emerald-700 border border-emerald-200')}>
                            {isLegacy ? 'Legacy' : 'New'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={clsx('font-mono text-xs font-bold', isLegacy?'text-amber-700':'text-emerald-600')}>{w.wo_number}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600 max-w-[150px] truncate">{w.project_name}</td>
                        <td className="px-4 py-3">
                          <p className="text-xs font-semibold text-slate-800">{w.vendor_name}</p>
                          {w.sc_code && <p className="text-[10px] text-slate-400 font-mono">{w.sc_code}</p>}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-700 max-w-[200px] truncate">{w.subject}</td>
                        <td className="px-4 py-3">
                          {/* For new SC module WOs: use contractor_type */}
                          {w.source === 'sc_module' && w.contractor_type && (() => {
                            const ct = CT_META[w.contractor_type] || CT_META.sub_contractor;
                            return (
                              <span className={clsx('inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold', ct.bg, ct.text)}>
                                <span className="w-1.5 h-1.5 rounded-full" style={{ background: ct.dot }} />
                                {ct.short} — {ct.label}
                              </span>
                            );
                          })()}
                          {/* For legacy WOs: use vendor_type */}
                          {w.source === 'legacy' && w.vendor_type && (
                            <span className={clsx('text-[10px] px-2 py-0.5 rounded-full font-semibold', VENDOR_TYPE_BADGE[w.vendor_type]||'bg-slate-100 text-slate-600')}>
                              {w.vendor_type}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-xs font-bold text-slate-800">{fmt(w.contract_amount)}</td>
                        <td className="px-4 py-3 text-right text-xs font-semibold text-indigo-600">
                          {w.total_billed > 0 ? fmt(w.total_billed) : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span className={clsx('text-[10px] px-2 py-0.5 rounded-full font-semibold capitalize', sm.bg, sm.text)}>{sm.label}</span>
                        </td>
                        {/* DLP chip */}
                        <td className="px-4 py-3">
                          {w.dlp_end_date ? (() => {
                            const days = dayjs(w.dlp_end_date).diff(dayjs(), 'day');
                            const expired = days < 0;
                            const soon    = days >= 0 && days <= 30;
                            return (
                              <span className={clsx('text-[9px] px-1.5 py-0.5 rounded font-bold whitespace-nowrap',
                                expired ? 'bg-red-100 text-red-700'
                                  : soon  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-emerald-100 text-emerald-700')}>
                                {expired ? `Expired ${Math.abs(days)}d ago`
                                  : soon  ? `${days}d left`
                                  : dayjs(w.dlp_end_date).format('DD MMM YY')}
                              </span>
                            );
                          })() : <span className="text-slate-300 text-[10px]">—</span>}
                        </td>
                        <td className="px-4 py-3" onClick={e=>e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            <button onClick={()=>handleRowClick(w)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50" title="View">
                              <Eye className="w-4 h-4"/>
                            </button>
                            {!isLegacy && (
                              <button onClick={()=>setModal(w)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50" title="Edit">
                                <Edit2 className="w-4 h-4"/>
                              </button>
                            )}
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

      {modal && (
        <WOForm
          wo={modal==='new' ? null : modal}
          projects={projects}
          subcontractors={subs}
          onClose={()=>setModal(null)}
        />
      )}
      {newDrawer && (
        <NewWODrawer
          wo={newDrawer}
          onClose={()=>setNewDrawer(null)}
          onEdit={w=>{ setNewDrawer(null); setModal(w); }}
        />
      )}
      {legacyDrawer && (
        <LegacyWODrawer
          woId={legacyDrawer.id}
          woRow={legacyDrawer}
          onClose={()=>setLegacy(null)}
        />
      )}
    </div>
  );
}
