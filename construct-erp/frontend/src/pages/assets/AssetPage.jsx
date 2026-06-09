// Asset Master — Snipe-IT style
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import {
  Plus, Search, Download, Upload, Edit2, Trash2, Eye, Printer,
  CheckSquare, CornerDownLeft, Filter, X, RefreshCw,
  Truck, Wrench, Package, Settings, Tag, MapPin, Calendar,
  AlertCircle, ChevronDown, MoreVertical, Copy,
} from 'lucide-react';
import { assetAPI, assetMgmtAPI, projectAPI } from '../../api/client';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';

// ─── QR Print Preview ─────────────────────────────────────────────
function QRPrintPreview({ assets, onClose }) {
  useEffect(() => {
    // Inject print-only CSS: hide everything except our QR zone
    const style = document.createElement('style');
    style.id = '__qr_print_style__';
    style.textContent = `
      @media print {
        body > * { visibility: hidden !important; }
        #qr-print-zone, #qr-print-zone * { visibility: visible !important; }
        #qr-print-zone {
          position: fixed !important;
          top: 0 !important; left: 0 !important;
          width: 100% !important; background: white !important;
          padding: 16px !important;
        }
        .qr-label { page-break-inside: avoid; }
      }
    `;
    document.head.appendChild(style);
    return () => { document.getElementById('__qr_print_style__')?.remove(); };
  }, []);

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-start justify-center overflow-y-auto p-6">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl my-4">
        {/* Header — hidden when printing */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{printColorAdjust:'exact'}}>
          <div>
            <h2 className="font-bold text-slate-800 text-lg">QR Labels</h2>
            <p className="text-xs text-slate-400">{assets.length} asset{assets.length!==1?'s':''} · click Print to send to printer</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700">
              <Printer className="w-4 h-4" /> Print
            </button>
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* QR grid — this is what gets printed */}
        <div id="qr-print-zone" className="p-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {assets.map(a => (
              <div key={a.id} className="qr-label border border-slate-200 rounded-xl p-4 flex flex-col items-center gap-2 text-center">
                <QRCodeSVG
                  value={`BCIM|${a.asset_code}|${a.asset_name}|${a.serial_number||'N/A'}`}
                  size={120} level="H"
                  style={{display:'block'}}
                />
                <div className="font-mono text-sm font-bold text-indigo-700">{a.asset_code}</div>
                <div className="text-[11px] text-slate-600 leading-tight max-w-[140px]">{a.asset_name}</div>
                {a.brand && <div className="text-[10px] text-slate-400">{a.brand}{a.model ? ` · ${a.model}`:''}</div>}
                {a.serial_number && <div className="text-[10px] text-slate-400 font-mono">S/N: {a.serial_number}</div>}
                <div className="text-[9px] text-slate-300 uppercase tracking-widest">BCIM Engineering</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Status config ────────────────────────────────────────────────
const STATUS = {
  available:   { label: 'Ready to Deploy', dot: '#22c55e', bg: '#f0fdf4', text: '#15803d', border: '#bbf7d0' },
  assigned:    { label: 'Deployed',         dot: '#3b82f6', bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' },
  maintenance: { label: 'Maintenance',      dot: '#f97316', bg: '#fff7ed', text: '#c2410c', border: '#fed7aa' },
  breakdown:   { label: 'Breakdown',        dot: '#ef4444', bg: '#fef2f2', text: '#b91c1c', border: '#fecaca' },
  disposed:    { label: 'Archived',         dot: '#94a3b8', bg: '#f8fafc', text: '#475569', border: '#e2e8f0' },
  retired:     { label: 'Retired',          dot: '#94a3b8', bg: '#f8fafc', text: '#475569', border: '#e2e8f0' },
  transferred: { label: 'Transferred',      dot: '#8b5cf6', bg: '#f5f3ff', text: '#6d28d9', border: '#ddd6fe' },
  in_use:      { label: 'In Use',           dot: '#06b6d4', bg: '#ecfeff', text: '#0e7490', border: '#a5f3fc' },
};

function StatusBadge({ status }) {
  const s = STATUS[status] || { label: status, dot: '#94a3b8', bg: '#f8fafc', text: '#475569', border: '#e2e8f0' };
  return (
    <span style={{ background: s.bg, color: s.text, border: `1px solid ${s.border}` }}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap">
      <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: s.dot }} />
      {s.label}
    </span>
  );
}

