import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { MessageSquare, Save, ToggleLeft, ToggleRight, TestTube } from 'lucide-react';
import toast from 'react-hot-toast';

const B = { navy:'#0A1F5C' };
const fade = (d=0) => ({ initial:{opacity:0,y:14}, animate:{opacity:1,y:0}, transition:{duration:0.35,delay:d} });
const inp = 'w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all';
const lbl = 'text-xs font-black text-gray-600 uppercase tracking-wide block mb-1.5';

const EVENTS = [
  { key:'leave_approval',  label:'Leave Approved/Rejected' },
  { key:'salary_credit',   label:'Salary Credited' },
  { key:'attendance_alert',label:'Attendance Exception' },
  { key:'birthday',        label:'Birthday Wishes' },
  { key:'document_expiry', label:'Document Expiry Alert' },
];

export default function SmsSettingsPage() {
  const [cfg, setCfg] = useState({ provider:'MSG91', api_key:'', sender_id:'BCIMHR', template_id:'' });
  const [events, setEvents] = useState(Object.fromEntries(EVENTS.map(e=>[e.key,true])));
  const [testNo, setTestNo] = useState('');

  const set = (k,v) => setCfg(p=>({...p,[k]:v}));
  const sendTest = () => { if(!testNo){toast.error('Enter a mobile number');return;} toast.success(`Test SMS sent to ${testNo}`); };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <motion.div {...fade(0)} className="max-w-2xl mx-auto">
        <div className="rounded-2xl mb-6 p-6 flex items-center justify-between"
          style={{background:`linear-gradient(135deg,${B.navy},#1e3a8a)`}}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-white"/>
            </div>
            <div>
              <h1 className="text-lg font-black text-white">SMS Settings</h1>
              <p className="text-xs text-blue-200">Configure SMS gateway & alerts</p>
            </div>
          </div>
          <button onClick={()=>toast.success('SMS settings saved')}
            className="flex items-center gap-2 px-4 py-2 bg-yellow-400 hover:bg-yellow-300 text-gray-900 text-sm font-black rounded-xl transition">
            <Save className="w-4 h-4"/> Save
          </button>
        </div>

        <div className="space-y-5">
          {/* Gateway */}
          <motion.div {...fade(0.05)} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-xs font-black uppercase tracking-widest text-blue-600 mb-4">Gateway Configuration</h2>
            <div className="space-y-4">
              <div>
                <label className={lbl}>Provider</label>
                <select className={inp} value={cfg.provider} onChange={e=>set('provider',e.target.value)}>
                  {['MSG91','Textlocal','Kaleyra','Twilio','Fast2SMS'].map(p=><option key={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>API Key</label>
                <input className={inp} type="password" placeholder="Enter API key" value={cfg.api_key} onChange={e=>set('api_key',e.target.value)}/>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={lbl}>Sender ID</label>
                  <input className={inp} value={cfg.sender_id} onChange={e=>set('sender_id',e.target.value)}/>
                </div>
                <div>
                  <label className={lbl}>Template ID (DLT)</label>
                  <input className={inp} placeholder="e.g. 1507162341234567890" value={cfg.template_id} onChange={e=>set('template_id',e.target.value)}/>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Test SMS */}
          <motion.div {...fade(0.1)} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-xs font-black uppercase tracking-widest text-blue-600 mb-4">Test SMS</h2>
            <div className="flex gap-3">
              <input className={inp} placeholder="+91 9876543210" value={testNo} onChange={e=>setTestNo(e.target.value)}/>
              <button onClick={sendTest}
                className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl whitespace-nowrap transition">
                <TestTube className="w-4 h-4"/> Send Test
              </button>
            </div>
          </motion.div>

          {/* Events */}
          <motion.div {...fade(0.15)} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-xs font-black uppercase tracking-widest text-gray-500 mb-4">Alert Events</h2>
            <div className="space-y-3">
              {EVENTS.map(ev=>(
                <div key={ev.key} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <span className="text-sm font-medium text-gray-700">{ev.label}</span>
                  <button onClick={()=>setEvents(p=>({...p,[ev.key]:!p[ev.key]}))}>
                    {events[ev.key]
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
