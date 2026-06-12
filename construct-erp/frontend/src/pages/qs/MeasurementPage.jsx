// src/pages/qs/MeasurementPage.jsx
import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Ruler, Plus, X, CheckCircle2, XCircle, Search,
  Calculator, Clock, FileText, ArrowUpRight, ChevronDown,
  Download, RefreshCw, BookOpen, Pencil,
} from 'lucide-react';
import { clsx } from 'clsx';
import dayjs from 'dayjs';
import { measurementAPI, boqAPI, projectAPI, default as api } from '../../api/client';
import toast from 'react-hot-toast';
import DataToolbar from '../../components/common/DataToolbar';
import TableActions from '../../components/common/TableActions';

// ── helpers ──────────────────────────────────────────────────────────────────

const num = (v, d = 3) => parseFloat(v || 0).toFixed(d);

const STATUS_CONFIG = {
  draft:       { label: 'Draft',       bg: 'bg-slate-100',  text: 'text-slate-500',   border: 'border-slate-200'  },
  submitted:   { label: 'Pending QS',  bg: 'bg-amber-50',   text: 'text-amber-600',   border: 'border-amber-200'  },
  qs_approved: { label: 'Pending PM',  bg: 'bg-blue-50',    text: 'text-blue-600',    border: 'border-blue-200'   },
  pm_approved: { label: 'Approved',    bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200'},
  rejected:    { label: 'Rejected',    bg: 'bg-red-50',     text: 'text-red-500',     border: 'border-red-200'    },
};

const StatusBadge = ({ status }) => {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
  return (
    <span className={clsx(
      'inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-medium border',
      cfg.bg, cfg.text, cfg.border,
    )}>
      {cfg.label}
    </span>
  );
};

const TABS = [
  { key: 'all',        label: 'All'        },
  { key: 'submitted',  label: 'Pending QS' },
  { key: 'qs_approved',label: 'Pending PM' },
  { key: 'pm_approved',label: 'Approved'   },
  { key: 'rejected',   label: 'Rejected'   },
];

const TEMPLATE_MB = [
  { Sr_No: '1.1', Analytical_Description: 'Excavation for Foundation - Section A', Location: 'Block A - North Grid', Execution_Date: '2026-04-16', Nos: '1', Len: '10.00', Br: '5.00', Ht: '1.50', Ded: '0.00' },
  { Sr_No: '1.2', Analytical_Description: 'PCC Work for Raft',                     Location: 'Block B - Main Entry',  Execution_Date: '2026-04-17', Nos: '2', Len: '15.00', Br: '15.00', Ht: '0.15', Ded: '0.00' },
];

// ── component ─────────────────────────────────────────────────────────────────

export default function MeasurementPage() {
  const navigate = useNavigate();
  const [projectId,    setProjectId]    = useState('');
  const [showForm,     setShowForm]     = useState(false);
  const [editEntry,    setEditEntry]    = useState(null); // null = add mode, row = edit mode
  const [activeTab,    setActiveTab]    = useState('all');
  const [search,       setSearch]       = useState('');
  const [selected,     setSelected]     = useState(null);
  const [rejectRemark, setRejectRemark] = useState('');
  const [showReject,   setShowReject]   = useState(false);

  const [form, setForm] = useState({
    boq_item_id: '', mb_number: '',
    entry_date:  dayjs().format('YYYY-MM-DD'),
    description: '', location: '', drawing_ref: '', remarks: '',
    nos: 1, length: '', breadth: '', height: '', deduction: 0,
  });

  const qc = useQueryClient();

  const netQty = Math.max(
    0,
    parseFloat(form.nos || 1) * parseFloat(form.length || 0) *
    parseFloat(form.breadth || 0) * parseFloat(form.height || 0) -
    parseFloat(form.deduction || 0),
  );

  // ── queries ────────────────────────────────────────────────────────────────

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn:  () => projectAPI.list().then(r => r.data?.data).catch(() => []),
  });

  const { data: boqItems = [] } = useQuery({
    queryKey: ['boq', projectId],
    queryFn:  () => projectId
      ? boqAPI.list({ project_id: projectId }).then(r => r.data?.data).catch(() => [])
      : Promise.resolve([]),
    enabled: !!projectId,
  });

  const { data: mbData, isLoading, refetch } = useQuery({
    queryKey: ['measurements', projectId, activeTab],
    queryFn:  () => measurementAPI.list({
      project_id: projectId || undefined,
      status:     activeTab !== 'all' ? activeTab : undefined,
    }).then(r => r.data?.data).catch(() => []),
  });

  // ── mutations ──────────────────────────────────────────────────────────────

  const resetForm = () => {
    setForm({
      boq_item_id: '', mb_number: '',
      entry_date:  dayjs().format('YYYY-MM-DD'),
      description: '', location: '', drawing_ref: '', remarks: '',
      nos: 1, length: '', breadth: '', height: '', deduction: 0,
    });
    setEditEntry(null);
  };

  const openEdit = (m) => {
    setEditEntry(m);
    setForm({
      boq_item_id: m.boq_item_id || '',
      mb_number:   m.mb_number   || '',
      entry_date:  m.entry_date  ? dayjs(m.entry_date).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
      description: m.description || m.boq_description || '',
      location:    m.location    || '',
      drawing_ref: m.drawing_ref || '',
      remarks:     m.remarks     || '',
      nos:         m.nos         ?? 1,
      length:      m.length      || '',
      breadth:     m.breadth     || '',
      height:      m.height      || '',
      deduction:   m.deduction   || 0,
    });
    setShowForm(true);
  };

  const createMutation = useMutation({
    mutationFn: (d) => measurementAPI.create({
      ...d,
      project_id: projectId,
      mb_number:  d.mb_number || `MB-${Math.floor(Math.random() * 90000) + 10000}`,
    }),
    onSuccess: () => {
      toast.success('Measurement entry submitted');
      setShowForm(false);
      resetForm();
      qc.invalidateQueries({ queryKey: ['measurements'] });
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Submission failed'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => measurementAPI.update(id, data),
    onSuccess: () => {
      toast.success('Measurement entry updated');
      setShowForm(false);
      resetForm();
      qc.invalidateQueries({ queryKey: ['measurements'] });
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Update failed'),
  });

  const importMutation = useMutation({
    mutationFn: (file) => {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('project_id', projectId);
      return measurementAPI.import(fd);
    },
    onSuccess: (r) => { toast.success(r.data.message); qc.invalidateQueries({ queryKey: ['measurements'] }); },
    onError:   (e) => toast.error(e?.response?.data?.error || 'Import failed'),
  });

  const handleImport = (e) => { const f = e.target.files?.[0]; if (f) importMutation.mutate(f); };

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/measurements/${id}`),
    onSuccess: () => { toast.success('Entry deleted'); qc.invalidateQueries({ queryKey: ['measurements'] }); },
    onError:   (e) => toast.error(e?.response?.data?.error || 'Cannot delete — may be linked to a bill'),
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, action, remarks }) => measurementAPI.approve(id, { action, remarks }),
    onSuccess: (_, v) => {
      toast.success(`Measurement ${v.action === 'approve' ? 'approved' : 'rejected'}`);
      setSelected(null);
      setShowReject(false);
      setRejectRemark('');
      qc.invalidateQueries({ queryKey: ['measurements'] });
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Action failed'),
  });

  // ── derived data ───────────────────────────────────────────────────────────

  const allMB = useMemo(() =>
    Array.isArray(mbData)
      ? mbData.map(m => ({ ...m, project_name: m.project_name || m.project }))
      : [],
  [mbData]);

  const filtered = useMemo(() => {
    if (!search) return allMB;
    const s = search.toLowerCase();
    return allMB.filter(m =>
      (m.mb_number    || '').toLowerCase().includes(s) ||
      (m.sr_no        || '').toLowerCase().includes(s) ||
      (m.boq_description || m.description || '').toLowerCase().includes(s) ||
      (m.location     || '').toLowerCase().includes(s),
    );
  }, [allMB, search]);

  const stats = useMemo(() => ({
    submitted:   allMB.filter(m => m.status === 'submitted').length,
    qs_approved: allMB.filter(m => m.status === 'qs_approved').length,
    pm_approved: allMB.filter(m => m.status === 'pm_approved').length,
    rejected:    allMB.filter(m => m.status === 'rejected').length,
  }), [allMB]);

  const tabCounts = useMemo(() => {
    const c = { all: allMB.length };
    TABS.slice(1).forEach(t => { c[t.key] = allMB.filter(m => m.status === t.key).length; });
    return c;
  }, [allMB]);

  // BOQ item grouped for select
  const boqByChapter = useMemo(() =>
    boqItems.reduce((acc, b) => {
      const ch = b.chapter_name
        ? `Ch ${b.chapter_no}: ${b.chapter_name}`
        : `Chapter ${b.chapter_no || 'Uncategorized'}`;
      if (!acc[ch]) acc[ch] = [];
      acc[ch].push(b);
      return acc;
    }, {}),
  [boqItems]);

  // selected BOQ item (for unit display)
  const selectedBoqItem = useMemo(() =>
    boqItems.find(b => String(b.id) === String(form.boq_item_id)),
  [boqItems, form.boq_item_id]);

  // ── approve label helper ───────────────────────────────────────────────────
  const approveLabel = (status) => {
    if (status === 'submitted')   return 'Approve (QS)';
    if (status === 'qs_approved') return 'Approve (PM)';
    return null;
  };

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#f4f6f9] font-sans">

      {/* ── Sticky Header ── */}
      <div className="sticky top-0 z-30 bg-white border-b border-[#e2e6ec] shadow-sm">
        <div className="px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center shadow">
              <Ruler className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-[15px] font-medium text-[#1a1c21] leading-none">Measurement Book</h1>
              <p className="text-[10px] text-[#8e94a3] font-medium uppercase tracking-wider mt-0.5">
                Digital site measurement log &amp; verification
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Project selector */}
            <div className="relative">
              <select
                className="h-9 pl-3 pr-8 rounded-xl border border-[#d8dce1] bg-white text-[12px] text-[#1a1c21] outline-none focus:border-indigo-400 appearance-none cursor-pointer"
                value={projectId}
                onChange={e => setProjectId(e.target.value)}
              >
                <option value="">All Projects</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#8e94a3] pointer-events-none" />
            </div>

            <button
              onClick={() => refetch()}
              className="h-9 w-9 flex items-center justify-center rounded-xl border border-[#e2e6ec] bg-white text-[#6a6f7d] hover:bg-[#f4f6f9] transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            <button
              onClick={() => {
                if (!projectId) { toast.error('Select a project first'); return; }
                navigate(`/qs/measurements/book?project_id=${projectId}`);
              }}
              className="h-9 flex items-center gap-1.5 px-3 rounded-xl border border-indigo-300 bg-indigo-50 text-indigo-700 text-xs font-medium hover:bg-indigo-100 transition-colors"
            >
              <BookOpen className="w-4 h-4" />
              Open Measurement Book
            </button>

            <DataToolbar
              data={allMB}
              fileName={`Measurement_Book_${projectId || 'All'}`}
              onAdd={() => !projectId ? toast.error('Select a project first') : setShowForm(true)}
              addLabel="New MB Entry"
              onImport={handleImport}
              templateData={TEMPLATE_MB}
              templateName="Measurement_Book_Template"
            />
          </div>
        </div>
      </div>

      <div className="px-6 py-5 space-y-5">

        {/* ── Stats strip ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { key: 'submitted',   label: 'Pending QS', val: stats.submitted,   color: 'text-amber-500'   },
            { key: 'qs_approved', label: 'Pending PM', val: stats.qs_approved, color: 'text-blue-500'    },
            { key: 'pm_approved', label: 'Approved',   val: stats.pm_approved, color: 'text-emerald-500' },
            { key: 'rejected',    label: 'Rejected',   val: stats.rejected,    color: 'text-red-500'     },
          ].map(st => (
            <button
              key={st.key}
              onClick={() => setActiveTab(prev => prev === st.key ? 'all' : st.key)}
              className={clsx(
                'bg-white border rounded-2xl shadow-sm px-4 py-4 text-center transition-all hover:shadow-md',
                activeTab === st.key ? 'border-indigo-400 ring-1 ring-indigo-200' : 'border-[#e2e6ec]',
              )}
            >
              <div className={clsx('text-2xl font-medium', st.color)}>{st.val}</div>
              <div className="text-[10px] text-[#8e94a3] font-medium uppercase tracking-wider mt-1">{st.label}</div>
            </button>
          ))}
        </div>

        {/* ── Tab pills + Search ── */}
        <div className="flex flex-col md:flex-row gap-3 items-start md:items-center justify-between">
          {/* Tab pills */}
          <div className="flex gap-1 bg-white border border-[#e2e6ec] rounded-xl p-1 flex-wrap">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={clsx(
                  'px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all flex items-center gap-1.5',
                  activeTab === t.key
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-[#6a6f7d] hover:bg-[#f4f6f9]',
                )}
              >
                {t.label}
                <span className={clsx(
                  'inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold',
                  activeTab === t.key ? 'bg-white/20 text-white' : 'bg-[#f4f6f9] text-[#6a6f7d]',
                )}>
                  {tabCounts[t.key] ?? 0}
                </span>
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8e94a3]" />
            <input
              className="w-full h-9 pl-9 pr-3 border border-[#d8dce1] rounded-xl bg-white text-[12px] text-[#1a1c21] outline-none focus:border-indigo-400 placeholder-[#8e94a3]"
              placeholder="Search MB No, item, location…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* ── Table ── */}
        <div className="bg-white border border-[#e2e6ec] rounded-2xl shadow-sm overflow-hidden">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-[#f4f6f9] border-b border-[#e2e6ec]">
                {['CSI No', 'BOQ Item', 'Location', 'Date', 'Dimensions (L×B×H×Nos)', 'Net Qty', 'Unit', 'Status', ''].map((h, i) => (
                  <th
                    key={i}
                    className={clsx(
                      'py-3 px-4 text-[10px] font-medium text-[#6a6f7d] uppercase tracking-wider',
                      i >= 5 && i <= 6 ? 'text-right' : i === 7 ? 'text-center' : 'text-left',
                    )}
                  >{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0f2f5]">
              {isLoading ? (
                Array(5).fill(0).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={9} className="px-4 py-3">
                      <div className="h-6 bg-[#f4f6f9] rounded animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-16 text-center text-[#8e94a3] text-[12px] font-medium">
                    No measurement entries found
                  </td>
                </tr>
              ) : (
                filtered.map((m) => (
                  <tr
                    key={m.id}
                    onClick={() => setSelected(m)}
                    className="hover:bg-[#f8f9fb] cursor-pointer transition-colors"
                  >
                    {/* CSI No */}
                    <td className="py-3 px-4">
                      <div className="font-medium text-indigo-600 font-mono text-[11px]">{m.sr_no || '—'}</div>
                      {m.mb_number && <div className="text-[9px] text-slate-900 font-medium font-mono mt-0.5">{m.mb_number}</div>}
                    </td>
                    {/* BOQ Item */}
                    <td className="py-3 px-4 max-w-[200px]">
                      <div className="font-medium text-[#1a1c21] truncate">
                        {m.boq_description || m.description || '—'}
                      </div>
                    </td>
                    {/* Location */}
                    <td className="py-3 px-4 text-[#6a6f7d] truncate max-w-[130px]">
                      {m.location || '—'}
                    </td>
                    {/* Date */}
                    <td className="py-3 px-4 text-[#6a6f7d] whitespace-nowrap">
                      {m.entry_date ? dayjs(m.entry_date).format('DD MMM YYYY') : '—'}
                    </td>
                    {/* Dimensions */}
                    <td className="py-3 px-4 text-right font-mono text-[#6a6f7d] whitespace-nowrap">
                      {num(m.length)} &times; {num(m.breadth)} &times; {num(m.height)} &times; {num(m.nos, 0)}
                    </td>
                    {/* Net Qty */}
                    <td className="py-3 px-4 text-right font-mono font-medium text-[#1a1c21]">
                      {num(m.net_quantity)}
                    </td>
                    {/* Unit */}
                    <td className="py-3 px-4 text-right text-[10px] text-[#8e94a3] uppercase font-medium">
                      {m.unit || m.boq_unit || '—'}
                    </td>
                    {/* Status */}
                    <td className="py-3 px-4 text-center">
                      <StatusBadge status={m.status} />
                    </td>
                    {/* Actions */}
                    <td className="py-3 px-4" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        {['draft', 'rejected'].includes(m.status) && (
                          <button
                            onClick={() => openEdit(m)}
                            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 transition-colors"
                            title="Edit entry"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <TableActions
                          disableEdit
                          onDelete={() => deleteMutation.mutate(m.id)}
                        />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          Detail Modal
      ══════════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {selected && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1,    opacity: 1 }}
              exit={{    scale: 0.96, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="bg-white rounded-2xl border border-[#e2e6ec] shadow-2xl w-full max-w-lg overflow-hidden"
            >
              {/* Header */}
              <div className="px-6 py-4 border-b border-[#e2e6ec] flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <StatusBadge status={selected.status} />
                    <span className="text-[10px] text-[#8e94a3] font-medium">
                      {selected.entry_date ? dayjs(selected.entry_date).format('DD MMM YYYY') : ''}
                    </span>
                  </div>
                  <h2 className="text-[16px] font-medium text-[#1a1c21] font-mono">
                    {selected.sr_no || selected.mb_number || 'Measurement Entry'}
                  </h2>
                  <p className="text-[11px] text-[#6a6f7d] mt-0.5">
                    {selected.project_name}
                    {selected.mb_number && <span className="ml-2 text-[10px] text-slate-400">· {selected.mb_number}</span>}
                  </p>
                </div>
                <button
                  onClick={() => { setSelected(null); setShowReject(false); setRejectRemark(''); }}
                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#f4f6f9] text-[#8e94a3] hover:text-[#1a1c21] transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body */}
              <div className="px-6 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
                {/* Description */}
                <div>
                  <div className="text-[10px] font-medium text-[#8e94a3] uppercase tracking-wider mb-1">Description</div>
                  <div className="text-[13px] font-medium text-[#1a1c21] leading-snug">
                    {selected.boq_description || selected.description || '—'}
                  </div>
                </div>

                {/* Location + Drawing Ref */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-[10px] font-medium text-[#8e94a3] uppercase tracking-wider mb-1">Location</div>
                    <div className="text-[12px] font-medium text-[#1a1c21]">{selected.location || '—'}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-medium text-[#8e94a3] uppercase tracking-wider mb-1">Drawing Ref</div>
                    <div className="text-[12px] font-medium text-[#1a1c21]">{selected.drawing_ref || '—'}</div>
                  </div>
                </div>

                {/* Measurement breakdown table */}
                <div className="rounded-xl border border-[#e2e6ec] overflow-hidden">
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="bg-[#f4f6f9] border-b border-[#e2e6ec]">
                        {['Nos', 'L (m)', 'B (m)', 'H (m)', 'Net Qty'].map((h, i) => (
                          <th key={i} className={clsx(
                            'py-2 px-3 text-[10px] font-medium text-[#6a6f7d] uppercase tracking-wider',
                            i === 4 ? 'text-right' : 'text-center',
                          )}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="divide-x divide-[#f0f2f5]">
                        <td className="py-3 px-3 text-center font-mono text-[#1a1c21]">{num(selected.nos, 0)}</td>
                        <td className="py-3 px-3 text-center font-mono text-[#1a1c21]">{num(selected.length)}</td>
                        <td className="py-3 px-3 text-center font-mono text-[#1a1c21]">{num(selected.breadth)}</td>
                        <td className="py-3 px-3 text-center font-mono text-[#1a1c21]">{num(selected.height)}</td>
                        <td className="py-3 px-3 text-right font-mono font-medium text-indigo-600">{num(selected.net_quantity)}</td>
                      </tr>
                      {parseFloat(selected.deduction || 0) > 0 && (
                        <tr className="bg-red-50 border-t border-red-100">
                          <td colSpan={4} className="py-2 px-4 text-right text-[10px] font-medium text-red-500 uppercase tracking-wider">Less Deduction</td>
                          <td className="py-2 px-3 text-right font-mono text-red-500">− {num(selected.deduction)}</td>
                        </tr>
                      )}
                      <tr className="bg-[#f4f6f9] border-t border-[#e2e6ec]">
                        <td colSpan={4} className="py-3 px-4 text-right text-[10px] font-medium text-[#6a6f7d] uppercase tracking-wider">
                          Net Quantity &nbsp;({selected.unit || selected.boq_unit || '—'})
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-medium text-[15px] text-[#1a1c21]">
                          {num(selected.net_quantity)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Prepared by */}
                <div className="flex items-center justify-between text-[11px] text-[#8e94a3] pt-1 border-t border-[#f0f2f5]">
                  <span>Prepared by: <span className="font-medium text-[#6a6f7d]">{selected.submitted_by_name || '—'}</span></span>
                  <span>Ref: <span className="font-medium text-[#6a6f7d]">{selected.drawing_ref || '—'}</span></span>
                </div>

                {/* Reject remark input */}
                {showReject && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-medium text-[#6a6f7d] uppercase tracking-wider">Rejection Remarks</label>
                    <textarea
                      className="w-full border border-[#d8dce1] rounded-xl bg-white text-[12px] text-[#1a1c21] outline-none focus:border-indigo-400 px-3 py-2 min-h-[70px] resize-none placeholder-[#8e94a3]"
                      placeholder="Enter reason for rejection…"
                      value={rejectRemark}
                      onChange={e => setRejectRemark(e.target.value)}
                    />
                  </div>
                )}
              </div>

              {/* Footer actions */}
              {['submitted', 'qs_approved'].includes(selected.status) && (
                <div className="px-6 py-4 border-t border-[#e2e6ec] flex gap-2">
                  {showReject ? (
                    <>
                      <button
                        onClick={() => { setShowReject(false); setRejectRemark(''); }}
                        className="h-9 px-4 rounded-xl border border-[#e2e6ec] bg-white text-[12px] font-medium text-[#6a6f7d] hover:bg-[#f4f6f9] transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => approveMutation.mutate({ id: selected.id, action: 'reject', remarks: rejectRemark })}
                        disabled={approveMutation.isPending}
                        className="flex-1 h-9 px-4 rounded-xl bg-red-500 text-white text-[12px] font-medium hover:bg-red-600 transition-colors disabled:opacity-60"
                      >
                        Confirm Reject
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => setShowReject(true)}
                        className="h-9 px-4 rounded-xl border border-red-200 bg-red-50 text-red-500 text-[12px] font-medium hover:bg-red-100 transition-colors"
                      >
                        Reject
                      </button>
                      <button
                        onClick={() => approveMutation.mutate({ id: selected.id, action: 'approve' })}
                        disabled={approveMutation.isPending}
                        className="flex-1 h-9 px-4 rounded-xl bg-indigo-600 text-white text-[12px] font-medium hover:bg-indigo-500 transition-colors disabled:opacity-60"
                      >
                        {approveLabel(selected.status)}
                      </button>
                    </>
                  )}
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════════════════════════════════════════
          New Entry Form Modal
      ══════════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showForm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1,    opacity: 1 }}
              exit={{    scale: 0.96, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="bg-white rounded-2xl border border-[#e2e6ec] shadow-2xl w-full max-w-xl max-h-[92vh] flex flex-col overflow-hidden"
            >
              {/* Sticky modal header */}
              <div className="px-6 py-4 border-b border-[#e2e6ec] flex items-center justify-between flex-shrink-0 bg-white">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
                    {editEntry ? <Pencil className="w-4 h-4 text-white" /> : <Plus className="w-4 h-4 text-white" />}
                  </div>
                  <h2 className="text-[14px] font-medium text-[#1a1c21]">
                    {editEntry ? `Edit Entry — ${editEntry.mb_number || editEntry.sr_no || ''}` : 'New Measurement Entry'}
                  </h2>
                </div>
                <button
                  onClick={() => { setShowForm(false); resetForm(); }}
                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#f4f6f9] text-[#8e94a3] hover:text-[#1a1c21] transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Scrollable body */}
              <form
                onSubmit={(e) => { e.preventDefault(); createMutation.mutate(form); }}
                className="flex-1 overflow-y-auto px-6 py-5 space-y-4"
              >
                {/* Project + BOQ Item */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-medium text-[#6a6f7d] uppercase tracking-wider">Project</label>
                    <div className="relative">
                      <select
                        className="w-full h-9 pl-3 pr-8 border border-[#d8dce1] rounded-xl bg-white text-[12px] text-[#1a1c21] outline-none focus:border-indigo-400 appearance-none"
                        value={projectId}
                        onChange={e => setProjectId(e.target.value)}
                      >
                        <option value="">Select project</option>
                        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#8e94a3] pointer-events-none" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-medium text-[#6a6f7d] uppercase tracking-wider">BOQ Item</label>
                    <div className="relative">
                      <select
                        className="w-full h-9 pl-3 pr-8 border border-[#d8dce1] rounded-xl bg-white text-[12px] text-[#1a1c21] outline-none focus:border-indigo-400 appearance-none"
                        value={form.boq_item_id}
                        onChange={e => setForm(p => ({ ...p, boq_item_id: e.target.value }))}
                      >
                        <option value="">Select BOQ item</option>
                        {Object.entries(boqByChapter).map(([chName, items]) => (
                          <optgroup key={chName} label={chName}>
                            {items.map(b => (
                              <option key={b.id} value={b.id}>
                                {b.item_no} — {(b.description || '').substring(0, 48)}{b.description?.length > 48 ? '…' : ''}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#8e94a3] pointer-events-none" />
                    </div>
                  </div>
                </div>

                {/* Date + Drawing Ref */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-medium text-[#6a6f7d] uppercase tracking-wider">Date</label>
                    <input
                      type="date"
                      className="w-full h-9 px-3 border border-[#d8dce1] rounded-xl bg-white text-[12px] text-[#1a1c21] outline-none focus:border-indigo-400"
                      value={form.entry_date}
                      onChange={e => setForm(p => ({ ...p, entry_date: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-medium text-[#6a6f7d] uppercase tracking-wider">Drawing Ref</label>
                    <input
                      type="text"
                      className="w-full h-9 px-3 border border-[#d8dce1] rounded-xl bg-white text-[12px] text-[#1a1c21] outline-none focus:border-indigo-400 placeholder-[#8e94a3]"
                      placeholder="e.g. DWG-A-001"
                      value={form.drawing_ref}
                      onChange={e => setForm(p => ({ ...p, drawing_ref: e.target.value }))}
                    />
                  </div>
                </div>

                {/* Description */}
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-medium text-[#6a6f7d] uppercase tracking-wider">Description</label>
                  <textarea
                    className="w-full px-3 py-2 border border-[#d8dce1] rounded-xl bg-white text-[12px] text-[#1a1c21] outline-none focus:border-indigo-400 placeholder-[#8e94a3] resize-none min-h-[60px]"
                    placeholder="Specific work, level or component description…"
                    value={form.description}
                    onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                  />
                </div>

                {/* Location */}
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-medium text-[#6a6f7d] uppercase tracking-wider">Location</label>
                  <input
                    type="text"
                    className="w-full h-9 px-3 border border-[#d8dce1] rounded-xl bg-white text-[12px] text-[#1a1c21] outline-none focus:border-indigo-400 placeholder-[#8e94a3]"
                    placeholder="e.g. Block A - Grid 3-4, Level 2"
                    value={form.location}
                    onChange={e => setForm(p => ({ ...p, location: e.target.value }))}
                  />
                </div>

                {/* Geometric grid */}
                <div className="rounded-xl border border-[#e2e6ec] bg-[#f8f9fb] p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Calculator className="w-4 h-4 text-indigo-500" />
                    <span className="text-[11px] font-medium text-[#1a1c21] uppercase tracking-wider">Geometric Dimensions</span>
                  </div>
                  <div className="grid grid-cols-5 gap-2">
                    {[
                      ['nos',       'Nos'],
                      ['length',    'L (m)'],
                      ['breadth',   'B (m)'],
                      ['height',    'H (m)'],
                      ['deduction', 'Ded'],
                    ].map(([field, label]) => (
                      <div key={field} className="space-y-1">
                        <label className="block text-[10px] font-medium text-[#6a6f7d] text-center">{label}</label>
                        <input
                          type="number"
                          step="0.001"
                          min="0"
                          className="w-full h-9 px-1.5 text-center font-mono border border-[#d8dce1] rounded-xl bg-white text-[12px] text-[#1a1c21] outline-none focus:border-indigo-400"
                          value={form[field]}
                          onChange={e => setForm(p => ({ ...p, [field]: e.target.value }))}
                        />
                      </div>
                    ))}
                  </div>

                  {/* Live preview panel */}
                  <div className="mt-1 pt-3 border-t border-[#e2e6ec] flex items-center justify-between">
                    <div className="text-[10px] font-medium text-[#6a6f7d] uppercase tracking-wider">
                      Net Qty = Nos × L × B × H − Ded
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[24px] font-medium font-mono text-indigo-600">{netQty.toFixed(3)}</span>
                      <span className="text-[11px] text-[#8e94a3] font-medium">
                        {selectedBoqItem?.unit || selectedBoqItem?.boq_unit || '—'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Remarks */}
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-medium text-[#6a6f7d] uppercase tracking-wider">Remarks (optional)</label>
                  <input
                    type="text"
                    className="w-full h-9 px-3 border border-[#d8dce1] rounded-xl bg-white text-[12px] text-[#1a1c21] outline-none focus:border-indigo-400 placeholder-[#8e94a3]"
                    placeholder="Any additional notes…"
                    value={form.remarks}
                    onChange={e => setForm(p => ({ ...p, remarks: e.target.value }))}
                  />
                </div>
              </form>

              {/* Sticky footer buttons */}
              <div className="px-6 py-4 border-t border-[#e2e6ec] flex gap-2 flex-shrink-0 bg-white">
                <button
                  type="button"
                  onClick={() => { setShowForm(false); resetForm(); }}
                  className="h-9 px-5 rounded-xl border border-[#e2e6ec] bg-white text-[12px] font-medium text-[#6a6f7d] hover:bg-[#f4f6f9] transition-colors"
                >
                  Cancel
                </button>
                {editEntry ? (
                  <button
                    onClick={() => updateMutation.mutate({ id: editEntry.id, data: form })}
                    disabled={updateMutation.isPending || !form.boq_item_id}
                    className="flex-1 h-9 px-5 rounded-xl bg-indigo-600 text-white text-[12px] font-medium hover:bg-indigo-500 transition-colors disabled:opacity-60"
                  >
                    {updateMutation.isPending ? 'Saving…' : 'Save Changes'}
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => createMutation.mutate({ ...form, status: 'draft' })}
                      disabled={createMutation.isPending || !form.boq_item_id || !form.description}
                      className="h-9 px-5 rounded-xl border border-[#d8dce1] bg-white text-[12px] font-medium text-[#6a6f7d] hover:bg-[#f4f6f9] transition-colors disabled:opacity-50"
                    >
                      Save Draft
                    </button>
                    <button
                      onClick={() => createMutation.mutate(form)}
                      disabled={createMutation.isPending || !form.boq_item_id || !form.description}
                      className="flex-1 h-9 px-5 rounded-xl bg-indigo-600 text-white text-[12px] font-medium hover:bg-indigo-500 transition-colors disabled:opacity-60"
                    >
                      {createMutation.isPending ? 'Submitting…' : 'Submit'}
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
