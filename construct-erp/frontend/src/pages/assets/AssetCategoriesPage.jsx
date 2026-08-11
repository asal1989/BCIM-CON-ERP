import React, { useEffect, useState } from 'react';
import { assetMgmtAPI } from '../../api/client';
import { Plus, Edit2, Trash2, Tag, ChevronRight, Layers } from 'lucide-react';
import {
  PageHeader, SectionCard, EmptyState, LoadingSpinner, Modal, FormField,
  StatusBadge, fmtINR, titleCase,
} from '../../components/ui';

const DEP_METHODS = ['straight_line', 'written_down_value', 'units_of_production'];

function CategoryModal({ cat, categories, onSave, onClose }) {
  const [form, setForm] = useState(cat || {
    name:'', parent_id:'', depreciation_method:'straight_line',
    useful_life_years:5, maintenance_interval_days:90, description:''
  });
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  return (
    <Modal title={cat?.id ? 'Edit Category' : 'New Asset Category'} onClose={onClose}
      footer={<>
        <button onClick={onClose} className="btn-secondary">Cancel</button>
        <button onClick={()=>{ if(!form.name) return alert('Name required'); onSave(form); }} className="btn-primary">
          {cat?.id ? 'Save Changes' : 'Create Category'}
        </button>
      </>}>
      <div className="p-6 grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <FormField label="Category Name" required>
            <input value={form.name} onChange={e=>set('name',e.target.value)} className="input" placeholder="e.g. Vehicles, Power Tools" />
          </FormField>
        </div>
        <FormField label="Parent Category">
          <select value={form.parent_id||''} onChange={e=>set('parent_id',e.target.value)} className="input">
            <option value="">None (Top Level)</option>
            {categories.filter(c=>c.id!==cat?.id).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </FormField>
        <FormField label="Depreciation Method">
          <select value={form.depreciation_method} onChange={e=>set('depreciation_method',e.target.value)} className="input">
            {DEP_METHODS.map(m=><option key={m} value={m}>{m.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}</option>)}
          </select>
        </FormField>
        <FormField label="Useful Life (Years)">
          <input type="number" value={form.useful_life_years} onChange={e=>set('useful_life_years',e.target.value)} className="input" min={1} />
        </FormField>
        <FormField label="Maintenance Interval (Days)">
          <input type="number" value={form.maintenance_interval_days} onChange={e=>set('maintenance_interval_days',e.target.value)} className="input" min={1} />
        </FormField>
        <div className="col-span-2">
          <FormField label="Description">
            <textarea value={form.description||''} onChange={e=>set('description',e.target.value)} rows={2} className="input" />
          </FormField>
        </div>
      </div>
    </Modal>
  );
}

export default function AssetCategoriesPage() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [modal, setModal]           = useState(null);

  const load = async () => {
    setLoading(true);
    try { setCategories((await assetMgmtAPI.listCategories()).data?.data); } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (form) => {
    try {
      if (form.id) await assetMgmtAPI.updateCategory(form.id, form);
      else await assetMgmtAPI.createCategory(form);
      setModal(null); load();
    } catch (e) { alert(e?.response?.data?.error||e.message); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this category?')) return;
    try { await assetMgmtAPI.deleteCategory(id); load(); } catch (e) { alert(e.message); }
  };

  const roots    = categories.filter(c=>!c.parent_id);
  const children = (pid) => categories.filter(c=>c.parent_id===pid);

  return (
    <div className="p-6 md:p-8 space-y-6">
      <PageHeader title="Asset Categories" subtitle="Manage depreciation rules and maintenance intervals per category" breadcrumb={['Assets & IT','Categories']}>
        <button onClick={()=>setModal('new')} className="btn-primary"><Plus className="w-4 h-4" /> New Category</button>
      </PageHeader>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card text-center">
          <div className="text-2xl font-bold text-indigo-600">{roots.length}</div>
          <div className="text-xs text-slate-500 mt-0.5">Root Categories</div>
        </div>
        <div className="card text-center">
          <div className="text-2xl font-bold text-slate-700">{categories.length}</div>
          <div className="text-xs text-slate-500 mt-0.5">Total Categories</div>
        </div>
        <div className="card text-center">
          <div className="text-2xl font-bold text-emerald-600">{categories.reduce((s,c)=>s+parseInt(c.asset_count||0),0)}</div>
          <div className="text-xs text-slate-500 mt-0.5">Assets Categorized</div>
        </div>
      </div>

      {loading ? <LoadingSpinner /> : (
        <div className="space-y-3">
          {roots.length === 0 ? (
            <div className="card">
              <EmptyState icon={Layers} title="No categories yet" description="Create categories to organize your assets with depreciation rules and maintenance schedules." actionLabel="Create First Category" onAction={()=>setModal('new')} />
            </div>
          ) : roots.map(root=>(
            <div key={root.id} className="card overflow-hidden p-0">
              {/* Root row */}
              <div className="flex items-center gap-4 px-5 py-4 bg-slate-50 border-b">
                <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0">
                  <Tag className="w-4 h-4 text-indigo-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-black">{root.name}</p>
                  {root.description && <p className="text-xs text-slate-400 truncate">{root.description}</p>}
                </div>
                <div className="hidden md:flex items-center gap-5 text-xs text-slate-500 flex-shrink-0">
                  <span className="badge badge-indigo">{root.depreciation_method?.replace(/_/g,' ').toUpperCase()}</span>
                  <span>{root.useful_life_years}y useful life</span>
                  <span>Every {root.maintenance_interval_days}d</span>
                  <span className="badge badge-blue">{root.asset_count} assets</span>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={()=>setModal(root)} className="btn-ghost p-2"><Edit2 className="w-4 h-4" /></button>
                  <button onClick={()=>handleDelete(root.id)} className="btn-ghost p-2 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
              {/* Children */}
              {children(root.id).map(child=>(
                <div key={child.id} className="flex items-center gap-4 px-5 py-3 pl-16 border-b last:border-0 hover:bg-slate-50 group">
                  <ChevronRight className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700">{child.name}</p>
                  </div>
                  <div className="hidden md:flex items-center gap-5 text-xs text-slate-400 flex-shrink-0">
                    <span>{child.depreciation_method?.replace(/_/g,' ')}</span>
                    <span>{child.useful_life_years}y</span>
                    <span>Every {child.maintenance_interval_days}d</span>
                    <span className="badge badge-gray">{child.asset_count} assets</span>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <button onClick={()=>setModal(child)} className="btn-ghost p-2"><Edit2 className="w-4 h-4" /></button>
                    <button onClick={()=>handleDelete(child.id)} className="btn-ghost p-2 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {modal && (
        <CategoryModal cat={modal==='new'?null:modal} categories={categories} onSave={handleSave} onClose={()=>setModal(null)} />
      )}
    </div>
  );
}
