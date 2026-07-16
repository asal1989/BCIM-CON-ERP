// src/pages/hr-admin/ESSLSyncPage.jsx — 2026 Premium UI
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Fingerprint, Server, CheckCircle, XCircle, RefreshCw,
  Settings, Eye, Download, AlertTriangle, Clock, Users, Wifi, WifiOff,
  Key, Copy, MonitorDot, Terminal, CheckCheck
} from 'lucide-react';
import { hrEsslAPI } from '../../api/client';
import toast from 'react-hot-toast';

const B = { navy:'#0A1F5C', blue:'#2563EB', yellow:'#F4C430', success:'#10B981' };
const fade = (d=0) => ({ initial:{opacity:0,y:14}, animate:{opacity:1,y:0}, transition:{duration:0.35,delay:d,ease:[0.16,1,0.3,1]} });
const inp = "w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all";
const lbl = "text-xs font-bold text-gray-600 uppercase tracking-wide block mb-1.5";
const today = new Date().toISOString().split('T')[0];
const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];

function ConnectionSettings({ existing, onSaved }) {
  const [f, setF] = useState({
    host:     existing?.host     || '',
    port:     existing?.port     || 1433,
    database: existing?.database || '',
    username: existing?.username || '',
    password: '',
    instance: existing?.instance || '',
    domain:   existing?.domain   || '',
  });
  const [testing,    setTesting]    = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [saving,     setSaving]     = useState(false);
  const s = (k,v) => setF(p=>({...p,[k]:v}));

  const handleTest = async () => {
    if (!f.host||!f.database||!f.username||!f.password) return toast.error('Fill host, database, username, password');
    setTesting(true); setTestResult(null);
    try {
      const r = await hrEsslAPI.testConnection(f);
      setTestResult({ ok:true, ...r.data }); toast.success('Connection successful!');
    } catch(e) {
      setTestResult({ ok:false, error:e.response?.data?.error||e.message });
    } finally { setTesting(false); }
  };

  const handleSave = async () => {
    if (!f.host||!f.database||!f.username||!f.password) return toast.error('Fill all required fields');
    setSaving(true);
    try {
      await hrEsslAPI.saveConfig(f);
      toast.success('Connection settings saved'); onSaved();
    } catch(e) {
      toast.error(e.response?.data?.error||'Save failed');
    } finally { setSaving(false); }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-5" style={{boxShadow:'0 2px 12px rgba(10,31,92,0.06)'}}>
      <div className="flex items-center gap-2">
        <Server className="w-5 h-5 text-blue-500"/>
        <h2 className="text-gray-900 font-black">ESSL SQL Server Connection</h2>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 space-y-1">
        <p className="font-bold text-amber-900">📌 How ESSL stores data in SQL Server:</p>
        <p>• Table <strong>USERINFO</strong> — employee master (USERID, BADGENUMBER = Emp Code, NAME)</p>
        <p>• Table <strong>CHECKINOUT</strong> — swipe logs (CHECKTIME, CHECKTYPE: I=In / O=Out)</p>
        <p>• Ensure SQL Server is reachable from this server with SELECT permission.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[
          {key:'host',     label:'SQL Server Host / IP', placeholder:'192.168.1.100 or server-name', req:true},
          {key:'port',     label:'Port',                 placeholder:'1433',                          type:'number'},
          {key:'database', label:'Database Name',        placeholder:'iclock or biotime or ESSL',    req:true},
          {key:'username', label:'SQL Login Username',   placeholder:'sa',                            req:true},
          {key:'password', label:'Password',             placeholder:'••••••••',                     type:'password', req:true},
          {key:'instance', label:'Instance Name',        placeholder:'SQLEXPRESS'},
          {key:'domain',   label:'Windows Domain',       placeholder:'WORKGROUP'},
        ].map(({ key, label, placeholder, type='text', req })=>(
          <div key={key}>
            <label className={lbl}>{label}{req&&<span className="text-red-500 ml-0.5">*</span>}</label>
            <input className={inp} type={type} value={f[key]} onChange={e=>s(key,e.target.value)} placeholder={placeholder}/>
          </div>
        ))}
      </div>

      {testResult && (
        <div className={`rounded-xl px-4 py-3 text-sm ${testResult.ok?'bg-emerald-50 border border-emerald-200':'bg-red-50 border border-red-200'}`}>
          {testResult.ok ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-emerald-700 font-bold">
                <CheckCircle className="w-4 h-4"/> Connected to {testResult.database}
              </div>
              {testResult.tables?.length>0 && (
                <div className="text-emerald-700 text-xs space-y-1">
                  {testResult.tables.map(t=>(
                    <div key={t}>• <strong>{t}</strong> — {testResult.counts?.[t]?.toLocaleString()} records</div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-red-700">
              <XCircle className="w-4 h-4"/><span>{testResult.error}</span>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-3">
        <button onClick={handleTest} disabled={testing}
          className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 disabled:opacity-40 text-gray-700 rounded-xl text-sm font-bold">
          {testing?<RefreshCw className="w-4 h-4 animate-spin"/>:<Wifi className="w-4 h-4"/>} Test Connection
        </button>
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-4 py-2.5 text-white rounded-xl text-sm font-bold disabled:opacity-40"
          style={{background:`linear-gradient(135deg,${B.blue},${B.navy})`}}>
          {saving?<RefreshCw className="w-4 h-4 animate-spin"/>:<CheckCircle className="w-4 h-4"/>} Save Settings
        </button>
      </div>
    </div>
  );
}

function SyncPanel({ lastSync }) {
  const [from,    setFrom]    = useState(firstOfMonth);
  const [to,      setTo]      = useState(today);
  const [preview, setPreview] = useState(null);
  const [result,  setResult]  = useState(null);
  const [loading, setLoading] = useState(false);
  const [step,    setStep]    = useState('idle');

  const handlePreview = async () => {
    setLoading(true); setPreview(null); setStep('previewing');
    try {
      const r = await hrEsslAPI.preview(from, to); setPreview(r.data);
    } catch(e) {
      toast.error(e.response?.data?.error||'Preview failed'); setStep('idle');
    } finally { setLoading(false); }
  };

  const handleSync = async () => {
    setLoading(true); setResult(null); setStep('syncing');
    try {
      const r = await hrEsslAPI.sync(from, to);
      setResult(r.data); setStep('done'); toast.success(`Synced ${r.data.synced} attendance records`);
    } catch(e) {
      toast.error(e.response?.data?.error||'Sync failed'); setStep('idle');
    } finally { setLoading(false); }
  };

  const reset = () => { setPreview(null); setResult(null); setStep('idle'); };
  const QUICK = [
    { label:'Today',      f:today,        t:today },
    { label:'This Week',  f:(()=>{ const d=new Date(); d.setDate(d.getDate()-d.getDay()+1); return d.toISOString().split('T')[0]; })(), t:today },
    { label:'This Month', f:firstOfMonth, t:today },
  ];

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-5" style={{boxShadow:'0 2px 12px rgba(10,31,92,0.06)'}}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-violet-500"/>
          <h2 className="text-gray-900 font-black">Fetch Attendance from ESSL</h2>
        </div>
        {lastSync && <span className="text-xs text-gray-400">Last sync: {new Date(lastSync).toLocaleString('en-IN')}</span>}
      </div>

      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <label className={lbl}>From Date</label>
          <input type="date" value={from} onChange={e=>setFrom(e.target.value)}
            className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 text-sm focus:outline-none focus:border-blue-400"/>
        </div>
        <div>
          <label className={lbl}>To Date</label>
          <input type="date" value={to} onChange={e=>setTo(e.target.value)}
            className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 text-sm focus:outline-none focus:border-blue-400"/>
        </div>
        <div className="flex gap-1.5">
          {QUICK.map(q=>(
            <button key={q.label} onClick={()=>{ setFrom(q.f); setTo(q.t); }}
              className="px-3 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-bold rounded-xl">
              {q.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={handlePreview} disabled={loading}
          className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 disabled:opacity-40 text-gray-700 rounded-xl text-sm font-bold">
          {loading&&step==='previewing'?<RefreshCw className="w-4 h-4 animate-spin"/>:<Eye className="w-4 h-4"/>} Preview Swipes
        </button>
        <button onClick={handleSync} disabled={loading}
          className="flex items-center gap-2 px-4 py-2.5 text-white rounded-xl text-sm font-black disabled:opacity-40"
          style={{background:`linear-gradient(135deg,#7C3AED,#6D28D9)`}}>
          {loading&&step==='syncing'?<RefreshCw className="w-4 h-4 animate-spin"/>:<Download className="w-4 h-4"/>} Sync to Attendance
        </button>
        {(preview||result) && (
          <button onClick={reset} className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl text-sm font-bold">Clear</button>
        )}
      </div>

      {preview && (
        <div className="space-y-2">
          <p className="text-sm text-gray-600">
            Showing <span className="font-black text-gray-900">{preview.total}</span> raw swipe records from ESSL
            {preview.total===200 && <span className="text-amber-600"> (limited to 200 — run Sync to process all)</span>}
          </p>
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {['Emp Code','Name','Swipe Time','Type','Device'].map(h=>(
                    <th key={h} className="px-3 py-2 text-left text-gray-500 font-black uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {preview.data.map((r,i)=>{
                  const d = String(r.direction||r.check_type||'').trim().toLowerCase();
                  const isIn = d==='in'||d==='i'||d==='0';
                  return (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-mono text-gray-900 font-bold">{r.emp_code}</td>
                      <td className="px-3 py-2 text-gray-700">{r.emp_name||'—'}</td>
                      <td className="px-3 py-2 text-gray-700">{r.swipe_time||'—'}</td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${isIn?'bg-emerald-50 text-emerald-700':'bg-red-50 text-red-700'}`}>
                          {isIn?'▶ IN':'◀ OUT'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-400">{r.device_id||'—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {result && step==='done' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-emerald-700 font-black">
            <CheckCircle className="w-5 h-5"/> Sync Complete
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label:'Raw Swipes',     value:result.raw_swipes,    color:'text-gray-900'  },
              { label:'Days Processed', value:result.employee_days, color:'text-blue-700'  },
              { label:'Synced',         value:result.synced,        color:'text-emerald-700'},
              { label:'Skipped',        value:result.skipped,       color:'text-amber-700' },
            ].map(c=>(
              <div key={c.label} className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center">
                <div className={`text-2xl font-black ${c.color}`}>{c.value??'—'}</div>
                <div className="text-gray-500 text-xs font-bold uppercase tracking-wide mt-1">{c.label}</div>
              </div>
            ))}
          </div>
          {result.table_used && (
            <p className="text-xs text-gray-400">Source table: <span className="text-gray-700 font-bold">{result.table_used}</span></p>
          )}
          {result.not_found?.length>0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <p className="text-amber-800 text-sm font-bold mb-1">
                <AlertTriangle className="w-4 h-4 inline mr-1"/>
                {result.not_found.length} ESSL code(s) not found in ERP:
              </p>
              <p className="text-amber-700 text-xs font-mono">{result.not_found.join(', ')}</p>
              <p className="text-amber-600 text-xs mt-1">Ensure these codes match exactly in HR → Employees.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function UnmatchedPanel() {
  const [show,    setShow]    = useState(false);
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try { const r = await hrEsslAPI.unmatched(); setData(r.data); setShow(true); }
    catch(e) { toast.error(e.response?.data?.error||'Failed to load'); }
    finally { setLoading(false); }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5" style={{boxShadow:'0 2px 12px rgba(10,31,92,0.06)'}}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-amber-500"/>
          <h2 className="text-gray-900 font-black">Unmatched ESSL Employees</h2>
          <span className="text-xs text-gray-400">— ESSL employees whose codes don't exist in ERP</span>
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-bold rounded-xl">
          {loading?<RefreshCw className="w-3.5 h-3.5 animate-spin"/>:<Eye className="w-3.5 h-3.5"/>} Check
        </button>
      </div>

      {show && data && (
        <div className="mt-4 space-y-2">
          <p className="text-sm text-gray-600">
            <span className="font-black text-gray-900">{data.total}</span> unmatched of {data.essl_total} ESSL employees
          </p>
          {data.data.length===0 ? (
            <div className="flex items-center gap-2 text-emerald-700 text-sm font-bold">
              <CheckCircle className="w-4 h-4"/> All ESSL employees matched in ERP
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    {['ESSL Emp Code','ESSL Name','Action'].map(h=>(
                      <th key={h} className="px-3 py-2 text-left text-gray-500 font-black uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.data.map((e,i)=>(
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-amber-700 font-mono font-bold">{e.emp_code}</td>
                      <td className="px-3 py-2 text-gray-700">{e.emp_name}</td>
                      <td className="px-3 py-2 text-gray-400 text-xs">Add this code to employee in HR → Employees</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Agent Mode Setup Panel ────────────────────────────────────────────────────
function AgentSetupPanel() {
  const [copied, setCopied] = useState(null);

  const { data: agentData, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['essl-agent-key'],
    queryFn:  () => hrEsslAPI.agentKey().then(r => r.data?.data ?? r.data),
    retry: 1,
  });

  const copy = (text, label) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  const CodeLine = ({ label, value }) => (
    <div className="flex items-center gap-2 bg-gray-900 rounded-xl px-4 py-3">
      <span className="text-gray-400 text-xs font-mono flex-1 break-all select-all">{value}</span>
      <button onClick={() => copy(value, label)}
        className="flex-shrink-0 p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors">
        {copied === label ? <CheckCheck size={14} className="text-emerald-400"/> : <Copy size={14}/>}
      </button>
    </div>
  );

  const STEPS = [
    {
      num: '01', title: 'Install Node.js on HRADMIN',
      desc: 'Download and install Node.js LTS from nodejs.org on the HRADMIN Windows machine (192.168.1.26).',
    },
    {
      num: '02', title: 'Copy the agent folder',
      desc: 'Copy the essl-agent folder from the ERP project to C:\\essl-agent\\ on the HRADMIN machine.',
    },
    {
      num: '03', title: 'Create config.json',
      desc: 'Inside C:\\essl-agent\\, copy config.example.json → config.json. Fill in the SQL password and paste your API Key and Company ID below.',
    },
    {
      num: '04', title: 'Install dependencies',
      desc: 'Open Command Prompt in C:\\essl-agent\\ and run:',
      code: 'npm install',
    },
    {
      num: '05', title: 'Test run',
      desc: 'Run a manual test sync for the past 1 day:',
      code: 'node sync.js --days 1',
    },
    {
      num: '06', title: 'Schedule via Windows Task Scheduler',
      desc: 'Open Task Scheduler → Create Basic Task → Daily at 23:00 → Action: Start a program → Program: C:\\essl-agent\\run-sync.bat',
    },
  ];

  return (
    <div className="space-y-5">
      {/* Why agent mode banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4">
        <div className="flex items-center gap-2 mb-2">
          <MonitorDot className="w-4 h-4 text-amber-600"/>
          <p className="font-bold text-amber-800 text-sm">Why Agent Mode?</p>
        </div>
        <p className="text-amber-700 text-sm leading-relaxed">
          The ESSL SQL Server at <strong>192.168.1.26 (HRADMIN)</strong> is on your office LAN — the cloud ERP server cannot
          reach it directly. The local agent runs on HRADMIN, reads ESSL data locally with no network issues,
          and securely pushes attendance to the cloud ERP using an API key.
        </p>
      </div>

      {/* API key card */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4" style={{boxShadow:'0 2px 12px rgba(10,31,92,0.06)'}}>
        <div className="flex items-center gap-2">
          <Key className="w-5 h-5 text-blue-500"/>
          <h2 className="text-gray-900 font-black">Agent Credentials</h2>
          <span className="text-xs text-gray-400">— paste these into config.json on HRADMIN</span>
        </div>

        {isLoading && (
          <div className="flex items-center gap-2 text-gray-400 text-sm">
            <RefreshCw className="w-4 h-4 animate-spin"/> Loading API key…
          </div>
        )}

        {isError && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 space-y-2">
            <div className="flex items-center gap-2 text-red-700 text-sm font-bold">
              <XCircle className="w-4 h-4"/> Failed to load API key
            </div>
            <p className="text-red-600 text-xs">{error?.response?.data?.error || error?.message || 'Unknown error'}</p>
            <button onClick={() => refetch()}
              className="flex items-center gap-2 px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 text-xs font-bold rounded-xl">
              <RefreshCw className="w-3 h-3"/> Retry
            </button>
          </div>
        )}

        {agentData && (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-bold text-gray-600 uppercase tracking-wide block mb-1.5">API Key</label>
              <CodeLine label="api_key" value={agentData.api_key}/>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-600 uppercase tracking-wide block mb-1.5">Company ID</label>
              <CodeLine label="company_id" value={String(agentData.company_id)}/>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-600 uppercase tracking-wide block mb-1.5">Push URL (already set in config.example.json)</label>
              <CodeLine label="push_url" value={agentData.push_url}/>
            </div>
            <button onClick={() => refetch()}
              className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-bold rounded-xl">
              <RefreshCw className="w-3.5 h-3.5"/> Regenerate Key
            </button>
          </div>
        )}
      </div>

      {/* Setup steps */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4" style={{boxShadow:'0 2px 12px rgba(10,31,92,0.06)'}}>
        <div className="flex items-center gap-2">
          <Terminal className="w-5 h-5 text-violet-500"/>
          <h2 className="text-gray-900 font-black">Setup Instructions</h2>
        </div>

        <div className="space-y-4">
          {STEPS.map(step => (
            <div key={step.num} className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black text-white"
                style={{background:'linear-gradient(135deg,#0A1F5C,#2563EB)'}}>
                {step.num}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-900 text-sm">{step.title}</p>
                <p className="text-gray-500 text-xs mt-0.5 leading-relaxed">{step.desc}</p>
                {step.code && (
                  <div className="mt-2">
                    <CodeLine label={step.code} value={step.code}/>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-800 mt-2">
          <p className="font-bold mb-1">📋 config.json fields to fill:</p>
          <pre className="text-xs text-blue-700 whitespace-pre-wrap">{`{
  "essl": {
    "host":     "192.168.1.26",
    "instance": "SQLEXPRESS",
    "database": "etimetrackliteweb",
    "username": "sa",
    "password": "YOUR_SQL_PASSWORD"
  },
  "erp": {
    "api_key":    "← paste API Key from above",
    "company_id": ← paste Company ID from above
  },
  "sync_days": 1
}`}</pre>
        </div>
      </div>
    </div>
  );
}

export default function ESSLSyncPage() {
  const qc = useQueryClient();
  const [showSettings, setShowSettings] = useState(false);
  const [activeTab, setActiveTab] = useState('agent'); // 'direct' | 'agent'

  const { data: cfgData, refetch } = useQuery({
    queryKey:['essl-config'],
    queryFn:()=>hrEsslAPI.getConfig().then(r=>r.data?.data??r.data??[]).catch(()=>[]),
  });
  const cfg = cfgData;
  const isConfigured = !!cfg?.host;

  const TABS = [
    { key: 'agent',  label: '🖥️ Agent Mode (Recommended)',  desc: 'Agent runs on HRADMIN, pushes to cloud' },
    { key: 'direct', label: '🔌 Direct Mode',               desc: 'Cloud server connects to SQL Server directly' },
  ];

  return (
    <div className="p-6 space-y-6 min-h-screen" style={{background:'#F8FAFC'}}>

      {/* Header */}
      <motion.div {...fade(0)} className="relative overflow-hidden rounded-2xl"
        style={{background:`linear-gradient(135deg,${B.navy},#1e3a8a)`,boxShadow:'0 8px 32px rgba(10,31,92,0.2)'}}>
        <div className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-[0.07]"
          style={{background:'radial-gradient(circle,#fff,transparent 70%)',transform:'translate(25%,-25%)'}}/>
        <div className="relative z-10 px-8 py-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 rounded-xl bg-white/15 flex items-center justify-center">
                <Fingerprint className="w-4 h-4 text-white"/>
              </div>
              <span className="text-white/60 text-sm font-semibold">HR & Admin</span>
            </div>
            <h1 className="text-2xl font-black text-white">ESSL Biometric Sync</h1>
            <p className="text-white/55 text-sm mt-1">Pull attendance data from ESSL biometric device into ERP</p>
          </div>
          <div className="flex items-center gap-3 self-start flex-wrap">
            {isConfigured && activeTab === 'direct' ? (
              <div className="flex items-center gap-2 text-emerald-300 text-sm font-bold bg-white/10 px-3 py-1.5 rounded-xl">
                <Wifi className="w-4 h-4"/> {cfg.host} / {cfg.database}
              </div>
            ) : activeTab === 'direct' && (
              <div className="flex items-center gap-2 text-amber-300 text-sm font-bold bg-white/10 px-3 py-1.5 rounded-xl">
                <WifiOff className="w-4 h-4"/> Not configured
              </div>
            )}
            {activeTab === 'direct' && (
              <button onClick={()=>setShowSettings(v=>!v)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black hover:opacity-90"
                style={{background:B.yellow,color:B.navy}}>
                <Settings className="w-4 h-4"/>
                {showSettings?'Hide Settings':'Connection Settings'}
              </button>
            )}
          </div>
        </div>
      </motion.div>

      {/* Mode Tabs */}
      <motion.div {...fade(0.06)} className="flex gap-2 flex-wrap">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`flex-1 min-w-[180px] px-5 py-3 rounded-2xl text-left transition-all border ${
              activeTab === t.key
                ? 'bg-white border-blue-200 shadow-md'
                : 'bg-gray-100 border-transparent hover:bg-white hover:border-gray-200'
            }`}>
            <p className={`font-bold text-sm ${activeTab === t.key ? 'text-blue-700' : 'text-gray-600'}`}>{t.label}</p>
            <p className="text-xs text-gray-400 mt-0.5">{t.desc}</p>
          </button>
        ))}
      </motion.div>

      {/* Agent Mode */}
      {activeTab === 'agent' && (
        <motion.div {...fade(0.08)}>
          <AgentSetupPanel/>
        </motion.div>
      )}

      {/* Direct Mode */}
      {activeTab === 'direct' && (
        <>
          {(showSettings||!isConfigured) && (
            <motion.div {...fade(0.08)}>
              <ConnectionSettings existing={cfg} onSaved={()=>{ refetch(); setShowSettings(false); }}/>
            </motion.div>
          )}

          {isConfigured ? (
            <>
              <motion.div {...fade(0.12)}><SyncPanel lastSync={cfg.last_sync}/></motion.div>
              <motion.div {...fade(0.16)}><UnmatchedPanel/></motion.div>
            </>
          ) : (
            <motion.div {...fade(0.12)} className="bg-white rounded-2xl border border-gray-100 p-14 text-center"
              style={{boxShadow:'0 2px 12px rgba(10,31,92,0.06)'}}>
              <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
                <Fingerprint className="w-7 h-7 text-gray-300"/>
              </div>
              <p className="text-gray-500 font-bold">Configure the SQL Server connection above to start syncing attendance.</p>
              <p className="text-gray-400 text-xs mt-2">Note: Direct mode requires the ESSL SQL Server to be reachable from the cloud. If ESSL is on your office LAN, use Agent Mode instead.</p>
            </motion.div>
          )}
        </>
      )}
    </div>
  );
}
