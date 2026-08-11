// src/pages/quality/QAQCReportsPage.jsx
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  FileText, Download, Calendar, Search,
  BarChart3, Building2, Eye, AlertCircle,
  CheckCircle2, X, BadgeCheck, FileSearch,
  ShieldAlert, FlaskConical, Hammer, Printer,
  Filter, FileSpreadsheet, ShieldCheck, Layers, Shield,
} from 'lucide-react';
import { qualityAPI, projectAPI, snagAPI } from '../../api/client';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import dayjs from 'dayjs';

const REPORT_TYPES = [
  { id: 'rfi-ledger',      name: 'RFI Master Ledger',         description: 'Complete inspection request log with status and timelines', icon: FileSearch,  category: 'Inspection',  accent: 'indigo'  },
  { id: 'ncr-report',      name: 'NCR Analysis Report',       description: 'Non-conformance reports, root causes and severity analysis', icon: ShieldAlert, category: 'Compliance',  accent: 'red'     },
  { id: 'lab-tests',       name: 'Material Testing Ledger',   description: 'Lab test results, material compliance and fail rates',       icon: FlaskConical,category: 'Materials',   accent: 'emerald' },
  { id: 'mtc-report',      name: 'Test Certificate Register', description: 'MTC certificates, NABL status and pass/fail vs spec',         icon: ShieldCheck, category: 'Materials',   accent: 'purple'  },
  { id: 'pour-report',     name: 'Pour Card Register',        description: 'Concrete pours, cube results and certification status',      icon: Layers,      category: 'Inspection',  accent: 'indigo'  },
  { id: 'audit-report',    name: 'Quality Audit Report',      description: 'Audit findings, NC closure and compliance tracking',         icon: Shield,      category: 'Compliance',  accent: 'red'     },
  { id: 'quality-summary', name: 'QA/QC Executive Summary',   description: 'High-level quality metrics, pass rates and pending items',   icon: BadgeCheck,  category: 'Executive',   accent: 'purple'  },
  { id: 'snag-list',       name: 'Snag List & Handover',      description: 'Project defect tracking, rectification status and sign-offs', icon: Hammer,      category: 'Inspection',  accent: 'amber'   },
];

