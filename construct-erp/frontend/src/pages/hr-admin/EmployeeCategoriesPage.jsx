import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Tag, Plus, Edit2, Trash2, X, Save, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { hrMastersAPI } from '../../api/client';

const B = { navy:'#0A1F5C' };
const fade = (d=0) => ({ initial:{opacity:0,y:14}, animate:{opacity:1,y:0}, transition:{duration:0.35,delay:d} });
const inp = 'w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all';
const lbl = 'text-xs font-black text-gray-600 uppercase tracking-wide block mb-1.5';

const BLANK = { code:'', name:'', description:'', pf:true, esi:true, pt:false };

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div initial={{opacity:0,scale:0.97}} animate={{opacity:1,scale:1}} transition={{duration:0.2}}
        className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 flex items-center justify-between" style={{background:'linear-gradient(135deg,#0A1F5C,#1e3a8a)'}}>
          <h2 className="text-sm font-black text-white">{title}</h2>
          <button onClick={onClose} className="p-1.5 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition"><X className="w-4 h-4"/></button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </motion.div>
    </div>
  );
}

function Check({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)} className="w-4 h-4 accent-blue-600"/>
      <span className="text-sm font-medium text-gray-700">{label}</span>
    </label>
  );
}

export default function EmployeeCategoriesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null);
  const [form, setForm]   = useState(BLANK);

  const { data, isLoading } = useQuery({
    queryKey: ['employee-categories'],
    queryFn: () => hrMastersAPI.listEmployeeCategories().then(r => r.data?.data || []),
  });
  const cats = data || [];

  const invalidate = () => qc.invalidateQueries({ queryKey: ['employee-categories'] });
  const createMut = useMutation({ mutationFn: (d) => hrMastersAPI.createEmployeeCategory(d), onSuccess: () => { invalidate(); toast.success('Category created'); }, onError: (e) => toast.error(e.response?.data?.error || 'Failed to create') });
  const updateMut = useMutation({ mutationFn: ({id,d}) => hrMastersAPI.updateEmployeeCategory(id,d), onSuccess: () => { invalidate(); toast.success('Category updated'); }, onError: (e) => toast.error(e.response?.data?.error || 'Failed to update') });
  const deleteMut = useMutation({ mutationFn: (id) => hrMastersAPI.deleteEmployeeCategory(id), onSuccess: () => { invalidate(); toast.success('Deleted'); }, onError: (e) => toast.error(e.response?.data?.error || 'Failed to delete') });

  const filtered = cats.filter(c=>c.name.toLowerCase().includes(search.toLowerCase())||c.code.toLowerCase().includes(search.toLowerCase()));
  const set = (k,v) => setForm(p=>({...p,[k]:v}));
  const openAdd  = () => { setForm(BLANK); setModal('add'); };
  const openEdit = (c) => { setForm({ code:c.code, name:c.name, description:c.description||'', pf:c.pf, esi:c.esi, pt:c.pt }); setModal(c); };
  const close    = () => setModal(null);

  const save = () => {
    if(!form.code||!form.name){ toast.error('Code and Name required'); return; }
    if(modal==='add') createMut.mutate(form);
    else updateMut.mutate({ id: modal.id, d: form });
    close();
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <motion.div {...fade(0)}>
        <div className="rounded-2xl mb-6 p-6 flex items-center justify-between"
          style={{background:`linear-gradient(135deg,${B.navy},#1e3a8a)`}}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center"><Tag className="w-5 h-5 text-white"/></div>
            <div>
              <h1 className="text-lg font-black text-white">Employee Categories</h1>
              <p className="text-xs text-blue-200">{cats.length} categories · {cats.reduce((s,c)=>s+Number(c.employees||0),0)} employees</p>
            </div>
          </div>
          <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2 bg-yellow-400 hover:bg-yellow-300 text-gray-900 text-sm font-black rounded-xl transition">
            <Plus className="w-4 h-4"/> New Category
          </button>
        </div>

        <div className="relative mb-4">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"/>
          <input className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400"
            placeholder="Search categories..." value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>

        <motion.div {...fade(0.05)} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {['Code','Category Name','Description','Employees','PF','ESI','PT',''].map(h=>(
                  <th key={h} className="text-left px-4 py-3 text-xs font-black text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={8} className="text-center py-12 text-gray-400 text-sm">Loading…</td></tr>}
              {!isLoading && filtered.map((c,i)=>(
                <tr key={c.id} className={`border-b border-gray-50 hover:bg-blue-50/30 transition-colors ${i%2?'bg-gray-50/30':''}`}>
                  <td className="px-4 py-3"><span className="font-black text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg text-xs">{c.code}</span></td>
                  <td className="px-4 py-3 font-semibold text-gray-800">{c.name}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{c.description || '—'}</td>
                  <td className="px-4 py-3"><span className="bg-gray-100 text-gray-700 text-xs font-bold px-2.5 py-1 rounded-full">{c.employees}</span></td>
                  {['pf','esi','pt'].map(k=>(
                    <td key={k} className="px-4 py-3">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${c[k]?'bg-green-50 text-green-700':'bg-red-50 text-red-500'}`}>{c[k]?'Yes':'No'}</span>
                    </td>
                  ))}
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5">
                      <button onClick={()=>openEdit(c)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition"><Edit2 className="w-3.5 h-3.5"/></button>
                      <button onClick={()=>deleteMut.mutate(c.id)}   className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition"><Trash2 className="w-3.5 h-3.5"/></button>
                    </div>
                  </td>
                </tr>
              ))}
              {!isLoading && !filtered.length && <tr><td colSpan={8} className="text-center py-12 text-gray-400 text-sm">No categories found</td></tr>}
            </tbody>
          </table>
        </motion.div>
      </motion.div>

      {modal && (
        <Modal title={modal==='add'?'New Category':'Edit Category'} onClose={close}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div><label className={lbl}>Code</label><input className={inp} value={form.code} onChange={e=>set('code',e.target.value.toUpperCase())} maxLength={10}/></div>
              <div><label className={lbl}>Name</label><input className={inp} value={form.name} onChange={e=>set('name',e.target.value)}/></div>
            </div>
            <div><label className={lbl}>Description</label><input className={inp} value={form.description} onChange={e=>set('description',e.target.value)}/></div>
            <div>
              <label className={lbl}>Statutory Deductions</label>
              <div className="flex gap-6 mt-1">
                <Check label="PF" checked={form.pf}  onChange={v=>set('pf',v)}/>
                <Check label="ESI" checked={form.esi} onChange={v=>set('esi',v)}/>
                <Check label="PT"  checked={form.pt}  onChange={v=>set('pt',v)}/>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={close} className="flex-1 py-2.5 border border-gray-200 text-gray-600 font-semibold rounded-xl hover:bg-gray-50 transition text-sm">Cancel</button>
              <button onClick={save} className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl transition text-sm flex items-center justify-center gap-2">
                <Save className="w-4 h-4"/> Save
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
