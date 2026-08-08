// EmployeeAssetsPage.jsx — Assets assigned to employees
import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X, Pencil, Trash2, RotateCcw, Package } from 'lucide-react';
import { clsx } from 'clsx';
import dayjs from 'dayjs';
import toast from 'react-hot-toast';
import { hrEmpAssetsAPI, hrEmployeesAPI } from '../../api/client';
import { PageHeader } from '../../theme';
import { FIELD_HL } from '../../constants/fieldStyles';

const INP = `w-full h-9 rounded-lg px-3 text-xs font-medium outline-none transition-all border ${FIELD_HL}`;
const CATEGORIES = ['laptop','mobile','sim_card','vehicle','tools','uniform','safety_gear','access_card','other'];
const CONDITIONS  = ['new','good','fair','poor'];
const STATUS_C    = { assigned:'blue', returned:'green', lost:'red', damaged:'orange' };

function AssetForm({ asset, employees=[], defaultCategory='', onClose, onSaved }) {
  const isEdit = !!asset;
  const [f, setF] = useState(asset || { employee_id:'', asset_name:'', asset_code:'', category:defaultCategory||'laptop', serial_number:'', assigned_on:dayjs().format('YYYY-MM-DD'), return_expected:'', condition_at_issue:'good', asset_value:0, notes:'' });
  const set = (k,v) => setF(p=>({...p,[k]:v}));
  const mut = useMutation({
    mutationFn: d => isEdit ? hrEmpAssetsAPI.update(asset.id, d) : hrEmpAssetsAPI.create(d),
    onSuccess: () => { toast.success(isEdit?'Updated':'Asset assigned'); onSaved(); onClose(); },
    onError: e => toast.error(e?.response?.data?.error||'Failed'),
  });
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="text-sm font-semibold">{isEdit?'Edit Asset':'Assign Asset'}</h3>
          <button onClick={onClose}><X size={16}/></button>
        </div>
        <div className="p-5 space-y-3">
          <div><label className="block text-[11px] text-slate-500 mb-1">Employee *</label>
            <select value={f.employee_id} onChange={e=>set('employee_id',e.target.value)} className={INP}>
              <option value="">Select…</option>
              {employees.map(e=><option key={e.id} value={e.id}>{e.name||e.full_name} ({e.employee_code||e.emp_code})</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-[11px] text-slate-500 mb-1">Asset Name *</label>
              <input value={f.asset_name} onChange={e=>set('asset_name',e.target.value)} placeholder="MacBook Pro 14" className={INP} /></div>
            <div><label className="block text-[11px] text-slate-500 mb-1">Category</label>
              <select value={f.category} onChange={e=>set('category',e.target.value)} className={INP}>
                {CATEGORIES.map(c=><option key={c} value={c} className="capitalize">{c.replace(/_/g,' ')}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-[11px] text-slate-500 mb-1">Asset Code</label>
              <input value={f.asset_code||''} onChange={e=>set('asset_code',e.target.value)} placeholder="IT-001" className={INP} /></div>
            <div><label className="block text-[11px] text-slate-500 mb-1">Serial Number</label>
              <input value={f.serial_number||''} onChange={e=>set('serial_number',e.target.value)} className={INP} /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="block text-[11px] text-slate-500 mb-1">Assigned On</label>
              <input type="date" value={f.assigned_on} onChange={e=>set('assigned_on',e.target.value)} className={INP} /></div>
            <div><label className="block text-[11px] text-slate-500 mb-1">Return Expected</label>
              <input type="date" value={f.return_expected||''} onChange={e=>set('return_expected',e.target.value)} className={INP} /></div>
            <div><label className="block text-[11px] text-slate-500 mb-1">Condition</label>
              <select value={f.condition_at_issue} onChange={e=>set('condition_at_issue',e.target.value)} className={INP}>
                {CONDITIONS.map(c=><option key={c} value={c} className="capitalize">{c}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-[11px] text-slate-500 mb-1">Asset Value (₹)</label>
              <input type="number" value={f.asset_value} onChange={e=>set('asset_value',e.target.value)} className={INP} /></div>
            <div><label className="block text-[11px] text-slate-500 mb-1">Notes</label>
              <input value={f.notes||''} onChange={e=>set('notes',e.target.value)} className={INP} /></div>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t">
          <button onClick={onClose} className="h-9 px-4 rounded-xl border text-xs">Cancel</button>
          <button onClick={()=>mut.mutate(f)} disabled={mut.isPending||!f.employee_id} className="h-9 px-5 rounded-xl bg-blue-600 text-white text-xs font-semibold disabled:opacity-50">
            {mut.isPending?'Saving…':isEdit?'Update':'Assign'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ReturnModal({ asset, onClose, onSaved }) {
  const [f, setF] = useState({ returned_on:dayjs().format('YYYY-MM-DD'), condition_at_return:'good', notes:'' });
  const mut = useMutation({
    mutationFn: d => hrEmpAssetsAPI.return(asset.id, d),
    onSuccess: () => { toast.success('Asset returned'); onSaved(); onClose(); },
    onError: e => toast.error(e?.response?.data?.error||'Failed'),
  });
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="text-sm font-semibold">Return Asset — {asset.asset_name}</h3>
          <button onClick={onClose}><X size={16}/></button>
        </div>
        <div className="p-5 space-y-3">
          <div><label className="block text-[11px] text-slate-500 mb-1">Return Date</label>
            <input type="date" value={f.returned_on} onChange={e=>setF(p=>({...p,returned_on:e.target.value}))} className={INP} /></div>
          <div><label className="block text-[11px] text-slate-500 mb-1">Condition at Return</label>
            <select value={f.condition_at_return} onChange={e=>setF(p=>({...p,condition_at_return:e.target.value}))} className={INP}>
              {['good','fair','poor','damaged','lost'].map(c=><option key={c} value={c} className="capitalize">{c}</option>)}
            </select>
          </div>
          <div><label className="block text-[11px] text-slate-500 mb-1">Notes</label>
            <input value={f.notes} onChange={e=>setF(p=>({...p,notes:e.target.value}))} className={INP} /></div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t">
          <button onClick={onClose} className="h-9 px-4 rounded-xl border text-xs">Cancel</button>
          <button onClick={()=>mut.mutate(f)} disabled={mut.isPending} className="h-9 px-5 rounded-xl bg-green-600 text-white text-xs font-semibold disabled:opacity-50">
            {mut.isPending?'Saving…':'Confirm Return'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function EmployeeAssetsPage() {
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const categoryLock = searchParams.get('category') || '';
  const [showForm, setShowForm] = useState(false);
  const [editAsset, setEditAsset] = useState(null);
  const [returnAsset, setReturnAsset] = useState(null);
  const [filterStatus, setFilterStatus] = useState('assigned');

  const { data: assets=[] } = useQuery({ queryKey:['hr-emp-assets',filterStatus,categoryLock], queryFn:()=>hrEmpAssetsAPI.list({status:filterStatus||undefined,category:categoryLock||undefined}).then(r=>r.data?.data||[]) });
  const { data: empRes } = useQuery({ queryKey:['hr-employees-simple'], queryFn:()=>hrEmployeesAPI.list({ employment_status:'active', limit:500 }).then(r=>r.data) });
  const employees = empRes?.data || [];
  const del = useMutation({ mutationFn:id=>hrEmpAssetsAPI.remove(id), onSuccess:()=>{ toast.success('Deleted'); qc.invalidateQueries({queryKey:['hr-emp-assets']}); } });

  const pageTitle = categoryLock === 'uniform' ? 'Uniform Issue' : 'Employee Assets';
  const pageSubtitle = categoryLock === 'uniform' ? 'Issue and track uniforms given to employees' : 'Assign and track assets given to employees';

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#f5f6fa]">
      <PageHeader title={pageTitle} subtitle={pageSubtitle}
        breadcrumbs={[{label:'HR & Admin'},{label:categoryLock==='uniform'?'Uniform Issue':'Assets'}]}
        actions={<button onClick={()=>{setEditAsset(null);setShowForm(true);}} className="h-9 px-4 rounded-xl bg-blue-600 text-white text-xs font-semibold flex items-center gap-2"><Plus size={14}/> {categoryLock==='uniform'?'Issue Uniform':'Assign Asset'}</button>}
      />
      <div className="flex-1 overflow-auto p-5">
        <div className="flex gap-2 mb-4">
          {['','assigned','returned','lost','damaged'].map(s=>(
            <button key={s} onClick={()=>setFilterStatus(s)}
              className={clsx('h-8 px-3 rounded-lg text-xs font-medium capitalize', filterStatus===s?'bg-blue-600 text-white':'bg-white border border-slate-200 text-slate-600')}>
              {s||'All'}
            </button>
          ))}
        </div>
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden max-w-6xl">
          <table className="w-full text-xs">
            <thead className="bg-slate-50"><tr>
              {['Employee','Asset','Category','Code / Serial','Assigned On','Return Expected','Condition','Value','Status','Actions'].map(h=>(
                <th key={h} className="px-3 py-3 text-left font-semibold text-slate-500 whitespace-nowrap">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {assets.map(a=>{
                const color = STATUS_C[a.status]||'slate';
                return (
                  <tr key={a.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-3 font-medium">{a.full_name} <span className="text-slate-400">({a.emp_code})</span></td>
                    <td className="px-3 py-3 font-medium text-slate-800">{a.asset_name}</td>
                    <td className="px-3 py-3 capitalize">{a.category?.replace(/_/g,' ')}</td>
                    <td className="px-3 py-3 font-mono text-[10px] text-slate-500">{a.asset_code||a.serial_number||'—'}</td>
                    <td className="px-3 py-3">{dayjs(a.assigned_on).format('DD-MM-YYYY')}</td>
                    <td className="px-3 py-3">{a.return_expected?dayjs(a.return_expected).format('DD-MM-YYYY'):'—'}</td>
                    <td className="px-3 py-3 capitalize">{a.condition_at_issue}</td>
                    <td className="px-3 py-3">₹{parseFloat(a.asset_value||0).toLocaleString('en-IN')}</td>
                    <td className="px-3 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold bg-${color}-100 text-${color}-700 capitalize`}>{a.status}</span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex gap-1">
                        {a.status==='assigned' && (
                          <button onClick={()=>setReturnAsset(a)} className="w-6 h-6 rounded hover:bg-green-100 flex items-center justify-center" title="Return">
                            <RotateCcw size={11} className="text-green-600"/>
                          </button>
                        )}
                        <button onClick={()=>{setEditAsset(a);setShowForm(true);}} className="w-6 h-6 rounded hover:bg-slate-100 flex items-center justify-center">
                          <Pencil size={11} className="text-slate-500"/>
                        </button>
                        <button onClick={()=>{if(window.confirm('Delete?'))del.mutate(a.id);}} className="w-6 h-6 rounded hover:bg-red-50 flex items-center justify-center">
                          <Trash2 size={11} className="text-red-400"/>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {assets.length===0 && <tr><td colSpan={10} className="py-12 text-center text-slate-400">No assets found</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      {showForm && <AssetForm asset={editAsset} defaultCategory={categoryLock} employees={employees} onClose={()=>{setShowForm(false);setEditAsset(null);}} onSaved={()=>qc.invalidateQueries({queryKey:['hr-emp-assets']})} />}
      {returnAsset && <ReturnModal asset={returnAsset} onClose={()=>setReturnAsset(null)} onSaved={()=>qc.invalidateQueries({queryKey:['hr-emp-assets']})} />}
    </div>
  );
}
