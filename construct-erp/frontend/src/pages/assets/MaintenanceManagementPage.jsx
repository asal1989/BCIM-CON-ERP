import React, { useEffect, useState, useMemo } from 'react';
import { assetMgmtAPI, assetAPI } from '../../api/client';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from 'recharts';
import {
  Wrench, Plus, CheckCircle, Clock, AlertTriangle, Calendar,
  Search, TrendingUp, IndianRupee, RefreshCw, Activity, X, BarChart3,
} from 'lucide-react';
import dayjs from 'dayjs';
import {
  PageHeader, MetricCard, SectionCard, StatusBadge, EmptyState, LoadingSpinner,
  Modal, FormField, Tabs, FilterBar, SearchInput, ProgressBar,
  fmtINR, fmtDate, daysFrom, titleCase,
} from '../../components/ui';

const PRIO_BADGE = {
  low:      'badge badge-gray',
  medium:   'badge badge-yellow',
  high:     'badge badge-orange',
  critical: 'badge badge-red',
};
const TYPE_BADGE = {
  preventive: 'badge badge-teal',
  breakdown:  'badge badge-red',
  corrective: 'badge badge-yellow',
  emergency:  'badge badge-red',
};
const STATUS_COLOR = {
  open:        'badge badge-blue',
  in_progress: 'badge badge-yellow',
  completed:   'badge badge-green',
  cancelled:   'badge badge-gray',
};

function CreateWOModal({ assets, onSave, onClose }) {
  const [form, setForm] = useState({ asset_id:'', wo_type:'preventive', description:'', priority:'medium', scheduled_date:'', technician:'', vendor_name:'' });
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  return (
    <Modal title="Create Work Order" subtitle="Schedule a maintenance task" onClose={onClose}
      footer={<>
        <button onClick={onClose} className="btn-secondary">Cancel</button>
        <button onClick={()=>{ if(!form.asset_id||!form.description) return alert('Fill required fields'); onSave(form); }}
          className="btn-primary">Create Work Order</button>
      </>}>
      <div className="p-6 grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <FormField label="Asset" required>
            <select value={form.asset_id} onChange={e=>set('asset_id',e.target.value)} className="input">
              <option value="">Select asset to maintain…</option>
              {assets.filter(a=>a.status!=='disposed').map(a=><option key={a.id} value={a.id}>{a.asset_code} — {a.asset_name}</option>)}
            </select>
          </FormField>
        </div>
        <FormField label="Maintenance Type">
          <select value={form.wo_type} onChange={e=>set('wo_type',e.target.value)} className="input">
            {['preventive','breakdown','corrective','emergency'].map(t=><option key={t} value={t}>{titleCase(t)}</option>)}
          </select>
        </FormField>
        <FormField label="Priority">
          <select value={form.priority} onChange={e=>set('priority',e.target.value)} className="input">
            {['low','medium','high','critical'].map(p=><option key={p} value={p}>{titleCase(p)}</option>)}
          </select>
        </FormField>
        <div className="col-span-2">
          <FormField label="Work Description" required>
            <textarea value={form.description} onChange={e=>set('description',e.target.value)} rows={3}
              className="input" placeholder="Describe maintenance work required…" />
          </FormField>
        </div>
        <FormField label="Scheduled Date">
          <input type="date" value={form.scheduled_date} onChange={e=>set('scheduled_date',e.target.value)} className="input" />
        </FormField>
        <FormField label="Technician">
          <input value={form.technician} onChange={e=>set('technician',e.target.value)} className="input" placeholder="Name" />
        </FormField>
        <div className="col-span-2">
          <FormField label="Vendor / Workshop">
            <input value={form.vendor_name} onChange={e=>set('vendor_name',e.target.value)} className="input" placeholder="Service center name" />
          </FormField>
        </div>
      </div>
    </Modal>
  );
}

