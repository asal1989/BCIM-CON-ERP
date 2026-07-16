import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Settings, Save, ToggleLeft, ToggleRight } from 'lucide-react';

const B = { navy:'#0A1F5C' };
const fade = (d=0) => ({ initial:{opacity:0,y:14}, animate:{opacity:1,y:0}, transition:{duration:0.35,delay:d} });
const inp = 'w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all';
const lbl = 'text-xs font-black text-gray-600 uppercase tracking-wide block mb-1.5';

const SECTIONS = [
  { title:'Attendance', color:'blue', fields:[
    { key:'auto_approve_days', label:'Auto-approve after (days)', type:'number', value:'3' },
    { key:'late_grace_min',    label:'Late grace period (minutes)', type:'number', value:'15' },
    { key:'half_day_hours',    label:'Half-day threshold (hours)', type:'number', value:'4' },
    { key:'ot_min_hours',      label:'OT minimum hours', type:'number', value:'2' },
  ]},
  { title:'Leave', color:'emerald', fields:[
    { key:'leave_carry_fwd',   label:'Carry forward limit (days)', type:'number', value:'15' },
    { key:'leave_encash_max',  label:'Max encashment (days/year)', type:'number', value:'10' },
  ]},
  { title:'Payroll', color:'violet', fields:[
    { key:'salary_day',        label:'Salary processing day', type:'number', value:'25' },
    { key:'esi_wage_limit',    label:'ESI wage ceiling (₹)', type:'number', value:'21000' },
    { key:'pf_wage_limit',     label:'PF wage ceiling (₹)', type:'number', value:'15000' },
  ]},
];

const TOGGLES = [
  { key:'biometric_sync',   label:'Enable biometric sync',        on:true  },
  { key:'auto_payroll',     label:'Auto-generate payroll',         on:false },
  { key:'sms_alerts',       label:'SMS alerts on leave approval',  on:true  },
  { key:'email_payslip',    label:'Email payslip on processing',   on:true  },
  { key:'geo_fence',        label:'Enable geofence attendance',    on:false },
];

export default function MasterSettingsPage() {
  const [vals, setVals]  = useState(() => Object.fromEntries(SECTIONS.flatMap(s=>s.fields).map(f=>[f.key,f.value])));
  const [togs, setTogs]  = useState(() => Object.fromEntries(TOGGLES.map(t=>[t.key,t.on])));
  const [saved, setSaved]= useState(false);

  const save = () => { setSaved(true); setTimeout(()=>setSaved(false),2000); };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <motion.div {...fade(0)} className="max-w-3xl mx-auto">
        <div className="rounded-2xl mb-6 p-6 flex items-center justify-between"
          style={{background:`linear-gradient(135deg,${B.navy},#1e3a8a)`}}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
              <Settings className="w-5 h-5 text-white"/>
            </div>
            <div>
              <h1 className="text-lg font-black text-white">Master Settings</h1>
              <p className="text-xs text-blue-200">Global HR configuration</p>
            </div>
          </div>
          <button onClick={save}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-black rounded-xl transition ${saved?'bg-green-400 text-white':'bg-yellow-400 hover:bg-yellow-300 text-gray-900'}`}>
            <Save className="w-4 h-4"/>{saved?'Saved!':'Save Settings'}
          </button>
        </div>

        <div className="space-y-5">
          {SECTIONS.map((sec,si)=>(
            <motion.div key={sec.title} {...fade(0.05*(si+1))} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h2 className={`text-xs font-black uppercase tracking-widest text-${sec.color}-600 mb-4`}>{sec.title} Settings</h2>
              <div className="grid grid-cols-2 gap-4">
                {sec.fields.map(f=>(
                  <div key={f.key}>
                    <label className={lbl}>{f.label}</label>
                    <input type={f.type} className={inp} value={vals[f.key]}
                      onChange={e=>setVals(p=>({...p,[f.key]:e.target.value}))}/>
                  </div>
                ))}
              </div>
            </motion.div>
          ))}

          <motion.div {...fade(0.2)} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-xs font-black uppercase tracking-widest text-gray-500 mb-4">Feature Toggles</h2>
            <div className="space-y-3">
              {TOGGLES.map(t=>(
                <div key={t.key} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <span className="text-sm font-medium text-gray-700">{t.label}</span>
                  <button onClick={()=>setTogs(p=>({...p,[t.key]:!p[t.key]}))}
                    className="transition-colors">
                    {togs[t.key]
                      ? <ToggleRight className="w-8 h-8 text-blue-600"/>
                      : <ToggleLeft  className="w-8 h-8 text-gray-300"/>}
                  </button>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}
