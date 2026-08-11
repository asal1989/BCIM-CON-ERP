// Document Control Registry — Drawings · Submittals · Transmittals
import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import {
  FolderSearch, Plus, X, Layers, FileText, History,
  ShieldCheck, Clock, User, Download, Eye, Send,
  CheckCircle2, AlertTriangle, Package, RefreshCw,
} from 'lucide-react';
import { qualityAPI, projectAPI, dmsAPI } from '../../api/client';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import { clsx } from 'clsx';

// ── Submittal View Modal ────────────────────────────────────────────
function SubmittalViewModal({ submittal: s, onClose }) {
  const att = Array.isArray(s.attachments) ? s.attachments : [];
  const firstDoc = att[0];
  const dmsId = firstDoc?.dms_id;
  const ext = (firstDoc?.name || '').split('.').pop().toLowerCase();
  const isPDF   = ext === 'pdf';
  const isDocx  = ['docx','doc'].includes(ext);
  const isImage = ['png','jpg','jpeg','webp'].includes(ext);
  const needsBlob = isPDF || isImage;

  const [blobUrl, setBlobUrl]   = useState('');
  const [loading, setLoading]   = useState(isDocx); // PDF uses direct URL (no loading needed), docx needs fetch
  const [fetchErr, setFetchErr] = useState('');

  // For PDF: use direct URL with JWT token — more reliable than blob in iframe
  const token = sessionStorage.getItem('accessToken');
  const pdfDirectUrl = isPDF && dmsId ? `/api/v1/dms/${dmsId}/file?token=${token}` : '';

  useEffect(() => {
    if (!dmsId) return;
    if (isDocx) {
      // DOCX: fetch rendered HTML from server
      setLoading(true); setFetchErr('');
      let url = '';
      fetch(`/api/v1/dms/${dmsId}/docx-preview`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(r => r.blob())
        .then(blob => { url = URL.createObjectURL(blob); setBlobUrl(url); })
        .catch(() => setFetchErr('Unable to load Word preview.'))
        .finally(() => setLoading(false));
      return () => { if (url) URL.revokeObjectURL(url); };
    }
  }, [dmsId, isDocx]);

  const handleDownload = async () => {
    if (!dmsId) { toast.error('No file attached'); return; }
    try {
      const res = await dmsAPI.fileBlob(dmsId);
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url; a.download = firstDoc?.name || 'document';
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch { toast.error('Download failed'); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white w-full max-w-5xl rounded-2xl shadow-2xl overflow-hidden my-8" onClick={e => e.stopPropagation()}
        style={{ boxShadow:'0 25px 50px -12px rgba(0,0,0,0.4)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-indigo-700 to-indigo-600">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-indigo-200 text-xs font-mono">{s.submittal_number}</span>
              <span className={clsx('text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border', STATUS_BADGE[s.status]||'bg-slate-100 text-slate-600 border-slate-200')}>{s.status}</span>
            </div>
            <h2 className="font-semibold text-white text-base mt-0.5 truncate">{s.title}</h2>
          </div>
          <div className="flex items-center gap-2 ml-4 flex-shrink-0">
            {dmsId && (
              <button onClick={handleDownload}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white text-xs rounded-lg transition-colors">
                <Download className="w-3.5 h-3.5" /> Download
              </button>
            )}
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/25 text-white/80">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row">
          {/* Left: Details */}
          <div className="lg:w-64 flex-shrink-0 border-b lg:border-b-0 lg:border-r bg-slate-50 p-5">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Submittal Details</h3>
            <div className="space-y-3">
              {[
                ['Sub Number',    s.submittal_number],
                ['Category',      s.category],
                ['Material',      s.material_name],
                ['Vendor',        s.vendor_name],
                ['Status',        s.status?.charAt(0).toUpperCase()+s.status?.slice(1)],
                ['Submitted',     s.submitted_at ? dayjs(s.submitted_at).format('DD MMM YYYY') : '—'],
                ['Review Date',   s.review_date   ? dayjs(s.review_date).format('DD MMM YYYY')   : '—'],
                ['Remarks',       s.remarks],
              ].filter(([,v])=>v).map(([label, value])=>(
                <div key={label}>
                  <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">{label}</p>
                  <p className="text-sm text-slate-700 font-medium mt-0.5">{value}</p>
                </div>
              ))}
            </div>
            {firstDoc && (
              <div className="mt-4 pt-4 border-t border-slate-200">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Attached File</h3>
                <div className="flex items-center gap-2 p-2.5 bg-white rounded-xl border border-slate-200">
                  <FileText className="w-5 h-5 text-red-500 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-700 truncate">{firstDoc.name}</p>
                    <p className="text-[10px] text-slate-400 uppercase">{ext} file</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right: Preview */}
          <div className="flex-1 p-5 min-h-[60vh]">
            {!dmsId ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-400 py-16">
                <FileText className="w-12 h-12 mb-3 opacity-30" />
                <p className="font-medium">No file attached to this submittal</p>
                <p className="text-xs mt-1">You can attach files when editing the submittal</p>
              </div>
            ) : loading ? (
              <div className="flex items-center justify-center h-full text-slate-400 py-16">
                <RefreshCw className="w-6 h-6 animate-spin mr-2" /> Loading preview…
              </div>
            ) : fetchErr ? (
              <div className="flex flex-col items-center justify-center h-full py-16">
                <FileText className="w-12 h-12 text-slate-300 mb-3" />
                <p className="text-slate-500 mb-4">{fetchErr}</p>
                <button onClick={handleDownload}
                  className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-medium text-sm">
                  <Download className="w-4 h-4" /> Download File
                </button>
              </div>
            ) : isPDF && pdfDirectUrl ? (
              /* PDF: use direct URL with token — most reliable approach */
              <iframe
                key={pdfDirectUrl}
                src={pdfDirectUrl}
                className="w-full rounded-xl border border-slate-200"
                style={{ minHeight: '70vh', height: '70vh' }}
                title={s.title}
              />
            ) : isDocx && blobUrl ? (
              /* DOCX rendered as HTML */
              <iframe
                src={blobUrl}
                className="w-full rounded-xl border border-slate-200"
                style={{ minHeight: '70vh', height: '70vh' }}
                title={s.title}
              />
            ) : isImage && blobUrl ? (
              <div className="flex justify-center items-start">
                <img src={blobUrl} alt={s.title} className="max-h-[70vh] object-contain rounded-xl border border-slate-200" />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full py-16">
                <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                  <FileText className="w-8 h-8 text-slate-400" />
                </div>
                <h3 className="font-semibold text-slate-700 mb-2">{firstDoc?.name}</h3>
                <p className="text-sm text-slate-400 mb-5">
                  {['xlsx','xls'].includes(ext) ? 'Open in Microsoft Excel to view' : 'Download to view this file'}
                </p>
                <button onClick={handleDownload}
                  className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-medium">
                  <Download className="w-4 h-4" /> Download {ext.toUpperCase()}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const STATUS_BADGE = {
  IFC:           'bg-emerald-50 text-emerald-700 border-emerald-200',
  IFA:           'bg-amber-50 text-amber-700 border-amber-200',
  Superseded:    'bg-red-50 text-red-700 border-red-200',
  approved:      'bg-emerald-50 text-emerald-700 border-emerald-200',
  pending:       'bg-amber-50 text-amber-700 border-amber-200',
  rejected:      'bg-red-50 text-red-700 border-red-200',
  sent:          'bg-blue-50 text-blue-700 border-blue-200',
  acknowledged:  'bg-emerald-50 text-emerald-700 border-emerald-200',
  overdue:       'bg-red-50 text-red-700 border-red-200',
  draft:         'bg-slate-100 text-slate-600 border-slate-200',
};

function StatusBadge({ status }) {
  const cls = STATUS_BADGE[status] ?? 'bg-slate-100 text-slate-600 border-slate-200';
  return <span className={`text-[10px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full border ${cls}`}>{status?.replace('_',' ') || '—'}</span>;
}

const PURPOSE_COLORS = {
  approval:    'bg-orange-100 text-orange-700',
  review:      'bg-yellow-100 text-yellow-700',
  information: 'bg-blue-100 text-blue-700',
  action:      'bg-red-100 text-red-700',
  record:      'bg-slate-100 text-slate-600',
  comment:     'bg-purple-100 text-purple-700',
};

export default function DocumentControlPage() {
  const [activeTab, setActiveTab] = useState('submittals');
  const [showForm, setShowForm]   = useState(false);
  const [ackModal, setAckModal]     = useState(null);
  const [viewSub, setViewSub]       = useState(null);  // submittal being viewed
  const [projectId, setProjectId]   = useState('');
  const qc = useQueryClient();
  const { register, handleSubmit, reset, watch } = useForm();

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectAPI.list().then(r => r.data?.data ?? []).catch(() => []),
  });
  const { data: drawings = [],    isLoading: ldg } = useQuery({ queryKey:['quality-drawings',projectId],    queryFn: () => qualityAPI.listDrawings(projectId?{project_id:projectId}:undefined).then(r=>r.data?.data??[]).catch(()=>[]) });
  const { data: submittals = [],  isLoading: lsub } = useQuery({ queryKey:['quality-submittals',projectId],  queryFn: () => qualityAPI.listSubmittals(projectId?{project_id:projectId}:undefined).then(r=>r.data?.data??[]).catch(()=>[]) });
  const { data: transmittals = [],isLoading: ltr } = useQuery({ queryKey:['quality-transmittals',projectId],queryFn: () => qualityAPI.listTransmittals(projectId?{project_id:projectId}:undefined).then(r=>r.data?.data??[]).catch(()=>[]) });

  const createDrawingMut = useMutation({
    mutationFn: d => qualityAPI.createDrawing(d),
    onSuccess: () => { toast.success('Drawing registered'); reset(); setShowForm(false); qc.invalidateQueries({queryKey:['quality-drawings']}); },
    onError: e => toast.error(e?.response?.data?.error||'Failed'),
  });
  const createSubmittalMut = useMutation({
    mutationFn: d => qualityAPI.createSubmittal(d),
    onSuccess: () => { toast.success('Submittal registered'); reset(); setShowForm(false); qc.invalidateQueries({queryKey:['quality-submittals']}); },
    onError: e => toast.error(e?.response?.data?.error||'Failed'),
  });
  const createTransmittalMut = useMutation({
    mutationFn: d => qualityAPI.createTransmittal(d),
    onSuccess: () => { toast.success('Transmittal sent'); reset(); setShowForm(false); qc.invalidateQueries({queryKey:['quality-transmittals']}); },
    onError: e => toast.error(e?.response?.data?.error||'Failed'),
  });
  const ackMut = useMutation({
    mutationFn: ({ id, data }) => qualityAPI.acknowledgeTransmittal(id, data),
    onSuccess: () => { toast.success('Acknowledged'); setAckModal(null); qc.invalidateQueries({queryKey:['quality-transmittals']}); },
    onError: e => toast.error(e?.response?.data?.error||'Failed'),
  });

  const tabs = [
    { id:'submittals',   label:'Material Submittals', icon:ShieldCheck, count: submittals.length },
    { id:'transmittals', label:'Transmittals',         icon:Send,         count: transmittals.length },
    { id:'drawings',     label:'Drawing Register',     icon:Layers,       count: drawings.length },
  ];

  const onSubmit = (data) => {
    const pId = data.project_id || projectId;
    if (!pId) { toast.error('Select a project first'); return; }
    if (activeTab==='drawings')     createDrawingMut.mutate({ ...data, project_id: pId });
    if (activeTab==='submittals')   createSubmittalMut.mutate({ ...data, project_id: pId });
    if (activeTab==='transmittals') createTransmittalMut.mutate({ ...data, project_id: pId });
  };

  return (
    <div className="bg-[#f4f6f9] min-h-full p-6 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center">
            <FolderSearch className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-black">Document Control Registry</h1>
            <p className="text-xs text-slate-500">Submittals · Transmittals · Drawing Register</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select value={projectId} onChange={e=>setProjectId(e.target.value)}
            className="border border-slate-200 bg-white rounded-lg px-3 py-2 text-sm outline-none w-56">
            <option value="">All Projects</option>
            {projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button onClick={()=>setShowForm(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg px-4 py-2 flex items-center gap-2">
            <Plus className="w-4 h-4" />
            New {activeTab==='drawings'?'Drawing':activeTab==='submittals'?'Submittal':'Transmittal'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-[#f8f9fc] p-1 rounded-xl flex gap-1 w-fit border border-[#e2e6ec] flex-wrap">
        {tabs.map(t=>(
          <button key={t.id} onClick={()=>setActiveTab(t.id)}
            className={clsx('flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
              activeTab===t.id ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900')}>
            <t.icon className="w-4 h-4" />
            {t.label}
            <span className={clsx('text-xs px-1.5 py-0.5 rounded-full font-bold',
              activeTab===t.id ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-200 text-slate-500')}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* ── SUBMITTALS ── */}
      {activeTab==='submittals' && (
        <div className="bg-white rounded-xl border border-[#e2e6ec] overflow-hidden">
          <div className="bg-[#f8f9fc] border-b border-[#e2e6ec] px-5 py-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700">Material Approval Submittals (MAS)</span>
            <span className="text-xs text-slate-400">{submittals.length} submittals</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#f8f9fc] border-b border-slate-100">
                <tr>{['Sub#','Title / Material','Category','Vendor','Status','Submitted','Review Date','Action'].map(h=>(
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {lsub && <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">Loading…</td></tr>}
                {!lsub && submittals.length===0 && (
                  <tr><td colSpan={8} className="px-4 py-10 text-center">
                    <Package className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm text-slate-400">No submittals yet</p>
                    <button onClick={()=>setShowForm(true)} className="mt-2 text-xs text-indigo-600 hover:underline">Register first submittal →</button>
                  </td></tr>
                )}
                {submittals.map(s=>(
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs font-bold text-indigo-600">{s.submittal_number||'—'}</td>
                    <td className="px-4 py-3 max-w-[200px]">
                      <div className="font-medium text-black truncate">{s.title||s.description||'—'}</div>
                      {s.material_name && <div className="text-xs text-slate-400 truncate">{s.material_name}</div>}
                    </td>
                    <td className="px-4 py-3"><span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{s.category||'General'}</span></td>
                    <td className="px-4 py-3 text-xs text-slate-500">{s.vendor_name||'—'}</td>
                    <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                    <td className="px-4 py-3 text-xs text-slate-500">{s.submitted_at?dayjs(s.submitted_at).format('DD MMM YYYY'):'—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{s.review_date?dayjs(s.review_date).format('DD MMM YYYY'):'—'}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => setViewSub(s)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white transition-colors"
                        title="View / Preview document">
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TRANSMITTALS ── */}
      {activeTab==='transmittals' && (
        <div className="bg-white rounded-xl border border-[#e2e6ec] overflow-hidden">
          <div className="bg-[#f8f9fc] border-b border-[#e2e6ec] px-5 py-3 flex items-center justify-between">
            <div>
              <span className="text-sm font-semibold text-slate-700">Document Transmittals</span>
              <p className="text-xs text-slate-400 mt-0.5">Formal document submission records to client/consultant</p>
            </div>
            <span className="text-xs text-slate-400">{transmittals.length} transmittals</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#f8f9fc] border-b border-slate-100">
                <tr>{['TRS#','Date','To','Subject','Purpose','Delivery','Docs','Status','Action'].map(h=>(
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {ltr && <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-400">Loading…</td></tr>}
                {!ltr && transmittals.length===0 && (
                  <tr><td colSpan={9} className="px-4 py-10 text-center">
                    <Send className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm text-slate-400">No transmittals sent yet</p>
                    <button onClick={()=>setShowForm(true)} className="mt-2 text-xs text-indigo-600 hover:underline">Create first transmittal →</button>
                  </td></tr>
                )}
                {transmittals.map(t=>(
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs font-bold text-indigo-600">{t.transmittal_no}</td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap">{dayjs(t.transmittal_date).format('DD MMM YYYY')}</td>
                    <td className="px-4 py-3 max-w-[140px]">
                      <div className="font-medium text-black truncate text-xs">{t.to_party}</div>
                      {t.to_contact && <div className="text-[10px] text-slate-400">{t.to_contact}</div>}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-700 max-w-[180px] truncate">{t.subject}</td>
                    <td className="px-4 py-3">
                      <span className={clsx('text-[10px] px-2 py-0.5 rounded-full font-semibold capitalize', PURPOSE_COLORS[t.purpose]||'bg-slate-100 text-slate-600')}>
                        {t.purpose}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs capitalize text-slate-500">{t.delivery_method}</td>
                    <td className="px-4 py-3 text-xs text-center">
                      <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold inline-flex items-center justify-center">
                        {Array.isArray(t.documents)?t.documents.length:0}
                      </span>
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={t.status} /></td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        {t.status==='sent' && (
                          <button onClick={()=>setAckModal(t)} title="Mark Acknowledged"
                            className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white border border-emerald-200 transition-colors">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-indigo-600 transition-colors">
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── DRAWINGS ── */}
      {activeTab==='drawings' && (
        <div className="bg-white rounded-xl border border-[#e2e6ec] overflow-hidden">
          <div className="bg-[#f8f9fc] border-b border-[#e2e6ec] px-5 py-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700">Drawing Register — Good For Construction (GFC)</span>
            <span className="text-xs text-slate-400">{drawings.length} drawings</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#f8f9fc] border-b border-slate-100">
                <tr>{['Drawing No.','Title','Discipline','Revision','Status','Project','Revision Date',''].map(h=>(
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {ldg && <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">Loading…</td></tr>}
                {!ldg && drawings.length===0 && (
                  <tr><td colSpan={8} className="px-4 py-10 text-center">
                    <Layers className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm text-slate-400">No drawings registered yet</p>
                  </td></tr>
                )}
                {drawings.map(d=>(
                  <tr key={d.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3"><span className="font-mono text-xs font-bold text-slate-700">{d.drawing_number}</span></td>
                    <td className="px-4 py-3 text-sm text-black max-w-[200px] truncate">{d.title||'—'}</td>
                    <td className="px-4 py-3"><span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{d.discipline||'—'}</span></td>
                    <td className="px-4 py-3"><span className="font-mono text-xs font-bold text-indigo-600">Rev {d.revision??'0'}</span></td>
                    <td className="px-4 py-3"><StatusBadge status={d.status} /></td>
                    <td className="px-4 py-3 text-xs text-slate-500">{d.project_name||'—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{d.revision_date?dayjs(d.revision_date).format('DD MMM YYYY'):'—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:text-indigo-600 hover:border-indigo-300 transition-colors"><History className="w-3.5 h-3.5" /></button>
                        <button className="w-7 h-7 flex items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white transition-colors"><Eye className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── FORM MODAL ── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-8 overflow-hidden">
            <div className="px-6 py-4 bg-indigo-600 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {activeTab==='drawings'?<Layers className="w-5 h-5 text-white" />:activeTab==='submittals'?<ShieldCheck className="w-5 h-5 text-white" />:<Send className="w-5 h-5 text-white" />}
                <span className="text-base font-semibold text-white">
                  {activeTab==='drawings'?'Register Drawing':activeTab==='submittals'?'New Material Submittal':'New Transmittal'}
                </span>
              </div>
              <button onClick={()=>{setShowForm(false);reset();}} className="text-indigo-200 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit(onSubmit)} className="p-6 grid grid-cols-2 gap-4 overflow-y-auto max-h-[70vh]">

              {/* Common: Project */}
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Project *</label>
                <select {...register('project_id')} defaultValue={projectId}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-300">
                  <option value="">Select project…</option>
                  {projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              {/* DRAWING FIELDS */}
              {activeTab==='drawings' && (<>
                <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Drawing Number *</label>
                  <input {...register('drawing_number',{required:true})} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-300" placeholder="DWG-ARCH-001" /></div>
                <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Title *</label>
                  <input {...register('title',{required:true})} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-300" /></div>
                <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Discipline</label>
                  <select {...register('discipline')} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none">
                    {['Civil','Structural','Architecture','MEP','Waterproofing','Landscape','General'].map(d=><option key={d}>{d}</option>)}</select></div>
                <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Revision</label>
                  <input {...register('revision')} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none" placeholder="0 / A / R1" defaultValue="0" /></div>
                <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Status</label>
                  <select {...register('status')} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none">
                    {['ifc','IFA','Superseded'].map(s=><option key={s} value={s}>{s}</option>)}</select></div>
              </>)}

              {/* SUBMITTAL FIELDS */}
              {activeTab==='submittals' && (<>
                <div className="col-span-2"><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Title *</label>
                  <input {...register('title',{required:true})} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-300" placeholder="e.g. Submittal for Waterproofing Materials" /></div>
                <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Material Name</label>
                  <input {...register('material_name')} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none" /></div>
                <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Vendor / Manufacturer</label>
                  <input {...register('vendor_name')} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none" /></div>
                <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Category</label>
                  <select {...register('category')} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none">
                    {['Material Approval','Third Party Approval','Vendor Prequalification','Method Statement','Shop Drawing','Sample','Rate Schedule','General'].map(c=><option key={c}>{c}</option>)}</select></div>
                <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Submission Date</label>
                  <input type="date" {...register('submitted_at')} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none" /></div>
                <div className="col-span-2"><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Remarks</label>
                  <textarea {...register('remarks')} rows={2} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none resize-none" /></div>
              </>)}

              {/* TRANSMITTAL FIELDS */}
              {activeTab==='transmittals' && (<>
                <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Date *</label>
                  <input type="date" {...register('transmittal_date',{required:true})} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none" defaultValue={new Date().toISOString().slice(0,10)} /></div>
                <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">To (Company/Consultant) *</label>
                  <input {...register('to_party',{required:true})} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none" placeholder="Client / Consultant name" /></div>
                <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Contact Person</label>
                  <input {...register('to_contact')} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none" /></div>
                <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Email</label>
                  <input type="email" {...register('to_email')} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none" /></div>
                <div className="col-span-2"><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Subject *</label>
                  <input {...register('subject',{required:true})} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none" placeholder="e.g. Transmittal of Method Statement — Waterproofing Works" /></div>
                <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Purpose</label>
                  <select {...register('purpose')} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none">
                    {['information','approval','review','record','action','comment'].map(p=><option key={p} value={p}>{p.charAt(0).toUpperCase()+p.slice(1)}</option>)}</select></div>
                <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Delivery Method</label>
                  <select {...register('delivery_method')} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none">
                    {['email','courier','hand','registered_post','portal'].map(d=><option key={d} value={d}>{d.replace('_',' ').replace(/\b\w/g,c=>c.toUpperCase())}</option>)}</select></div>
                <div className="col-span-2"><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Remarks / Notes</label>
                  <textarea {...register('remarks')} rows={2} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none resize-none" /></div>
              </>)}

              <div className="col-span-2 flex justify-end gap-3 pt-2">
                <button type="button" onClick={()=>{setShowForm(false);reset();}} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
                <button type="submit" className="px-6 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700">
                  {activeTab==='drawings'?'Register Drawing':activeTab==='submittals'?'Submit':'Send Transmittal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Submittal View Modal */}
      {viewSub && <SubmittalViewModal submittal={viewSub} onClose={() => setViewSub(null)} />}

      {/* Acknowledge Modal */}
      {ackModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h2 className="font-semibold text-black mb-1">Acknowledge Transmittal</h2>
            <p className="text-xs text-slate-500 mb-4">{ackModal.transmittal_no} — {ackModal.subject}</p>
            <div className="space-y-3">
              <div><label className="block text-xs font-medium text-slate-500 mb-1">Acknowledged By</label>
                <input id="ack_by" className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Name of person who acknowledged" /></div>
              <div><label className="block text-xs font-medium text-slate-500 mb-1">Acknowledgment Date</label>
                <input id="ack_date" type="date" className="w-full border rounded-lg px-3 py-2 text-sm" defaultValue={new Date().toISOString().slice(0,10)} /></div>
              <div><label className="block text-xs font-medium text-slate-500 mb-1">Remarks</label>
                <textarea id="ack_remarks" rows={2} className="w-full border rounded-lg px-3 py-2 text-sm resize-none" /></div>
            </div>
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={()=>setAckModal(null)} className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
              <button onClick={()=>ackMut.mutate({id:ackModal.id, data:{
                ack_by: document.getElementById('ack_by').value,
                ack_date: document.getElementById('ack_date').value,
                ack_remarks: document.getElementById('ack_remarks').value,
              }})} className="px-5 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700">
                <CheckCircle2 className="w-4 h-4 inline mr-1.5" />Mark Acknowledged
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