const ACCENT = {
  indigo:  { icon: 'text-indigo-600',  bg: 'bg-indigo-50',  border: 'border-indigo-300',  btn: 'bg-indigo-600 hover:bg-indigo-700',  bar: 'bg-indigo-500' },
  red:     { icon: 'text-red-600',     bg: 'bg-red-50',     border: 'border-red-300',     btn: 'bg-red-600 hover:bg-red-700',        bar: 'bg-red-500' },
  emerald: { icon: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-300', btn: 'bg-emerald-600 hover:bg-emerald-700',bar: 'bg-emerald-500' },
  purple:  { icon: 'text-purple-600',  bg: 'bg-purple-50',  border: 'border-purple-300',  btn: 'bg-purple-600 hover:bg-purple-700',  bar: 'bg-purple-500' },
  amber:   { icon: 'text-amber-600',   bg: 'bg-amber-50',   border: 'border-amber-300',   btn: 'bg-amber-600 hover:bg-amber-700',    bar: 'bg-amber-500' },
};

const CATEGORIES = ['All', 'Inspection', 'Compliance', 'Materials', 'Executive'];

const fmt = (d) => d ? dayjs(d).format('DD-MMM-YYYY') : '—';

export default function QAQCReportsPage() {
  const [selectedReport, setSelectedReport]   = useState('');
  const [dateRange, setDateRange]             = useState('this-month');
  const [selectedProject, setSelectedProject] = useState('all');
  const [searchTerm, setSearchTerm]           = useState('');
  const [isGenerating, setIsGenerating]       = useState(false);
  const [generatedReport, setGeneratedReport] = useState(null);
  const [error, setError]                     = useState('');
  const [activeCategory, setActiveCategory]   = useState('All');

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectAPI.list().then(r => { const d = r?.data; return Array.isArray(d) ? d : (Array.isArray(d?.data) ? d.data : []); }).catch(() => []),
  });
  const { data: rfis  = [] } = useQuery({ queryKey: ['quality-rfi'], queryFn: () => qualityAPI.listRFI().then(r => r.data?.data ?? []).catch(() => []) });
  const { data: ncrs  = [] } = useQuery({ queryKey: ['quality-ncr'], queryFn: () => qualityAPI.listNCR().then(r => r.data?.data ?? []).catch(() => []) });
  const { data: labs  = [] } = useQuery({ queryKey: ['quality-lab'], queryFn: () => qualityAPI.listLabTests().then(r => r.data?.data ?? []).catch(() => []) });
  const { data: mtcs  = [] } = useQuery({ queryKey: ['quality-mtc'], queryFn: () => qualityAPI.listMTC().then(r => r.data?.data ?? []).catch(() => []) });
  const { data: pours = [] } = useQuery({ queryKey: ['quality-pour'], queryFn: () => qualityAPI.listPourCards().then(r => r.data?.data ?? []).catch(() => []) });
  const { data: audits= [] } = useQuery({ queryKey: ['quality-audits'], queryFn: () => qualityAPI.listAudits().then(r => r.data?.data ?? []).catch(() => []) });
  const { data: snags = [] } = useQuery({ queryKey: ['snags-report'], queryFn: () => snagAPI.list().then(r => r.data?.data ?? []).catch(() => []) });

  const filteredTypes = REPORT_TYPES.filter(r => {
    const matchSearch = r.name.toLowerCase().includes(searchTerm.toLowerCase()) || r.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchCat = activeCategory === 'All' || r.category === activeCategory;
    return matchSearch && matchCat;
  });

  const applyFilters = (arr, dateField = 'created_at') => {
    let result = [...arr];
    if (selectedProject !== 'all') result = result.filter(x => x.project_id === selectedProject);
    if (dateRange !== 'all') {
      const now = dayjs();
      const startMap = { today: now.startOf('day'), 'this-week': now.startOf('week'), 'this-month': now.startOf('month'), 'last-month': now.subtract(1,'month').startOf('month'), 'this-quarter': now.startOf('quarter'), 'this-year': now.startOf('year') };
      const start = startMap[dateRange] || now.startOf('month');
      result = result.filter(x => dayjs(x[dateField] || x.created_at).isAfter(start));
    }
    return result;
  };

  const buildReport = (id) => {
    const fr = applyFilters(rfis);
    const fn = applyFilters(ncrs);
    const fl = applyFilters(labs, 'sample_date');
    const fm = applyFilters(mtcs);
    const fp = applyFilters(pours);
    const fa = applyFilters(audits, 'audit_date');
    const fs = applyFilters(snags);
    switch (id) {
      case 'rfi-ledger': return {
        title: 'RFI Master Ledger', type: id,
        summary: { 'Total RFIs': fr.length, Approved: fr.filter(r=>r.status==='approved').length, Pending: fr.filter(r=>r.status==='raised').length, Rejected: fr.filter(r=>r.status==='rejected').length },
        data: fr.length ? fr.map(r => ({ 'RFI Number': r.rfi_number||'—', Activity: r.activity_name||'—', Location: r.location||'—', Date: fmt(r.created_at), Status: (r.status||'—').toUpperCase() })) : [{ 'RFI Number': 'No data', Activity: '—', Location: '—', Date: '—', Status: '—' }],
      };
      case 'ncr-report': return {
        title: 'NCR Analysis Report', type: id,
        summary: { 'Total NCRs': fn.length, Critical: fn.filter(n=>n.severity==='critical').length, Major: fn.filter(n=>n.severity==='major').length, 'Open Issues': fn.filter(n=>n.status!=='closed').length },
        data: fn.length ? fn.map(n => ({ 'NCR Number': n.ncr_number||'—', Description: n.description||'—', Severity: (n.severity||'—').toUpperCase(), Status: (n.status||'—').toUpperCase(), 'Raised By': n.raised_by_name||'—' })) : [{ 'NCR Number': 'No data', Description: '—', Severity: '—', Status: '—', 'Raised By': '—' }],
      };
      case 'lab-tests': return {
        title: 'Material Testing Ledger', type: id,
        summary: { 'Total Samples': fl.length, Pass: fl.filter(l=>l.result_status==='pass').length, Fail: fl.filter(l=>l.result_status==='fail').length, Pending: fl.filter(l=>!l.result_status||l.result_status==='pending').length },
        data: fl.length ? fl.map(l => ({ 'Lab Serial': l.test_number||'—', 'Material Type': (l.material_type||'—').toUpperCase(), 'Sample Date': fmt(l.sample_date||l.created_at), Result: (l.result_status||'pending').toUpperCase(), Lab: l.lab_name||'—' })) : [{ 'Lab Serial': 'No data', 'Material Type': '—', 'Sample Date': '—', Result: '—', Lab: '—' }],
      };
      case 'mtc-report': return {
        title: 'Test Certificate Register', type: id,
        summary: { 'Total Certs': fm.length, Accepted: fm.filter(m=>m.status==='accepted').length, 'Pending Review': fm.filter(m=>m.status==='pending_review').length, 'Auto-Fail': fm.filter(m=>m.auto_result==='fail').length },
        data: fm.length ? fm.map(m => ({ 'Ref No': m.internal_ref||'—', 'Cert No': m.mtc_number||'—', Material: m.material_name||'—', Grade: m.material_grade||'—', NABL: m.nabl_accredited?'Yes':'No', 'Auto Result': (m.auto_result||'pending').toUpperCase(), Status: (m.status||'—').replace('_',' ').toUpperCase() })) : [{ 'Ref No': 'No data', 'Cert No': '—', Material: '—', Grade: '—', NABL: '—', 'Auto Result': '—', Status: '—' }],
      };
      case 'pour-report': return {
        title: 'Pour Card Register', type: id,
        summary: { 'Total Pours': fp.length, Closed: fp.filter(p=>p.status==='closed').length, 'Certs Pending': fp.filter(p=>p.status==='certs_pending').length, Rejected: fp.filter(p=>p.status==='rejected').length },
        data: fp.length ? fp.map(p => ({ 'Pour Card': p.pour_card_number||'—', Description: p.pour_description||'—', Type: (p.pour_type||'—'), Grade: p.concrete_grade||'—', 'Cubes Pass': `${p.cube_pass_count||0}/${p.cube_test_count||0}`, NCR: p.ncr_number||'—', Status: (p.status||'—').replace('_',' ').toUpperCase() })) : [{ 'Pour Card': 'No data', Description: '—', Type: '—', Grade: '—', 'Cubes Pass': '—', NCR: '—', Status: '—' }],
      };
      case 'audit-report': return {
        title: 'Quality Audit Report', type: id,
        summary: { 'Total Audits': fa.length, Completed: fa.filter(a=>['completed','closed'].includes(a.status)).length, 'Open Findings': fa.reduce((s,a)=>s+parseInt(a.open_findings||0,10),0), 'NC Findings': fa.reduce((s,a)=>s+parseInt(a.nc_count||0,10),0) },
        data: fa.length ? fa.map(a => ({ 'Audit No': a.audit_number||'—', Type: (a.audit_type||'—').replace('_',' '), Standard: a.audit_standard||'—', Auditor: a.auditor_name||'—', Date: fmt(a.audit_date), Findings: a.finding_count||0, Open: a.open_findings||0, Status: (a.status||'—').replace('_',' ').toUpperCase() })) : [{ 'Audit No': 'No data', Type: '—', Standard: '—', Auditor: '—', Date: '—', Findings: '—', Open: '—', Status: '—' }],
      };
      case 'snag-list': return {
        title: 'Snag List & Handover', type: id,
        summary: { 'Total Snags': fs.length, Open: fs.filter(s=>s.status==='open').length, Closed: fs.filter(s=>s.status==='closed').length, Critical: fs.filter(s=>s.priority==='critical').length },
        data: fs.length ? fs.map(s => ({ Code: s.snag_code||'—', Title: s.title||'—', Zone: s.zone||'—', Trade: s.trade||'—', Priority: (s.priority||'—').toUpperCase(), Status: (s.status||'—').replace('_',' ').toUpperCase() })) : [{ Code: 'No data', Title: '—', Zone: '—', Trade: '—', Priority: '—', Status: '—' }],
      };
      default: return {
        title: REPORT_TYPES.find(r=>r.id===id)?.name||'QA/QC Report', type: id,
        summary: {
          'Total RFIs': fr.length,
          'Open NCRs': fn.filter(n=>n.status!=='closed').length,
          'Lab Pass Rate': fl.length>0 ? `${Math.round(fl.filter(l=>l.result_status==='pass').length/fl.length*100)}%` : '—',
          'MTC Pending': fm.filter(m=>m.status==='pending_review').length,
          'Pours Open': fp.filter(p=>['certs_pending','curing','poured'].includes(p.status)).length,
          'Open Findings': fa.reduce((s,a)=>s+parseInt(a.open_findings||0,10),0),
          'Open Snags': fs.filter(s=>s.status==='open').length,
          'Total Projects': projects.length,
        },
        data: [
          { Module: 'RFI / WIR',          Total: fr.length,  Open: fr.filter(r=>r.status==='raised').length },
          { Module: 'NCR',                Total: fn.length,  Open: fn.filter(n=>n.status!=='closed').length },
          { Module: 'Lab Tests',          Total: fl.length,  Open: fl.filter(l=>!l.result_status||l.result_status==='pending').length },
          { Module: 'Test Certificates',  Total: fm.length,  Open: fm.filter(m=>m.status==='pending_review').length },
          { Module: 'Pour Cards',         Total: fp.length,  Open: fp.filter(p=>p.status!=='closed').length },
          { Module: 'Audits',             Total: fa.length,  Open: fa.reduce((s,a)=>s+parseInt(a.open_findings||0,10),0) },
          { Module: 'Snags',              Total: fs.length,  Open: fs.filter(s=>s.status==='open').length },
        ],
      };
    }
  };

  const handleGenerate = async (id) => {
    setSelectedReport(id); setIsGenerating(true); setError(''); setGeneratedReport(null);
    try {
      await new Promise(r => setTimeout(r, 1000));
      setGeneratedReport(buildReport(id));
    } catch { setError('Failed to generate report. Please try again.'); }
    finally { setIsGenerating(false); }
  };

  const handlePDF = () => {
    if (!generatedReport) { setError('Generate a report first'); return; }
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const now = dayjs().format('DD MMM YYYY, hh:mm A');

    doc.setFontSize(16); doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 32, 80);
    doc.text('BCIM Engineering Pvt. Ltd.', 14, 16);
    doc.setFontSize(11); doc.setTextColor(99, 102, 241);
    doc.text(generatedReport.title, 14, 24);
    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 100);
    doc.text(`Generated: ${now}  |  Quality Management System`, 14, 30);

    let y = 38;
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 32, 80);
    doc.text('SUMMARY', 14, y); y += 4;
    const summaryEntries = Object.entries(generatedReport.summary);
    const colW = 60;
    summaryEntries.forEach(([key, val], i) => {
      const x = 14 + (i % 4) * colW;
      const rowY = y + Math.floor(i / 4) * 12;
      doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(120, 120, 120);
      doc.text(String(key).toUpperCase(), x, rowY + 4);
      doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 32, 80);
      doc.text(String(val ?? '—'), x, rowY + 10);
    });
    y += Math.ceil(summaryEntries.length / 4) * 12 + 6;

    if (generatedReport.data.length > 0) {
      const head = [Object.keys(generatedReport.data[0]).map(k => String(k).replace(/([A-Z])/g, ' $1').trim().toUpperCase())];
      const body = generatedReport.data.map(row => Object.values(row).map(v => String(v ?? '—')));
      autoTable(doc, {
        startY: y,
        head,
        body,
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: [67, 56, 202], textColor: 255, fontStyle: 'bold', fontSize: 7 },
        alternateRowStyles: { fillColor: [245, 247, 250] },
        margin: { left: 14, right: 14 },
      });
    }

    const pages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i); doc.setFontSize(7); doc.setTextColor(150);
      doc.text(`Page ${i} of ${pages}  |  BCIM ERP — QA/QC Reports  |  Confidential`, 14, doc.internal.pageSize.height - 8);
    }

    doc.save(`${generatedReport.title.replace(/\s+/g, '_')}_${dayjs().format('YYYY-MM-DD')}.pdf`);
  };

  const handleExcel = () => {
    if (!generatedReport) { setError('Generate a report first'); return; }
    const wb = XLSX.utils.book_new();

    // Sheet 1 — Summary
    const summaryRows = [
      ['BCIM Engineering Pvt. Ltd.'],
      [generatedReport.title],
      [`Generated: ${dayjs().format('DD MMM YYYY, hh:mm A')}`],
      [],
      ['Metric', 'Value'],
      ...Object.entries(generatedReport.summary).map(([k, v]) => [k.replace(/([A-Z])/g, ' $1').trim(), v]),
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(summaryRows);
    ws1['!cols'] = [{ wch: 28 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'Summary');

    // Sheet 2 — Data
    if (generatedReport.data.length > 0) {
      const ws2 = XLSX.utils.json_to_sheet(generatedReport.data);
      const cols = Object.keys(generatedReport.data[0]).map(k => ({ wch: Math.max(14, k.length + 2) }));
      ws2['!cols'] = cols;
      XLSX.utils.book_append_sheet(wb, ws2, 'Data');
    }

    XLSX.writeFile(wb, `${generatedReport.title.replace(/\s+/g, '_')}_${dayjs().format('YYYY-MM-DD')}.xlsx`);
  };

  const handlePrint = () => {
    if (!generatedReport) { setError('Generate a report first'); return; }
    window.print();
  };

  const kpis = [
    { label: 'Report Types',  value: REPORT_TYPES.length,                            icon: FileText,    color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { label: 'Inspections',   value: REPORT_TYPES.filter(r=>r.category==='Inspection').length, icon: FileSearch,  color: 'text-blue-600',   bg: 'bg-blue-50' },
    { label: 'Compliance',    value: REPORT_TYPES.filter(r=>r.category==='Compliance').length, icon: ShieldAlert, color: 'text-red-600',    bg: 'bg-red-50' },
    { label: 'Active Projects',value: projects.length,                                icon: Building2,   color: 'text-amber-600',  bg: 'bg-amber-50' },
  ];

  return (
    <div className="p-6 space-y-5 bg-[#f4f6f9] min-h-full">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-medium text-black">QA/QC Reports</h1>
            <p className="text-xs text-slate-500">Generate and export quality assurance reports</p>
          </div>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map(k => (
          <div key={k.label} className="bg-white rounded-xl border border-[#e2e6ec] p-5 flex items-center gap-4">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${k.bg}`}>
              <k.icon className={`w-5 h-5 ${k.color}`} />
            </div>
            <div>
              <p className="text-2xl font-medium text-slate-900 font-medium leading-none">{k.value}</p>
              <p className="text-xs text-slate-900 font-medium mt-1">{k.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters bar */}
      <div className="bg-white rounded-xl border border-[#e2e6ec] p-4 flex flex-wrap gap-3 items-center">
        <Filter className="w-4 h-4 text-slate-900 font-medium flex-shrink-0" />
        {/* Search */}
        <div className="flex items-center gap-2 flex-1 min-w-48 border border-slate-200 rounded-lg px-3 py-2">
          <Search className="w-4 h-4 text-slate-400" />
          <input className="flex-1 text-sm outline-none bg-transparent" placeholder="Search reports…"
            value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>
        {/* Date range */}
        <div className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2">
          <Calendar className="w-4 h-4 text-slate-400" />
          <select className="text-sm outline-none bg-transparent text-slate-700"
            value={dateRange} onChange={e => setDateRange(e.target.value)}>
            <option value="today">Today</option>
            <option value="this-week">This Week</option>
            <option value="this-month">This Month</option>
            <option value="last-month">Last Month</option>
            <option value="this-quarter">This Quarter</option>
            <option value="this-year">This Year</option>
          </select>
        </div>
        {/* Project */}
        <select className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 outline-none"
          value={selectedProject} onChange={e => setSelectedProject(e.target.value)}>
          <option value="all">All Projects</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {/* Category pills */}
        <div className="flex gap-1">
          {CATEGORIES.map(cat => (
            <button key={cat} onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${activeCategory === cat ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-900 hover:bg-slate-200'}`}>
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-red-700">
            <AlertCircle className="w-4 h-4" /> {error}
          </div>
          <button onClick={() => setError('')}><X className="w-4 h-4 text-red-500" /></button>
        </div>
      )}

      {/* Report cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredTypes.map(report => {
          const ac = ACCENT[report.accent];
          const isActive = selectedReport === report.id;
          const isThis = isGenerating && isActive;
          const Icon = report.icon;
          return (
            <div key={report.id}
              className={`bg-white rounded-xl border overflow-hidden transition-all ${isActive ? `${ac.border} border-2 shadow-md` : 'border-[#e2e6ec] hover:shadow-sm'}`}>
              {/* top bar */}
              <div className={`h-1 ${ac.bar}`} />
              <div className="p-5">
                <div className="flex items-start justify-between mb-4">
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${ac.bg}`}>
                    <Icon className={`w-5 h-5 ${ac.icon}`} />
                  </div>
                  <span className={`text-[10px] font-medium uppercase tracking-wide px-2 py-1 rounded-full ${ac.bg} ${ac.icon}`}>
                    {report.category}
                  </span>
                </div>
                <h3 className="text-sm font-medium text-slate-900 font-medium mb-1">{report.name}</h3>
                <p className="text-xs text-slate-900 font-medium leading-relaxed mb-4">{report.description}</p>

                {/* Generate */}
                <button onClick={() => handleGenerate(report.id)} disabled={isGenerating}
                  className={`w-full py-2.5 text-sm font-medium text-white rounded-lg flex items-center justify-center gap-2 transition-colors mb-2 disabled:opacity-50 ${ac.btn}`}>
                  {isThis ? (
                    <><div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />Generating…</>
                  ) : (
                    <><Eye className="w-3.5 h-3.5" />Generate Report</>
                  )}
                </button>

                {/* Download row */}
                <div className="flex gap-2">
                  <button onClick={() => { if (!generatedReport || generatedReport.type !== report.id) { setError(`Generate "${report.name}" first`); } else { handlePDF(); } }}
                    className="flex-1 py-2 border border-slate-200 text-slate-900 text-xs font-medium rounded-lg hover:bg-slate-50 flex items-center justify-center gap-1.5 transition-colors">
                    <Download className="w-3 h-3" /> PDF
                  </button>
                  <button onClick={() => { if (!generatedReport || generatedReport.type !== report.id) { setError(`Generate "${report.name}" first`); } else { handleExcel(); } }}
                    className="flex-1 py-2 border border-slate-200 text-slate-900 text-xs font-medium rounded-lg hover:bg-slate-50 flex items-center justify-center gap-1.5 transition-colors">
                    <FileSpreadsheet className="w-3 h-3" /> Excel
                  </button>
                  <button onClick={() => { if (!generatedReport || generatedReport.type !== report.id) { setError(`Generate "${report.name}" first`); } else { handlePrint(); } }}
                    className="flex-1 py-2 border border-slate-200 text-slate-900 text-xs font-medium rounded-lg hover:bg-slate-50 flex items-center justify-center gap-1.5 transition-colors">
                    <Printer className="w-3 h-3" /> Print
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Generated report preview */}
      {generatedReport ? (
        <div className="bg-white rounded-xl border border-[#e2e6ec] overflow-hidden">
          {/* header */}
          <div className="bg-[#f8f9fc] border-b border-[#e2e6ec] px-5 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <div>
                <p className="text-sm font-medium text-black">{generatedReport.title}</p>
                <p className="text-xs text-slate-400">Generated {new Date().toLocaleString('en-IN')}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handlePDF}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg transition-colors">
                <Download className="w-3 h-3" /> PDF
              </button>
              <button onClick={handleExcel}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-lg transition-colors">
                <FileSpreadsheet className="w-3 h-3" /> Excel
              </button>
              <button onClick={() => setGeneratedReport(null)}
                className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>
          </div>

          {/* Summary */}
          <div className="px-5 py-4 border-b border-slate-100">
            <p className="text-xs font-medium text-slate-900 font-medium uppercase tracking-wide mb-3">Summary</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(generatedReport.summary).map(([key, value]) => (
                <div key={key} className="bg-[#f8f9fc] border border-[#e2e6ec] rounded-lg p-3 text-center">
                  <p className="text-[10px] text-slate-900 font-medium uppercase tracking-wide mb-1">{key.replace(/([A-Z])/g,' $1').trim()}</p>
                  <p className="text-xl font-medium text-black">{value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Data table */}
          <div className="p-5 overflow-x-auto">
            <p className="text-xs font-medium text-slate-900 font-medium uppercase tracking-wide mb-3">Data</p>
            {generatedReport.data.length > 0 && (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#f8f9fc] border-b border-slate-100">
                    {Object.keys(generatedReport.data[0]).map(k => (
                      <th key={k} className="px-4 py-2.5 text-left text-xs font-medium text-slate-900 font-medium uppercase tracking-wide whitespace-nowrap">
                        {k}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {generatedReport.data.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                      {Object.values(row).map((val, ci) => (
                        <td key={ci} className="px-4 py-3 text-xs text-slate-700">{String(val)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white border-2 border-dashed border-[#e2e6ec] rounded-xl p-12 text-center">
          <BarChart3 className="w-10 h-10 text-slate-200 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-400">Select a report above and click "Generate Report"</p>
          <p className="text-xs text-slate-900 font-medium mt-1">Data will populate here for preview before download</p>
        </div>
      )}
    </div>
  );
}
