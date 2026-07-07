// src/pages/hr-admin/SalaryStructurePage.jsx — 2026 Premium UI
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BarChart2, Plus, Edit2, Trash2, ChevronDown, ChevronRight, X, Layers } from 'lucide-react';
import { hrSalaryAPI } from '../../api/client';
import toast from 'react-hot-toast';

const B = { navy:'#0A1F5C', blue:'#2563EB', yellow:'#F4C430' };
const fade = (d=0) => ({ initial:{opacity:0,y:14}, animate:{opacity:1,y:0}, transition:{duration:0.35,delay:d,ease:[0.16,1,0.3,1]} });
const inp = "w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all";
const inpXs = "w-full px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-900 focus:outline-none focus:border-blue-400 transition-all";

const TYPE_CFG = {
  earning:   { bg:'bg-emerald-50', text:'text-emerald-700', dot:'bg-emerald-500' },
  deduction: { bg:'bg-red-50',     text:'text-red-700',     dot:'bg-red-500'     },
  statutory: { bg:'bg-amber-50',   text:'text-amber-700',   dot:'bg-amber-500'   },
};

// BCIM site-staff salary structure (calibrated to GreytHR extract)
const DEFAULT_COMPONENTS = [
  { component_name:'Basic',                    component_type:'earning',   calc_type:'fixed',        amount:0,   pct:0,     is_taxable:true  },
  { component_name:'HRA',                      component_type:'earning',   calc_type:'pct_of_basic', amount:0,   pct:20,    is_taxable:false },
  { component_name:'Project Office Spl Allow', component_type:'earning',   calc_type:'pct_of_basic', amount:0,   pct:20,    is_taxable:true  },
  { component_name:'Accommodation Allowance',  component_type:'earning',   calc_type:'pct_of_basic', amount:0,   pct:30,    is_taxable:false },
  { component_name:'Food Allowance',           component_type:'earning',   calc_type:'pct_of_basic', amount:0,   pct:18.67, is_taxable:false },
  { component_name:'Transport Allowance',      component_type:'earning',   calc_type:'pct_of_basic', amount:0,   pct:6.67,  is_taxable:false },
  { component_name:'LTA',                      component_type:'earning',   calc_type:'pct_of_basic', amount:0,   pct:8.33,  is_taxable:false },
  { component_name:'Medical Allowance',        component_type:'earning',   calc_type:'pct_of_basic', amount:0,   pct:5,     is_taxable:false },
  { component_name:'Mobile Allowance',         component_type:'earning',   calc_type:'fixed',        amount:500, pct:0,     is_taxable:false },
  { component_name:'Incentive',                component_type:'earning',   calc_type:'pct_of_basic', amount:0,   pct:13.33, is_taxable:true  },
  { component_name:'Washing Allowance',        component_type:'earning',   calc_type:'pct_of_basic', amount:0,   pct:1,     is_taxable:false },
  { component_name:'Special Allowance',        component_type:'earning',   calc_type:'fixed',        amount:0,   pct:0,     is_taxable:true  },
  { component_name:'PF Employee',              component_type:'statutory', calc_type:'pct_of_basic', amount:0,   pct:12,    is_taxable:false },
  { component_name:'Professional Tax',         component_type:'statutory', calc_type:'fixed',        amount:200, pct:0,     is_taxable:false },
  { component_name:'Mess Deduction',           component_type:'deduction', calc_type:'fixed',        amount:0,   pct:0,     is_taxable:false },
];

