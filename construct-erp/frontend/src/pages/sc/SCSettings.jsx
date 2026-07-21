// src/pages/sc/SCSettings.jsx — SC Module Settings + ESSL Biometric Integration
import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { scAPI } from '../../api/client';
import { PageHeader, Theme } from '../../theme';
import {
  Settings, RefreshCw, Save, CheckCircle, X, Wifi,
  WifiOff, Database, Server, Key, Eye, EyeOff,
  CheckCircle2, AlertTriangle, Loader,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';

const APPROVAL_STAGE_OPTIONS=[
  {value:'qs_engineer',       label:'QS Engineer — Quantity Verification'},
  {value:'project_head',      label:'Project Head / Director'},
  {value:'managing_director', label:'Managing Director'},
  {value:'site_engineer',     label:'Site Engineer'},
  {value:'project_manager',   label:'Project Manager'},
  {value:'accounts',          label:'Accounts / Finance'},
  {value:'management',        label:'Management'},
];

const inp = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-300 transition';
const Field = ({label,children,hint}) => (
  <div>
    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">{label}</label>
    {children}
    {hint && <p className="text-[10px] text-slate-400 mt-1">{hint}</p>}
  </div>
);

export default function SCSettings() {
  const qc = useQueryClient();
  const [activeTab, setTab] = useState('general');
  const [form, setForm] = useState({
    default_gst_pct:18, default_tds_pct:2, default_retention_pct:5,
    approval_stages:['qs_engineer','managing_director'],
    wo_prefix:'WO', bill_prefix:'BILL',
    require_wo_approval:true, block_overbilling:true,
    // ESSL
    essl_enabled:false, essl_host:'', essl_port:3306,
    essl_database:'att2000', essl_user:'root', essl_password:'',
    essl_schema:'auto',
  });
  const [showPwd,   setShowPwd]   = useState(false);
  const [testResult,setTestResult]= useState(null);  // {success, schema, record_count, error}
  const [testing,   setTesting]   = useState(false);
  const set = (k,v) => setForm(f => ({...f,[k]:v}));

  const { data, isLoading } = useQuery({
    queryKey:['sc-settings'], queryFn:()=>scAPI.getSettings().then(r => r.data?.data ?? r.data ?? []).catch(() => []), staleTime:0,
  });
  useEffect(()=>{
    if(data) setForm(f=>({...f,...data,
      approval_stages: Array.isArray(data.approval_stages)?data.approval_stages:['qs_engineer','project_head','managing_director'],
      essl_password: data.essl_password==='***saved***' ? '' : (data.essl_password||''),
    }));
  },[data]);

  const saveMut = useMutation({
    mutationFn: d=>scAPI.saveSettings(d),
    onSuccess:()=>{ toast.success('Settings saved'); qc.invalidateQueries({queryKey:['sc-settings']}); },
    onError:e=>toast.error(e?.response?.data?.error||'Failed'),
  });

  const handleTest = async () => {
    if (!form.essl_host) return toast.error('Enter ESSL host/IP first');
    setTesting(true); setTestResult(null);
    try {
      const r = await scAPI.esslTest({
        essl_host: form.essl_host, essl_port: form.essl_port,
        essl_database: form.essl_database, essl_user: form.essl_user,
        essl_password: form.essl_password,
      });
      setTestResult(r.data?.data);
      if (r.data.data.success) toast.success(`Connected! Schema: ${r.data.data.schema}, ${r.data.data.record_count} records`);
      else toast.error(`Failed: ${r.data.data.error}`);
    } catch(e) {
      setTestResult({ success:false, error: e?.response?.data?.error || e.message });
      toast.error('Connection failed');
    } finally { setTesting(false); }
  };

  const toggleStage = s => setForm(f=>({...f, approval_stages: f.approval_stages.includes(s)?f.approval_stages.filter(x=>x!==s):[...f.approval_stages,s]}));

  const TABS = [
    {k:'general',  label:'General'},
    {k:'workflow', label:'Approval Workflow'},
    {k:'essl',     label:'ESSL Biometric', badge: form.essl_enabled ? '●' : null},
  ];

  return (
    <div style={{ background: Theme.pageBg, minHeight:'100vh' }}>
      <PageHeader
        title="SC Module Settings"
        subtitle="Configure rates, approval workflow and ESSL biometric integration"
        breadcrumbs={[{label:'Subcontractors'},{label:'Settings'}]}
      />

      <div className="p-5 md:p-6 max-w-[900px] mx-auto space-y-5">

        {/* Tab bar */}
        <div className="w-full overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1 w-fit min-w-max shadow-sm">
          {TABS.map(({k,label,badge})=>(
            <button key={k} onClick={()=>setTab(k)}
              className={clsx('flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all whitespace-nowrap',
                activeTab===k?'text-white shadow-sm':'text-slate-600 hover:text-slate-800 hover:bg-slate-50')}
              style={activeTab===k?{background:`linear-gradient(135deg,${Theme.navyLight} 0%,${Theme.navyDark} 100%)`}:{}}>
              {label}
              {badge && <span className="text-emerald-400 text-xs">{badge}</span>}
            </button>
          ))}
        </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-48"><RefreshCw className="w-6 h-6 animate-spin text-slate-400 mr-2"/>Loading…</div>
        ) : (
          <div className="space-y-5">

            {/* ── General Tab ── */}
            {activeTab === 'general' && (
              <>
                <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
                  <h2 className="font-bold text-slate-700 mb-4">Default Rates & Percentages</h2>
                  <div className="grid grid-cols-3 gap-4">
                    {[['default_gst_pct','GST %'],['default_tds_pct','TDS %'],['default_retention_pct','Retention %']].map(([k,l])=>(
                      <Field key={k} label={l}>
                        <div className="flex items-center gap-2">
                          <input type="number" value={form[k]} onChange={e=>set(k,parseFloat(e.target.value||0))}
                            min={0} max={100} className={inp}/>
                          <span className="text-slate-400 text-sm">%</span>
                        </div>
                      </Field>
                    ))}
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
                  <h2 className="font-bold text-slate-700 mb-4">Document Numbering Prefix</h2>
                  <div className="grid grid-cols-2 gap-4">
                    {[['wo_prefix','Work Order Prefix'],['bill_prefix','Bill Prefix']].map(([k,l])=>(
                      <Field key={k} label={l} hint={`e.g. ${form[k]}-LANCO-001`}>
                        <input value={form[k]} onChange={e=>set(k,e.target.value)} className={inp}/>
                      </Field>
                    ))}
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
                  <h2 className="font-bold text-slate-700 mb-4">Validation Rules</h2>
                  <div className="space-y-3">
                    {[
                      ['require_wo_approval','Require WO approval before billing','Bills can only be raised against approved WOs'],
                      ['block_overbilling','Block overbilling','SC quantity cannot exceed WO balance quantity'],
                    ].map(([k,l,desc])=>(
                      <div key={k} className={clsx('flex items-center justify-between p-4 rounded-xl border-2',form[k]?'border-emerald-300 bg-emerald-50':'border-slate-100')}>
                        <div>
                          <p className="text-sm font-semibold text-slate-700">{l}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
                        </div>
                        <button onClick={()=>set(k,!form[k])}
                          className={clsx('relative inline-flex h-6 w-11 items-center rounded-full transition-colors',form[k]?'bg-emerald-600':'bg-slate-300')}>
                          <span className={clsx('inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',form[k]?'translate-x-6':'translate-x-1')}/>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* ── Workflow Tab ── */}
            {activeTab === 'workflow' && (
              <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
                <h2 className="font-bold text-slate-700 mb-2">Bill Approval Stages</h2>
                <p className="text-xs text-slate-400 mb-4">Select which stages a bill must pass through</p>
                <div className="space-y-2">
                  {APPROVAL_STAGE_OPTIONS.map((s,i)=>{
                    const selected=form.approval_stages.includes(s.value);
                    const idx=form.approval_stages.indexOf(s.value);
                    return (
                      <div key={s.value} className={clsx('flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all',selected?'border-indigo-400 bg-indigo-50':'border-slate-100 bg-white hover:border-slate-200')}>
                        <div className="flex items-center gap-3">
                          {selected?(
                            <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold">{idx+1}</div>
                          ):(
                            <div className="w-6 h-6 rounded-full border-2 border-slate-300"/>
                          )}
                          <span className="text-sm font-medium text-slate-700">{s.label}</span>
                        </div>
                        <button onClick={()=>toggleStage(s.value)}
                          className={clsx('flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold transition-colors',selected?'bg-indigo-600 text-white hover:bg-indigo-700':'border border-slate-200 text-slate-600 hover:bg-slate-50')}>
                          {selected?<><X className="w-3 h-3"/>Remove</>:<><CheckCircle className="w-3 h-3"/>Add</>}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── ESSL Tab ── */}
            {activeTab === 'essl' && (
              <>
                {/* Enable toggle */}
                <div className={clsx('bg-white rounded-2xl border-2 p-5 shadow-sm transition-all',
                  form.essl_enabled?'border-emerald-300':'border-slate-200')}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {form.essl_enabled
                        ? <Wifi className="w-5 h-5 text-emerald-600"/>
                        : <WifiOff className="w-5 h-5 text-slate-400"/>}
                      <div>
                        <p className="font-bold text-slate-800">ESSL Biometric Integration</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Auto-sync attendance from ESSL ETimetracklite / biometric attendance machine
                        </p>
                      </div>
                    </div>
                    <button onClick={()=>set('essl_enabled',!form.essl_enabled)}
                      className={clsx('relative inline-flex h-7 w-14 items-center rounded-full transition-colors',form.essl_enabled?'bg-emerald-600':'bg-slate-300')}>
                      <span className={clsx('inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform',form.essl_enabled?'translate-x-8':'translate-x-1')}/>
                    </button>
                  </div>
                </div>

                {form.essl_enabled && (
                  <>
                    {/* Connection settings */}
                    <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
                      <div className="flex items-center gap-2 mb-4">
                        <Server className="w-4 h-4 text-slate-500"/>
                        <h2 className="font-bold text-slate-700">ESSL Server Connection</h2>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <Field label="ESSL Server IP / Hostname *"
                          hint="IP address of the PC running ESSL software e.g. 192.168.1.100">
                          <input value={form.essl_host} onChange={e=>set('essl_host',e.target.value)}
                            className={inp} placeholder="192.168.1.100"/>
                        </Field>
                        <Field label="MySQL Port" hint="Default: 3306">
                          <input type="number" value={form.essl_port} onChange={e=>set('essl_port',parseInt(e.target.value||3306))}
                            className={inp}/>
                        </Field>
                        <Field label="Database Name" hint="Default: att2000">
                          <input value={form.essl_database} onChange={e=>set('essl_database',e.target.value)}
                            className={inp} placeholder="att2000"/>
                        </Field>
                        <Field label="MySQL Username" hint="Usually 'root'">
                          <input value={form.essl_user} onChange={e=>set('essl_user',e.target.value)}
                            className={inp} placeholder="root"/>
                        </Field>
                        <div className="col-span-2">
                          <Field label="MySQL Password" hint={data?.essl_password==='***saved***'?'Password saved — leave blank to keep existing':''}>
                            <div className="relative">
                              <input type={showPwd?'text':'password'} value={form.essl_password}
                                onChange={e=>set('essl_password',e.target.value)}
                                className={inp+' pr-10'}
                                placeholder={data?.essl_password==='***saved***'?'(saved — blank to keep)':'Enter MySQL password'}/>
                              <button type="button" onClick={()=>setShowPwd(p=>!p)}
                                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600">
                                {showPwd?<EyeOff className="w-4 h-4"/>:<Eye className="w-4 h-4"/>}
                              </button>
                            </div>
                          </Field>
                        </div>
                        <Field label="Database Schema / Version"
                          hint="'auto' detects automatically. Change only if auto-detect fails.">
                          <select value={form.essl_schema} onChange={e=>set('essl_schema',e.target.value)} className={inp}>
                            <option value="auto">Auto-detect (Recommended)</option>
                            <option value="checkinout">Old ESSL — CHECKINOUT table</option>
                            <option value="att_log">New ESSL — att_log table</option>
                            <option value="attlog">ESSL / ZKTeco — attlog table</option>
                            <option value="zkteco">ZKTeco — iclock_transaction</option>
                          </select>
                        </Field>
                      </div>

                      {/* Test connection */}
                      <div className="mt-4 flex items-center gap-3">
                        <button onClick={handleTest} disabled={testing || !form.essl_host}
                          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-40">
                          {testing
                            ? <><Loader className="w-4 h-4 animate-spin"/> Testing…</>
                            : <><Database className="w-4 h-4"/> Test Connection</>}
                        </button>
                        {testResult && (
                          <div className={clsx('flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold',
                            testResult.success?'bg-emerald-50 text-emerald-700 border border-emerald-200':'bg-red-50 text-red-700 border border-red-200')}>
                            {testResult.success
                              ? <><CheckCircle2 className="w-4 h-4"/> Connected! Schema: <strong>{testResult.schema}</strong> · {testResult.record_count?.toLocaleString()} records</>
                              : <><AlertTriangle className="w-4 h-4"/> {testResult.error}</>}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* How it works */}
                    <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5">
                      <h3 className="font-bold text-blue-800 text-sm mb-3 flex items-center gap-2">
                        <Key className="w-4 h-4"/> How ESSL Sync Works
                      </h3>
                      <div className="space-y-2 text-xs text-blue-700">
                        {[
                          '1. Workers punch in/out on the ESSL biometric machine at site',
                          '2. ESSL machine syncs to the ESSL server software on your PC',
                          '3. In ERP → Labour tab → set ESSL Employee Code for each worker',
                          '4. Click "Sync from ESSL" → select date → ERP pulls punches automatically',
                          '5. Present if ≥1 punch, Half Day if <4.5 hrs, wages auto-calculated',
                          '6. Create NMR from the synced attendance → raise Labour Bill',
                        ].map((s,i)=>(
                          <p key={i} className="flex items-start gap-2">
                            <span className="font-bold flex-shrink-0">{s}</span>
                          </p>
                        ))}
                      </div>
                      <div className="mt-3 pt-3 border-t border-blue-200 grid grid-cols-3 gap-2 text-xs text-blue-700">
                        <div><p className="font-bold">Full Day</p><p>Daily Rate × 1.0</p></div>
                        <div><p className="font-bold">Half Day (&lt;4.5 hrs)</p><p>Daily Rate × 0.5</p></div>
                        <div><p className="font-bold">No Punch</p><p>Not auto-marked absent</p></div>
                      </div>
                    </div>
                  </>
                )}
              </>
            )}

            {/* Save button */}
            <div className="flex justify-end">
              <button onClick={()=>saveMut.mutate(form)} disabled={saveMut.isPending}
                className="flex items-center gap-2 px-6 py-3 text-white text-sm font-bold rounded-xl disabled:opacity-50"
                style={{background:`linear-gradient(135deg,${Theme.navyLight} 0%,${Theme.navyDark} 100%)`}}>
                <Save className="w-4 h-4"/>{saveMut.isPending?'Saving…':'Save Settings'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