// ─── Asset type icon ──────────────────────────────────────────────
const TYPE_ICON_MAP = {
  'Tipper Truck': Truck, 'JCB': Truck, 'Excavator': Truck, 'Crane': Truck,
  'Water Tanker': Truck, 'Generator': Settings, 'Compactor': Settings,
  'Power Tools': Wrench, 'Survey Equipment': Wrench, 'Bar Bending Machine': Wrench,
  office_equipment: Package, furniture: Package, appliance: Settings,
};
function AssetIcon({ type, className = '' }) {
  const Icon = TYPE_ICON_MAP[type] || Package;
  return <Icon className={className} />;
}

// ─── Category colors ──────────────────────────────────────────────
const fmtCur = (v) => v ? `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '—';

// ─── Asset form modal ─────────────────────────────────────────────
const ASSET_TYPES = [
  { value:'Excavator',label:'Excavator'},{ value:'Crane',label:'Crane'},{ value:'Concrete Mixer',label:'Concrete Mixer'},
  { value:'Generator',label:'Generator'},{ value:'Compactor',label:'Compactor'},{ value:'Tipper Truck',label:'Tipper Truck'},
  { value:'JCB',label:'JCB'},{ value:'Water Tanker',label:'Water Tanker'},{ value:'Bar Bending Machine',label:'Bar Bending Machine'},
  { value:'Concrete Pump',label:'Concrete Pump'},{ value:'Tower Crane',label:'Tower Crane'},{ value:'Survey Equipment',label:'Survey Equipment'},
  { value:'Power Tools',label:'Power Tools'},{ value:'office_equipment',label:'Office Equipment'},{ value:'furniture',label:'Furniture'},
  { value:'appliance',label:'Air Conditioner / Appliance'},{ value:'electrical',label:'Electrical'},{ value:'Other',label:'Other'},
];

function AssetFormModal({ editAsset, projects, categories, onClose }) {
  const qc = useQueryClient();
  const isEdit = !!editAsset;
  const [form, setForm] = useState(isEdit ? {
    ...editAsset,
    purchase_date: editAsset.purchase_date?.slice(0,10)||'',
    warranty_expiry: editAsset.warranty_expiry?.slice(0,10)||'',
    amc_expiry: editAsset.amc_expiry?.slice(0,10)||'',
    insurance_expiry: editAsset.insurance_expiry?.slice(0,10)||'',
    fitness_expiry: editAsset.fitness_expiry?.slice(0,10)||'',
    pollution_expiry: editAsset.pollution_expiry?.slice(0,10)||'',
    road_tax_expiry: editAsset.road_tax_expiry?.slice(0,10)||'',
  } : {
    asset_code:'', asset_name:'', asset_type:'Other', brand:'', model:'',
    serial_number:'', po_number:'', invoice_number:'', department:'', current_location:'',
    purchase_value:'', purchase_date:'', useful_life_years:'', salvage_value:'',
    depreciation_method:'straight_line', warranty_expiry:'', amc_expiry:'',
    insurance_policy_no:'', insurance_expiry:'', insurance_value:'',
    fitness_expiry:'', pollution_expiry:'', road_tax_expiry:'',
    meter_type:'Hours', fuel_type:'Diesel', current_meter:'0', category_id:'', notes:'',
  });
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const [tab, setTab] = useState('basic');

  const mut = useMutation({
    mutationFn: d => isEdit ? assetAPI.update(editAsset.id, d) : assetAPI.create(d),
    onSuccess: () => { toast.success(isEdit?'Asset updated':'Asset registered'); qc.invalidateQueries({queryKey:['assets-all']}); onClose(); },
    onError: e => toast.error(e?.response?.data?.error||'Save failed'),
  });

  const TABS = [['basic','Basic Info'],['procurement','Procurement'],['financial','Financial'],['compliance','Compliance']];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden my-8" style={{boxShadow:'0 25px 50px -12px rgba(0,0,0,0.4)'}}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-slate-700 to-slate-800">
          <div>
            <h2 className="font-bold text-white text-lg">{isEdit ? `Edit — ${editAsset.asset_code}` : 'Register New Asset'}</h2>
            <p className="text-slate-400 text-xs mt-0.5">Plant, Equipment, Tools or Admin Asset</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center bg-white/10 hover:bg-white/20 text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        {/* Tab bar */}
        <div className="overflow-x-auto border-b" style={{ scrollbarWidth: 'none' }}>
          <div className="flex min-w-max">
            {TABS.map(([k,l])=>(
              <button key={k} onClick={()=>setTab(k)}
                className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${tab===k?'border-indigo-600 text-indigo-700 bg-indigo-50/50':'border-transparent text-slate-500 hover:text-slate-700'}`}>
                {l}
              </button>
            ))}
          </div>
        </div>
        {/* Body */}
        <div className="p-6">
          {tab==='basic' && (
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Asset Tag / Code *</label>
                <input value={form.asset_code} onChange={e=>set('asset_code',e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 outline-none" placeholder="e.g. EQ-GEN-001, TL-JCB-001" />
                {!isEdit && <p className="text-[11px] text-slate-400 mt-1">Format: <span className="font-mono">TYPE-SEQUENCE</span> e.g. EQ-AC-001, TL-JCB-002, IT-LAP-005</p>}</div>
              <div className="col-span-1"><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Asset Name *</label>
                <input value={form.asset_name} onChange={e=>set('asset_name',e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300 outline-none" /></div>
              <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Asset Type</label>
                <select value={form.asset_type} onChange={e=>set('asset_type',e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none">
                  {ASSET_TYPES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
              <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Category</label>
                <select value={form.category_id||''} onChange={e=>set('category_id',e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none">
                  <option value="">— No category —</option>
                  {categories.map(c=><option key={c.id} value={c.id}>{c.parent_name?`${c.parent_name} › ${c.name}`:c.name}</option>)}</select></div>
              <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Brand / Make</label>
                <input value={form.brand||''} onChange={e=>set('brand',e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none" /></div>
              <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Model</label>
                <input value={form.model||''} onChange={e=>set('model',e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none" /></div>
              <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Serial Number</label>
                <input value={form.serial_number||''} onChange={e=>set('serial_number',e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none" /></div>
              <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Base Location</label>
                <select value={form.current_location||''} onChange={e=>set('current_location',e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none">
                  <option value="">Central Yard / Store</option>
                  {projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
              <div className="col-span-2"><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Notes</label>
                <textarea value={form.notes||''} onChange={e=>set('notes',e.target.value)} rows={2} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none resize-none" /></div>
            </div>
          )}
          {tab==='procurement' && (
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">PO Number</label>
                <input value={form.po_number||''} onChange={e=>set('po_number',e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none" /></div>
              <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Invoice Number</label>
                <input value={form.invoice_number||''} onChange={e=>set('invoice_number',e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none" /></div>
              <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Purchase Date</label>
                <input type="date" value={form.purchase_date||''} onChange={e=>set('purchase_date',e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none" /></div>
              <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Purchase Value (₹)</label>
                <input type="number" value={form.purchase_value||''} onChange={e=>set('purchase_value',e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none" /></div>
              <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Warranty Expiry</label>
                <input type="date" value={form.warranty_expiry||''} onChange={e=>set('warranty_expiry',e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none" /></div>
              <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">AMC Expiry</label>
                <input type="date" value={form.amc_expiry||''} onChange={e=>set('amc_expiry',e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none" /></div>
            </div>
          )}
          {tab==='financial' && (
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Useful Life (Years)</label>
                <input type="number" value={form.useful_life_years||''} onChange={e=>set('useful_life_years',e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none" /></div>
              <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Salvage Value (₹)</label>
                <input type="number" value={form.salvage_value||''} onChange={e=>set('salvage_value',e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none" /></div>
              <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Depreciation Method</label>
                <select value={form.depreciation_method||'straight_line'} onChange={e=>set('depreciation_method',e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none">
                  <option value="straight_line">Straight Line (SLM)</option>
                  <option value="wdv">Written Down Value (WDV)</option></select></div>
              <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Insurance Policy No.</label>
                <input value={form.insurance_policy_no||''} onChange={e=>set('insurance_policy_no',e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none" /></div>
              <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Insurance Expiry</label>
                <input type="date" value={form.insurance_expiry||''} onChange={e=>set('insurance_expiry',e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none" /></div>
              <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Insured Value (₹)</label>
                <input type="number" value={form.insurance_value||''} onChange={e=>set('insurance_value',e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none" /></div>
            </div>
          )}
          {tab==='compliance' && (
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Fitness Certificate Expiry</label>
                <input type="date" value={form.fitness_expiry||''} onChange={e=>set('fitness_expiry',e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none" /></div>
              <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Pollution Certificate Expiry</label>
                <input type="date" value={form.pollution_expiry||''} onChange={e=>set('pollution_expiry',e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none" /></div>
              <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Road Tax / Reg. Expiry</label>
                <input type="date" value={form.road_tax_expiry||''} onChange={e=>set('road_tax_expiry',e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none" /></div>
              <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Meter Type</label>
                <select value={form.meter_type||'Hours'} onChange={e=>set('meter_type',e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none">
                  <option value="Hours">Working Hours</option><option value="Km">Kilometers</option></select></div>
              <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Fuel Type</label>
                <select value={form.fuel_type||'Diesel'} onChange={e=>set('fuel_type',e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none">
                  <option>Diesel</option><option>Petrol</option><option>Electric</option><option>Manual</option></select></div>
              <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Current Meter</label>
                <input type="number" value={form.current_meter||0} onChange={e=>set('current_meter',e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none" /></div>
            </div>
          )}
        </div>
        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t bg-slate-50">
          <div className="flex gap-1">
            {TABS.map(([k],i)=>(
              <div key={k} className={`w-2 h-2 rounded-full transition-colors ${tab===k?'bg-indigo-600':'bg-slate-300'}`} />
            ))}
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-100">Cancel</button>
            <button onClick={()=>mut.mutate(form)} disabled={!form.asset_code||!form.asset_name||mut.isPending}
              className="px-6 py-2 text-sm font-semibold text-white rounded-lg disabled:opacity-50 transition-colors"
              style={{background:'#4f46e5'}}>
              {mut.isPending?'Saving…':isEdit?'Update Asset':'Register Asset'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Asset detail panel ───────────────────────────────────────────
function AssetDetailPanel({ asset: a, onClose, onEdit, onPrintQR, qc }) {
  const [detailTab, setDetailTab] = useState('overview');

  const deleteMut = useMutation({
    mutationFn: () => assetAPI.delete(a.id),
    onSuccess: ()=>{ toast.success('Asset disposed'); qc.invalidateQueries({queryKey:['assets-all']}); onClose(); },
    onError: e=>toast.error(e?.response?.data?.error||'Failed'),
  });

  const s = STATUS[a.status] || STATUS.available;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1" onClick={onClose} />
      <div className="w-full max-w-[560px] bg-white shadow-2xl flex flex-col h-full border-l border-slate-200">
        {/* Asset header */}
        <div className="flex-shrink-0" style={{background:'linear-gradient(135deg, #1e293b 0%, #334155 100%)'}}>
          <div className="flex items-start justify-between p-5 pb-3">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-white/15 flex items-center justify-center">
                <AssetIcon type={a.asset_type} className="w-8 h-8 text-white/80" />
              </div>
              <div>
                <p className="text-white/60 text-xs font-mono">{a.asset_code}</p>
                <h2 className="text-white font-bold text-lg leading-tight">{a.asset_name}</h2>
                <p className="text-white/50 text-xs mt-0.5">{a.brand} {a.model}</p>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center bg-white/10 hover:bg-white/20 text-white/70">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="px-5 pb-4 flex items-center gap-3">
            <StatusBadge status={a.status} />
            {a.category_name && <span className="text-xs text-white/40 bg-white/10 px-2 py-0.5 rounded-md">{a.category_name}</span>}
          </div>
          {/* Action buttons */}
          <div className="flex gap-2 px-5 pb-4">
            <button onClick={onEdit} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-medium rounded-lg transition-colors">
              <Edit2 className="w-3.5 h-3.5" /> Edit
            </button>
            <button onClick={()=>{ if(window.confirm(`Dispose "${a.asset_name}"?`)) deleteMut.mutate(); }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-red-500 text-white/70 hover:text-white text-xs font-medium rounded-lg transition-colors">
              <Trash2 className="w-3.5 h-3.5" /> Dispose
            </button>
          </div>
          {/* Detail tabs */}
          <div className="overflow-x-auto border-t border-white/10" style={{ scrollbarWidth: 'none' }}>
            <div className="flex min-w-max">
              {[['overview','Overview'],['financial','Financial'],['compliance','Compliance'],['qr','QR Code']].map(([k,l])=>(
                <button key={k} onClick={()=>setDetailTab(k)}
                  className={`flex-1 py-2.5 text-xs font-medium transition-colors whitespace-nowrap px-4 ${detailTab===k?'bg-white/15 text-white border-b-2 border-indigo-400':'text-white/50 hover:text-white/80'}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Detail content */}
        <div className="flex-1 overflow-y-auto">
          {detailTab==='overview' && (
            <div className="p-5 space-y-4">
              {/* Key metrics */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  ['Location', a.current_project_name||'Central Yard'],
                  ['Type', a.asset_type],
                  ['Serial No.', a.serial_number||'—'],
                  ['Meter', `${Number(a.current_meter||0).toLocaleString()} ${a.meter_type||'hrs'}`],
                ].map(([l,v])=>(
                  <div key={l} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                    <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">{l}</p>
                    <p className="text-sm font-semibold text-slate-800 mt-0.5 truncate">{v}</p>
                  </div>
                ))}
              </div>
              {/* Info rows */}
              <div className="border border-slate-100 rounded-xl overflow-hidden">
                {[
                  ['PO Number', a.po_number],
                  ['Invoice Number', a.invoice_number],
                  ['Purchase Date', a.purchase_date ? dayjs(a.purchase_date).format('DD MMM YYYY') : null],
                  ['Purchase Value', a.purchase_value ? fmtCur(a.purchase_value) : null],
                  ['Department', a.department],
                  ['Notes', a.notes],
                ].filter(([,v])=>v).map(([l,v],i)=>(
                  <div key={l} className={`flex items-center gap-4 px-4 py-3 ${i%2===0?'bg-white':'bg-slate-50/50'}`}>
                    <span className="text-xs text-slate-400 w-28 flex-shrink-0">{l}</span>
                    <span className="text-xs text-slate-700 font-medium">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {detailTab==='financial' && (
            <div className="p-5 space-y-3">
              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
                <p className="text-xs text-indigo-500 font-semibold uppercase tracking-wider mb-2">Asset Value</p>
                <div className="text-3xl font-bold text-indigo-700">{fmtCur(a.purchase_value)}</div>
                <p className="text-xs text-indigo-400 mt-1">Purchase value · {a.depreciation_method?.replace('_',' ')}</p>
              </div>
              {[
                ['Useful Life', a.useful_life_years ? `${a.useful_life_years} years`:null],
                ['Salvage Value', a.salvage_value ? fmtCur(a.salvage_value):null],
                ['Depreciation Method', a.depreciation_method?.replace(/_/g,' ')],
                ['Insurance Policy', a.insurance_policy_no],
                ['Insurance Value', a.insurance_value ? fmtCur(a.insurance_value):null],
                ['Insurance Expiry', a.insurance_expiry ? dayjs(a.insurance_expiry).format('DD MMM YYYY'):null],
                ['Warranty Expiry', a.warranty_expiry ? dayjs(a.warranty_expiry).format('DD MMM YYYY'):null],
                ['AMC Expiry', a.amc_expiry ? dayjs(a.amc_expiry).format('DD MMM YYYY'):null],
              ].filter(([,v])=>v).map(([l,v],i)=>(
                <div key={l} className={`flex items-center gap-4 px-4 py-3 rounded-xl border ${i%2===0?'bg-white border-slate-100':'bg-slate-50 border-slate-100'}`}>
                  <span className="text-xs text-slate-400 w-32 flex-shrink-0">{l}</span>
                  <span className="text-xs text-slate-700 font-semibold">{v}</span>
                </div>
              ))}
            </div>
          )}
          {detailTab==='compliance' && (
            <div className="p-5 space-y-3">
              {[
                ['Fitness Certificate', a.fitness_expiry],
                ['Pollution Certificate', a.pollution_expiry],
                ['Road Tax / Registration', a.road_tax_expiry],
              ].map(([l,d])=>{
                const days = d ? Math.ceil((new Date(d)-new Date())/(1000*60*60*24)) : null;
                const expired = days!==null && days<0;
                const urgent  = days!==null && days>=0 && days<=30;
                return (
                  <div key={l} className={`flex items-center justify-between p-4 rounded-xl border ${expired?'bg-red-50 border-red-200':urgent?'bg-amber-50 border-amber-200':'bg-white border-slate-100'}`}>
                    <div>
                      <p className="text-sm font-medium text-slate-700">{l}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{d ? dayjs(d).format('DD MMM YYYY') : 'Not set'}</p>
                    </div>
                    {days!==null && (
                      <span className={`text-sm font-bold ${expired?'text-red-600':urgent?'text-amber-600':'text-emerald-600'}`}>
                        {expired ? `${Math.abs(days)}d overdue` : days===0 ? 'Today' : `${days}d`}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {detailTab==='qr' && (
            <div className="p-5 flex flex-col items-center gap-4">
              <div className="bg-white border-2 border-slate-100 rounded-2xl p-6 shadow-sm">
                <QRCodeSVG value={`BCIM | ${a.asset_code} | ${a.asset_name} | ${a.serial_number||'—'}`} size={200} level="H" />
              </div>
              <div className="text-center">
                <p className="font-bold text-slate-800 text-lg">{a.asset_code}</p>
                <p className="text-sm text-slate-500">{a.asset_name}</p>
              </div>
              <button onClick={onPrintQR} className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700">
                <Printer className="w-4 h-4" /> Print QR Label
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════
export default function AssetPage() {
  const qc = useQueryClient();
  const [search, setSearch]       = useState('');
  const [statusFilter, setStatus] = useState('all');
  const [typeFilter, setType]     = useState('all');
  const [selected, setSelected]   = useState(null);  // detail panel
  const [editAsset, setEdit]      = useState(null);   // edit modal
  const [showAdd, setShowAdd]     = useState(false);
  const [selectedIds, setIds]     = useState(new Set());
  const [showQRPrint, setQRPrint] = useState(false);
  const importRef = useRef();

  const { data: assets = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['assets-all'],
    queryFn: () => assetAPI.list().then(r=>r.data?.data||[]),
    retry: 2,
  });
  const { data: projects = [] } = useQuery({ queryKey:['projects'], queryFn:()=>projectAPI.list().then(r=>r.data?.data??[]) });
  const { data: categories = [] } = useQuery({ queryKey:['asset-categories'], queryFn:()=>assetMgmtAPI.listCategories().then(r=>r.data?.data||[]) });

  const deleteMut = useMutation({
    mutationFn: id => assetAPI.delete(id),
    onSuccess: ()=>{ toast.success('Asset disposed'); qc.invalidateQueries({queryKey:['assets-all']}); setSelected(null); },
    onError: e=>toast.error(e?.response?.data?.error||'Failed'),
  });

  const filtered = useMemo(()=>assets.filter(a=>{
    if(statusFilter!=='all' && a.status!==statusFilter) return false;
    if(typeFilter!=='all' && a.asset_type!==typeFilter) return false;
    if(search){ const q=search.toLowerCase(); return [a.asset_code,a.asset_name,a.brand,a.model,a.serial_number,a.current_project_name].some(v=>v?.toLowerCase().includes(q)); }
    return true;
  }),[assets,statusFilter,typeFilter,search]);

  // Status counts
  const counts = useMemo(()=>{
    const m={all:assets.length};
    assets.forEach(a=>{ m[a.status]=(m[a.status]||0)+1; });
    return m;
  },[assets]);

  const toggleId = (id)=>setIds(prev=>{ const n=new Set(prev); n.has(id)?n.delete(id):n.add(id); return n; });
  const allSelected = filtered.length>0 && filtered.every(a=>selectedIds.has(a.id));

  const STATUS_FILTERS = [
    {k:'all',     l:'All',          color:'#64748b'},
    {k:'available',l:'Ready',       color:'#22c55e'},
    {k:'assigned', l:'Deployed',    color:'#3b82f6'},
    {k:'maintenance',l:'Maint.',    color:'#f97316'},
    {k:'breakdown',l:'Breakdown',   color:'#ef4444'},
    {k:'disposed', l:'Archived',    color:'#94a3b8'},
  ];

  const exportCSV = () => {
    const rows = [
      ['Code','Name','Type','Category','Brand','Model','Serial','Location','Status','Purchase Value','Purchase Date'],
      ...filtered.map(a=>[a.asset_code,a.asset_name,a.asset_type,a.category_name||'',a.brand||'',a.model||'',a.serial_number||'',a.current_project_name||'Central Yard',a.status,a.purchase_value||0,a.purchase_date||''])
    ];
    const csv=rows.map(r=>r.map(v=>`"${v}"`).join(',')).join('\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
    const el=document.createElement('a'); el.href=url; el.download='asset-register.csv'; el.click();
  };

  return (
    <div className="h-full flex flex-col bg-slate-50">
      {/* Top toolbar */}
      <div className="flex-shrink-0 bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Asset Master</h1>
            <p className="text-xs text-slate-400 mt-0.5">
              {assets.length} total assets · {fmtCur(assets.reduce((s,a)=>s+parseFloat(a.purchase_value||0),0))} total value
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={()=>qc.invalidateQueries({queryKey:['assets-all']})} className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-500"><RefreshCw className="w-4 h-4" /></button>
            <button onClick={exportCSV} className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600 text-sm font-medium">
              <Download className="w-4 h-4" /> Export
            </button>
            <input ref={importRef} type="file" accept=".csv" className="hidden" onChange={async e=>{
              const file=e.target.files?.[0]; if(!file) return;
              const text=await file.text();
              // Proper CSV parser — handles quoted fields with commas inside
              const parseCSVLine=(line)=>{
                const result=[]; let cur=''; let inQ=false;
                for(let i=0;i<line.length;i++){
                  if(line[i]==='"'){ inQ=!inQ; }
                  else if(line[i]===','&&!inQ){ result.push(cur.trim()); cur=''; }
                  else { cur+=line[i]; }
                }
                result.push(cur.trim());
                return result;
              };
              const lines=text.trim().split(/\r?\n/);
              const headers=parseCSVLine(lines[0]).map(h=>h.replace(/^"|"$/g,'').trim().toLowerCase().replace(/\s+/g,'_'));
              const rows=lines.slice(1).filter(l=>l.trim()).map(l=>{
                const vals=parseCSVLine(l).map(v=>v.replace(/^"|"$/g,'').trim());
                const o={}; headers.forEach((h,i)=>o[h]=vals[i]||''); return o;
              }).filter(r=>r.asset_code&&r.asset_name&&r.asset_type);
              if(!rows.length){ toast.error('No valid rows — ensure columns: asset_code, asset_name, asset_type'); return; }
              try {
                const res=await assetAPI.bulkImport(rows);
                toast.success(res.data?.message||`Imported ${rows.length} assets`);
                qc.invalidateQueries({queryKey:['assets-all']});
              } catch(err){ toast.error(err?.response?.data?.error||'Import failed'); }
              e.target.value='';
            }} />
            <button onClick={()=>importRef.current?.click()} className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600 text-sm font-medium">
              <Upload className="w-4 h-4" /> Import
            </button>
            <button onClick={()=>setShowAdd(true)} style={{background:'#4f46e5'}}
              className="flex items-center gap-1.5 px-4 py-2 text-white rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity">
              <Plus className="w-4 h-4" /> Add Asset
            </button>
          </div>
        </div>

        {/* Status filter chips */}
        <div className="flex items-center gap-2 mt-4 flex-wrap">
          {STATUS_FILTERS.map(f=>(
            <button key={f.k} onClick={()=>setStatus(f.k)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${statusFilter===f.k?'text-white shadow-sm':' bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
              style={statusFilter===f.k?{background:f.color,borderColor:f.color}:{}}>
              <span className="w-1.5 h-1.5 rounded-full" style={{background:f.color}} />
              {f.l} <span className={`ml-0.5 ${statusFilter===f.k?'text-white/70':'text-slate-400'}`}>({counts[f.k]||0})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Search + secondary filters */}
      <div className="flex-shrink-0 bg-white border-b border-slate-100 px-6 py-3 flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search assets, serial numbers…"
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" />
          {search && <button onClick={()=>setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>}
        </div>
        <select value={typeFilter} onChange={e=>setType(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-600 outline-none focus:border-indigo-300">
          <option value="all">All Types</option>
          {[...new Set(assets.map(a=>a.asset_type))].sort().map(t=><option key={t} value={t}>{t}</option>)}
        </select>
        <span className="text-xs text-slate-400 ml-auto">{filtered.length} of {assets.length}</span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="flex flex-col items-center gap-3">
              <RefreshCw className="w-8 h-8 animate-spin text-indigo-500" />
              <span className="text-sm text-slate-400">Loading assets…</span>
            </div>
          </div>
        ) : isError ? (
          <div className="flex items-center justify-center h-64">
            <div className="flex flex-col items-center gap-3 text-center">
              <AlertCircle className="w-10 h-10 text-red-400" />
              <p className="text-slate-600 font-medium">Could not load assets</p>
              <p className="text-xs text-slate-400 mb-2">The server returned an error. Please try again.</p>
              <button onClick={()=>refetch()} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700">
                <RefreshCw className="w-3.5 h-3.5" /> Retry
              </button>
            </div>
          </div>
        ) : (
          <table className="w-full" style={{borderCollapse:'separate', borderSpacing:0}}>
            <thead className="sticky top-0 z-10">
              <tr style={{background:'#f8fafc'}}>
                <th className="w-10 px-4 py-3 border-b border-slate-200">
                  <input type="checkbox" checked={allSelected} onChange={()=>{ if(allSelected) setIds(new Set()); else setIds(new Set(filtered.map(a=>a.id))); }} className="rounded" />
                </th>
                {['Asset Tag','Asset Name / Model','Category','Department','Location','Status','Purchase Value','Actions'].map(h=>(
                  <th key={h} className="px-4 py-3 text-left border-b border-slate-200 text-[11px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white">
              {filtered.length===0 ? (
                <tr><td colSpan={9} className="py-20 text-center">
                  <Package className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                  <p className="text-slate-400 font-medium">No assets found</p>
                  <p className="text-xs text-slate-300 mt-1">Try adjusting your filters or search terms</p>
                </td></tr>
              ) : filtered.map((a,idx)=>(
                <tr key={a.id}
                  className={`border-b border-slate-100 cursor-pointer transition-colors ${selectedIds.has(a.id)?'bg-indigo-50/60':idx%2===0?'bg-white hover:bg-slate-50/80':'bg-slate-50/30 hover:bg-slate-100/60'}`}>
                  <td className="px-4 py-3" onClick={e=>e.stopPropagation()}>
                    <input type="checkbox" checked={selectedIds.has(a.id)} onChange={()=>toggleId(a.id)} className="rounded" />
                  </td>
                  <td className="px-4 py-3" onClick={()=>setSelected(a)}>
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-indigo-50 flex-shrink-0">
                        <AssetIcon type={a.asset_type} className="w-4 h-4 text-indigo-600" />
                      </div>
                      <span className="font-mono font-bold text-indigo-600 text-sm hover:underline">{a.asset_code}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3" onClick={()=>setSelected(a)}>
                    <div className="font-medium text-slate-800 text-sm">{a.asset_name}</div>
                    {(a.brand||a.model) && <div className="text-xs text-slate-400 mt-0.5">{[a.brand,a.model].filter(Boolean).join(' · ')}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">{a.category_name||a.asset_type}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-slate-500">{a.department||'—'}</span>
                  </td>
                  <td className="px-4 py-3">
                    {a.current_project_name ? (
                      <span className="flex items-center gap-1 text-xs text-slate-600">
                        <MapPin className="w-3 h-3 text-slate-400" />{a.current_project_name}
                      </span>
                    ) : <span className="text-xs text-slate-400">Central Yard</span>}
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={a.status} /></td>
                  <td className="px-4 py-3">
                    <span className="text-sm font-semibold text-slate-700">{fmtCur(a.purchase_value)}</span>
                  </td>
                  <td className="px-4 py-3" onClick={e=>e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      <button onClick={()=>setSelected(a)} title="View details"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors">
                        <Eye className="w-4 h-4" />
                      </button>
                      <button onClick={()=>setEdit(a)} title="Edit"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={()=>{ if(window.confirm(`Dispose "${a.asset_name}"?`)) deleteMut.mutate(a.id); }} title="Dispose"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Bulk action bar */}
      {selectedIds.size>0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 px-5 py-3 bg-slate-800 text-white rounded-2xl shadow-2xl z-40">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <div className="w-px h-4 bg-white/20" />
          <button onClick={()=>setIds(new Set())} className="text-xs text-slate-400 hover:text-white">Clear</button>
          <button
            onClick={()=>setQRPrint(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-medium transition-colors">
            <Printer className="w-3.5 h-3.5" /> Print QR Labels
          </button>
          <button onClick={exportCSV} className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-medium transition-colors">
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
        </div>
      )}

      {/* Add modal */}
      {showAdd && <AssetFormModal projects={projects} categories={categories} onClose={()=>setShowAdd(false)} />}
      {editAsset && <AssetFormModal editAsset={editAsset} projects={projects} categories={categories} onClose={()=>setEdit(null)} />}
      {selected && <AssetDetailPanel asset={selected} onClose={()=>setSelected(null)} onEdit={()=>{ setEdit(selected); setSelected(null); }} onPrintQR={()=>{ setQRPrint('single'); }} qc={qc} />}

      {/* QR Print Preview */}
      {showQRPrint && (
        <QRPrintPreview
          assets={showQRPrint==='single' && selected
            ? [selected]
            : assets.filter(a=>selectedIds.has(a.id))}
          onClose={()=>setQRPrint(false)}
        />
      )}
    </div>
  );
}
