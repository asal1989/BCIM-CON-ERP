// TravelRequestPage.jsx — Travel Requests & Reimbursements
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X, CheckCircle2, XCircle } from 'lucide-react';
import { clsx } from 'clsx';
import dayjs from 'dayjs';
import toast from 'react-hot-toast';
import { hrTravelAPI, hrEmployeesAPI } from '../../api/client';
import { PageHeader } from '../../theme';
import { FIELD_HL } from '../../constants/fieldStyles';

const INP = `w-full h-9 rounded-lg px-3 text-xs font-medium outline-none transition-all border ${FIELD_HL}`;
const STATUS_C = { pending:'yellow', approved:'blue', rejected:'red', advance_paid:'purple', settled:'green', cancelled:'slate' };
const MODES = ['air','train','bus','own_vehicle','cab','others'];

function TravelForm({ onClose, onSaved, employees=[] }) {
  const [f, setF] = useState({ employee_id:'', purpose:'', from_date:'', to_date:'', from_city:'', to_city:'', mode:'train', travel_class:'', advance_requested:0, remarks:'' });
  const set = (k,v) => setF(p=>({...p,[k]:v}));
  const mut = useMutation({
    mutationFn: d => { const fd = new FormData(); Object.entries(d).forEach(([k,v])=>v!==undefined&&fd.append(k,v)); return hrTravelAPI.create(fd); },
    onSuccess: () => { toast.success('Travel request submitted'); onSaved(); onClose(); },
    onError: e => toast.error(e?.response?.data?.error||'Failed'),
  });
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="text-sm font-semibold">New Travel Request</h3>
          <button onClick={onClose}><X size={16}/></button>
        </div>
        <div className="p-5 space-y-3">
          {employees.length > 0 && (
            <div><label className="block text-[11px] text-slate-500 mb-1">Employee (leave blank for self)</label>
              <select value={f.employee_id} onChange={e=>set('employee_id',e.target.value)} className={INP}>
                <option value="">Self</option>
                {employees.map(e=><option key={e.id} value={e.id}>{e.full_name||e.name} ({e.employee_code||e.emp_code})</option>)}
              </select>
            </div>
          )}
          <div><label className="block text-[11px] text-slate-500 mb-1">Purpose *</label>
            <input value={f.purpose} onChange={e=>set('purpose',e.target.value)} placeholder="Site visit, client meeting…" className={INP} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-[11px] text-slate-500 mb-1">From Date *</label>
              <input type="date" value={f.from_date} onChange={e=>set('from_date',e.target.value)} className={INP} /></div>
            <div><label className="block text-[11px] text-slate-500 mb-1">To Date *</label>
              <input type="date" value={f.to_date} onChange={e=>set('to_date',e.target.value)} className={INP} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-[11px] text-slate-500 mb-1">From City</label>
              <input value={f.from_city} onChange={e=>set('from_city',e.target.value)} placeholder="Bangalore" className={INP} /></div>
            <div><label className="block text-[11px] text-slate-500 mb-1">To City</label>
              <input value={f.to_city} onChange={e=>set('to_city',e.target.value)} placeholder="Mumbai" className={INP} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-[11px] text-slate-500 mb-1">Mode</label>
              <select value={f.mode} onChange={e=>set('mode',e.target.value)} className={INP}>
                {MODES.map(m=><option key={m} value={m} className="capitalize">{m.replace(/_/g,' ')}</option>)}
              </select>
            </div>
            <div><label className="block text-[11px] text-slate-500 mb-1">Class</label>
              <input value={f.travel_class} onChange={e=>set('travel_class',e.target.value)} placeholder="Economy / Sleeper / AC" className={INP} /></div>
          </div>
          <div><label className="block text-[11px] text-slate-500 mb-1">Advance Requested (₹)</label>
            <input type="number" value={f.advance_requested} onChange={e=>set('advance_requested',e.target.value)} className={INP} /></div>
          <div><label className="block text-[11px] text-slate-500 mb-1">Remarks</label>
            <input value={f.remarks} onChange={e=>set('remarks',e.target.value)} className={INP} /></div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t">
          <button onClick={onClose} className="h-9 px-4 rounded-xl border text-xs">Cancel</button>
          <button onClick={()=>mut.mutate(f)} disabled={mut.isPending} className="h-9 px-5 rounded-xl bg-blue-600 text-white text-xs font-semibold disabled:opacity-50">
            {mut.isPending?'Submitting…':'Submit Request'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ApproveModal({ travel, onClose, onSaved }) {
  const [advance, setAdvance] = useState(travel.advance_requested||0);
  const mut = useMutation({
    mutationFn: () => hrTravelAPI.approve(travel.id, { advance_approved: advance }),
    onSuccess: () => { toast.success('Approved'); onSaved(); onClose(); },
    onError: e => toast.error(e?.response?.data?.error||'Failed'),
  });
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="text-sm font-semibold">Approve Travel Request</h3>
          <button onClick={onClose}><X size={16}/></button>
        </div>
        <div className="p-5 space-y-3">
          <div className="text-xs text-slate-600">{travel.full_name} — {travel.purpose}</div>
          <div><label className="block text-[11px] text-slate-500 mb-1">Advance Approved (₹)</label>
            <input type="number" value={advance} onChange={e=>setAdvance(e.target.value)} className={INP} /></div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t">
          <button onClick={onClose} className="h-9 px-4 rounded-xl border text-xs">Cancel</button>
          <button onClick={()=>mut.mutate()} disabled={mut.isPending} className="h-9 px-5 rounded-xl bg-green-600 text-white text-xs font-semibold disabled:opacity-50">
            {mut.isPending?'Approving…':'Approve'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TravelRequestPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [approveItem, setApproveItem] = useState(null);
  const [filterStatus, setFilterStatus] = useState('');

  const { data: list=[] } = useQuery({ queryKey:['hr-travel',filterStatus], queryFn:()=>hrTravelAPI.list({status:filterStatus||undefined}).then(r=>r.data?.data||[]) });
  const { data: employees=[] } = useQuery({ queryKey:['hr-employees-active'], queryFn:()=>hrEmployeesAPI.list({ is_active:true, limit:500 }).then(r=>r.data?.data||[]) });

  const reject = useMutation({ mutationFn:id=>hrTravelAPI.reject(id,{}), onSuccess:()=>{ toast.success('Rejected'); qc.invalidateQueries({queryKey:['hr-travel']}); }, onError:e=>toast.error(e?.response?.data?.error||'Reject failed') });

  const refresh = () => qc.invalidateQueries({queryKey:['hr-travel']});

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#f5f6fa]">
      <PageHeader title="Travel Requests" subtitle="Submit, approve and settle employee travel"
        breadcrumbs={[{label:'HR & Admin'},{label:'Travel'}]}
        actions={<button onClick={()=>setShowForm(true)} className="h-9 px-4 rounded-xl bg-blue-600 text-white text-xs font-semibold flex items-center gap-2"><Plus size={14}/> New Request</button>}
      />
      <div className="flex-1 overflow-auto p-5">
        <div className="flex gap-2 mb-4 flex-wrap">
          {['','pending','approved','settled','rejected'].map(s=>(
            <button key={s} onClick={()=>setFilterStatus(s)}
              className={clsx('h-8 px-3 rounded-lg text-xs font-medium capitalize', filterStatus===s?'bg-blue-600 text-white':'bg-white border border-slate-200 text-slate-600')}>
              {s||'All'}
            </button>
          ))}
        </div>
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden max-w-6xl">
          <table className="w-full text-xs">
            <thead className="bg-slate-50"><tr>
              {['Employee','Purpose','Dates','Route','Mode','Advance Req','Advance App','Actual','Status','Actions'].map(h=>(
                <th key={h} className="px-3 py-3 text-left font-semibold text-slate-500 whitespace-nowrap">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {list.map(t=>{
                const color = STATUS_C[t.status]||'slate';
                return (
                  <tr key={t.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-3 font-medium">{t.full_name}</td>
                    <td className="px-3 py-3 max-w-xs truncate text-slate-600">{t.purpose}</td>
                    <td className="px-3 py-3 whitespace-nowrap">{dayjs(t.from_date).format('DD-MM')}&nbsp;–&nbsp;{dayjs(t.to_date).format('DD-MM-YY')}</td>
                    <td className="px-3 py-3">{t.from_city&&t.to_city?`${t.from_city} → ${t.to_city}`:'—'}</td>
                    <td className="px-3 py-3 capitalize">{t.mode?.replace(/_/g,' ')}</td>
                    <td className="px-3 py-3">₹{parseFloat(t.advance_requested||0).toLocaleString('en-IN')}</td>
                    <td className="px-3 py-3 text-blue-700">₹{parseFloat(t.advance_approved||0).toLocaleString('en-IN')}</td>
                    <td className="px-3 py-3">{t.actual_expense?`₹${parseFloat(t.actual_expense).toLocaleString('en-IN')}`:'—'}</td>
                    <td className="px-3 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold bg-${color}-100 text-${color}-700 capitalize`}>{t.status?.replace(/_/g,' ')}</span>
                    </td>
                    <td className="px-3 py-3">
                      {t.status==='pending' && (
                        <div className="flex gap-1">
                          <button onClick={()=>setApproveItem(t)} className="w-6 h-6 rounded hover:bg-green-100 flex items-center justify-center">
                            <CheckCircle2 size={12} className="text-green-600"/>
                          </button>
                          <button onClick={()=>reject.mutate(t.id)} className="w-6 h-6 rounded hover:bg-red-100 flex items-center justify-center">
                            <XCircle size={12} className="text-red-500"/>
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {list.length===0 && <tr><td colSpan={10} className="py-12 text-center text-slate-400">No travel requests</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      {showForm && <TravelForm onClose={()=>setShowForm(false)} onSaved={refresh} employees={employees} />}
      {approveItem && <ApproveModal travel={approveItem} onClose={()=>setApproveItem(null)} onSaved={refresh} />}
    </div>
  );
}
