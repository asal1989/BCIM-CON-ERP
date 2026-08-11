// Full Tender Management — Dashboard + Register + EMD + Costing
import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Search, AlertTriangle, CheckCircle2, TrendingUp, IndianRupee,
  FileText, Clock, X, Edit2, ChevronRight, Filter, Download,
  Target, Activity, Briefcase, Award,
} from 'lucide-react';
import { tenderMgmtAPI } from '../../api/client';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import dayjs from 'dayjs';

const STATUS_CFG = {
  new:              { label: 'New',             color: 'bg-slate-100 text-slate-700 border-slate-200' },
  under_review:     { label: 'Under Review',    color: 'bg-blue-50 text-blue-700 border-blue-200' },
  bid_preparation:  { label: 'Bid Preparation', color: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  approval_pending: { label: 'Pending Approval',color: 'bg-orange-50 text-orange-700 border-orange-200' },
  submitted:        { label: 'Submitted',       color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  won:              { label: 'Won ✓',           color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  lost:             { label: 'Lost',            color: 'bg-red-50 text-red-700 border-red-200' },
  cancelled:        { label: 'Cancelled',       color: 'bg-slate-100 text-slate-500 border-slate-200' },
};

const CATEGORIES = ['civil','electrical','mechanical','hvac','plumbing','interior','landscaping','mixed','other'];
const SOURCES     = ['direct','cppp','gem','e_tender','newspaper','reference','other'];
const CLIENT_TYPES= ['government','psu','private','semi_govt','international'];

const fmtC = v => v ? `₹${Number(v).toLocaleString('en-IN',{maximumFractionDigits:0})}` : '—';

function TenderFormModal({ tender, onClose }) {
  const qc = useQueryClient();
  const isEdit = !!tender;
  const [form, setForm] = useState(tender || {
    tender_number:'', title:'', description:'', scope_of_work:'',
    tender_type:'works', tender_category:'civil', tender_source:'direct',
    client_name:'', client_contact:'', client_email:'', client_type:'private',
    location:'', estimated_value:'', submission_deadline:'', bid_open_date:'',
    submission_mode:'online', emd_required:false, emd_amount:'',
    go_no_go_status:'pending', remarks:''
  });
  const set = (k,v) => setForm(f => ({ ...f, [k]:v }));

  const mut = useMutation({
    mutationFn: d => isEdit ? tenderMgmtAPI.update(tender.id, d) : tenderMgmtAPI.create(d),
    onSuccess: () => { toast.success(isEdit ? 'Tender updated' : 'Tender registered'); qc.invalidateQueries({ queryKey:['tenders-mgmt'] }); onClose(); },
    onError: e => toast.error(e?.response?.data?.error || 'Failed'),
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl my-8">
        <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white rounded-t-xl">
          <h2 className="font-semibold text-gray-800 text-lg">{isEdit ? 'Edit Tender' : 'Register New Tender'}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400 hover:text-gray-600" /></button>
        </div>
        <div className="p-6 grid grid-cols-2 gap-4">
          {/* Identification */}
          <div className="col-span-2 pt-1 pb-2 border-b">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Tender Identification</span>
          </div>
          <div><label className="block text-xs font-medium text-gray-600 mb-1">Tender Number *</label>
            <input value={form.tender_number} onChange={e=>set('tender_number',e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="TND-2026-001" /></div>
          <div><label className="block text-xs font-medium text-gray-600 mb-1">Tender Title *</label>
            <input value={form.title} onChange={e=>set('title',e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
          <div><label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
            <select value={form.tender_category} onChange={e=>set('tender_category',e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
              {CATEGORIES.map(c=><option key={c} value={c}>{c.charAt(0).toUpperCase()+c.slice(1)}</option>)}</select></div>
          <div><label className="block text-xs font-medium text-gray-600 mb-1">Source</label>
            <select value={form.tender_source} onChange={e=>set('tender_source',e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
              {SOURCES.map(s=><option key={s} value={s}>{s.toUpperCase()}</option>)}</select></div>
          <div className="col-span-2"><label className="block text-xs font-medium text-gray-600 mb-1">Scope of Work</label>
            <textarea value={form.scope_of_work||''} onChange={e=>set('scope_of_work',e.target.value)} rows={2} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>

          {/* Client */}
          <div className="col-span-2 pt-3 pb-2 border-b">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Client Details</span>
          </div>
          <div><label className="block text-xs font-medium text-gray-600 mb-1">Client Name</label>
            <input value={form.client_name||''} onChange={e=>set('client_name',e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
          <div><label className="block text-xs font-medium text-gray-600 mb-1">Client Type</label>
            <select value={form.client_type||'private'} onChange={e=>set('client_type',e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
              {CLIENT_TYPES.map(t=><option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}</select></div>
          <div><label className="block text-xs font-medium text-gray-600 mb-1">Client Contact</label>
            <input value={form.client_contact||''} onChange={e=>set('client_contact',e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
          <div><label className="block text-xs font-medium text-gray-600 mb-1">Location</label>
            <input value={form.location||''} onChange={e=>set('location',e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>

          {/* Financial */}
          <div className="col-span-2 pt-3 pb-2 border-b">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Value & Dates</span>
          </div>
          <div><label className="block text-xs font-medium text-gray-600 mb-1">Estimated Value (₹)</label>
            <input type="number" value={form.estimated_value||''} onChange={e=>set('estimated_value',e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
          <div><label className="block text-xs font-medium text-gray-600 mb-1">Submission Deadline</label>
            <input type="datetime-local" value={form.submission_deadline||''} onChange={e=>set('submission_deadline',e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
          <div><label className="block text-xs font-medium text-gray-600 mb-1">Bid Opening Date</label>
            <input type="datetime-local" value={form.bid_open_date||''} onChange={e=>set('bid_open_date',e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
          <div><label className="block text-xs font-medium text-gray-600 mb-1">Submission Mode</label>
            <select value={form.submission_mode||'online'} onChange={e=>set('submission_mode',e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="online">Online</option><option value="offline">Offline</option><option value="both">Both</option></select></div>

          {/* EMD */}
          <div className="col-span-2 pt-3 pb-2 border-b">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">EMD Details</span>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-700">EMD Required?</label>
            <input type="checkbox" checked={form.emd_required||false} onChange={e=>set('emd_required',e.target.checked)} className="w-4 h-4" />
          </div>
          {form.emd_required && (
            <div><label className="block text-xs font-medium text-gray-600 mb-1">EMD Amount (₹)</label>
              <input type="number" value={form.emd_amount||''} onChange={e=>set('emd_amount',e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
          )}

          {/* Go/No-Go */}
          <div><label className="block text-xs font-medium text-gray-600 mb-1">Go / No-Go Decision</label>
            <select value={form.go_no_go_status||'pending'} onChange={e=>set('go_no_go_status',e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="pending">Pending</option><option value="go">Go ✓</option><option value="no_go">No Go ✗</option></select></div>
          <div className="col-span-2"><label className="block text-xs font-medium text-gray-600 mb-1">Remarks</label>
            <textarea value={form.remarks||''} onChange={e=>set('remarks',e.target.value)} rows={2} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t bg-gray-50 rounded-b-xl">
          <button onClick={onClose} className="px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-100">Cancel</button>
          <button onClick={() => mut.mutate(form)} disabled={!form.tender_number || !form.title || mut.isPending}
            className="px-5 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50">
            {isEdit ? 'Update Tender' : 'Register Tender'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TenderManagementPage() {
  const qc = useQueryClient();
  const [tab, setTab]         = useState('register');  // register | dashboard
  const [search, setSearch]   = useState('');
  const [statusFilter, setStatus] = useState('');
  const [modal, setModal]     = useState(null);

  const { data: tenders = [], isLoading } = useQuery({
    queryKey: ['tenders-mgmt', statusFilter],
    queryFn: () => tenderMgmtAPI.list({ status: statusFilter||undefined }).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
  });

  const { data: dash } = useQuery({
    queryKey: ['tender-mgmt-dash'],
    queryFn: () => tenderMgmtAPI.dashboard().then(r => r.data?.data ?? r.data ?? []).catch(() => []),
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status }) => tenderMgmtAPI.updateStatus(id, { status }),
    onSuccess: () => { toast.success('Status updated'); qc.invalidateQueries({ queryKey:['tenders-mgmt'] }); },
    onError: e => toast.error(e?.response?.data?.error || 'Failed'),
  });

  const filtered = useMemo(() => tenders.filter(t => {
    if (!search) return true;
    return [t.tender_number, t.title, t.client_name, t.location]
      .some(v => v?.toLowerCase().includes(search.toLowerCase()));
  }), [tenders, search]);

  const s = dash?.summary;

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto min-h-screen bg-[#f4f6f9]">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Tender Management</h1>
          <p className="text-sm text-slate-500 mt-0.5">End-to-end tender lifecycle from identification to award</p>
        </div>
        <button onClick={() => setModal('new')}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 shadow-sm">
          <Plus className="w-4 h-4" /> Register Tender
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white/70 border border-slate-200 p-1 rounded-xl w-fit mb-5">
        {[['register','Tender Register'],['dashboard','Dashboard & Analytics']].map(([k,l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={clsx('px-4 py-1.5 rounded-lg text-sm font-medium transition-colors',
              tab===k ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900')}>
            {l}
          </button>
        ))}
      </div>

      {tab === 'dashboard' && dash && (
        <div className="space-y-5">
          {/* KPI Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
            {[
              { label:'Active',       value: s?.active||0,        color:'text-indigo-600', bg:'bg-indigo-50' },
              { label:'Submitted',    value: s?.submitted||0,     color:'text-blue-600',   bg:'bg-blue-50' },
              { label:'Won',          value: s?.won||0,           color:'text-emerald-600',bg:'bg-emerald-50' },
              { label:'Lost',         value: s?.lost||0,          color:'text-red-600',    bg:'bg-red-50' },
              { label:'Win Rate',     value: `${s?.win_rate||0}%`,color:'text-purple-600', bg:'bg-purple-50' },
              { label:'Revenue Won',  value: fmtC(s?.revenue_won),color:'text-emerald-700',bg:'bg-emerald-50' },
              { label:'Pipeline',     value: fmtC(s?.pipeline_value),color:'text-blue-700',bg:'bg-blue-50' },
            ].map(c => (
              <div key={c.label} className={`border rounded-xl p-4 ${c.bg}`}>
                <div className={`text-2xl font-bold ${c.color}`}>{c.value}</div>
                <div className="text-xs text-slate-500 mt-0.5">{c.label}</div>
              </div>
            ))}
          </div>

          {/* Expiring EMDs */}
          {dash.expiring_emd?.length > 0 && (
            <div className="bg-white border border-orange-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-orange-700 mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> EMD / BG Expiring in 30 Days ({dash.expiring_emd.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {dash.expiring_emd.map(e => (
                  <div key={e.id} className="p-3 bg-orange-50 rounded-lg border border-orange-200 text-xs">
                    <div className="font-medium text-orange-800">{e.tender_number} — {e.tender_title}</div>
                    <div className="text-orange-600 mt-1">{e.instrument_type?.toUpperCase()}: ₹{Number(e.amount).toLocaleString()}</div>
                    <div className="text-orange-500">Expires: {e.expiry_date}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Wins */}
          {dash.recent_wins?.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-black mb-3 flex items-center gap-2">
                <Award className="w-4 h-4 text-emerald-500" /> Recent Wins
              </h3>
              <div className="space-y-2">
                {dash.recent_wins.map(w => (
                  <div key={w.id} className="flex items-center justify-between p-3 bg-emerald-50 rounded-lg text-xs">
                    <div>
                      <span className="font-medium text-black">{w.title}</span>
                      <span className="text-slate-400 ml-2">{w.client_name}</span>
                    </div>
                    <div className="text-emerald-700 font-bold">{fmtC(w.awarded_amount)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'register' && (
        <>
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input value={search} onChange={e=>setSearch(e.target.value)}
                className="pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-sm w-full shadow-sm"
                placeholder="Search tenders…" />
            </div>
            <div className="flex gap-1 flex-wrap">
              {[['','All'], ...Object.entries(STATUS_CFG).map(([k,v])=>[k,v.label])].map(([val,lbl]) => (
                <button key={val} onClick={() => setStatus(val)}
                  className={clsx('px-3 py-2 rounded-lg text-xs font-medium border transition-all whitespace-nowrap',
                    statusFilter===val ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200')}>
                  {lbl}
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          {isLoading ? <div className="text-center py-12 text-slate-400">Loading…</div> : (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      {['#','Tender','Client','Category','Source','Value','Deadline','EMD','Status','Go/No-Go','Actions'].map(h => (
                        <th key={h} className="text-left py-3 px-3 text-xs font-medium text-slate-500 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((t, i) => {
                      const cfg = STATUS_CFG[t.status] || STATUS_CFG.new;
                      const daysLeft = t.submission_deadline ? dayjs(t.submission_deadline).diff(dayjs(),'day') : null;
                      const isUrgent = daysLeft !== null && daysLeft <= 7 && daysLeft >= 0;
                      const isOverdue = daysLeft !== null && daysLeft < 0;
                      return (
                        <tr key={t.id} className="border-b last:border-0 hover:bg-slate-50 group">
                          <td className="py-2 px-3 text-slate-400 text-xs">{i+1}</td>
                          <td className="py-2 px-3">
                            <div className="font-mono text-xs text-indigo-600">{t.tender_number}</div>
                            <div className="text-xs font-medium text-black max-w-[180px] truncate">{t.title}</div>
                            {t.location && <div className="text-[10px] text-slate-400">{t.location}</div>}
                          </td>
                          <td className="py-2 px-3 text-xs">
                            <div>{t.client_name || '—'}</div>
                            {t.client_type && <div className="text-[10px] text-slate-400 capitalize">{t.client_type}</div>}
                          </td>
                          <td className="py-2 px-3 text-xs capitalize">{t.tender_category}</td>
                          <td className="py-2 px-3 text-xs uppercase">{t.tender_source}</td>
                          <td className="py-2 px-3 text-xs">{fmtC(t.estimated_value)}</td>
                          <td className="py-2 px-3 text-xs">
                            {t.submission_deadline && (
                              <div className={clsx('font-medium', isOverdue ? 'text-red-600' : isUrgent ? 'text-orange-500' : 'text-slate-600')}>
                                {dayjs(t.submission_deadline).format('DD/MM/YY')}
                                {daysLeft !== null && (
                                  <div className={clsx('text-[10px]', isOverdue ? 'text-red-500' : isUrgent ? 'text-orange-400' : 'text-slate-400')}>
                                    {isOverdue ? `${Math.abs(daysLeft)}d overdue` : `${daysLeft}d left`}
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="py-2 px-3 text-xs">
                            {t.emd_required ? (
                              <div>
                                <div>{fmtC(t.emd_amount)}</div>
                                {t.active_emd_count > 0 && <div className="text-[10px] text-emerald-600">Submitted</div>}
                              </div>
                            ) : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="py-2 px-3">
                            <select value={t.status}
                              onChange={e => statusMut.mutate({ id:t.id, status:e.target.value })}
                              className={clsx('text-xs px-2 py-1 rounded-md border font-medium cursor-pointer', cfg.color)}>
                              {Object.entries(STATUS_CFG).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                            </select>
                          </td>
                          <td className="py-2 px-3">
                            <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium',
                              t.go_no_go_status==='go' ? 'bg-emerald-100 text-emerald-700' :
                              t.go_no_go_status==='no_go' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500')}>
                              {t.go_no_go_status === 'go' ? 'GO ✓' : t.go_no_go_status === 'no_go' ? 'NO GO ✗' : 'Pending'}
                            </span>
                          </td>
                          <td className="py-2 px-3">
                            <button onClick={() => setModal(t)}
                              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded opacity-0 group-hover:opacity-100">
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {filtered.length === 0 && (
                      <tr><td colSpan={11} className="text-center py-10 text-slate-400">
                        <Briefcase className="w-8 h-8 mx-auto mb-2 opacity-30" />No tenders found
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {modal && (
        <TenderFormModal tender={modal === 'new' ? null : modal} onClose={() => setModal(null)} />
      )}
    </div>
  );
}