function CompleteWOModal({ wo, onSave, onClose }) {
  const [form, setForm] = useState({ work_done:'', labour_cost:'', parts_cost:'', downtime_hours:'', spare_parts:'', next_service_date:'' });
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const total = (parseFloat(form.labour_cost||0)+parseFloat(form.parts_cost||0));
  return (
    <Modal title={`Complete — ${wo.wo_number}`} subtitle={`${wo.asset_name} · ${wo.wo_type}`} onClose={onClose}
      footer={<>
        <button onClick={onClose} className="btn-secondary">Cancel</button>
        <button onClick={()=>{ if(!form.work_done) return alert('Describe work done'); onSave(form); }}
          className="btn-success"><CheckCircle className="w-4 h-4" /> Mark Complete</button>
      </>}>
      <div className="p-6 space-y-4">
        <FormField label="Work Done" required>
          <textarea value={form.work_done} onChange={e=>set('work_done',e.target.value)} rows={3}
            className="input" placeholder="Describe what was completed…" />
        </FormField>
        <div className="grid grid-cols-3 gap-4">
          <FormField label="Labour Cost (₹)">
            <input type="number" value={form.labour_cost} onChange={e=>set('labour_cost',e.target.value)} className="input" min={0} />
          </FormField>
          <FormField label="Parts Cost (₹)">
            <input type="number" value={form.parts_cost} onChange={e=>set('parts_cost',e.target.value)} className="input" min={0} />
          </FormField>
          <FormField label="Downtime (hrs)">
            <input type="number" value={form.downtime_hours} onChange={e=>set('downtime_hours',e.target.value)} className="input" min={0} step={0.5} />
          </FormField>
        </div>
        {total > 0 && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2">
            <IndianRupee className="w-4 h-4 text-emerald-600" />
            <span className="text-sm text-emerald-800">Total Cost: <strong>{fmtINR(total)}</strong></span>
          </div>
        )}
        <FormField label="Spare Parts Used">
          <input value={form.spare_parts} onChange={e=>set('spare_parts',e.target.value)} className="input" placeholder="Filters, oil, belts…" />
        </FormField>
        <FormField label="Next Service Date">
          <input type="date" value={form.next_service_date} onChange={e=>set('next_service_date',e.target.value)} className="input" />
        </FormField>
      </div>
    </Modal>
  );
}