function StructureModal({ structure, onClose, onSave }) {
  const [name, setName] = useState(structure?.name||'');
  const [components, setComponents] = useState(
    structure?.components?.length ? structure.components : DEFAULT_COMPONENTS.map(c=>({...c}))
  );

  const updateComp = (i,k,v) => setComponents(prev=>prev.map((c,idx)=>idx===i?{...c,[k]:v}:c));
  const addComp    = () => setComponents(prev=>[...prev,{ component_name:'', component_type:'earning', calc_type:'fixed', amount:0, pct:0, is_taxable:true }]);
  const removeComp = (i) => setComponents(prev=>prev.filter((_,idx)=>idx!==i));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:'rgba(0,0,0,0.4)',backdropFilter:'blur(4px)'}}>
      <motion.div initial={{scale:0.95,opacity:0,y:20}} animate={{scale:1,opacity:1,y:0}}
        transition={{duration:0.22}} className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 flex-shrink-0"
          style={{background:`linear-gradient(135deg,${B.navy},#1e3a8a)`}}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center">
              <Layers className="w-5 h-5 text-white"/>
            </div>
            <p className="font-bold text-white">{structure?'Edit':'New'} Salary Structure</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center text-white hover:bg-white/20"><X className="w-4 h-4"/></button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5">
          <div className="mb-5">
            <label className="text-xs font-black text-gray-600 uppercase tracking-wide block mb-1.5">Structure Name</label>
            <input className={inp} value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Staff Grade A"/>
          </div>

          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-black text-gray-700 uppercase tracking-wide">Components</h3>
            <button onClick={addComp} className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800">
              <Plus className="w-3.5 h-3.5"/> Add Component
            </button>
          </div>

          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <div className="grid grid-cols-12 gap-1 px-3 py-2 bg-gray-50 border-b border-gray-200 text-[10px] font-black text-gray-500 uppercase tracking-wide">
              <div className="col-span-3">Component</div>
              <div className="col-span-2">Type</div>
              <div className="col-span-2">Calculation</div>
              <div className="col-span-2">Amount / %</div>
              <div className="col-span-2">Taxable</div>
              <div className="col-span-1"/>
            </div>
            <div className="divide-y divide-gray-100">
              {components.map((c,i)=>(
                <div key={i} className="grid grid-cols-12 gap-1 px-3 py-2 items-center hover:bg-gray-50">
                  <input className={`col-span-3 ${inpXs}`} value={c.component_name} onChange={e=>updateComp(i,'component_name',e.target.value)} placeholder="Name"/>
                  <select className={`col-span-2 ${inpXs}`} value={c.component_type} onChange={e=>updateComp(i,'component_type',e.target.value)}>
                    <option value="earning">Earning</option>
                    <option value="deduction">Deduction</option>
                    <option value="statutory">Statutory</option>
                  </select>
                  <select className={`col-span-2 ${inpXs}`} value={c.calc_type} onChange={e=>updateComp(i,'calc_type',e.target.value)}>
                    <option value="fixed">Fixed ₹</option>
                    <option value="pct_of_basic">% of Basic</option>
                    <option value="pct_of_gross">% of Gross</option>
                  </select>
                  {c.calc_type==='fixed' ? (
                    <input className={`col-span-2 ${inpXs}`} type="number" value={c.amount} onChange={e=>updateComp(i,'amount',e.target.value)} placeholder="₹"/>
                  ) : (
                    <input className={`col-span-2 ${inpXs}`} type="number" value={c.pct} onChange={e=>updateComp(i,'pct',e.target.value)} placeholder="%"/>
                  )}
                  <label className="col-span-2 flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                    <input type="checkbox" checked={c.is_taxable} onChange={e=>updateComp(i,'is_taxable',e.target.checked)} className="rounded"/>
                    Taxable
                  </label>
                  <button onClick={()=>removeComp(i)} className="col-span-1 flex justify-center p-1 text-gray-300 hover:text-red-500 transition-colors">
                    <Trash2 className="w-3.5 h-3.5"/>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-3 px-6 pb-6 flex-shrink-0">
          <button onClick={onClose} className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-bold">Cancel</button>
          <button onClick={()=>name&&onSave({ name, components })} disabled={!name}
            className="flex-1 py-2.5 text-white rounded-xl text-sm font-black disabled:opacity-50"
            style={{background:`linear-gradient(135deg,${B.blue},${B.navy})`}}>
            Save Structure
          </button>
        </div>
      </motion.div>
    </div>
  );
}

export default function SalaryStructurePage() {
  const qc = useQueryClient();
  const [modal,    setModal]    = useState(null);
  const [expanded, setExpanded] = useState({});

  const { data, isLoading } = useQuery({
    queryKey:['hr-salary-structures'],
    queryFn:()=>hrSalaryAPI.listStructures().then(r=>r.data),
  });
  const structures = data?.data || [];

  const saveMut = useMutation({
    mutationFn:(d)=>modal?.id ? hrSalaryAPI.updateStructure(modal.id,d) : hrSalaryAPI.createStructure(d),
    onSuccess:()=>{ toast.success('Saved'); qc.invalidateQueries({ queryKey:['hr-salary-structures'] }); setModal(null); },
    onError:e=>toast.error(e.response?.data?.error||'Error'),
  });

  const toggle = (id) => setExpanded(p=>({...p,[id]:!p[id]}));

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
                <BarChart2 className="w-4 h-4 text-white"/>
              </div>
              <span className="text-white/60 text-sm font-semibold">HR & Admin</span>
            </div>
            <h1 className="text-2xl font-black text-white">Salary Structures</h1>
            <p className="text-white/55 text-sm mt-1">Define CTC components for different employee grades</p>
          </div>
          <button onClick={()=>setModal({})}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-black shadow-lg hover:opacity-90 self-start"
            style={{background:B.yellow,color:B.navy}}>
            <Plus className="w-4 h-4"/> New Structure
          </button>
        </div>
      </motion.div>

      {/* Structures */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 rounded-full border-2 border-blue-200 border-t-blue-600 animate-spin"/>
        </div>
      ) : (
        <div className="space-y-3">
          {structures.map((s,i)=>(
            <motion.div key={s.id} {...fade(0.06+i*0.03)} className="bg-white rounded-2xl border border-gray-100 overflow-hidden"
              style={{boxShadow:'0 2px 12px rgba(10,31,92,0.06)'}}>
              <div className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={()=>toggle(s.id)}>
                <div className="flex items-center gap-3">
                  {expanded[s.id] ? <ChevronDown className="w-4 h-4 text-gray-400"/> : <ChevronRight className="w-4 h-4 text-gray-400"/>}
                  <div>
                    <span className="font-black text-gray-900">{s.name}</span>
                    <span className="text-gray-400 text-sm ml-2">({(s.components||[]).length} components)</span>
                  </div>
                </div>
                <div className="flex items-center gap-2" onClick={e=>e.stopPropagation()}>
                  <div className="flex gap-1">
                    {['earning','deduction','statutory'].map(t=>{
                      const cnt = (s.components||[]).filter(c=>c.component_type===t).length;
                      if (!cnt) return null;
                      const cfg = TYPE_CFG[t];
                      return (
                        <span key={t} className={`text-xs font-bold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}>
                          {cnt} {t}
                        </span>
                      );
                    })}
                  </div>
                  <button onClick={()=>setModal(s)} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors">
                    <Edit2 className="w-3.5 h-3.5"/>
                  </button>
                </div>
              </div>
              {expanded[s.id] && s.components && (
                <div className="border-t border-gray-100 p-5">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-100">
                        {['Component','Type','Calculation','Taxable'].map(h=>(
                          <th key={h} className="text-left py-2 text-gray-400 font-black uppercase tracking-wide">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {s.components.map((c,j)=>{
                        const cfg = TYPE_CFG[c.component_type]||TYPE_CFG.earning;
                        return (
                          <tr key={j} className="hover:bg-gray-50">
                            <td className="py-2 text-gray-900 font-bold">{c.component_name}</td>
                            <td className="py-2">
                              <span className={`text-xs font-bold px-2 py-0.5 rounded-full capitalize ${cfg.bg} ${cfg.text}`}>
                                {c.component_type}
                              </span>
                            </td>
                            <td className="py-2 text-gray-600">
                              {c.calc_type==='fixed' ? `₹${parseFloat(c.amount).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})} fixed` :
                               c.calc_type==='pct_of_basic' ? `${c.pct}% of Basic` :
                               `${c.pct}% of Gross`}
                            </td>
                            <td className="py-2">
                              {c.is_taxable
                                ? <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">Yes</span>
                                : <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">No</span>
                              }
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </motion.div>
          ))}
          {structures.length===0 && (
            <div className="bg-white rounded-2xl border border-gray-100 text-center py-16"
              style={{boxShadow:'0 2px 12px rgba(10,31,92,0.06)'}}>
              <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
                <BarChart2 className="w-7 h-7 text-gray-300"/>
              </div>
              <p className="text-gray-500 font-bold">No salary structures yet</p>
              <p className="text-gray-400 text-sm mt-1">Click "New Structure" to create one</p>
            </div>
          )}
        </div>
      )}

      {modal!==null && (
        <StructureModal
          structure={modal?.id ? modal : null}
          onClose={()=>setModal(null)}
          onSave={(d)=>saveMut.mutate(d)}
        />
      )}
    </div>
  );
}
