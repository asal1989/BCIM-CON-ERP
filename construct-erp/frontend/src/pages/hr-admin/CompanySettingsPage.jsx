import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, Edit2, Save, X, Globe, Phone, Mail, MapPin } from 'lucide-react';
import toast from 'react-hot-toast';
import { hrMastersAPI } from '../../api/client';

const B = { navy:'#0A1F5C', blue:'#2563EB' };
const fade = (d=0) => ({ initial:{opacity:0,y:14}, animate:{opacity:1,y:0}, transition:{duration:0.35,delay:d} });
const inp = 'w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all';
const lbl = 'text-xs font-black text-gray-600 uppercase tracking-wide block mb-1.5';

export default function CompanySettingsPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);

  const { data: company, isLoading } = useQuery({
    queryKey: ['company-settings'],
    queryFn: () => hrMastersAPI.getCompanySettings().then(r => r.data?.data),
  });

  useEffect(() => { if (company && !editing) setDraft(company); }, [company, editing]);

  const saveMut = useMutation({
    mutationFn: (d) => hrMastersAPI.updateCompanySettings(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['company-settings'] }); toast.success('Company settings saved'); setEditing(false); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to save'),
  });

  const startEdit = () => { setDraft(company); setEditing(true); };
  const cancel = () => { setDraft(company); setEditing(false); };
  const save = () => saveMut.mutate(draft);
  const f = editing ? (draft || company || {}) : (company || {});
  const set = (k,v) => setDraft(p => ({...(p||company), [k]:v}));

  if (isLoading || !company) {
    return <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center text-gray-400 text-sm">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <motion.div {...fade(0)} className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="rounded-2xl mb-6 p-6 flex items-center justify-between"
          style={{background:`linear-gradient(135deg,${B.navy},#1e3a8a)`}}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-white"/>
            </div>
            <div>
              <h1 className="text-lg font-black text-white">Company Settings</h1>
              <p className="text-xs text-blue-200">Organisation master information</p>
            </div>
          </div>
          {!editing
            ? <button onClick={startEdit}
                className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm font-bold rounded-xl transition">
                <Edit2 className="w-4 h-4"/> Edit
              </button>
            : <div className="flex gap-2">
                <button onClick={cancel} className="flex items-center gap-1 px-3 py-2 bg-white/10 hover:bg-white/20 text-white text-sm font-bold rounded-xl transition">
                  <X className="w-4 h-4"/> Cancel
                </button>
                <button disabled={saveMut.isPending} onClick={save} className="flex items-center gap-1 px-3 py-2 bg-yellow-400 hover:bg-yellow-300 text-gray-900 text-sm font-black rounded-xl transition disabled:opacity-50">
                  <Save className="w-4 h-4"/> Save
                </button>
              </div>
          }
        </div>

        <div className="space-y-5">
          {/* Basic Info */}
          <motion.div {...fade(0.05)} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-xs font-black uppercase tracking-widest text-blue-600 mb-4">Basic Information</h2>
            <div className="grid grid-cols-2 gap-4">
              {[['Company Name','name'],['Short Name','short_name'],['Registration No.','reg_no'],['GSTIN','gstin'],['PAN','pan']].map(([l,k])=>(
                <div key={k} className={k==='name'?'col-span-2':''}>
                  <label className={lbl}>{l}</label>
                  {editing
                    ? <input className={inp} value={f[k]||''} onChange={e=>set(k,e.target.value)}/>
                    : <div className="px-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm text-gray-800 font-medium">{f[k]||'—'}</div>
                  }
                </div>
              ))}
            </div>
          </motion.div>

          {/* Contact */}
          <motion.div {...fade(0.1)} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-xs font-black uppercase tracking-widest text-blue-600 mb-4">Contact Details</h2>
            <div className="grid grid-cols-2 gap-4">
              {[['Email','email',Mail],['Phone','phone',Phone],['Website','website',Globe]].map(([l,k,Icon])=>(
                <div key={k}>
                  <label className={lbl}><span className="inline-flex items-center gap-1"><Icon className="w-3 h-3"/>{l}</span></label>
                  {editing
                    ? <input className={inp} value={f[k]||''} onChange={e=>set(k,e.target.value)}/>
                    : <div className="px-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm text-gray-800 font-medium">{f[k]||'—'}</div>
                  }
                </div>
              ))}
            </div>
          </motion.div>

          {/* Address */}
          <motion.div {...fade(0.15)} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-xs font-black uppercase tracking-widest text-blue-600 mb-4"><span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3"/>Registered Address</span></h2>
            <div className="grid grid-cols-2 gap-4">
              {[['Address','address',true],['City','city',false],['State','state',false],['Pincode','pincode',false]].map(([l,k,full])=>(
                <div key={k} className={full?'col-span-2':''}>
                  <label className={lbl}>{l}</label>
                  {editing
                    ? <input className={inp} value={f[k]||''} onChange={e=>set(k,e.target.value)}/>
                    : <div className="px-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm text-gray-800 font-medium">{f[k]||'—'}</div>
                  }
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}