export default function MaintenanceManagementPage() {
  const [wos, setWos]       = useState([]);
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]       = useState('open');
  const [search, setSearch] = useState('');
  const [typeFilter, setType] = useState('');
  const [modal, setModal]   = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [w, a] = await Promise.all([assetMgmtAPI.listWorkOrders(), assetAPI.list()]);
      setWos(w.data?.data||[]); setAssets(a.data?.data||[]);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (form) => {
    try { await assetMgmtAPI.createWorkOrder(form); setModal(null); load(); }
    catch (e) { alert(e?.response?.data?.error||e.message); }
  };
  const handleComplete = async (id, form) => {
    try { await assetMgmtAPI.completeWorkOrder(id, form); setModal(null); load(); }
    catch (e) { alert(e?.response?.data?.error||e.message); }
  };

  const openWOs     = wos.filter(w=>['open','in_progress'].includes(w.status));
  const completedWOs= wos.filter(w=>w.status==='completed');
  const upcomingService = assets.filter(a=>{ if(!a.next_service_date||a.status==='disposed') return false; return daysFrom(a.next_service_date)<=30; }).sort((a,b)=>new Date(a.next_service_date)-new Date(b.next_service_date));

  const totalCost     = completedWOs.reduce((s,w)=>s+parseFloat(w.total_cost||0),0);
  const totalDowntime = completedWOs.reduce((s,w)=>s+parseFloat(w.downtime_hours||0),0);
  const breakdowns    = wos.filter(w=>w.wo_type==='breakdown').length;
  const preventive    = wos.filter(w=>w.wo_type==='preventive').length;

  // Cost by asset (for chart)
  const costByAsset = useMemo(()=>{
    const m={};
    completedWOs.forEach(w=>{ const k=w.asset_code||'Unknown'; m[k]=(m[k]||0)+parseFloat(w.total_cost||0); });
    return Object.entries(m).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([name,cost])=>({name,cost}));
  },[completedWOs]);

  const apply = (list) => list.filter(w=>{
    if(typeFilter && w.wo_type!==typeFilter) return false;
    if(search){ const q=search.toLowerCase(); return [w.wo_number,w.asset_code,w.asset_name,w.description,w.technician].some(v=>v?.toLowerCase().includes(q)); }
    return true;
  });

  const tabs = [
    { key:'open',     label:'Open', count: openWOs.length },
    { key:'upcoming', label:'Upcoming (30d)', count: upcomingService.length },
    { key:'history',  label:'Completed', count: completedWOs.length },
    { key:'cost',     label:'Cost Analysis' },
  ];

  return (
    <div className="p-6 md:p-8 space-y-6">
      <PageHeader title="Maintenance Management" subtitle="Preventive schedules, breakdown tracking & cost analysis" breadcrumb={['Assets & IT','Maintenance']}>
        <button onClick={load} className="btn-secondary"><RefreshCw className="w-4 h-4" /></button>
        <button onClick={()=>setModal('new')} className="btn-primary"><Plus className="w-4 h-4" /> New Work Order</button>
      </PageHeader>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="Open Work Orders" value={openWOs.length} icon={Clock} color="blue"
          sub={openWOs.filter(w=>w.priority==='critical').length>0 ? `${openWOs.filter(w=>w.priority==='critical').length} critical`:'All priorities'} />
        <MetricCard label="Upcoming (30d)" value={upcomingService.length} icon={Calendar} color="amber" sub="Assets due for service" />
        <MetricCard label="Total Maint. Cost" value={fmtINR(totalCost)} icon={IndianRupee} color="emerald" sub={`${completedWOs.length} completed WOs`} />
        <MetricCard label="Downtime" value={`${totalDowntime.toFixed(1)}h`} icon={Activity} color="red"
          sub={`${breakdowns} breakdowns / ${preventive} preventive`} />
      </div>

      {/* Tabs */}
      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {/* Filters (for list tabs) */}
      {(tab==='open'||tab==='history') && (
        <FilterBar>
          <SearchInput value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search WO, asset, technician…" className="flex-1 max-w-xs" />
          <select value={typeFilter} onChange={e=>setType(e.target.value)} className="input w-40">
            <option value="">All Types</option>
            {['preventive','breakdown','corrective','emergency'].map(t=><option key={t} value={t}>{titleCase(t)}</option>)}
          </select>
        </FilterBar>
      )}

      {loading ? <LoadingSpinner /> : (
        <>
          {/* OPEN */}
          {tab==='open' && (
            <div className="space-y-3">
              {apply(openWOs).length===0 ? (
                <div className="card"><EmptyState icon={Wrench} title="No open work orders" description="All maintenance is up to date!" /></div>
              ) : apply(openWOs).map(wo=>(
                <div key={wo.id} className={`card border-l-4 ${wo.priority==='critical'?'border-l-red-500':wo.priority==='high'?'border-l-orange-500':wo.priority==='medium'?'border-l-amber-400':'border-l-blue-400'}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <span className="font-mono text-xs text-indigo-600 font-bold">{wo.wo_number}</span>
                        <span className={TYPE_BADGE[wo.wo_type]||'badge badge-gray'}>{titleCase(wo.wo_type)}</span>
                        <span className={PRIO_BADGE[wo.priority]||'badge badge-gray'}>{titleCase(wo.priority)}</span>
                        <span className={STATUS_COLOR[wo.status]||'badge badge-gray'}>{titleCase(wo.status)}</span>
                      </div>
                      <p className="text-sm font-semibold text-black">
                        <span className="text-indigo-600">{wo.asset_code}</span>
                        <span className="text-slate-400 mx-1.5">—</span>
                        {wo.asset_name}
                      </p>
                      <p className="text-xs text-slate-500 mt-1 line-clamp-1">{wo.description}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
                        {wo.scheduled_date && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{fmtDate(wo.scheduled_date)}</span>}
                        {wo.technician && <span>👤 {wo.technician}</span>}
                        {wo.vendor_name_resolved && <span>🏭 {wo.vendor_name_resolved}</span>}
                      </div>
                    </div>
                    <button onClick={()=>setModal({complete:true,wo})} className="btn-success flex-shrink-0">
                      <CheckCircle className="w-4 h-4" /> Done
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* UPCOMING */}
          {tab==='upcoming' && (
            <div className="table-wrapper">
              <table className="data-table">
                <thead><tr><th>Asset</th><th>Next Service</th><th>Due In</th><th>Last Serviced</th><th>Action</th></tr></thead>
                <tbody>
                  {upcomingService.length===0 ? (
                    <tr><td colSpan={5}><EmptyState title="No assets due in next 30 days" /></td></tr>
                  ) : upcomingService.map(a=>{
                    const d=daysFrom(a.next_service_date);
                    return (
                      <tr key={a.id} className={d<=0?'bg-red-50/50':d<=7?'bg-amber-50/50':''}>
                        <td><span className="font-mono text-xs text-indigo-600 font-semibold">{a.asset_code}</span><br/><span className="text-xs text-slate-500">{a.asset_name}</span></td>
                        <td>{fmtDate(a.next_service_date)}</td>
                        <td><span className={`font-bold text-sm ${d<=0?'text-red-600':d<=7?'text-amber-600':'text-slate-600'}`}>{d<=0?`${Math.abs(d)}d overdue`:d===0?'Today':`${d}d`}</span></td>
                        <td className="text-slate-400">{a.last_service_date?fmtDate(a.last_service_date):'—'}</td>
                        <td><button onClick={()=>setModal('new')} className="btn-secondary text-xs">Schedule</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* HISTORY */}
          {tab==='history' && (
            <div className="table-wrapper">
              <table className="data-table">
                <thead><tr><th>WO#</th><th>Asset</th><th>Type</th><th>Completed</th><th>Labour</th><th>Parts</th><th>Total</th><th>Downtime</th></tr></thead>
                <tbody>
                  {apply(completedWOs).length===0 ? (
                    <tr><td colSpan={8}><EmptyState title="No completed work orders yet" /></td></tr>
                  ) : apply(completedWOs).map(wo=>(
                    <tr key={wo.id}>
                      <td><span className="font-mono text-xs text-indigo-600 font-semibold">{wo.wo_number}</span></td>
                      <td><span className="text-indigo-600 font-mono text-xs">{wo.asset_code}</span><br/><span className="text-xs text-slate-500 max-w-[120px] truncate block">{wo.asset_name}</span></td>
                      <td><span className={TYPE_BADGE[wo.wo_type]||'badge badge-gray'}>{titleCase(wo.wo_type)}</span></td>
                      <td>{fmtDate(wo.completion_date)}</td>
                      <td className="text-right">{wo.labour_cost>0?fmtINR(wo.labour_cost):'—'}</td>
                      <td className="text-right">{wo.parts_cost>0?fmtINR(wo.parts_cost):'—'}</td>
                      <td className="text-right font-semibold">{wo.total_cost>0?fmtINR(wo.total_cost):'—'}</td>
                      <td className="text-right">{wo.downtime_hours>0?`${wo.downtime_hours}h`:'—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* COST ANALYSIS */}
          {tab==='cost' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <SectionCard title="Cost Summary" icon={IndianRupee}>
                <div className="space-y-3">
                  {[
                    ['Total Maintenance Cost', fmtINR(totalCost), 'text-red-600'],
                    ['Total Labour Cost', fmtINR(completedWOs.reduce((s,w)=>s+parseFloat(w.labour_cost||0),0)), 'text-slate-700'],
                    ['Total Parts Cost', fmtINR(completedWOs.reduce((s,w)=>s+parseFloat(w.parts_cost||0),0)), 'text-slate-700'],
                    ['Total Downtime', `${totalDowntime.toFixed(1)} hours`, 'text-amber-700'],
                    ['Breakdowns', `${breakdowns}`, 'text-red-600'],
                    ['Preventive Services', `${preventive}`, 'text-emerald-700'],
                  ].map(([l,v,tc])=>(
                    <div key={l} className="flex justify-between items-center py-2 border-b border-slate-50 last:border-0">
                      <span className="text-sm text-slate-500">{l}</span>
                      <span className={`font-semibold text-sm ${tc}`}>{v}</span>
                    </div>
                  ))}
                </div>
              </SectionCard>
              <SectionCard title="Top Assets by Maintenance Cost" icon={BarChart3}>
                {costByAsset.length===0 ? (
                  <EmptyState title="No cost data yet" description="Complete work orders to see cost analysis" />
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={costByAsset} layout="vertical" margin={{top:5,right:20,left:0,bottom:5}}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
                      <XAxis type="number" tick={{fontSize:10}} tickFormatter={v=>`₹${(v/1000).toFixed(0)}K`} />
                      <YAxis type="category" dataKey="name" tick={{fontSize:10}} width={60} />
                      <Tooltip formatter={v=>[fmtINR(v),'Cost']} />
                      <Bar dataKey="cost" fill="#EF4444" radius={[0,4,4,0]}>
                        {costByAsset.map((_,i)=><Cell key={i} fill={['#EF4444','#F97316','#F59E0B','#EAB308','#84CC16','#10B981'][i%6]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </SectionCard>
            </div>
          )}
        </>
      )}

      {modal==='new' && <CreateWOModal assets={assets} onSave={handleCreate} onClose={()=>setModal(null)} />}
      {modal?.complete && <CompleteWOModal wo={modal.wo} onSave={f=>handleComplete(modal.wo.id,f)} onClose={()=>setModal(null)} />}
    </div>
  );
}
