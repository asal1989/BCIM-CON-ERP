// src/pages/hr-admin/ExpenseClaimPage.jsx — 2026 Premium UI
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Receipt, Plus, Check, X, ExternalLink, Clock, TrendingUp, CheckCircle2 } from 'lucide-react';
import { hrExpensesAPI, hrEmployeesAPI } from '../../api/client';
import toast from 'react-hot-toast';

const B = { navy:'#0A1F5C', blue:'#2563EB', yellow:'#F4C430', success:'#10B981', warning:'#F59E0B', danger:'#EF4444' };
const fmt = (v) => `₹${parseFloat(v||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const fade = (d=0) => ({ initial:{opacity:0,y:14}, animate:{opacity:1,y:0}, transition:{duration:0.35,delay:d,ease:[0.16,1,0.3,1]} });
const EXPENSE_TYPES = ['travel','food','accommodation','fuel','tools','misc'];
const AVATAR_COLORS = [['#6366F1','#4F46E5'],['#0EA5E9','#0284C7'],['#10B981','#059669'],['#F59E0B','#D97706'],['#EF4444','#DC2626'],['#8B5CF6','#7C3AED']];
const avatarGrad = (n) => AVATAR_COLORS[(n?.charCodeAt(0)||0)%AVATAR_COLORS.length];
const initials   = (n) => (n||'U').split(' ').map(x=>x[0]).join('').slice(0,2).toUpperCase();

const STATUS_CFG = {
  pending:  { label:'Pending',  bg:'bg-amber-50',   text:'text-amber-700',   dot:'bg-amber-400'  },
  approved: { label:'Approved', bg:'bg-blue-50',    text:'text-blue-700',    dot:'bg-blue-500'   },
  rejected: { label:'Rejected', bg:'bg-red-50',     text:'text-red-700',     dot:'bg-red-500'    },
  paid:     { label:'Paid',     bg:'bg-emerald-50', text:'text-emerald-700', dot:'bg-emerald-500' },
};

const inp = "w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all";
const lbl = "text-xs font-bold text-gray-600 uppercase tracking-wide block mb-1.5";

export default function ExpenseClaimPage() {
  const qc = useQueryClient();
  const [modal, setModal]     = useState(false);
  const [statusF, setStatusF] = useState('pending');

  const { data, isLoading, refetch } = useQuery({
    queryKey:['hr-expenses', statusF],
    queryFn:()=>hrExpensesAPI.list({status:statusF||undefined}).then(r=>r.data),
  });
  const claims = data?.data || [];

  const approveMut = useMutation({ mutationFn:(id)=>hrExpensesAPI.approve(id),    onSuccess:()=>{ toast.success('Approved'); refetch(); }, onError:e=>toast.error(e.response?.data?.error||'Error') });
  const rejectMut  = useMutation({ mutationFn:(id)=>hrExpensesAPI.reject(id),     onSuccess:()=>{ toast.success('Rejected'); refetch(); }, onError:e=>toast.error(e.response?.data?.error||'Error') });
  const payMut     = useMutation({ mutationFn:(id)=>hrExpensesAPI.pay(id,{paid_date:new Date().toISOString().split('T')[0]}), onSuccess:()=>{ toast.success('Marked as paid'); refetch(); }, onError:e=>toast.error(e.response?.data?.error||'Error') });

  const totalPending  = claims.filter(c=>c.status==='pending').reduce((s,c)=>s+parseFloat(c.amount||0),0);
  const totalApproved = claims.filter(c=>c.status==='approved').reduce((s,c)=>s+parseFloat(c.amount||0),0);

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
                <Receipt className="w-4 h-4 text-white"/>
              </div>
              <span className="text-white/60 text-sm font-semibold">HR & Admin</span>
            </div>
            <h1 className="text-2xl font-black text-white">Expense Claims</h1>
            <p className="text-white/55 text-sm mt-1">Employee expense reimbursements</p>
          </div>
          <button onClick={()=>setModal(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-black shadow-lg hover:opacity-90 self-start"
            style={{background:B.yellow,color:B.navy}}>
            <Plus className="w-4 h-4"/> New Claim
          </button>
        </div>
      </motion.div>

      {/* KPI Cards */}
      <motion.div {...fade(0.08)} className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {label:'Total Claims',   value:claims.length,                          icon:Receipt,     color:B.blue,    bg:'#EFF6FF'},
          {label:'Pending Amount', value:fmt(totalPending),                       icon:Clock,       color:'#F59E0B', bg:'#FFFBEB'},
          {label:'Approved Amount',value:fmt(totalApproved),                      icon:TrendingUp,  color:B.blue,    bg:'#EFF6FF'},
          {label:'Paid Claims',    value:claims.filter(c=>c.status==='paid').length, icon:CheckCircle2,color:B.success, bg:'#ECFDF5'},
        ].map((c,i)=>(
          <motion.div key={c.label} {...fade(0.08+i*0.04)} className="bg-white rounded-2xl p-5 border border-gray-100"
            style={{boxShadow:'0 2px 12px rgba(10,31,92,0.06)'}}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">{c.label}</p>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{background:c.bg}}>
                <c.icon className="w-4 h-4" style={{color:c.color}}/>
              </div>
            </div>
            <p className="text-2xl font-black text-gray-900">{c.value}</p>
          </motion.div>
        ))}
      </motion.div>

      {/* Filter */}
      <motion.div {...fade(0.16)} className="bg-white rounded-2xl p-4 border border-gray-100 flex flex-wrap gap-3 items-center"
        style={{boxShadow:'0 2px 12px rgba(10,31,92,0.06)'}}>
        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
          {['pending','approved','paid','rejected',''].map(s=>(
            <button key={s} onClick={()=>setStatusF(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${statusF===s?'bg-white text-blue-700 shadow-sm':'text-gray-500 hover:text-gray-700'}`}>
              {s||'All'}
            </button>
          ))}
        </div>
        <div className="ml-auto text-xs text-gray-400 font-medium">{claims.length} record{claims.length!==1?'s':''}</div>
      </motion.div>

      {/* Table */}
      <motion.div {...fade(0.20)} className="bg-white rounded-2xl border border-gray-100 overflow-hidden"
        style={{boxShadow:'0 2px 12px rgba(10,31,92,0.06)'}}>
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 rounded-full border-2 border-blue-200 border-t-blue-600 animate-spin"/>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Employee','Type','Date','Amount','Description','Project','Status','Bill','Actions'].map(h=>(
                    <th key={h} className="text-left px-4 py-3 text-xs font-black text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {claims.map(c=>{
                  const st = STATUS_CFG[c.status]||STATUS_CFG.pending;
                  const [g1,g2] = avatarGrad(c.employee_name);
                  return (
                    <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center text-white text-xs font-black"
                            style={{background:`linear-gradient(135deg,${g1},${g2})`}}>
                            {initials(c.employee_name)}
                          </div>
                          <div>
                            <p className="font-bold text-gray-900">{c.employee_name}</p>
                            <p className="text-xs text-gray-400">{c.employee_code}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 capitalize text-gray-700 font-medium">{c.expense_type}</td>
                      <td className="px-4 py-3 text-gray-500">{new Date(c.claim_date).toLocaleDateString('en-IN')}</td>
                      <td className="px-4 py-3 font-black text-gray-900">{fmt(c.amount)}</td>
                      <td className="px-4 py-3 text-gray-500 max-w-[150px] truncate">{c.description||'—'}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{c.project_name||'—'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full ${st.bg} ${st.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`}/>{st.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {c.bill_url ? (
                          <a href={c.bill_url} target="_blank" rel="noreferrer"
                            className="p-1.5 inline-flex bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg transition-colors">
                            <ExternalLink className="w-4 h-4"/>
                          </a>
                        ) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1.5">
                          {c.status==='pending' && <>
                            <button onClick={()=>approveMut.mutate(c.id)} className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-lg" title="Approve"><Check className="w-3.5 h-3.5"/></button>
                            <button onClick={()=>rejectMut.mutate(c.id)}  className="p-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg" title="Reject"><X className="w-3.5 h-3.5"/></button>
                          </>}
                          {c.status==='approved' && (
                            <button onClick={()=>payMut.mutate(c.id)} className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-xs font-bold">Pay</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {claims.length===0 && (
              <div className="text-center py-16">
                <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
                  <Receipt className="w-7 h-7 text-gray-300"/>
                </div>
                <p className="text-gray-500 font-bold">No expense claims</p>
                <p className="text-gray-400 text-sm mt-1">Click "New Claim" to submit one</p>
              </div>
            )}
          </div>
        )}
      </motion.div>

      {modal && <ClaimModal onClose={()=>setModal(false)} onSuccess={()=>{ setModal(false); refetch(); }}/>}
    </div>
  );
}

function ClaimModal({ onClose, onSuccess }) {
  const [form, setForm] = useState({ user_id:'', expense_type:'travel', claim_date:new Date().toISOString().split('T')[0], amount:'', description:'', project_id:'' });
  const [file, setFile] = useState(null);
  const {data:empData}  = useQuery({queryKey:['hr-employees-active'],queryFn:()=>hrEmployeesAPI.list({employment_status:'active'}).then(r=>r.data)});
  const s = (k,v) => setForm(p=>({...p,[k]:v}));

  const createMut = useMutation({
    mutationFn:(fd)=>hrExpensesAPI.create(fd),
    onSuccess:()=>{ toast.success('Claim submitted'); onSuccess(); },
    onError:e=>toast.error(e.response?.data?.error||'Error'),
  });

  const handleSubmit = () => {
    if (!form.user_id||!form.amount) return toast.error('Employee and amount required');
    const fd = new FormData();
    Object.entries(form).forEach(([k,v])=>v&&fd.append(k,v));
    if (file) fd.append('bill',file);
    createMut.mutate(fd);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:'rgba(0,0,0,0.4)',backdropFilter:'blur(4px)'}}>
      <motion.div initial={{scale:0.95,opacity:0,y:20}} animate={{scale:1,opacity:1,y:0}}
        transition={{duration:0.22}} className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100"
          style={{background:`linear-gradient(135deg,${B.navy},#1e3a8a)`}}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center">
              <Receipt className="w-5 h-5 text-white"/>
            </div>
            <p className="font-bold text-white">Submit Expense Claim</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center text-white hover:bg-white/20"><X className="w-4 h-4"/></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div><label className={lbl}>Employee</label>
            <select className={inp} value={form.user_id} onChange={e=>s('user_id',e.target.value)}>
              <option value="">Select Employee</option>
              {(empData?.data||[]).map(e=><option key={e.id} value={e.id}>{e.name} ({e.employee_code})</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={lbl}>Expense Type</label>
              <select className={inp} value={form.expense_type} onChange={e=>s('expense_type',e.target.value)}>
                {EXPENSE_TYPES.map(t=><option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
              </select>
            </div>
            <div><label className={lbl}>Date</label>
              <input type="date" className={inp} value={form.claim_date} onChange={e=>s('claim_date',e.target.value)}/>
            </div>
          </div>
          <div><label className={lbl}>Amount (₹)</label>
            <input className={inp} type="number" value={form.amount} onChange={e=>s('amount',e.target.value)} placeholder="0"/>
          </div>
          <div><label className={lbl}>Description</label>
            <textarea className={inp} rows={2} value={form.description} onChange={e=>s('description',e.target.value)} placeholder="Brief description of expense"/>
          </div>
          <div>
            <label className={lbl}>Bill / Receipt (optional)</label>
            <input type="file" onChange={e=>setFile(e.target.files[0])}
              className="w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"/>
          </div>
        </div>
        <div className="flex gap-3 px-6 pb-6">
          <button onClick={onClose} className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-bold">Cancel</button>
          <button onClick={handleSubmit} disabled={createMut.isPending}
            className="flex-1 py-2.5 text-white rounded-xl text-sm font-black disabled:opacity-50"
            style={{background:`linear-gradient(135deg,${B.blue},${B.navy})`}}>
            {createMut.isPending?'Submitting…':'Submit Claim'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
