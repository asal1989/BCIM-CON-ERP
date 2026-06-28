// TrainingPage.jsx — Training Programs & Attendance
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X, Users, BookOpen, CheckCircle2 } from 'lucide-react';
import { clsx } from 'clsx';
import dayjs from 'dayjs';
import toast from 'react-hot-toast';
import { hrTrainingAPI } from '../../api/client';
import { PageHeader } from '../../theme';
import { FIELD_HL } from '../../constants/fieldStyles';

const INP = `w-full h-9 rounded-lg px-3 text-xs font-medium outline-none transition-all border ${FIELD_HL}`;
const STATUS_C = { planned:'blue', ongoing:'yellow', completed:'green', cancelled:'red' };

function ProgramForm({ prog, onClose, onSaved }) {
  const isEdit = !!prog;
  const [f, setF] = useState(prog || { title:'', type:'internal', trainer_name:'', trainer_org:'', venue:'', start_date:'', end_date:'', total_hours:'', cost_per_head:0, max_participants:'', target_department:'', description:'', status:'planned' });
  const set = (k,v) => setF(p=>({...p,[k]:v}));
  const mut = useMutation({
    mutationFn: d => isEdit ? hrTrainingAPI.update(prog.id, d) : hrTrainingAPI.create(d),
    onSuccess: () => { toast.success(isEdit?'Updated':'Created'); onSaved(); onClose(); },
    onError: e => toast.error(e?.response?.data?.error||'Failed'),
  });
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="text-sm font-semibold">{isEdit?'Edit Program':'New Training Program'}</h3>
          <button onClick={onClose}><X size={16}/></button>
        </div>
        <div className="overflow-y-auto flex-1 p-5 space-y-3">
          <div><label className="block text-[11px] text-slate-500 mb-1">Title *</label>
            <input value={f.title} onChange={e=>set('title',e.target.value)} className={INP} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-[11px] text-slate-500 mb-1">Type</label>
              <select value={f.type} onChange={e=>set('type',e.target.value)} className={INP}>
                {['internal','external','online','on_the_job'].map(t=><option key={t} value={t} className="capitalize">{t.replace(/_/g,' ')}</option>)}
              </select>
            </div>
            <div><label className="block text-[11px] text-slate-500 mb-1">Status</label>
              <select value={f.status} onChange={e=>set('status',e.target.value)} className={INP}>
                {['planned','ongoing','completed','cancelled'].map(s=><option key={s} value={s} className="capitalize">{s}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-[11px] text-slate-500 mb-1">Trainer Name</label>
              <input value={f.trainer_name||''} onChange={e=>set('trainer_name',e.target.value)} className={INP} /></div>
            <div><label className="block text-[11px] text-slate-500 mb-1">Trainer Organization</label>
              <input value={f.trainer_org||''} onChange={e=>set('trainer_org',e.target.value)} className={INP} /></div>
          </div>
          <div><label className="block text-[11px] text-slate-500 mb-1">Venue</label>
            <input value={f.venue||''} onChange={e=>set('venue',e.target.value)} className={INP} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-[11px] text-slate-500 mb-1">Start Date *</label>
              <input type="date" value={f.start_date} onChange={e=>set('start_date',e.target.value)} className={INP} /></div>
            <div><label className="block text-[11px] text-slate-500 mb-1">End Date *</label>
              <input type="date" value={f.end_date} onChange={e=>set('end_date',e.target.value)} className={INP} /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="block text-[11px] text-slate-500 mb-1">Total Hours</label>
              <input type="number" value={f.total_hours||''} onChange={e=>set('total_hours',e.target.value)} className={INP} /></div>
            <div><label className="block text-[11px] text-slate-500 mb-1">Cost/Head (₹)</label>
              <input type="number" value={f.cost_per_head} onChange={e=>set('cost_per_head',e.target.value)} className={INP} /></div>
            <div><label className="block text-[11px] text-slate-500 mb-1">Max Participants</label>
              <input type="number" value={f.max_participants||''} onChange={e=>set('max_participants',e.target.value)} className={INP} /></div>
          </div>
          <div><label className="block text-[11px] text-slate-500 mb-1">Target Department</label>
            <input value={f.target_department||''} onChange={e=>set('target_department',e.target.value)} placeholder="All / Safety / Operations…" className={INP} /></div>
          <div><label className="block text-[11px] text-slate-500 mb-1">Description</label>
            <textarea value={f.description||''} onChange={e=>set('description',e.target.value)} rows={3} className={`w-full rounded-lg px-3 py-2 text-xs outline-none transition-all border ${FIELD_HL} resize-none`} /></div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t">
          <button onClick={onClose} className="h-9 px-4 rounded-xl border text-xs">Cancel</button>
          <button onClick={()=>mut.mutate(f)} disabled={mut.isPending} className="h-9 px-5 rounded-xl bg-blue-600 text-white text-xs font-semibold disabled:opacity-50">
            {mut.isPending?'Saving…':isEdit?'Update':'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProgramDetail({ progId, onClose }) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey:['hr-training',progId], queryFn:()=>hrTrainingAPI.get(progId).then(r=>r.data?.data) });
  const updateP = useMutation({
    mutationFn: ({pid,d})=>hrTrainingAPI.updateParticipant(progId,pid,d),
    onSuccess:()=>qc.invalidateQueries({queryKey:['hr-training',progId]}),
    onError:e=>toast.error(e?.response?.data?.error||'Update failed'),
  });
  if (!data) return null;
  const participants = data.participants||[];
  const attended = participants.filter(p=>p.attended).length;
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <div className="text-sm font-semibold">{data.title}</div>
            <div className="text-[11px] text-slate-500">{dayjs(data.start_date).format('DD-MM-YYYY')} – {dayjs(data.end_date).format('DD-MM-YYYY')} · {data.venue||'—'}</div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-slate-500">{attended}/{participants.length} attended</span>
            <button onClick={onClose}><X size={16}/></button>
          </div>
        </div>
        <div className="overflow-y-auto flex-1">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 sticky top-0"><tr>
              {['Employee','Department','Attended','Score','Certificate'].map(h=>(
                <th key={h} className="px-4 py-3 text-left font-semibold text-slate-500">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {participants.map(p=>(
                <tr key={p.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium">{p.full_name} <span className="text-slate-400">({p.emp_code})</span></td>
                  <td className="px-4 py-3 text-slate-500">{p.department||'—'}</td>
                  <td className="px-4 py-3">
                    <input type="checkbox" checked={p.attended} onChange={e=>updateP.mutate({pid:p.id,d:{attended:e.target.checked}})} className="w-4 h-4 rounded cursor-pointer" />
                  </td>
                  <td className="px-4 py-3">
                    <input type="number" defaultValue={p.score||''} onBlur={e=>updateP.mutate({pid:p.id,d:{score:e.target.value}})}
                      className="w-16 h-7 border border-slate-200 rounded px-2 text-xs text-center" placeholder="—" />
                  </td>
                  <td className="px-4 py-3">
                    <input type="checkbox" checked={p.certificate_issued} onChange={e=>updateP.mutate({pid:p.id,d:{certificate_issued:e.target.checked}})} className="w-4 h-4 rounded cursor-pointer" />
                  </td>
                </tr>
              ))}
              {participants.length===0 && <tr><td colSpan={5} className="py-8 text-center text-slate-400">No participants added</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function TrainingPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editProg, setEditProg] = useState(null);
  const [viewProg, setViewProg] = useState(null);

  const { data: programs=[] } = useQuery({ queryKey:['hr-training-list'], queryFn:()=>hrTrainingAPI.list().then(r=>r.data?.data||[]) });

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#f5f6fa]">
      <PageHeader title="Training Management" subtitle="Schedule and track employee training programs"
        breadcrumbs={[{label:'HR & Admin'},{label:'Training'}]}
        actions={<button onClick={()=>{setEditProg(null);setShowForm(true);}} className="h-9 px-4 rounded-xl bg-blue-600 text-white text-xs font-semibold flex items-center gap-2"><Plus size={14}/> New Program</button>}
      />
      <div className="flex-1 overflow-auto p-5">
        <div className="grid grid-cols-1 gap-3 max-w-5xl">
          {programs.map(p=>{
            const color = STATUS_C[p.status]||'slate';
            return (
              <div key={p.id} className="bg-white rounded-xl border border-slate-200 px-5 py-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center flex-shrink-0">
                    <BookOpen size={18} className="text-purple-600"/>
                  </div>
                  <div>
                    <div className="font-semibold text-sm text-slate-800">{p.title}</div>
                    <div className="text-[11px] text-slate-500">{dayjs(p.start_date).format('DD-MM-YYYY')} – {dayjs(p.end_date).format('DD-MM-YYYY')} · {p.trainer_name||'Internal'} {p.venue?`· ${p.venue}`:''}</div>
                    <div className="flex gap-3 mt-1 text-[10px] text-slate-400">
                      <span><Users size={10} className="inline mr-0.5"/>{p.participant_count||0} registered · {p.attended_count||0} attended</span>
                      {p.total_hours && <span>{p.total_hours}h</span>}
                      {p.cost_per_head>0 && <span>₹{parseFloat(p.cost_per_head).toLocaleString('en-IN')}/head</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold bg-${color}-100 text-${color}-700 capitalize`}>{p.status}</span>
                  <button onClick={()=>setViewProg(p.id)} className="h-7 px-2.5 rounded-lg bg-slate-100 text-[11px] font-medium text-slate-600 hover:bg-slate-200">
                    Attendance
                  </button>
                  <button onClick={()=>{setEditProg(p);setShowForm(true);}} className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center">
                    <BookOpen size={13} className="text-slate-500"/>
                  </button>
                </div>
              </div>
            );
          })}
          {programs.length===0 && <div className="text-center py-16 text-slate-400 text-sm">No training programs yet</div>}
        </div>
      </div>
      {showForm && <ProgramForm prog={editProg} onClose={()=>{setShowForm(false);setEditProg(null);}} onSaved={()=>qc.invalidateQueries({queryKey:['hr-training-list']})} />}
      {viewProg && <ProgramDetail progId={viewProg} onClose={()=>setViewProg(null)} />}
    </div>
  );
}
