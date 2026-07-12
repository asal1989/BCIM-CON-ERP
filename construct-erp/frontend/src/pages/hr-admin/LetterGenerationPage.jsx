// LetterGenerationPage.jsx — HR Letter Templates & Generation
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X, Pencil, FileText, Printer, Eye } from 'lucide-react';
import { clsx } from 'clsx';
import dayjs from 'dayjs';
import toast from 'react-hot-toast';
import DOMPurify from 'dompurify';
import { hrLettersAPI } from '../../api/client';
import { PageHeader } from '../../theme';
import { FIELD_HL } from '../../constants/fieldStyles';

const INP = `w-full h-9 rounded-lg px-3 text-xs font-medium outline-none transition-all border ${FIELD_HL}`;
const TABS = ['Templates','Generated Letters'];
const LETTER_TYPES = ['offer','appointment','increment','relieving','experience','warning','show_cause','noc','probation_confirmation'];

function TemplateEditor({ tmpl, onClose, onSaved }) {
  const isEdit = !!tmpl;
  const [f, setF] = useState(tmpl || { type:'offer', name:'', subject:'', body_html:'' });
  const set = (k,v) => setF(p=>({...p,[k]:v}));
  const mut = useMutation({
    mutationFn: d => isEdit ? hrLettersAPI.updateTmpl(tmpl.id, d) : hrLettersAPI.createTmpl(d),
    onSuccess: () => { toast.success(isEdit?'Template updated':'Template created'); onSaved(); onClose(); },
    onError: e => toast.error(e?.response?.data?.error||'Failed'),
  });
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="text-sm font-semibold">{isEdit?'Edit Template':'New Template'}</h3>
          <button onClick={onClose}><X size={16}/></button>
        </div>
        <div className="overflow-y-auto flex-1 p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-[11px] text-slate-500 mb-1">Type</label>
              <select value={f.type} onChange={e=>set('type',e.target.value)} disabled={isEdit} className={INP}>
                {LETTER_TYPES.map(t=><option key={t} value={t} className="capitalize">{t.replace(/_/g,' ')}</option>)}
              </select>
            </div>
            <div><label className="block text-[11px] text-slate-500 mb-1">Template Name *</label>
              <input value={f.name} onChange={e=>set('name',e.target.value)} className={INP} /></div>
          </div>
          <div><label className="block text-[11px] text-slate-500 mb-1">Subject</label>
            <input value={f.subject||''} onChange={e=>set('subject',e.target.value)} placeholder="Use {{full_name}}, {{designation}} etc." className={INP} /></div>
          <div>
            <label className="block text-[11px] text-slate-500 mb-1">Body (HTML supported)</label>
            <div className="text-[10px] text-slate-400 mb-1">Variables: {'{{full_name}} {{designation}} {{department}} {{employee_id}} {{date_of_joining}} {{company_name}} {{basic_salary}} {{last_working_day}}'}</div>
            <textarea value={f.body_html} onChange={e=>set('body_html',e.target.value)} rows={12}
              className={`w-full rounded-lg px-3 py-2 text-xs font-mono outline-none transition-all border ${FIELD_HL} resize-y`} />
          </div>
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

function GenerateModal({ templates=[], employees=[], onClose, onSaved }) {
  const [f, setF] = useState({ employee_id:'', template_id:'', generated_on:dayjs().format('YYYY-MM-DD'), extra_data:{} });
  const [extraKey, setExtraKey] = useState('');
  const [extraVal, setExtraVal] = useState('');
  const set = (k,v) => setF(p=>({...p,[k]:v}));

  const mut = useMutation({
    mutationFn: d => hrLettersAPI.generate(d),
    onSuccess: (r) => { toast.success('Letter generated'); onSaved(r.data?.data); onClose(); },
    onError: e => toast.error(e?.response?.data?.error||'Failed'),
  });

  const addExtra = () => {
    if (!extraKey.trim()) return;
    setF(p=>({...p, extra_data:{...p.extra_data,[extraKey]:extraVal}}));
    setExtraKey(''); setExtraVal('');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="text-sm font-semibold">Generate Letter</h3>
          <button onClick={onClose}><X size={16}/></button>
        </div>
        <div className="p-5 space-y-3">
          <div><label className="block text-[11px] text-slate-500 mb-1">Employee *</label>
            <select value={f.employee_id} onChange={e=>set('employee_id',e.target.value)} className={INP}>
              <option value="">Select employee…</option>
              {employees.map(e=><option key={e.id} value={e.id}>{e.full_name} ({e.employee_id})</option>)}
            </select>
          </div>
          <div><label className="block text-[11px] text-slate-500 mb-1">Template *</label>
            <select value={f.template_id} onChange={e=>set('template_id',e.target.value)} className={INP}>
              <option value="">Select template…</option>
              {templates.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div><label className="block text-[11px] text-slate-500 mb-1">Letter Date</label>
            <input type="date" value={f.generated_on} onChange={e=>set('generated_on',e.target.value)} className={INP} /></div>
          {/* Extra variables */}
          <div>
            <label className="block text-[11px] text-slate-500 mb-1">Extra Variables (for this letter)</label>
            <div className="flex gap-2 mb-2">
              <input value={extraKey} onChange={e=>setExtraKey(e.target.value)} placeholder="variable name" className={`flex-1 ${INP}`} />
              <input value={extraVal} onChange={e=>setExtraVal(e.target.value)} placeholder="value" className={`flex-1 ${INP}`} />
              <button onClick={addExtra} className="h-9 px-3 rounded-lg bg-slate-100 text-xs font-medium">Add</button>
            </div>
            {Object.entries(f.extra_data).map(([k,v])=>(
              <div key={k} className="flex items-center gap-2 text-[11px] text-slate-600 mb-1">
                <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded">{k}</span>: {v}
                <button onClick={()=>{const d={...f.extra_data};delete d[k];setF(p=>({...p,extra_data:d}));}} className="text-red-400">×</button>
              </div>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t">
          <button onClick={onClose} className="h-9 px-4 rounded-xl border text-xs">Cancel</button>
          <button onClick={()=>mut.mutate(f)} disabled={mut.isPending||!f.employee_id||!f.template_id} className="h-9 px-5 rounded-xl bg-blue-600 text-white text-xs font-semibold disabled:opacity-50">
            {mut.isPending?'Generating…':'Generate'}
          </button>
        </div>
      </div>
    </div>
  );
}

function LetterPrintView({ letter, onClose }) {
  const print = () => {
    const win = window.open('','_blank','width=900,height=700');
    win.document.write(`<!DOCTYPE html><html><head><title>${letter.subject||'Letter'}</title>
      <style>body{font-family:'Times New Roman',serif;padding:20mm 25mm;color:#000;font-size:12pt;line-height:1.6}p{margin:0 0 12pt}</style>
      </head><body>${DOMPurify.sanitize(letter.content_html)}</body></html>`);
    win.document.close();
    setTimeout(()=>win.print(),300);
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <div className="text-sm font-semibold">{letter.full_name} — {letter.letter_type?.replace(/_/g,' ')}</div>
            <div className="text-[11px] text-slate-500">{letter.reference_no} · {dayjs(letter.generated_on).format('DD-MM-YYYY')}</div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={print} className="h-8 px-3 rounded-lg bg-blue-600 text-white text-xs flex items-center gap-1.5">
              <Printer size={13}/> Print
            </button>
            <button onClick={onClose}><X size={16}/></button>
          </div>
        </div>
        <div className="overflow-y-auto flex-1 p-8" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(letter.content_html) }} />
      </div>
    </div>
  );
}

export default function LetterGenerationPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState('Templates');
  const [showTmplForm, setShowTmplForm] = useState(false);
  const [editTmpl, setEditTmpl] = useState(null);
  const [showGenerate, setShowGenerate] = useState(false);
  const [viewLetter, setViewLetter] = useState(null);

  const { data: templates=[] } = useQuery({ queryKey:['hr-letter-templates'], queryFn:()=>hrLettersAPI.templates().then(r=>r.data?.data||[]) });
  const { data: generated=[] }  = useQuery({ queryKey:['hr-letters-gen'], queryFn:()=>hrLettersAPI.generated().then(r=>r.data?.data||[]) });

  const refresh = () => { qc.invalidateQueries({queryKey:['hr-letter-templates']}); qc.invalidateQueries({queryKey:['hr-letters-gen']}); };

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#f5f6fa]">
      <PageHeader title="Letter Generation" subtitle="Offer · Appointment · Increment · Relieving · Experience · Warning"
        breadcrumbs={[{label:'HR & Admin'},{label:'Letters'}]}
        actions={
          <div className="flex gap-2">
            {tab==='Templates' && <button onClick={()=>{setEditTmpl(null);setShowTmplForm(true);}} className="h-9 px-4 rounded-xl bg-slate-700 text-white text-xs font-semibold flex items-center gap-2"><Plus size={14}/> New Template</button>}
            <button onClick={()=>setShowGenerate(true)} className="h-9 px-4 rounded-xl bg-blue-600 text-white text-xs font-semibold flex items-center gap-2"><FileText size={14}/> Generate Letter</button>
          </div>
        }
      />

      <div className="flex gap-1 px-5 pt-3 bg-white border-b flex-shrink-0">
        {TABS.map(t=>(
          <button key={t} onClick={()=>setTab(t)}
            className={clsx('px-4 py-2 text-xs font-medium rounded-t-lg border-b-2 -mb-px',
              tab===t?'border-blue-600 text-blue-700':'border-transparent text-slate-500')}>
            {t}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-5">
        {tab==='Templates' && (
          <div className="grid grid-cols-2 gap-3 max-w-4xl">
            {templates.map(t=>(
              <div key={t.id} className="bg-white rounded-xl border border-slate-200 px-4 py-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-semibold text-sm text-slate-800">{t.name}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5 capitalize">{t.type.replace(/_/g,' ')} {t.is_default && '· Default'}</div>
                  </div>
                  <button onClick={()=>{setEditTmpl(t);setShowTmplForm(true);}} className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center">
                    <Pencil size={13} className="text-slate-500"/>
                  </button>
                </div>
                {t.subject && <div className="text-[11px] text-slate-500 mt-2 truncate">{t.subject}</div>}
              </div>
            ))}
          </div>
        )}

        {tab==='Generated Letters' && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden max-w-5xl">
            <table className="w-full text-xs">
              <thead className="bg-slate-50"><tr>
                {['Ref No','Employee','Type','Subject','Date','Actions'].map(h=>(
                  <th key={h} className="px-4 py-3 text-left font-semibold text-slate-500">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {generated.map(l=>(
                  <tr key={l.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-[11px]">{l.reference_no}</td>
                    <td className="px-4 py-3 font-medium">{l.full_name}</td>
                    <td className="px-4 py-3 capitalize">{l.letter_type?.replace(/_/g,' ')}</td>
                    <td className="px-4 py-3 text-slate-500 max-w-xs truncate">{l.subject||'—'}</td>
                    <td className="px-4 py-3">{dayjs(l.generated_on).format('DD-MM-YYYY')}</td>
                    <td className="px-4 py-3">
                      <button onClick={()=>setViewLetter(l)} className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center">
                        <Eye size={13} className="text-blue-500"/>
                      </button>
                    </td>
                  </tr>
                ))}
                {generated.length===0 && <tr><td colSpan={6} className="py-12 text-center text-slate-400">No letters generated yet</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showTmplForm && <TemplateEditor tmpl={editTmpl} onClose={()=>{setShowTmplForm(false);setEditTmpl(null);}} onSaved={refresh} />}
      {showGenerate && <GenerateModal templates={templates} onClose={()=>setShowGenerate(false)} onSaved={(l)=>{refresh();setViewLetter(l);}} />}
      {viewLetter && <LetterPrintView letter={viewLetter} onClose={()=>setViewLetter(null)} />}
    </div>
  );
}
