// src/pages/documents/GFCMasterLogPage.jsx — GFC Drawing Master Log Tracker
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import {
  Layers, Plus, X, Search, RefreshCw, History, Pencil, Trash2,
  FileUp, CheckCircle2, PauseCircle, CircleSlash, FileStack, Download,
  Paperclip, Eye,
} from 'lucide-react';
import { clsx } from 'clsx';
import dayjs from 'dayjs';
import toast from 'react-hot-toast';
import { gfcAPI, projectAPI } from '../../api/client';

const DISCIPLINES = ['Architecture', 'Structural', 'Civil', 'MEP', 'Electrical', 'Plumbing', 'HVAC', 'Fire Fighting', 'Landscape', 'Interior', 'General'];

const STATUS_CONFIG = {
  current:    { label: 'Current',    cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  superseded: { label: 'Superseded', cls: 'bg-slate-100 text-slate-500 border-slate-200' },
  on_hold:    { label: 'On Hold',    cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  cancelled:  { label: 'Cancelled',  cls: 'bg-red-50 text-red-600 border-red-200' },
};

const fmt = d => (d ? dayjs(d).format('DD MMM YYYY') : '—');

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.current;
  return (
    <span className={clsx('inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border whitespace-nowrap', cfg.cls)}>
      {cfg.label}
    </span>
  );
}

/* ── Add / Edit Drawing Modal ─────────────────────────────────────────────── */
function DrawingModal({ initial, projects, onClose, onSave, isPending }) {
  const isEdit = Boolean(initial?.id);
  const [form, setForm] = useState({
    project_id:       initial?.project_id || '',
    drawing_number:   initial?.drawing_number || '',
    title:            initial?.title || '',
    discipline:       initial?.discipline || '',
    tower_block:      initial?.tower_block || '',
    floor_zone:       initial?.floor_zone || '',
    current_revision: initial?.current_revision || 'R0',
    gfc_date:         initial?.gfc_date ? dayjs(initial.gfc_date).format('YYYY-MM-DD') : '',
    received_date:    initial?.received_date ? dayjs(initial.received_date).format('YYYY-MM-DD') : '',
    issued_by:        initial?.issued_by || '',
    transmittal_ref:  initial?.transmittal_ref || '',
    copies_received:  initial?.copies_received ?? 1,
    soft_copy:        initial?.soft_copy ?? true,
    status:           initial?.status || 'current',
    remarks:          initial?.remarks || '',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = (e) => {
    e.preventDefault();
    if (!form.project_id)     return toast.error('Select a project');
    if (!form.drawing_number) return toast.error('Drawing number is required');
    if (!form.title)          return toast.error('Title is required');
    onSave(form);
  };

  const input = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400';
  const label = 'block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5';

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/40 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-8 overflow-hidden">
        <div className="px-6 py-4 bg-indigo-600 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Layers className="w-5 h-5 text-white" />
            <span className="text-base font-semibold text-white">{isEdit ? `Edit Drawing — ${initial.drawing_number}` : 'Register GFC Drawing'}</span>
          </div>
          <button onClick={onClose} className="text-indigo-200 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={submit} className="p-6 grid grid-cols-2 gap-4 overflow-y-auto max-h-[72vh]">
          <div className="col-span-2">
            <label className={label}>Project *</label>
            <select value={form.project_id} onChange={e => set('project_id', e.target.value)} disabled={isEdit} className={input}>
              <option value="">Select project…</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>Drawing Number *</label>
            <input value={form.drawing_number} onChange={e => set('drawing_number', e.target.value)} className={input} placeholder="GFC-ARCH-001" />
          </div>
          <div>
            <label className={label}>Discipline</label>
            <select value={form.discipline} onChange={e => set('discipline', e.target.value)} className={input}>
              <option value="">—</option>
              {DISCIPLINES.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className={label}>Drawing Title *</label>
            <input value={form.title} onChange={e => set('title', e.target.value)} className={input} placeholder="Typical Floor Plan — Tower A" />
          </div>
          <div>
            <label className={label}>Tower / Block</label>
            <input value={form.tower_block} onChange={e => set('tower_block', e.target.value)} className={input} />
          </div>
          <div>
            <label className={label}>Floor / Zone</label>
            <input value={form.floor_zone} onChange={e => set('floor_zone', e.target.value)} className={input} />
          </div>
          {!isEdit && (
            <div>
              <label className={label}>Revision</label>
              <input value={form.current_revision} onChange={e => set('current_revision', e.target.value)} className={input} placeholder="R0" />
            </div>
          )}
          <div>
            <label className={label}>GFC Issue Date</label>
            <input type="date" value={form.gfc_date} onChange={e => set('gfc_date', e.target.value)} className={input} />
          </div>
          <div>
            <label className={label}>Received On Site</label>
            <input type="date" value={form.received_date} onChange={e => set('received_date', e.target.value)} className={input} />
          </div>
          <div>
            <label className={label}>Issued By (Consultant)</label>
            <input value={form.issued_by} onChange={e => set('issued_by', e.target.value)} className={input} placeholder="Architect / Consultant name" />
          </div>
          <div>
            <label className={label}>Transmittal Ref.</label>
            <input value={form.transmittal_ref} onChange={e => set('transmittal_ref', e.target.value)} className={input} placeholder="TRN-001" />
          </div>
          <div>
            <label className={label}>Hard Copies Received</label>
            <input type="number" min="0" value={form.copies_received} onChange={e => set('copies_received', parseInt(e.target.value, 10) || 0)} className={input} />
          </div>
          <div className="flex items-end gap-4 pb-1">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={form.soft_copy} onChange={e => set('soft_copy', e.target.checked)} className="w-4 h-4 accent-indigo-600" />
              Soft Copy Received
            </label>
          </div>
          {isEdit && (
            <div>
              <label className={label}>Status</label>
              <select value={form.status} onChange={e => set('status', e.target.value)} className={input}>
                {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          )}
          <div className="col-span-2">
            <label className={label}>Remarks</label>
            <textarea value={form.remarks} onChange={e => set('remarks', e.target.value)} rows={2} className={input} />
          </div>
          <div className="col-span-2 flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={isPending}
              className="px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50">
              {isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Register Drawing'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── New Revision Modal ───────────────────────────────────────────────────── */
function RevisionModal({ drawing, onClose, onSave, isPending }) {
  const suggestNext = (rev) => {
    const m = String(rev || '').match(/^([A-Za-z]*)(\d+)$/);
    return m ? `${m[1]}${parseInt(m[2]) + 1}` : '';
  };
  const [form, setForm] = useState({
    revision: suggestNext(drawing.current_revision),
    gfc_date: dayjs().format('YYYY-MM-DD'),
    received_date: '',
    transmittal_ref: '',
    issued_by: drawing.issued_by || '',
    change_description: '',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const input = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400';
  const label = 'block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5';

  const submit = (e) => {
    e.preventDefault();
    if (!form.revision) return toast.error('Revision is required');
    onSave(form);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/40 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg my-8 overflow-hidden">
        <div className="px-6 py-4 bg-emerald-600 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileUp className="w-5 h-5 text-white" />
            <div>
              <p className="text-base font-semibold text-white leading-tight">New GFC Revision</p>
              <p className="text-xs text-emerald-100">{drawing.drawing_number} · currently {drawing.current_revision}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-emerald-100 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={submit} className="p-6 grid grid-cols-2 gap-4">
          <div>
            <label className={label}>New Revision *</label>
            <input value={form.revision} onChange={e => set('revision', e.target.value)} className={input} placeholder="R1" />
          </div>
          <div>
            <label className={label}>GFC Issue Date</label>
            <input type="date" value={form.gfc_date} onChange={e => set('gfc_date', e.target.value)} className={input} />
          </div>
          <div>
            <label className={label}>Received On Site</label>
            <input type="date" value={form.received_date} onChange={e => set('received_date', e.target.value)} className={input} />
          </div>
          <div>
            <label className={label}>Transmittal Ref.</label>
            <input value={form.transmittal_ref} onChange={e => set('transmittal_ref', e.target.value)} className={input} />
          </div>
          <div className="col-span-2">
            <label className={label}>Issued By</label>
            <input value={form.issued_by} onChange={e => set('issued_by', e.target.value)} className={input} />
          </div>
          <div className="col-span-2">
            <label className={label}>Change Description</label>
            <textarea value={form.change_description} onChange={e => set('change_description', e.target.value)} rows={2} className={input}
              placeholder="What changed in this revision?" />
          </div>
          <div className="col-span-2 flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={isPending}
              className="px-5 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50">
              {isPending ? 'Saving…' : 'Issue Revision'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Revision History Modal ───────────────────────────────────────────────── */
function HistoryModal({ drawing, onClose }) {
  const { data: revisions = [], isLoading } = useQuery({
    queryKey: ['gfc-revisions', drawing.id],
    queryFn: () => gfcAPI.revisions(drawing.id).then(r => r.data?.data ?? []),
  });

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/40 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-8 overflow-hidden">
        <div className="px-6 py-4 bg-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <History className="w-5 h-5 text-white" />
            <div>
              <p className="text-base font-semibold text-white leading-tight">Revision History</p>
              <p className="text-xs text-slate-300">{drawing.drawing_number} — {drawing.title}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-300 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-slate-400">Loading history…</div>
          ) : revisions.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">No revisions recorded.</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-100 sticky top-0">
                <tr>
                  {['Rev', 'GFC Date', 'Received', 'Transmittal', 'Issued By', 'Change Description', 'Logged By'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {revisions.map((rv, i) => (
                  <tr key={rv.id} className={i === 0 ? 'bg-emerald-50/40' : ''}>
                    <td className="px-4 py-3">
                      <span className={clsx('font-mono font-bold', i === 0 ? 'text-emerald-700' : 'text-slate-500')}>{rv.revision}</span>
                      {i === 0 && <span className="ml-1.5 text-[9px] font-bold text-emerald-600 uppercase">Latest</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{fmt(rv.gfc_date)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{fmt(rv.received_date)}</td>
                    <td className="px-4 py-3 font-mono">{rv.transmittal_ref || '—'}</td>
                    <td className="px-4 py-3">{rv.issued_by || '—'}</td>
                    <td className="px-4 py-3 max-w-[200px]">{rv.change_description || '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-400">{rv.created_by_name || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="px-6 py-3 border-t border-slate-100 flex justify-end">
          <button onClick={onClose} className="px-5 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800">Close</button>
        </div>
      </div>
    </div>
  );
}

/* ── CSV export helper ────────────────────────────────────────────────────── */
function exportCSV(rows, filename) {
  const headers = ['Drawing No.', 'Title', 'Discipline', 'Tower/Block', 'Floor/Zone', 'Revision', 'Status', 'GFC Date', 'Received', 'Transmittal Ref', 'Issued By', 'Copies', 'Soft Copy', 'Remarks'];
  const escape = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const lines = [
    headers.map(escape).join(','),
    ...rows.map(d => [
      d.drawing_number, d.title, d.discipline || '', d.tower_block || '', d.floor_zone || '',
      d.current_revision || d.revision || '', d.status || '',
      d.gfc_date ? dayjs(d.gfc_date).format('DD-MMM-YYYY') : '',
      d.received_date ? dayjs(d.received_date).format('DD-MMM-YYYY') : '',
      d.transmittal_ref || '', d.issued_by || '',
      d.copies_received ?? '', d.soft_copy ? 'Yes' : 'No', d.remarks || '',
    ].map(escape).join(',')),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

/* ── Main Page ────────────────────────────────────────────────────────────── */
export default function GFCMasterLogPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab]       = useState('register'); // 'register' | 'revlog' | 'superseded'
  const [search, setSearch]             = useState('');
  const [projectFilter, setProject]     = useState('');
  const [disciplineFilter, setDiscipline] = useState('');
  const [statusFilter, setStatus]       = useState('');
  const [modal, setModal]               = useState(null); // {type:'add'|'edit'|'revision'|'history', drawing}
  const [uploadTarget, setUploadTarget] = useState(null); // drawing id being uploaded to
  const fileInputRef                    = React.useRef();

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectAPI.list().then(r => r.data?.data ?? []),
  });

  const { data: drawings = [], isLoading } = useQuery({
    queryKey: ['gfc-drawings', projectFilter, disciplineFilter, statusFilter, search],
    queryFn: () => gfcAPI.list({
      project_id: projectFilter || undefined,
      discipline: disciplineFilter || undefined,
      status: statusFilter || undefined,
      search: search || undefined,
    }).then(r => r.data?.data ?? []),
    placeholderData: keepPreviousData,
  });

  const { data: stats } = useQuery({
    queryKey: ['gfc-stats', projectFilter],
    queryFn: () => gfcAPI.stats({ project_id: projectFilter || undefined }).then(r => r.data?.data ?? {}),
  });

  const { data: allRevisions = [], isLoading: revLogLoading } = useQuery({
    queryKey: ['gfc-all-revisions', projectFilter],
    queryFn: () => gfcAPI.allRevisions({ project_id: projectFilter || undefined }).then(r => r.data?.data ?? []),
    enabled: activeTab === 'revlog',
  });

  const { data: supersededDrawings = [], isLoading: supLoading } = useQuery({
    queryKey: ['gfc-superseded', projectFilter],
    queryFn: () => gfcAPI.superseded({ project_id: projectFilter || undefined }).then(r => r.data?.data ?? []),
    enabled: activeTab === 'superseded',
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['gfc-drawings'] });
    qc.invalidateQueries({ queryKey: ['gfc-stats'] });
    qc.invalidateQueries({ queryKey: ['gfc-all-revisions'] });
    qc.invalidateQueries({ queryKey: ['gfc-superseded'] });
  };

  const createMut = useMutation({
    mutationFn: d => gfcAPI.create(d),
    onSuccess: () => { toast.success('Drawing registered'); setModal(null); invalidate(); },
    onError: e => toast.error(e?.response?.data?.error || 'Failed to register drawing'),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, ...d }) => gfcAPI.update(id, d),
    onSuccess: () => { toast.success('Drawing updated'); setModal(null); invalidate(); },
    onError: e => toast.error(e?.response?.data?.error || 'Update failed'),
  });
  const revisionMut = useMutation({
    mutationFn: ({ id, ...d }) => gfcAPI.addRevision(id, d),
    onSuccess: () => { toast.success('New revision issued'); setModal(null); invalidate(); },
    onError: e => toast.error(e?.response?.data?.error || 'Failed to add revision'),
  });
  const deleteMut = useMutation({
    mutationFn: id => gfcAPI.remove(id),
    onSuccess: () => { toast.success('Drawing deleted'); invalidate(); },
    onError: e => toast.error(e?.response?.data?.error || 'Delete failed'),
  });
  const uploadMut = useMutation({
    mutationFn: ({ id, file }) => {
      const fd = new FormData();
      fd.append('file', file);
      return gfcAPI.uploadFile(id, fd);
    },
    onSuccess: () => { toast.success('File attached'); setUploadTarget(null); invalidate(); },
    onError: e => toast.error(e?.response?.data?.error || 'Upload failed'),
  });

  const openFile = async (id, fileName) => {
    try {
      const res = await gfcAPI.downloadFile(id);
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noreferrer';
      a.download = fileName || 'drawing';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch {
      toast.error('Could not open file');
    }
  };

  const kpis = [
    { label: 'Total Drawings', value: stats?.total ?? '—',      icon: FileStack,    cls: 'border-indigo-500',  iconBg: 'bg-indigo-50 text-indigo-600' },
    { label: 'Current GFC',    value: stats?.current ?? '—',    icon: CheckCircle2, cls: 'border-emerald-500', iconBg: 'bg-emerald-50 text-emerald-600' },
    { label: 'Superseded',     value: stats?.superseded ?? '—', icon: CircleSlash,  cls: 'border-slate-400',   iconBg: 'bg-slate-100 text-slate-500' },
    { label: 'On Hold',        value: stats?.on_hold ?? '—',    icon: PauseCircle,  cls: 'border-amber-500',   iconBg: 'bg-amber-50 text-amber-600' },
    { label: 'Disciplines',    value: stats?.disciplines ?? '—',icon: Layers,       cls: 'border-blue-500',    iconBg: 'bg-blue-50 text-blue-600' },
  ];

  return (
    <div className="p-6 md:p-8 max-w-[1500px] mx-auto min-h-screen bg-[#f4f6f9]">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">GFC Master Log</h1>
          <p className="text-sm text-slate-500 mt-0.5">Good For Construction drawing register · revisions · transmittals</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => exportCSV(drawings, `gfc-register-${dayjs().format('YYYY-MM-DD')}.csv`)}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50 shadow-sm">
            <Download className="w-4 h-4" /> Export CSV
          </button>
          <button onClick={() => setModal({ type: 'add' })}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 shadow-sm">
            <Plus className="w-4 h-4" /> Register Drawing
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-white border border-slate-200 rounded-xl p-1 shadow-sm w-fit">
        {[
          { key: 'register',   label: 'Drawing Register' },
          { key: 'revlog',     label: 'Revision Log' },
          { key: 'superseded', label: 'Superseded' },
        ].map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={clsx('px-4 py-1.5 rounded-lg text-sm font-medium transition-colors',
              activeTab === t.key
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50')}>
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'register' && (<>
      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-5">
        {kpis.map(({ label, value, icon: Icon, cls, iconBg }) => (
          <div key={label} className={clsx('bg-white border border-slate-200 rounded-xl p-4 shadow-sm border-l-4', cls)}>
            <div className={clsx('inline-flex items-center justify-center w-8 h-8 rounded-lg mb-2', iconBg)}>
              <Icon className="w-4 h-4" />
            </div>
            <div className="text-xl font-bold font-mono text-slate-800">{value}</div>
            <div className="text-xs text-slate-500 font-medium mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-center gap-3 shadow-sm mb-5 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search drawing no, title, transmittal…"
            className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-4 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
        </div>
        <select value={projectFilter} onChange={e => setProject(e.target.value)}
          className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400">
          <option value="">All Projects</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={disciplineFilter} onChange={e => setDiscipline(e.target.value)}
          className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400">
          <option value="">All Disciplines</option>
          {DISCIPLINES.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatus(e.target.value)}
          className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400">
          <option value="">All Status</option>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <button onClick={invalidate} className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg" title="Refresh">
          <RefreshCw className="w-4 h-4" />
        </button>
        <span className="text-xs text-slate-400 shrink-0">{drawings.length} drawings</span>
      </div>

      {/* Hidden file input for drawing attachment */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.dwg,.dxf,.jpg,.jpeg,.png,.tif,.tiff"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0];
          if (file && uploadTarget) uploadMut.mutate({ id: uploadTarget, file });
          e.target.value = '';
        }}
      />

      {/* Master log table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {['Drawing No.', 'Title', 'Discipline', 'Tower / Floor', 'Rev', 'GFC Date', 'Received', 'Transmittal', 'Issued By', 'Copies', 'Status', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    {[...Array(12)].map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-slate-100 rounded animate-pulse" /></td>
                    ))}
                  </tr>
                ))
              ) : drawings.map(d => (
                <tr key={d.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors group">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="text-xs font-bold font-mono text-indigo-700">{d.drawing_number}</span>
                  </td>
                  <td className="px-4 py-3 max-w-[220px]">
                    <p className="text-xs font-medium text-slate-800 truncate" title={d.title}>{d.title}</p>
                    {d.remarks && <p className="text-[10px] text-slate-400 truncate" title={d.remarks}>{d.remarks}</p>}
                    {d.file_name && (
                      <button onClick={() => openFile(d.id, d.file_name)}
                        className="inline-flex items-center gap-1 mt-1 text-[10px] text-indigo-600 hover:underline truncate max-w-full text-left"
                        title={d.file_name}>
                        <Paperclip className="w-3 h-3 shrink-0" />
                        <span className="truncate">{d.file_name}</span>
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {d.discipline ? <span className="text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{d.discipline}</span> : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-500">
                    {[d.tower_block, d.floor_zone].filter(Boolean).join(' · ') || '—'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <button onClick={() => setModal({ type: 'history', drawing: d })}
                      className="font-mono text-xs font-bold text-indigo-600 hover:underline"
                      title={`${d.revision_count} revision(s) — view history`}>
                      {d.current_revision}
                      {Number(d.revision_count) > 1 && <span className="ml-1 text-[9px] text-slate-400 font-normal">({d.revision_count})</span>}
                    </button>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-600">{fmt(d.gfc_date)}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-600">{fmt(d.received_date)}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs font-mono text-slate-600">{d.transmittal_ref || '—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-600 max-w-[140px] truncate">{d.issued_by || '—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-600">
                    {d.copies_received ?? 0}H{d.soft_copy ? ' + S' : ''}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap"><StatusBadge status={d.status} /></td>
                  <td className="px-4 py-3 whitespace-nowrap text-right">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => { setUploadTarget(d.id); fileInputRef.current?.click(); }}
                        title={d.file_name ? `Replace file (${d.file_name})` : 'Attach drawing file'}
                        disabled={uploadMut.isPending && uploadTarget === d.id}
                        className={clsx(
                          'p-1.5 rounded-lg border transition-colors',
                          d.file_url
                            ? 'border-indigo-300 bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white'
                            : 'border-slate-200 text-slate-400 hover:text-indigo-600 hover:border-indigo-300',
                        )}>
                        <Paperclip className="w-3.5 h-3.5" />
                      </button>
                      {d.file_url && (
                        <button onClick={() => openFile(d.id, d.file_name)}
                          title="View / download file"
                          className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-emerald-600 hover:border-emerald-300 transition-colors">
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button onClick={() => setModal({ type: 'revision', drawing: d })} title="Issue new revision"
                        className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-600 hover:text-white transition-colors">
                        <FileUp className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setModal({ type: 'history', drawing: d })} title="Revision history"
                        className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-indigo-600 hover:border-indigo-300 transition-colors">
                        <History className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setModal({ type: 'edit', drawing: d })} title="Edit"
                        className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-indigo-600 hover:border-indigo-300 transition-colors">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => { if (window.confirm(`Delete drawing ${d.drawing_number}? Revision history will also be removed.`)) deleteMut.mutate(d.id); }}
                        title="Delete"
                        className="p-1.5 rounded-lg border border-red-200 bg-red-50 text-red-500 hover:bg-red-600 hover:text-white transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {!isLoading && drawings.length === 0 && (
                <tr>
                  <td colSpan={12} className="py-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                        <Layers className="w-5 h-5 text-slate-300" />
                      </div>
                      <p className="text-sm font-medium text-slate-400">
                        {search || projectFilter || disciplineFilter || statusFilter ? 'No drawings match your filters' : 'No GFC drawings registered yet'}
                      </p>
                      {(search || projectFilter || disciplineFilter || statusFilter) ? (
                        <button onClick={() => { setSearch(''); setProject(''); setDiscipline(''); setStatus(''); }}
                          className="text-xs text-indigo-500 hover:underline font-semibold">Clear filters</button>
                      ) : (
                        <button onClick={() => setModal({ type: 'add' })}
                          className="flex items-center gap-1.5 text-xs text-indigo-600 hover:underline font-semibold">
                          <Plus className="w-3.5 h-3.5" /> Register your first GFC drawing
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      </>)}

      {/* ── Revision Log tab ───────────────────────────────────────────────── */}
      {activeTab === 'revlog' && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <span className="text-sm font-semibold text-slate-700">All Revision Events</span>
            <button onClick={() => exportCSV(allRevisions, `gfc-revisions-${dayjs().format('YYYY-MM-DD')}.csv`)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
              <Download className="w-3.5 h-3.5" /> Export CSV
            </button>
          </div>
          <div className="overflow-x-auto">
            {revLogLoading ? (
              <div className="py-16 text-center text-sm text-slate-400">Loading…</div>
            ) : allRevisions.length === 0 ? (
              <div className="py-16 text-center text-sm text-slate-400">No revision events recorded yet.</div>
            ) : (
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {['Drawing No.', 'Title', 'Discipline', 'New Rev', 'GFC Date', 'Received', 'Transmittal', 'Issued By', 'Change Description', 'Logged By', 'Date'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {allRevisions.map(rv => (
                    <tr key={rv.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono font-bold text-indigo-700 whitespace-nowrap">{rv.drawing_number}</td>
                      <td className="px-4 py-3 max-w-[200px] truncate text-slate-700" title={rv.title}>{rv.title}</td>
                      <td className="px-4 py-3 text-slate-500">{rv.discipline || '—'}</td>
                      <td className="px-4 py-3"><span className="font-mono font-bold text-emerald-700">{rv.revision}</span></td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-600">{fmt(rv.gfc_date)}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-600">{fmt(rv.received_date)}</td>
                      <td className="px-4 py-3 font-mono text-slate-600">{rv.transmittal_ref || '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{rv.issued_by || '—'}</td>
                      <td className="px-4 py-3 max-w-[200px] truncate text-slate-500" title={rv.change_description}>{rv.change_description || '—'}</td>
                      <td className="px-4 py-3 text-slate-400">{rv.created_by_name || '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-400">{fmt(rv.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── Superseded tab ─────────────────────────────────────────────────── */}
      {activeTab === 'superseded' && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <div>
              <span className="text-sm font-semibold text-slate-700">Superseded Drawings</span>
              <p className="text-xs text-slate-400 mt-0.5">For reference only — do not use for construction</p>
            </div>
            <button onClick={() => exportCSV(supersededDrawings, `gfc-superseded-${dayjs().format('YYYY-MM-DD')}.csv`)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
              <Download className="w-3.5 h-3.5" /> Export CSV
            </button>
          </div>
          <div className="overflow-x-auto">
            {supLoading ? (
              <div className="py-16 text-center text-sm text-slate-400">Loading…</div>
            ) : supersededDrawings.length === 0 ? (
              <div className="py-16 text-center text-sm text-slate-400">No superseded drawings.</div>
            ) : (
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {['Drawing No.', 'Title', 'Discipline', 'Tower/Floor', 'Rev', 'GFC Date', 'Transmittal', 'Issued By', 'Remarks'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {supersededDrawings.map(d => (
                    <tr key={d.id} className="opacity-70 hover:opacity-100">
                      <td className="px-4 py-3 font-mono font-bold text-slate-500 whitespace-nowrap">{d.drawing_number}</td>
                      <td className="px-4 py-3 max-w-[220px] truncate text-slate-600" title={d.title}>{d.title}</td>
                      <td className="px-4 py-3 text-slate-500">{d.discipline || '—'}</td>
                      <td className="px-4 py-3 text-slate-500">{[d.tower_block, d.floor_zone].filter(Boolean).join(' · ') || '—'}</td>
                      <td className="px-4 py-3"><span className="font-mono text-red-500 font-bold">{d.current_revision}</span></td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-500">{fmt(d.gfc_date)}</td>
                      <td className="px-4 py-3 font-mono text-slate-500">{d.transmittal_ref || '—'}</td>
                      <td className="px-4 py-3 text-slate-500">{d.issued_by || '—'}</td>
                      <td className="px-4 py-3 max-w-[180px] truncate text-slate-400" title={d.remarks}>{d.remarks || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      {modal?.type === 'add' && (
        <DrawingModal projects={projects} onClose={() => setModal(null)}
          onSave={d => createMut.mutate(d)} isPending={createMut.isPending} />
      )}
      {modal?.type === 'edit' && (
        <DrawingModal initial={modal.drawing} projects={projects} onClose={() => setModal(null)}
          onSave={d => updateMut.mutate({ id: modal.drawing.id, ...d })} isPending={updateMut.isPending} />
      )}
      {modal?.type === 'revision' && (
        <RevisionModal drawing={modal.drawing} onClose={() => setModal(null)}
          onSave={d => revisionMut.mutate({ id: modal.drawing.id, ...d })} isPending={revisionMut.isPending} />
      )}
      {modal?.type === 'history' && (
        <HistoryModal drawing={modal.drawing} onClose={() => setModal(null)} />
      )}
    </div>
  );
}
