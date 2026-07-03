// src/pages/qs/BOQPage.jsx
import React, { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useReactToPrint } from 'react-to-print';
import {
  FileSpreadsheet, Plus, X, ChevronDown, ChevronRight,
  Search, Calculator, Upload, Printer, Download,
  AlertTriangle, CheckCircle2, TrendingUp, Package,
  Edit2, Trash2, Save, RefreshCw, Filter, Eye,
  BarChart3, Layers, Building2, FileText
} from 'lucide-react';
import { clsx } from 'clsx';
import { boqAPI, projectAPI } from '../../api/client';
import toast from 'react-hot-toast';
import masterBOQData from '../../data/master_boq.json';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ── Formatters ────────────────────────────────────────────────────────────────
const inr = (v) => {
  const n = parseFloat(v || 0);
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const num = (v, d = 3) => parseFloat(v || 0).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (v) => `${Math.min(100, parseFloat(v || 0)).toFixed(1)}%`;
const itemAmount = (i) => parseFloat(i.amount) || (parseFloat(i.quantity || 0) * parseFloat(i.rate || 0));

// ── Chapter grouping helpers (group by chapter_name, not chapter_no) ──────────
const toNum = (v) => parseFloat(String(v || '').replace(/[^0-9.]/g, '')) || 0;
const toTitleCase = (s) => s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
const normName = (s) => (s || '').trim().replace(/\s+/g, ' ').toLowerCase();
const chKey   = (it) => { const n = normName(it.chapter_name); return n || `__no:${it.chapter_no || 'ZZZ'}`; };
const chLabel = (it) => { const n = (it.chapter_name || '').trim().replace(/\s+/g, ' '); return n ? toTitleCase(n) : (it.chapter_no ? `Chapter ${it.chapter_no}` : 'Miscellaneous'); };

import { CONSTRUCTION_UNITS as UNITS } from '../../constants/units';

const EMPTY_FORM = {
  chapter_no: '', chapter_name: '', item_no: '', sr_no: '',
  description: '', short_description: '', unit: 'CUM', quantity: '', rate: '', hsn_code: '', remarks: ''
};

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function BOQPage() {
  const [projectId, setProjectId]     = useState('');
  const [search, setSearch]           = useState('');
  const [collapsed, setCollapsed]     = useState({});
  const [showForm, setShowForm]       = useState(false);
  const [editItem, setEditItem]       = useState(null);   // item being edited inline
  const [form, setForm]               = useState(EMPTY_FORM);
  const [filterChapter, setFilterChapter] = useState('all');
  const printRef = useRef();
  const fileInputRef = useRef();
  const qc = useQueryClient();

  // ── Queries ──────────────────────────────────────────────────────────────────
  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectAPI.list().then(r => {
      const d = r?.data;
      if (Array.isArray(d)) return d;
      if (d?.data) return d.data;
      return [];
    }).catch(() => []),
  });

  const { data: boqItems = [], isLoading, refetch } = useQuery({
    queryKey: ['boq', projectId],
    queryFn: () => projectId
      ? boqAPI.summary(projectId).then(r => r.data?.data || []).catch(() => [])
      : Promise.resolve([]),
    enabled: !!projectId,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchInterval: projectId ? 30000 : false,
  });

  const selectedProject = projects.find(p => p.id === projectId);

  // ── Mutations ─────────────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: (d) => boqAPI.create({ ...d, project_id: projectId }),
    onSuccess: () => {
      toast.success('BOQ item added successfully');
      setShowForm(false);
      setForm(EMPTY_FORM);
      qc.invalidateQueries({ queryKey: ['boq', projectId] });
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed to save item'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => boqAPI.update(id, data),
    onSuccess: () => {
      toast.success('BOQ item updated');
      setEditItem(null);
      qc.invalidateQueries({ queryKey: ['boq', projectId] });
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Update failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => boqAPI.delete(id),
    onSuccess: () => {
      toast.success('Item removed from BOQ');
      qc.invalidateQueries({ queryKey: ['boq', projectId] });
    },
    onError: () => toast.error('Failed to delete item'),
  });

  const importMutation = useMutation({
    mutationFn: (file) => {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('project_id', projectId);
      return boqAPI.import(fd);
    },
    onSuccess: (r) => {
      toast.success(`${r.data?.count || 0} items imported — please verify AI-tagged rows`);
      qc.invalidateQueries({ queryKey: ['boq', projectId] });
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Import failed'),
  });

  // ── Derived data ──────────────────────────────────────────────────────────────
  // Use chapter_name grouping only when items have multiple distinct chapter names.
  // If all items share one name (e.g. the project title), fall back to chapter_no.
  const useNameGrouping = useMemo(() => {
    const names = new Set(boqItems.map(i => normName(i.chapter_name)).filter(Boolean));
    return names.size > 1;
  }, [boqItems]);

  const getKey   = (it) => useNameGrouping ? chKey(it) : (it.chapter_no || '0');
  const getLabel = (it) => useNameGrouping ? chLabel(it) : (it.chapter_name && it.chapter_no ? `${it.chapter_no} — ${toTitleCase((it.chapter_name || '').trim())}` : it.chapter_no ? `Chapter ${it.chapter_no}` : 'Miscellaneous');

  const filtered = useMemo(() => {
    return boqItems.filter(i => {
      const matchSearch = !search ||
        i.description?.toLowerCase().includes(search.toLowerCase()) ||
        (i.item_no || '').toLowerCase().includes(search.toLowerCase()) ||
        (i.chapter_name || '').toLowerCase().includes(search.toLowerCase());
      const matchChapter = filterChapter === 'all' || getKey(i) === filterChapter;
      return matchSearch && matchChapter;
    });
  }, [boqItems, search, filterChapter, useNameGrouping]);

  const chapters = useMemo(() => {
    const map = {};
    filtered.forEach(item => {
      const key = getKey(item);
      if (!map[key]) map[key] = { key, name: getLabel(item), items: [], sort: Infinity };
      map[key].items.push(item);
      const sk = toNum(item.chapter_no) || toNum(item.item_no);
      if (sk && sk < map[key].sort) map[key].sort = sk;
    });
    return Object.values(map).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
  }, [filtered, useNameGrouping]);

  const allChapters = useMemo(() => {
    const seen = new Set();
    const list = [];
    boqItems.forEach(i => {
      const k = getKey(i);
      if (!seen.has(k)) { seen.add(k); list.push({ key: k, label: getLabel(i) }); }
    });
    return list.sort((a, b) => a.label.localeCompare(b.label));
  }, [boqItems, useNameGrouping]);

  const totals = useMemo(() => {
    const contract = filtered.reduce((s, i) => s + itemAmount(i), 0);
    const executed = filtered.reduce((s, i) => s + parseFloat(i.executed_qty || 0) * parseFloat(i.rate || 0), 0);
    const certified = filtered.reduce((s, i) => s + parseFloat(i.certified_qty || 0) * parseFloat(i.rate || 0), 0);
    return { contract, executed, certified, balance: contract - executed };
  }, [filtered]);

  // ── Handlers ──────────────────────────────────────────────────────────────────
  const handlePrint = useReactToPrint({ contentRef: printRef });

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!projectId) { toast.error('Select a project first'); return; }
    const tid = toast.loading(file.type.includes('pdf') || file.type.includes('image') ? 'AI extracting BOQ…' : 'Importing…');
    importMutation.mutate(file, { onSettled: () => toast.dismiss(tid) });
    e.target.value = '';
  };

  const handleDownloadPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 32, 80);
    doc.text('Bill of Quantities', 14, 18);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    doc.text(`Project: ${selectedProject?.name || '—'}  |  Contract Value: ${inr(totals.contract)}  |  Generated: ${new Date().toLocaleDateString('en-IN')}`, 14, 25);

    const head = [['CSI Code', 'Chapter', 'Item No', 'Description', 'Unit', 'Qty', 'Rate (₹)', 'Amount (₹)', 'Executed', '% Done']];
    const body = filtered.map(i => {
      const exec = parseFloat(i.executed_qty || 0);
      const qty  = parseFloat(i.quantity || 0);
      return [
        i.sr_no || '—',
        `${i.chapter_no || ''} ${i.chapter_name || ''}`.trim(),
        i.item_no || '—',
        i.description?.substring(0, 60),
        i.unit,
        num(i.quantity),
        num(i.rate, 2),
        inr(itemAmount(i)),
        num(exec),
        pct(qty > 0 ? (exec / qty) * 100 : 0),
      ];
    });

    autoTable(doc, {
      startY: 30,
      head,
      body,
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [15, 32, 80], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      columnStyles: { 2: { cellWidth: 80 } },
      margin: { left: 14, right: 14 },
      foot: [['', '', '', 'TOTAL', '', '', '', inr(totals.contract), inr(totals.executed), pct(totals.contract > 0 ? (totals.executed / totals.contract) * 100 : 0)]],
      footStyles: { fillColor: [15, 32, 80], textColor: 255, fontStyle: 'bold' },
    });

    const pg = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pg; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(150);
      doc.text(`Page ${i} of ${pg}  |  ConstructERP India  |  Confidential`, 14, doc.internal.pageSize.height - 8);
    }
    doc.save(`BOQ_${selectedProject?.name?.replace(/\s+/g, '_') || 'Export'}.pdf`);
  };

  const handleExportCSV = () => {
    const headers = ['CSI Code', 'Chapter No', 'Chapter Name', 'Item No', 'Description', 'Unit', 'Quantity', 'Rate', 'Amount', 'Executed Qty', 'Certified Qty', 'HSN Code'];
    const rows = filtered.map(i => [
      i.sr_no || '', i.chapter_no, i.chapter_name, i.item_no, `"${i.description}"`,
      i.unit, i.quantity, i.rate, itemAmount(i).toFixed(2), i.executed_qty || 0, i.certified_qty || 0, i.hsn_code || ''
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `BOQ_${selectedProject?.name || 'Export'}.csv`;
    a.click();
  };

  const confirmDelete = (id) => {
    if (window.confirm('Remove this BOQ item? This cannot be undone.')) deleteMutation.mutate(id);
  };

  const openEdit = (item) => {
    setEditItem({ ...item });
  };

  const saveEdit = () => {
    if (!editItem) return;
    updateMutation.mutate({
      id: editItem.id,
      data: { description: editItem.description, short_description: editItem.short_description, quantity: editItem.quantity, rate: editItem.rate, remarks: editItem.remarks, sr_no: editItem.sr_no, chapter_name: editItem.chapter_name, chapter_no: editItem.chapter_no }
    });
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Hidden print zone */}
      <div style={{ display: 'none' }}>
        <div ref={printRef} style={{ fontFamily: 'Arial, sans-serif', padding: 24 }}>
          <h2 style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 4 }}>Bill of Quantities</h2>
          <p style={{ fontSize: 11, color: '#555', marginBottom: 16 }}>
            Project: {selectedProject?.name} &nbsp;|&nbsp; Contract Value: {inr(totals.contract)} &nbsp;|&nbsp; Printed: {new Date().toLocaleDateString('en-IN')}
          </p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
            <thead>
              <tr style={{ background: '#0f2050', color: '#fff' }}>
                {['CSI Code', 'Item No', 'Chapter', 'Description', 'Unit', 'Qty', 'Rate', 'Amount', 'Exec Qty', '% Done'].map(h => (
                  <th key={h} style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 'bold' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((i, idx) => {
                const exec = parseFloat(i.executed_qty || 0);
                const qty  = parseFloat(i.quantity || 0);
                return (
                  <tr key={i.id} style={{ background: idx % 2 === 0 ? '#fff' : '#f5f7fa' }}>
                    <td style={{ padding: '5px 8px', borderBottom: '1px solid #e2e8f0', fontFamily: 'monospace', fontSize: 9 }}>{i.sr_no || '—'}</td>
                    <td style={{ padding: '5px 8px', borderBottom: '1px solid #e2e8f0' }}>{i.chapter_no} {i.chapter_name}</td>
                    <td style={{ padding: '5px 8px', borderBottom: '1px solid #e2e8f0' }}>{i.item_no}</td>
                    <td style={{ padding: '5px 8px', borderBottom: '1px solid #e2e8f0' }}>{i.description}</td>
                    <td style={{ padding: '5px 8px', borderBottom: '1px solid #e2e8f0' }}>{i.unit}</td>
                    <td style={{ padding: '5px 8px', borderBottom: '1px solid #e2e8f0', textAlign: 'right' }}>{num(i.quantity)}</td>
                    <td style={{ padding: '5px 8px', borderBottom: '1px solid #e2e8f0', textAlign: 'right' }}>₹{num(i.rate, 2)}</td>
                    <td style={{ padding: '5px 8px', borderBottom: '1px solid #e2e8f0', textAlign: 'right' }}>{inr(itemAmount(i))}</td>
                    <td style={{ padding: '5px 8px', borderBottom: '1px solid #e2e8f0', textAlign: 'right' }}>{num(exec)}</td>
                    <td style={{ padding: '5px 8px', borderBottom: '1px solid #e2e8f0', textAlign: 'right' }}>{pct(qty > 0 ? (exec / qty) * 100 : 0)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: '#0f2050', color: '#fff', fontWeight: 'bold' }}>
                <td colSpan={7} style={{ padding: '6px 8px' }}>TOTAL</td>
                <td style={{ padding: '6px 8px', textAlign: 'right' }}>{inr(totals.contract)}</td>
                <td style={{ padding: '6px 8px', textAlign: 'right' }}>{inr(totals.executed)}</td>
                <td style={{ padding: '6px 8px', textAlign: 'right' }}>{pct(totals.contract > 0 ? (totals.executed / totals.contract) * 100 : 0)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv,.pdf,.jpg,.jpeg,.png" className="hidden" onChange={handleFileChange} />

      <div className="min-h-screen bg-slate-50">

        {/* ── Top Header ── */}
        <div className="bg-white border-b border-slate-200 px-6 py-4 sticky top-0 z-20 shadow-sm">
          <div className="max-w-screen-2xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-600/20 flex-shrink-0">
                <FileSpreadsheet className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-slate-800 uppercase tracking-tight leading-none">Bill of Quantities</h1>
                <p className="text-[10px] text-slate-900 font-medium uppercase tracking-widest mt-0.5">
                  {selectedProject ? selectedProject.name : 'Select a project to begin'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Project Selector */}
              <select
                value={projectId}
                onChange={e => { setProjectId(e.target.value); setCollapsed({}); setFilterChapter('all'); }}
                className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-medium text-slate-900 outline-none focus:border-indigo-400 transition-all"
              >
                <option value="">— Select Project —</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>

              {projectId && (
                <>
                  <button onClick={handlePrint} title="Print"
                    className="flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 text-slate-900 text-[10px] font-medium uppercase tracking-widest rounded-xl hover:bg-slate-50 transition-all shadow-sm">
                    <Printer className="w-3.5 h-3.5" /> Print
                  </button>
                  <button onClick={handleDownloadPDF} title="Download PDF"
                    className="flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 text-slate-900 text-[10px] font-medium uppercase tracking-widest rounded-xl hover:bg-slate-50 transition-all shadow-sm">
                    <Download className="w-3.5 h-3.5" /> PDF
                  </button>
                  <button onClick={handleExportCSV} title="Export CSV"
                    className="flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 text-slate-900 text-[10px] font-medium uppercase tracking-widest rounded-xl hover:bg-slate-50 transition-all shadow-sm">
                    <FileText className="w-3.5 h-3.5" /> CSV
                  </button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={importMutation.isPending}
                    className="flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 text-slate-900 text-[10px] font-medium uppercase tracking-widest rounded-xl hover:bg-slate-50 transition-all shadow-sm disabled:opacity-50"
                  >
                    {importMutation.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                    {importMutation.isPending ? 'Importing…' : 'Import'}
                  </button>
                  <button
                    onClick={() => { setForm(EMPTY_FORM); setShowForm(true); }}
                    className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-medium uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-indigo-600/20"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Item
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="max-w-screen-2xl mx-auto px-6 py-6 space-y-6">

          {!projectId ? (
            <EmptyState icon={Building2} title="No Project Selected" desc="Choose a project from the dropdown above to view its BOQ." />
          ) : isLoading ? (
            <div className="py-32 flex flex-col items-center gap-3">
              <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
              <p className="text-[11px] font-medium text-slate-900 font-medium uppercase tracking-widest">Loading BOQ data…</p>
            </div>
          ) : (
            <>
              {/* ── KPI Strip ── */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <KPICard label="Contract Value"   value={inr(totals.contract)}  sub={`${filtered.length} line items`}       color="indigo" />
                <KPICard label="Executed Value"   value={inr(totals.executed)}  sub={pct(totals.contract > 0 ? (totals.executed / totals.contract) * 100 : 0) + ' of contract'} color="amber" />
                <KPICard label="Certified (RA)"   value={inr(totals.certified)} sub="RA bills certified"                      color="emerald" />
                <KPICard label="Balance to Execute" value={inr(totals.balance)} sub={totals.balance < 0 ? '⚠ Cost overrun' : 'Remaining'} color={totals.balance < 0 ? 'red' : 'slate'} />
              </div>

              {/* ── Overall Progress Bar ── */}
              <div className="bg-white border border-slate-200 rounded-2xl px-6 py-4 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest">Overall Execution Progress</span>
                  <span className="text-[11px] font-medium text-indigo-600">{pct(totals.contract > 0 ? (totals.executed / totals.contract) * 100 : 0)}</span>
                </div>
                <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 rounded-full transition-all duration-700"
                    style={{ width: pct(totals.contract > 0 ? (totals.executed / totals.contract) * 100 : 0) }}
                  />
                </div>
                <div className="flex justify-between mt-1.5">
                  <span className="text-[9px] text-slate-900 font-medium uppercase">0%</span>
                  <span className="text-[9px] text-emerald-600 font-medium uppercase">Certified: {pct(totals.contract > 0 ? (totals.certified / totals.contract) * 100 : 0)}</span>
                  <span className="text-[9px] text-slate-900 font-medium uppercase">100%</span>
                </div>
              </div>

              {/* ── Filters ── */}
              <div className="flex flex-col md:flex-row items-center gap-3">
                <div className="relative flex-1 w-full">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    className="w-full bg-white border border-slate-200 rounded-xl pl-11 pr-4 py-2.5 text-[11px] font-medium text-slate-900 outline-none focus:border-indigo-400 transition-all shadow-sm placeholder:text-slate-400"
                    placeholder="Search by description, item no, or chapter…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                </div>
                <div className="relative">
                  <Filter className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <select
                    value={filterChapter}
                    onChange={e => setFilterChapter(e.target.value)}
                    className="pl-10 pr-8 py-2.5 bg-white border border-slate-200 rounded-xl text-[11px] font-medium text-slate-900 outline-none focus:border-indigo-400 transition-all shadow-sm appearance-none"
                  >
                    <option value="all">All Chapters</option>
                    {allChapters.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </select>
                </div>
                <button
                  onClick={() => setCollapsed(prev => {
                    const allOpen = chapters.every(c => !prev[c.key]);
                    const next = {};
                    if (allOpen) chapters.forEach(c => { next[c.key] = true; });
                    return next;
                  })}
                  className="flex items-center gap-1.5 px-4 py-2.5 bg-white border border-slate-200 text-slate-900 text-[10px] font-medium uppercase tracking-widest rounded-xl hover:bg-slate-50 transition-all shadow-sm whitespace-nowrap"
                >
                  <Layers className="w-3.5 h-3.5" /> Expand / Collapse All
                </button>
              </div>

              {/* ── Chapter Accordion ── */}
              {chapters.length === 0 ? (
                <EmptyState icon={FileSpreadsheet} title="No BOQ Items Found" desc="Add items manually or import from Excel / PDF." />
              ) : (
                <div className="space-y-3">
                  {chapters.map((ch) => {
                    const isOpen = !collapsed[ch.key];
                    const chContract  = ch.items.reduce((s, i) => s + itemAmount(i), 0);
                    const chExecuted  = ch.items.reduce((s, i) => s + parseFloat(i.executed_qty || 0) * parseFloat(i.rate || 0), 0);
                    const chPct       = chContract > 0 ? (chExecuted / chContract) * 100 : 0;
                    const isOverrun   = chExecuted > chContract && chContract > 0;

                    return (
                      <div key={ch.key} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">

                        {/* Chapter Header */}
                        <button
                          onClick={() => setCollapsed(p => ({ ...p, [ch.key]: !p[ch.key] }))}
                          className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors text-left"
                        >
                          <div className="flex items-center gap-3">
                            <div className={clsx(
                              'w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-medium border transition-all',
                              isOpen ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-500'
                            )}>
                              {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-slate-900 uppercase tracking-tight">{ch.name}</span>
                                {isOverrun && (
                                  <span className="flex items-center gap-1 px-2 py-0.5 bg-red-50 border border-red-200 text-red-600 text-[9px] font-medium uppercase rounded-full">
                                    <AlertTriangle className="w-2.5 h-2.5" /> Overrun
                                  </span>
                                )}
                              </div>
                              <span className="text-[9px] text-slate-900 font-medium uppercase tracking-widest">{ch.items.length} items</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-6">
                            {/* Mini progress bar */}
                            <div className="hidden md:flex flex-col items-end gap-1 min-w-[120px]">
                              <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className={clsx('h-full rounded-full transition-all', isOverrun ? 'bg-red-500' : 'bg-indigo-400')}
                                  style={{ width: `${Math.min(100, chPct)}%` }}
                                />
                              </div>
                              <span className={clsx('text-[9px] font-medium uppercase', isOverrun ? 'text-red-500' : 'text-indigo-500')}>
                                {pct(chPct)} executed
                              </span>
                            </div>
                            <div className="text-right">
                              <div className="text-xs font-medium text-slate-900 font-mono">{inr(chContract)}</div>
                              <div className="text-[9px] text-slate-900 font-medium uppercase">chapter total</div>
                            </div>
                          </div>
                        </button>

                        {/* Items Table */}
                        {isOpen && (
                          <div className="border-t border-slate-100 overflow-x-auto">
                            <table className="w-full text-left">
                              <thead className="bg-slate-50 border-b border-slate-100">
                                <tr>
                                  <th className="px-4 py-3 text-[9px] font-medium text-slate-400 uppercase tracking-widest w-36">CSI Code</th>
                                  <th className="px-4 py-3 text-[9px] font-medium text-slate-400 uppercase tracking-widest w-16">Item No</th>
                                  <th className="px-4 py-3 text-[9px] font-medium text-slate-400 uppercase tracking-widest w-36">Chapter</th>
                                  <th className="px-4 py-3 text-[9px] font-medium text-slate-400 uppercase tracking-widest">Description</th>
                                  <th className="px-4 py-3 text-[9px] font-medium text-slate-400 uppercase tracking-widest w-44">Short Description</th>
                                  <th className="px-4 py-3 text-[9px] font-medium text-slate-400 uppercase tracking-widest text-center w-16">Unit</th>
                                  <th className="px-4 py-3 text-[9px] font-medium text-slate-400 uppercase tracking-widest text-right w-28">Contract Qty</th>
                                  <th className="px-4 py-3 text-[9px] font-medium text-slate-400 uppercase tracking-widest text-right w-28">Rate (₹)</th>
                                  <th className="px-4 py-3 text-[9px] font-medium text-slate-400 uppercase tracking-widest text-right w-32 bg-indigo-50/60">Amount</th>
                                  <th className="px-4 py-3 text-[9px] font-medium text-slate-400 uppercase tracking-widest text-right w-28">Exec Qty</th>
                                  <th className="px-4 py-3 text-[9px] font-medium text-slate-400 uppercase tracking-widest text-center w-28">Progress</th>
                                  <th className="px-4 py-3 w-20"></th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-50">
                                {ch.items.map((it) => {
                                  const execQty   = parseFloat(it.executed_qty || 0);
                                  const contractQty = parseFloat(it.quantity || 0);
                                  const execPct   = contractQty > 0 ? (execQty / contractQty) * 100 : 0;
                                  const isEditing = editItem?.id === it.id;
                                  const overrun   = execQty > contractQty && contractQty > 0;

                                  return (
                                    <tr key={it.id} className={clsx('group transition-colors', isEditing ? 'bg-indigo-50/40' : 'hover:bg-slate-50/60')}>
                                      <td className="px-4 py-3">
                                        {it.sr_no ? (
                                          <span className="text-[9px] font-medium text-slate-900 font-medium bg-slate-100 px-2 py-1 rounded-lg border border-slate-200 font-mono whitespace-nowrap">{it.sr_no}</span>
                                        ) : (
                                          <span className="text-[9px] text-slate-300">—</span>
                                        )}
                                      </td>
                                      <td className="px-4 py-3">
                                        <span className="text-[10px] font-medium text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg border border-indigo-100 font-mono">{it.item_no || '—'}</span>
                                      </td>
                                      <td className="px-4 py-3 w-36">
                                        {isEditing ? (
                                          <input
                                            className="w-full bg-white border border-indigo-300 rounded-lg px-2 py-1 text-[11px] outline-none"
                                            value={editItem.chapter_name || ''}
                                            placeholder="Chapter name"
                                            onChange={e => setEditItem(p => ({ ...p, chapter_name: e.target.value }))}
                                          />
                                        ) : (
                                          <span className={clsx(
                                            'text-[10px] font-medium px-2 py-1 rounded-lg border',
                                            it.chapter_name && it.chapter_name !== (selectedProject?.name || '')
                                              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                              : 'bg-slate-100 border-slate-200 text-slate-400'
                                          )}>
                                            {it.chapter_name || '—'}
                                          </span>
                                        )}
                                      </td>
                                      <td className="px-4 py-3 max-w-[320px]">
                                        {isEditing ? (
                                          <input
                                            className="w-full bg-white border border-indigo-300 rounded-lg px-3 py-1.5 text-[11px] font-medium text-slate-900 outline-none"
                                            value={editItem.description}
                                            onChange={e => setEditItem(p => ({ ...p, description: e.target.value }))}
                                          />
                                        ) : (
                                          <>
                                            <div className="text-[11px] font-medium text-slate-900 font-medium leading-snug" title={it.description}>{it.description}</div>
                                            {it.hsn_code && <div className="text-[9px] text-slate-900 font-medium mt-0.5">HSN: {it.hsn_code}</div>}
                                          </>
                                        )}
                                      </td>
                                      <td className="px-4 py-3 max-w-[176px]">
                                        {isEditing ? (
                                          <input
                                            className="w-full bg-white border border-indigo-300 rounded-lg px-2 py-1 text-[11px] outline-none"
                                            value={editItem.short_description || ''}
                                            placeholder="Short description"
                                            onChange={e => setEditItem(p => ({ ...p, short_description: e.target.value }))}
                                          />
                                        ) : (
                                          <div className="text-[10px] text-slate-500 leading-snug" title={it.short_description}>{it.short_description || '—'}</div>
                                        )}
                                      </td>
                                      <td className="px-4 py-3 text-center">
                                        <span className="text-[10px] font-medium text-slate-900 font-medium bg-slate-100 px-2 py-0.5 rounded-md">{it.unit}</span>
                                      </td>
                                      <td className="px-4 py-3 text-right">
                                        {isEditing ? (
                                          <input type="number" step="0.001"
                                            className="w-full bg-white border border-indigo-300 rounded-lg px-3 py-1.5 text-[11px] font-mono font-medium text-right outline-none"
                                            value={editItem.quantity}
                                            onChange={e => setEditItem(p => ({ ...p, quantity: e.target.value }))}
                                          />
                                        ) : (
                                          <span className="text-[11px] font-mono font-medium text-slate-700">{num(it.quantity)}</span>
                                        )}
                                      </td>
                                      <td className="px-4 py-3 text-right">
                                        {isEditing ? (
                                          <input type="number" step="0.01"
                                            className="w-full bg-white border border-indigo-300 rounded-lg px-3 py-1.5 text-[11px] font-mono font-medium text-right outline-none"
                                            value={editItem.rate}
                                            onChange={e => setEditItem(p => ({ ...p, rate: e.target.value }))}
                                          />
                                        ) : (
                                          <span className="text-[11px] font-mono font-medium text-slate-600">₹{num(it.rate, 2)}</span>
                                        )}
                                      </td>
                                      <td className="px-4 py-3 text-right bg-indigo-50/30">
                                        <span className="text-[12px] font-medium font-mono text-slate-900">
                                          {isEditing ? inr(parseFloat(editItem.quantity || 0) * parseFloat(editItem.rate || 0)) : inr(itemAmount(it))}
                                        </span>
                                      </td>
                                      <td className="px-4 py-3 text-right">
                                        <span className={clsx('text-[11px] font-mono font-bold', overrun ? 'text-red-600' : 'text-slate-600')}>{num(execQty)}</span>
                                        {overrun && <div className="text-[8px] text-red-500 font-medium uppercase">Overrun</div>}
                                      </td>
                                      <td className="px-4 py-3">
                                        <div className="flex flex-col gap-1">
                                          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                            <div
                                              className={clsx('h-full rounded-full', execPct >= 100 ? 'bg-emerald-500' : execPct >= 60 ? 'bg-blue-500' : 'bg-amber-400')}
                                              style={{ width: `${Math.min(100, execPct)}%` }}
                                            />
                                          </div>
                                          <span className={clsx('text-[9px] font-medium text-center', execPct >= 100 ? 'text-emerald-600' : 'text-slate-400')}>
                                            {pct(execPct)}
                                          </span>
                                        </div>
                                      </td>
                                      <td className="px-4 py-3">
                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                          {isEditing ? (
                                            <>
                                              <button onClick={saveEdit} disabled={updateMutation.isPending}
                                                className="w-7 h-7 flex items-center justify-center rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-600 hover:bg-emerald-100 transition-all">
                                                <Save className="w-3.5 h-3.5" />
                                              </button>
                                              <button onClick={() => setEditItem(null)}
                                                className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-50 border border-slate-200 text-slate-900 font-medium hover:bg-slate-100 transition-all">
                                                <X className="w-3.5 h-3.5" />
                                              </button>
                                            </>
                                          ) : (
                                            <>
                                              <button onClick={() => openEdit(it)}
                                                className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-50 border border-slate-200 text-slate-900 font-medium hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50 transition-all">
                                                <Edit2 className="w-3.5 h-3.5" />
                                              </button>
                                              <button onClick={() => confirmDelete(it.id)} disabled={deleteMutation.isPending}
                                                className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-50 border border-slate-200 text-slate-900 font-medium hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-all">
                                                <Trash2 className="w-3.5 h-3.5" />
                                              </button>
                                            </>
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                              {/* Chapter subtotal row */}
                              <tfoot>
                                <tr className="bg-slate-50 border-t border-slate-200">
                                  <td colSpan={7} className="px-4 py-2.5 text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest">
                                    {ch.name} Subtotal — {ch.items.length} items
                                  </td>
                                  <td className="px-4 py-2.5 text-right bg-indigo-50/40">
                                    <span className="text-[12px] font-medium font-mono text-slate-900">{inr(chContract)}</span>
                                  </td>
                                  <td className="px-4 py-2.5 text-right">
                                    <span className={clsx('text-[11px] font-medium font-mono', isOverrun ? 'text-red-600' : 'text-slate-700')}>{inr(chExecuted)}</span>
                                  </td>
                                  <td className="px-4 py-2.5 text-center">
                                    <span className={clsx('text-[10px] font-medium', isOverrun ? 'text-red-600' : 'text-indigo-600')}>{pct(chPct)}</span>
                                  </td>
                                  <td />
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Grand Total Row */}
                  <div className="bg-slate-800 text-white rounded-2xl px-5 py-4 flex flex-wrap items-center justify-between gap-4 shadow-lg">
                    <div>
                      <div className="text-[9px] font-medium uppercase tracking-widest text-slate-400">Grand Total — All Chapters</div>
                      <div className="text-[10px] font-medium text-slate-300 mt-0.5">{filtered.length} line items across {chapters.length} chapters</div>
                    </div>
                    <div className="flex items-center gap-8 flex-wrap">
                      <TotalCell label="Contract Value" value={inr(totals.contract)} color="text-white" />
                      <TotalCell label="Executed Value" value={inr(totals.executed)} color="text-amber-300" />
                      <TotalCell label="Certified (RA)" value={inr(totals.certified)} color="text-emerald-300" />
                      <TotalCell label="Balance" value={inr(totals.balance)} color={totals.balance < 0 ? 'text-red-300' : 'text-slate-300'} />
                      <TotalCell label="Execution %" value={pct(totals.contract > 0 ? (totals.executed / totals.contract) * 100 : 0)} color="text-indigo-300" />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Add Item Modal ── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center">
                  <Plus className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h2 className="text-sm font-medium text-slate-900 uppercase tracking-tight">Add BOQ Item</h2>
                  <p className="text-[9px] text-slate-900 font-medium uppercase tracking-widest">Register new line item to {selectedProject?.name}</p>
                </div>
              </div>
              <button onClick={() => setShowForm(false)} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-200 text-slate-900 font-medium transition-all">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); createMutation.mutate(form); }} className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Chapter No" required>
                  <input className={inputCls} placeholder="e.g. 1" value={form.chapter_no} onChange={e => setForm(p => ({ ...p, chapter_no: e.target.value }))} required />
                </FormField>
                <FormField label="Chapter Name" required>
                  <input className={inputCls} placeholder="e.g. Earthworks" value={form.chapter_name} onChange={e => setForm(p => ({ ...p, chapter_name: e.target.value }))} required />
                </FormField>
                <FormField label="Item Code">
                  <input className={inputCls} placeholder="e.g. 1.01" value={form.item_no} onChange={e => setForm(p => ({ ...p, item_no: e.target.value }))} />
                </FormField>
                <FormField label="Sr. No">
                  <input className={inputCls} placeholder="e.g. 01.36" value={form.sr_no} onChange={e => setForm(p => ({ ...p, sr_no: e.target.value }))} />
                </FormField>
              </div>

              <FormField label="Description" required>
                <textarea
                  className={`${inputCls} resize-none`} rows={3}
                  placeholder="Detailed specification as per contract…"
                  value={form.description}
                  onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                  required
                />
              </FormField>

              <FormField label="Short Description">
                <input
                  className={inputCls}
                  placeholder="Brief label for lists/reports"
                  value={form.short_description}
                  onChange={e => setForm(p => ({ ...p, short_description: e.target.value }))}
                />
              </FormField>

              <div className="grid grid-cols-3 gap-4">
                <FormField label="Unit" required>
                  <select className={inputCls} value={form.unit} onChange={e => setForm(p => ({ ...p, unit: e.target.value }))}>
                    {UNITS.map(u => <option key={u}>{u}</option>)}
                  </select>
                </FormField>
                <FormField label="Quantity" required>
                  <input type="number" step="0.001" className={inputCls} placeholder="0.000" value={form.quantity} onChange={e => setForm(p => ({ ...p, quantity: e.target.value }))} required />
                </FormField>
                <FormField label="Rate (₹)" required>
                  <input type="number" step="0.01" className={inputCls} placeholder="0.00" value={form.rate} onChange={e => setForm(p => ({ ...p, rate: e.target.value }))} required />
                </FormField>
              </div>

              <FormField label="HSN Code">
                <input className={inputCls} placeholder="Optional" value={form.hsn_code} onChange={e => setForm(p => ({ ...p, hsn_code: e.target.value }))} />
              </FormField>

              {/* Live amount preview */}
              <div className="bg-indigo-600 text-white rounded-xl p-4 flex items-center justify-between">
                <div>
                  <div className="text-[9px] font-medium uppercase tracking-widest text-indigo-200">Calculated Amount</div>
                  <div className="text-2xl font-medium font-mono mt-0.5">
                    {inr(parseFloat(form.quantity || 0) * parseFloat(form.rate || 0))}
                  </div>
                </div>
                <Calculator className="w-8 h-8 text-indigo-300/50" />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-900 font-medium uppercase text-[10px] tracking-widest rounded-xl transition-all">
                  Cancel
                </button>
                <button type="submit" disabled={createMutation.isPending}
                  className="flex-[2] py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-medium uppercase text-[10px] tracking-widest rounded-xl transition-all shadow-lg shadow-indigo-600/20 disabled:opacity-50 flex items-center justify-center gap-2">
                  {createMutation.isPending ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Saving…</> : <><Save className="w-3.5 h-3.5" /> Save Item</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

// ── Small sub-components ──────────────────────────────────────────────────────
const inputCls = 'w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-[11px] font-medium text-slate-900 font-medium outline-none focus:border-indigo-400 focus:bg-white transition-all';

function FormField({ label, required, children }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[9px] font-medium text-slate-400 uppercase tracking-widest">
        {label}{required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {children}
    </div>
  );
}

function KPICard({ label, value, sub, color }) {
  const colors = {
    indigo:  { border: 'border-indigo-100',  bg: 'bg-indigo-50',  text: 'text-indigo-600',  bar: 'bg-indigo-500' },
    amber:   { border: 'border-amber-100',   bg: 'bg-amber-50',   text: 'text-amber-600',   bar: 'bg-amber-500' },
    emerald: { border: 'border-emerald-100', bg: 'bg-emerald-50', text: 'text-emerald-600', bar: 'bg-emerald-500' },
    slate:   { border: 'border-slate-200',   bg: 'bg-slate-50',   text: 'text-slate-700',   bar: 'bg-slate-400' },
    red:     { border: 'border-red-100',     bg: 'bg-red-50',     text: 'text-red-600',     bar: 'bg-red-500' },
  };
  const c = colors[color] || colors.slate;
  return (
    <div className={clsx('bg-white border rounded-2xl p-5 shadow-sm relative overflow-hidden', c.border)}>
      <div className={clsx('absolute top-0 left-0 w-1 h-full', c.bar)} />
      <div className="text-[9px] font-medium text-slate-400 uppercase tracking-widest mb-2">{label}</div>
      <div className={clsx('text-xl font-medium font-mono tracking-tight', c.text)}>{value}</div>
      <div className="text-[9px] text-slate-900 font-medium mt-1 uppercase">{sub}</div>
    </div>
  );
}

function TotalCell({ label, value, color }) {
  return (
    <div className="text-right">
      <div className="text-[9px] font-medium text-slate-400 uppercase tracking-widest">{label}</div>
      <div className={clsx('text-sm font-medium font-mono', color)}>{value}</div>
    </div>
  );
}

function EmptyState({ icon: Icon, title, desc }) {
  return (
    <div className="bg-white border-2 border-dashed border-slate-200 rounded-2xl py-24 flex flex-col items-center text-center shadow-sm">
      <Icon className="w-12 h-12 text-slate-200 mb-4" />
      <h3 className="text-sm font-medium text-slate-900 uppercase tracking-tight mb-1">{title}</h3>
      <p className="text-[10px] text-slate-900 font-medium uppercase tracking-widest">{desc}</p>
    </div>
  );
}
