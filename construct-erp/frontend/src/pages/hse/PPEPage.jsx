// src/pages/hse/PPEPage.jsx
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { 
  HardHat, Plus, X, Shield, 
  User, Calendar, Clock, Package,
  RotateCcw, Trash2, Filter, Search,
  CheckCircle2, AlertCircle, Info, Tag
} from 'lucide-react';
import { ppeAPI, workerAPI, projectAPI, default as api } from '../../api/client';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import dayjs from 'dayjs';
import DataToolbar from '../../components/common/DataToolbar';
import TableActions from '../../components/common/TableActions';

export default function PPEPage() {
  const [showForm, setShowForm] = useState(false);
  const [filterType, setFilterType] = useState('all');
  const qc = useQueryClient();
  const { register, handleSubmit, reset } = useForm();

  const { data: ppeLogs, isLoading } = useQuery({
    queryKey: ['ppe-logs', filterType],
    queryFn: () => ppeAPI.list(filterType !== 'all' ? { type: filterType } : {}).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectAPI.list().then(r => { const d = r?.data; return Array.isArray(d) ? d : (Array.isArray(d?.data) ? d.data : []); }).catch(() => []),
  });

  const { data: workers } = useQuery({
    queryKey: ['workers'],
    queryFn: () => workerAPI.list().then(r => r.data?.data ?? r.data ?? []).catch(() => []),
  });

  const issueMut = useMutation({
    mutationFn: (d) => ppeAPI.issue(d),
    onSuccess: () => {
      toast.success('PPE Issuance Recorded');
      reset(); setShowForm(false);
      qc.invalidateQueries({ queryKey: ['ppe-logs'] });
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Issuance failed'),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/ppe/${id}`),
    onSuccess: () => {
      toast.success('PPE issuance record deleted');
      qc.invalidateQueries({ queryKey: ['ppe-logs'] });
    },
    onError: () => toast.error('Failed to delete PPE record'),
  });

  return (
    <div className="p-6 space-y-6 bg-slate-50 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
           <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
              <HardHat className="w-7 h-7 text-amber-500" />
           </div>
           <div>
              <h1 className="text-2xl font-medium text-slate-900 uppercase tracking-tight italic">PPE Lifecycle Hub</h1>
              <p className="text-[10px] text-slate-900 font-medium uppercase tracking-[0.2em]">Personal Protective Equipment Registry & Issuance</p>
           </div>
        </div>
        <DataToolbar 
          data={ppeLogs} 
          fileName="PPE_Issuance_Export" 
          onAdd={() => setShowForm(true)} 
          addLabel="Issue Safety Gear"
        />
      </div>

      {/* PPE Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Items Issued" value={ppeLogs?.length || 0} color="text-amber-500" />
          <StatCard label="Safety Helmets" value={ppeLogs?.filter(p => p.item_type === 'helmet').length || 0} color="text-blue-400" />
          <StatCard label="Jacket / High-Vis" value={ppeLogs?.filter(p => p.item_type === 'waistcoat').length || 0} color="text-emerald-500" />
          <StatCard label="Expiring Soon" value={ppeLogs?.filter(p => dayjs(p.expiry_date).diff(dayjs(), 'day') <= 30).length || 0} color="text-red-500" />
      </div>

      {/* Issuance Ledger */}
      <div className="bg-white border border-slate-200 overflow-hidden rounded-[2.5rem] shadow-sm">
        <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-white">
           <h3 className="text-xs font-medium text-slate-900 uppercase tracking-widest flex items-center gap-3 italic">
              <Package size={16} className="text-amber-500" /> Equipment Allocation Registry
           </h3>
           <div className="flex gap-2">
              <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-medium uppercase tracking-tight text-slate-900 font-medium italic">
                 <Filter size={12} /> Filtered by Type: {filterType}
              </div>
           </div>
        </div>
        <div className="p-0">
          <table className="w-full text-sm text-left border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="p-6 text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest">Safety Gear & Type</th>
                <th className="p-6 text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest">Recipient Worker</th>
                <th className="p-6 text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest">Issuance Date</th>
                <th className="p-6 text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest">Expiry / Renewal</th>
                <th className="p-6 text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest">Internal Status</th>
                <th className="p-6 text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {ppeLogs?.map(p => {
                const isOld = dayjs(p.expiry_date).isBefore(dayjs());
                
                return (
                  <tr key={p.id} className="hover:bg-slate-50 transition-all group">
                    <td className="p-6">
                      <div className="flex items-center gap-4">
                         <div className="w-11 h-11 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 shadow-sm group-hover:scale-110 transition-transform">
                            <Shield className="w-5 h-5" />
                         </div>
                         <div>
                            <div className="text-slate-900 font-medium text-xs uppercase tracking-tight italic">{p.item_code}</div>
                            <div className="text-[9px] font-medium text-slate-900 font-medium uppercase tracking-widest mt-1 italic">{p.item_type} • <span className="text-slate-300 font-mono">Condition: {p.condition || 'good'}</span></div>
                         </div>
                      </div>
                    </td>
                    <td className="p-6">
                       <div className="flex items-center gap-2 mb-1">
                          <User size={12} className="text-slate-400" />
                          <span className="text-slate-900 font-medium text-xs uppercase tracking-tight italic">{p.worker_name}</span>
                       </div>
                       <div className="text-[9px] text-slate-900 font-medium uppercase tracking-widest mt-1 ml-5 italic leading-none">{p.skill_type || 'General Site Staff'}</div>
                    </td>
                    <td className="p-6">
                      <div className="flex items-center gap-2 text-slate-900 font-medium font-mono text-xs font-medium bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-100 w-fit">
                         <Calendar size={12} className="text-slate-400" />
                         <span>{dayjs(p.issued_date).format('DD MMM YYYY')}</span>
                      </div>
                    </td>
                    <td className="p-6">
                      <div className={clsx("flex items-center gap-2 font-mono text-xs font-medium px-3 py-1.5 rounded-xl border w-fit shadow-sm uppercase", isOld ? "bg-red-50 text-red-600 border-red-100" : "bg-amber-50 text-amber-600 border-amber-100")}>
                         <Clock size={12} />
                         <span>{dayjs(p.expiry_date).format('DD MMM YYYY')}</span>
                      </div>
                      {isOld && <div className="text-[7px] bg-red-600 text-white px-2 py-0.5 mt-2 rounded-full w-fit font-medium uppercase italic animate-pulse shadow-sm">Replace Now</div>}
                    </td>
                    <td className="p-6">
                        <div className={clsx('flex items-center gap-1.5 px-4 py-2 rounded-2xl text-[9px] font-medium uppercase tracking-widest border w-fit shadow-sm italic', 
                          !isOld ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-red-50 text-red-600 border-red-100')}>
                           {!isOld ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />} {!isOld ? 'ACTIVE' : 'EXPIRED'}
                        </div>
                    </td>
                    <td className="p-6 text-right">
                        <div className="flex items-center justify-end gap-2.5">
                           <button className="w-10 h-10 flex items-center justify-center bg-white text-slate-900 font-medium hover:text-amber-600 border border-slate-200 shadow-sm rounded-xl transition-all"><RotateCcw className="w-4 h-4" /></button>
                           <div onClick={e => e.stopPropagation()} className="ml-1">
                             <TableActions disableEdit onDelete={() => deleteMut.mutate(p.id)} />
                           </div>
                        </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Issue PPE Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 shadow-sm w-full max-w-xl rounded-[3.5rem] overflow-hidden flex flex-col shadow-2xl animate-in zoom-in duration-300">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50">
               <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-amber-500 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-amber-500/20"><Package size={24} /></div>
                  <div>
                    <h2 className="text-xl font-medium text-slate-900 uppercase tracking-tight italic leading-none mb-1">PPE Issuance Registry</h2>
                    <p className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest leading-none italic">Safety Gear Allocation & Forensic Tracking</p>
                  </div>
               </div>
               <button onClick={() => setShowForm(false)} className="w-10 h-10 flex items-center justify-center bg-white border border-slate-200 rounded-full text-slate-900 font-medium hover:bg-slate-50 transition-all"><X className="w-6 h-6" /></button>
            </div>

            <form onSubmit={handleSubmit(issueMut.mutate)} className="p-10 space-y-8">
               <div className="grid grid-cols-2 gap-8">
                  <div className="space-y-2">
                     <label className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest ml-1 leading-none italic">Project *</label>
                     <select {...register('project_id', { required: true })} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium text-slate-900 uppercase italic outline-none focus:border-amber-500 transition-all">
                       <option value="">— Select Project —</option>
                       {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                     </select>
                     <label className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest ml-1 leading-none italic mt-4">Recipient Worker</label>
                     <select {...register('worker_id', { required: true })} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium text-slate-900 uppercase italic outline-none focus:border-amber-500 transition-all">
                        <option value="">Select Target Worker...</option>
                        {workers?.map(w => <option key={w.id} value={w.id}>{w.worker_name || w.name} ({w.skill_type})</option>)}
                     </select>
                  </div>
                  <div className="space-y-2">
                     <label className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest ml-1 leading-none italic">Item Classification</label>
                     <select {...register('item_type', { required: true })} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium text-slate-900 uppercase italic outline-none focus:border-amber-500 transition-all">
                        <option value="helmet">Category A: Safety Helmet</option>
                        <option value="waistcoat">Category B: High-Vis Jacket</option>
                        <option value="boots">Category C: Steel-Toe Boots</option>
                        <option value="harness">Category D: Safety Harness</option>
                        <option value="gloves">Category E: Industrial Gloves</option>
                     </select>
                  </div>
               </div>

               <div className="space-y-2">
                  <label className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest ml-1 leading-none italic">Item Code / Specification</label>
                  <input {...register('item_code', { required: true })} className="w-full p-5 bg-slate-50 border border-slate-200 rounded-2xl text-xs italic font-medium text-slate-900 outline-none focus:border-amber-500 shadow-inner transition-all uppercase" placeholder="e.g. KARAM PN-21 INDUSTRIAL HARDHAT" />
               </div>

               <div className="grid grid-cols-2 gap-8">
                  <div className="space-y-2">
                     <label className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest ml-1 leading-none">Issuance Date</label>
                     <input type="date" {...register('issued_date', { required: true })} defaultValue={dayjs().format('YYYY-MM-DD')} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium text-slate-900 font-mono uppercase outline-none focus:border-amber-500 transition-all" />
                  </div>
                  <div className="space-y-2">
                     <label className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest ml-1 leading-none">Renewal Protocol Date</label>
                     <input type="date" {...register('expiry_date', { required: true })} defaultValue={dayjs().add(1, 'year').format('YYYY-MM-DD')} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium text-amber-600 font-mono uppercase outline-none focus:border-amber-500 transition-all" />
                  </div>
               </div>

               <div className="bg-amber-50 text-amber-700 p-6 rounded-[2rem] text-[10px] font-medium uppercase tracking-widest flex items-center gap-5 italic leading-relaxed border border-amber-100 shadow-xl shadow-amber-500/5">
                  <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shrink-0 shadow-sm"><Info size={24} /></div>
                  <span>Standard safety gear at BCIM Engineering is valid for 12 standard business months. All equipment must beForensically inspected for physical fatigue before issuance.</span>
               </div>

               <div className="flex gap-4 pt-6">
                  <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-5 bg-slate-100 text-slate-900 font-medium rounded-[2rem] text-[10px] font-medium uppercase tracking-widest hover:bg-slate-200 transition-all">Discard Registry</button>
                  <button type="submit" disabled={issueMut.isPending} className="flex-2 py-5 bg-amber-500 text-white rounded-[2rem] text-[10px] font-medium uppercase tracking-widest hover:bg-amber-400 transition-all shadow-xl shadow-amber-500/30 italic flex items-center justify-center gap-3">
                     Authorize Issuance Protocol 🛡
                  </button>
               </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div className="bg-white p-8 border border-slate-200 rounded-[2.5rem] shadow-sm group hover:border-amber-500/30 transition-all cursor-default">
       <span className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-[0.2em] block mb-2 leading-none italic">{label}</span>
       <div className={clsx("text-4xl font-medium italic tracking-tighter leading-none font-mono", color)}>{value}</div>
    </div>
  );
}
