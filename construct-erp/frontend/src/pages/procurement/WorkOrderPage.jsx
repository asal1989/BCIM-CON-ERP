// src/pages/procurement/WorkOrderPage.jsx
import RecordAttachments from '../../components/shared/RecordAttachments';
import React, { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import useAuthStore from '../../store/authStore';
import {
  Hammer, Plus, X, Search, FileText, Download,
  Printer, Building2, Clock, CheckCircle2,
  ChevronRight, Upload, IndianRupee, Calendar,
  AlertCircle, RefreshCw, FileSpreadsheet,
  MapPin, User, Briefcase, Package, Percent, ClipboardList, Phone, Mail, Hash,
  Activity, Check, UserCheck, Edit2,
} from 'lucide-react';
import { clsx } from 'clsx';
import dayjs from 'dayjs';
import { subcontractorAPI, vendorAPI, projectAPI } from '../../api/client';
import toast from 'react-hot-toast';
import WOPrintTemplate from './WOPrintTemplate';

import { CONSTRUCTION_UNITS as UNITS } from '../../constants/units';
const inr = v => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATUS_CONFIG = {
  draft:      { label: 'Draft',                cls: 'bg-slate-100  text-slate-700  border-slate-200' },
  pending:    { label: 'Pending',              cls: 'bg-amber-50   text-amber-700  border-amber-200' },
  submitted:  { label: 'Procurement Approved', cls: 'bg-blue-50    text-blue-700   border-blue-200' },
  approved:   { label: 'MD Authorized',        cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  active:     { label: 'Active',     cls: 'bg-teal-50    text-teal-700   border-teal-200' },
  completed:  { label: 'Completed',  cls: 'bg-indigo-50  text-indigo-700 border-indigo-200' },
  terminated: { label: 'Terminated', cls: 'bg-red-50     text-red-600    border-red-200' },
  closed:     { label: 'Closed',     cls: 'bg-gray-100   text-gray-500   border-gray-200' },
  rejected:   { label: 'Rejected',   cls: 'bg-red-50     text-red-600    border-red-200' },
};

// 2-Stage approval pipeline — mirrors PO pipeline
const WO_STAGE_ACTIONS = [
  { id: 'procurement-approve', label: 'Procurement Approve', reqStatuses: ['draft','pending'] },
  { id: 'md-approve',          label: 'MD Authorize',        reqStatuses: ['submitted'] },
];
const WO_STAGE_LABELS = {
  'procurement-approve': 'Procurement Approval',
  'md-approve':          'MD Authorization',
};
const WO_STAGE_ROLES = {
  'procurement-approve': { roles: ['procurement_manager','project_manager','manager','admin','super_admin'], depts: ['procurement','purchase'] },
  'md-approve':          { roles: ['md','ceo','managing_director','admin','super_admin'],                    depts: ['md','managing director','ceo'] },
};
// maps status → pipeline stage number (1-indexed)
// NOTE: 'active' is a legacy / directly-issued operational status that never went
// through MD authorization — it must NOT mark the MD stage as done (stage 3).
// Only an explicit MD approval (status 'approved') completes the pipeline.
const WO_STATUS_STAGE = { draft:1, pending:1, submitted:2, approved:3, active:2, rejected:0, completed:3, terminated:0, closed:3 };

function canApproveWOStage(stageId, user) {
  if (!user) return false;
  if (['admin','super_admin'].includes(user.role)) return true;
  const allowed = WO_STAGE_ROLES[stageId];
  if (!allowed) return false;
  const role = (user.role || '').toLowerCase();
  const dept = (user.department || '').toLowerCase();
  return allowed.roles.some(r => role.includes(r)) || allowed.depts.some(d => dept.includes(d));
}

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  return (
    <span className={clsx('inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium border', cfg.cls)}>
      {cfg.label}
    </span>
  );
}

const inp = 'w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all placeholder:text-slate-400';

const WORK_CATEGORIES = ['Civil', 'Structural', 'Waterproofing', 'Electrical', 'Plumbing', 'Painting', 'Carpentry', 'Tiles', 'Aluminium', 'Demolition', 'Earth Work', 'Fabrication', 'Interior', 'Landscaping', 'General'];

const DEFAULT_WO_TERMS = `1. This Work Order is issued subject to the terms of the registered agreement / quotation, if any.
2. All work shall be carried out as per approved drawings, specifications and instructions of the Site Engineer / Project Manager.
3. Measurement of completed work shall be jointly recorded in the Measurement Book (MB) and certified before billing.
4. Payment shall be released against certified RA bills, subject to Retention and TDS deductions as specified above.
5. Retention shall be released only after successful completion of work and the Defect Liability Period (DLP).
6. TDS and GST shall be deducted / charged as applicable under prevailing Income Tax and GST laws.
7. The Contractor shall ensure adequate manpower, tools, tackles and safety equipment (PPE) at site at all times.
8. The Contractor shall comply with all statutory, safety, health and environmental regulations during execution of work.
9. Any variation in scope, quantity or specification must have prior written approval before execution.
10. Time is of the essence. Delay in completion beyond the agreed schedule may attract penalty / liquidated damages as mutually agreed.
11. Any damage to existing works or materials caused due to the Contractor's negligence shall be rectified at the Contractor's own cost.
12. The Contractor shall maintain valid insurance, licenses and statutory registrations (PF / ESI / labour license) wherever applicable.
13. This Work Order may be terminated by BCIM without liability for unsatisfactory performance, safety violations or non-compliance.
14. Any dispute or difference shall be subject to the jurisdiction of courts at Bangalore.
15. Acceptance of this Work Order (by signature, seal or commencement of work) shall be deemed as acceptance of all terms stated herein.`;

/* ── Excel Import Modal ─────────────────────────────────────────────────── */
function ExcelImportModal({ onClose, onImported }) {
  const [step, setStep]       = useState(1); // 1=upload 2=review 3=done
  const [file, setFile]       = useState(null);
  const [preview, setPreview] = useState([]);
  const [errors, setErrors]   = useState([]);
  const [vendors, setVendors] = useState([]);
  const [projects, setProjects] = useState([]);
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState(null);
  const fileRef = useRef();

  const handleDownloadTemplate = async () => {
    try {
      const res = await subcontractorAPI.downloadWOTemplate();
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a'); a.href = url; a.download = 'WO_Import_Template.xlsx'; a.click();
      URL.revokeObjectURL(url);
      toast.success('Template downloaded');
    } catch { toast.error('Failed to download template'); }
  };

  const handleUpload = async () => {
    if (!file) return toast.error('Select an Excel file first');
    setLoading(true);
    try {
      const res = await subcontractorAPI.excelImportPreview(file);
      const d = res.data;
      setPreview(d.preview || []);
      setErrors(d.errors || []);
      setVendors(d.vendors || []);
      setProjects(d.projects || []);
      setRows((d.preview || []).map(r => ({ ...r })));
      setStep(2);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to parse Excel');
    } finally { setLoading(false); }
  };

  const handleConfirm = async () => {
    const invalid = rows.filter(r => !r.vendor_id || !r.project_id);
    if (invalid.length) return toast.error(`${invalid.length} rows have unmatched vendor or project — fix them first`);
    setLoading(true);
    try {
      const records = rows.map(r => ({
        wo_number: r.wo_number,
        vendor_id: r.vendor_id,
        subject:   r.subject,
        start_date: r.start_date,
        end_date:   r.end_date,
        total_value: r.total_value,
        status:     r.status,
        scope_of_work: r.scope_of_work,
      }));
      // Use first row's project_id (all rows share a project in bulk import)
      // Actually send all with individual project_ids using bulk-import per project
      const byProject = {};
      rows.forEach(r => {
        if (!byProject[r.project_id]) byProject[r.project_id] = [];
        byProject[r.project_id].push({ ...r });
      });
      let totalCreated = 0, totalSkipped = 0;
      for (const [project_id, recs] of Object.entries(byProject)) {
        const res = await subcontractorAPI.bulkImportWOs({ project_id, records: recs });
        totalCreated += res.data.created || 0;
        totalSkipped += res.data.skipped || 0;
      }
      setResult({ created: totalCreated, skipped: totalSkipped });
      setStep(3);
      onImported();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Import failed');
    } finally { setLoading(false); }
  };

  const updateRow = (i, field, val) => setRows(p => p.map((r, idx) => idx === i ? { ...r, [field]: val } : r));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col overflow-hidden max-h-[92vh]">

        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center">
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-900">Import Work Orders from Excel</p>
              <p className="text-xs text-slate-400">
                {step === 1 ? 'Download template, fill it, then upload' : step === 2 ? 'Review and correct matched data before importing' : 'Import complete'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-900 font-medium hover:text-slate-900 transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Steps */}
        <div className="flex border-b border-slate-100 flex-shrink-0">
          {['Upload Excel', 'Review & Match', 'Done'].map((label, i) => (
            <div key={i} className={clsx('flex-1 py-3 text-center text-xs font-medium border-b-2 transition-colors',
              step === i+1 ? 'border-indigo-500 text-indigo-600' : step > i+1 ? 'border-emerald-400 text-emerald-600' : 'border-transparent text-slate-400')}>
              {label}
            </div>
          ))}
        </div>

        <div className="overflow-y-auto flex-1 p-6">

          {step === 1 && (
            <div className="space-y-5">
              <div className="flex gap-3 bg-blue-50 border border-blue-100 rounded-xl p-4">
                <AlertCircle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-blue-800">Before you start</p>
                  <p className="text-xs text-blue-700 mt-1">Download the Excel template, fill in your work orders (one per row), then upload the filled file. Vendor and Project names must match what's in the system.</p>
                </div>
              </div>

              <button onClick={handleDownloadTemplate}
                className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-medium rounded-lg hover:bg-emerald-100 transition-all">
                <Download className="w-4 h-4" /> Download Excel Template
              </button>

              <div onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-slate-200 rounded-xl p-10 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-all">
                <Upload className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                <p className="text-sm font-medium text-slate-600">
                  {file ? <span className="text-indigo-700">{file.name}</span> : 'Click to select filled Excel file'}
                </p>
                <p className="text-xs text-slate-900 font-medium mt-1">.xlsx or .xls · max 10 MB</p>
                <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
                  onChange={e => setFile(e.target.files[0])} />
              </div>

              <div className="flex justify-end">
                <button onClick={handleUpload} disabled={!file || loading}
                  className="flex items-center gap-2 px-6 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg">
                  {loading ? <><RefreshCw className="w-4 h-4 animate-spin" /> Parsing…</> : 'Preview Data →'}
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center gap-4 text-xs">
                <span className="px-2.5 py-1 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-full font-semibold">{rows.length} valid rows</span>
                {errors.length > 0 && <span className="px-2.5 py-1 bg-red-50 border border-red-200 text-red-600 rounded-full font-semibold">{errors.length} errors (skipped)</span>}
                <span className="text-slate-400">Fix vendor/project mismatches using the dropdowns below</span>
              </div>

              {errors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-1">
                  {errors.map((e, i) => <p key={i} className="text-xs text-red-600">Row {e.row}: {e.reason}</p>)}
                </div>
              )}

              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50">
                    <tr>
                      {['Row', 'WO Number', 'Vendor', 'Project', 'Subject', 'Start Date', 'Value (₹)', 'Status'].map(h => (
                        <th key={h} className="px-3 py-2.5 text-left font-medium text-slate-900 font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((r, i) => (
                      <tr key={i} className={r.vendor_id && r.project_id ? '' : 'bg-amber-50'}>
                        <td className="px-3 py-2 text-slate-400">{r.row}</td>
                        <td className="px-3 py-2 font-mono font-medium text-indigo-700 whitespace-nowrap">{r.wo_number}</td>
                        <td className="px-3 py-2 min-w-[160px]">
                          <select value={r.vendor_id || ''} onChange={e => updateRow(i, 'vendor_id', e.target.value)}
                            className={clsx('w-full border rounded px-2 py-1 text-xs outline-none', r.vendor_id ? 'border-slate-200' : 'border-amber-400 bg-amber-50')}>
                            <option value="">— select vendor —</option>
                            {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2 min-w-[160px]">
                          <select value={r.project_id || ''} onChange={e => updateRow(i, 'project_id', e.target.value)}
                            className={clsx('w-full border rounded px-2 py-1 text-xs outline-none', r.project_id ? 'border-slate-200' : 'border-amber-400 bg-amber-50')}>
                            <option value="">— select project —</option>
                            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2 max-w-[150px] truncate text-slate-600">{r.subject || '—'}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-slate-500">{r.start_date || '—'}</td>
                        <td className="px-3 py-2 whitespace-nowrap font-mono text-slate-800">₹{inr(r.total_value)}</td>
                        <td className="px-3 py-2">
                          <select value={r.status} onChange={e => updateRow(i, 'status', e.target.value)}
                            className="border border-slate-200 rounded px-2 py-1 text-xs outline-none">
                            {['draft','pending','approved'].map(s => <option key={s}>{s}</option>)}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex gap-3">
                <button onClick={() => setStep(1)} className="px-4 py-2 border border-slate-200 text-slate-900 text-sm font-medium rounded-lg hover:bg-slate-50">← Back</button>
                <button onClick={handleConfirm} disabled={loading || rows.length === 0}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg">
                  {loading ? <><RefreshCw className="w-4 h-4 animate-spin" /> Importing…</> : `Import ${rows.length} Work Orders`}
                </button>
              </div>
            </div>
          )}

          {step === 3 && result && (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-emerald-600" />
              </div>
              <h3 className="text-lg font-medium text-slate-900 font-medium mb-1">Import Complete</h3>
              <p className="text-sm text-slate-500">
                <strong className="text-emerald-700">{result.created}</strong> work orders created
                {result.skipped > 0 && <>, <strong className="text-amber-600">{result.skipped}</strong> duplicates skipped</>}
              </p>
              <button onClick={onClose} className="mt-6 px-6 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800">Close</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── PDF Import Modal ───────────────────────────────────────────────────── */
function PdfImportModal({ onClose, vendors, projects, onImported }) {
  const [step, setStep]           = useState(1);
  const [file, setFile]           = useState(null);
  const [extracted, setExtracted] = useState(null);
  const [header, setHeader]       = useState({});
  const [items, setItems]         = useState([]);
  const [projectId, setProjectId] = useState('');
  const [vendorId, setVendorId]   = useState('');
  const [loading, setLoading]     = useState(false);
  const [result, setResult]       = useState(null);
  const fileRef = useRef();

  const handleUpload = async () => {
    if (!file) return toast.error('Select a PDF file');
    setLoading(true);
    try {
      const res = await subcontractorAPI.importWOPreview(file);
      const data = res.data;
      setExtracted(data);
      setHeader(data.header || {});
      setItems((data.items || []).map(it => ({ ...it })));
      const vName = (data.header?.vendor_name || '').toLowerCase();
      const matched = (vendors || []).find(v => v.name?.toLowerCase().includes(vName) || vName.includes(v.name?.toLowerCase()));
      if (matched) setVendorId(matched.id);
      setStep(2);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to parse PDF');
    } finally { setLoading(false); }
  };

  const handleConfirm = async () => {
    if (!projectId) return toast.error('Select a project');
    if (!vendorId)  return toast.error('Select a vendor');
    setLoading(true);
    try {
      const res = await subcontractorAPI.importWOConfirm({ project_id: projectId, vendor_id: vendorId, header, items });
      setResult(res.data);
      setStep(3);
      onImported();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save Work Order');
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col overflow-hidden max-h-[92vh]">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-rose-50 border border-rose-100 flex items-center justify-center">
              <FileText className="w-4 h-4 text-rose-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-900">Import Work Order from PDF</p>
              <p className="text-xs text-slate-400">{step === 1 ? 'Upload PDF' : step === 2 ? 'Review extracted data' : 'Complete'}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-900 font-medium hover:text-slate-900 transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex border-b border-slate-100 flex-shrink-0">
          {['Upload PDF', 'Review', 'Done'].map((label, i) => (
            <div key={i} className={clsx('flex-1 py-3 text-center text-xs font-medium border-b-2 transition-colors',
              step === i+1 ? 'border-indigo-500 text-indigo-600' : step > i+1 ? 'border-emerald-400 text-emerald-600' : 'border-transparent text-slate-400')}>
              {label}
            </div>
          ))}
        </div>

        <div className="overflow-y-auto flex-1 p-6">
          {step === 1 && (
            <div className="space-y-5">
              <div onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-slate-200 rounded-xl p-10 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-all">
                <Upload className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                <p className="text-sm font-medium text-slate-600">{file ? <span className="text-indigo-700">{file.name}</span> : 'Click to select a Work Order PDF'}</p>
                <p className="text-xs text-slate-900 font-medium mt-1">PDF format only · max 10 MB</p>
                <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={e => setFile(e.target.files[0])} />
              </div>
              <p className="text-xs text-slate-900 font-medium bg-amber-50 border border-amber-200 rounded-lg p-3">
                The system uses AI to extract WO number, contractor, dates, scope, and line items. Review and edit before saving.
              </p>
              <div className="flex justify-end">
                <button onClick={handleUpload} disabled={!file || loading}
                  className="flex items-center gap-2 px-6 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg">
                  {loading ? <><RefreshCw className="w-4 h-4 animate-spin" /> Parsing…</> : 'Extract Data →'}
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-900 font-medium mb-1">Project *</label>
                  <select value={projectId} onChange={e => setProjectId(e.target.value)} className={inp}>
                    <option value="">Select project…</option>
                    {(projects || []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-900 font-medium mb-1">Vendor / Contractor *</label>
                  <select value={vendorId} onChange={e => setVendorId(e.target.value)} className={inp}>
                    <option value="">Select vendor…</option>
                    {(vendors || []).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                  {extracted?.header?.vendor_name && <p className="text-[11px] text-slate-900 font-medium mt-1">Extracted: <em>{extracted.header.vendor_name}</em></p>}
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-900 font-medium mb-1">WO Number</label>
                  <input value={header.wo_number || ''} onChange={e => setHeader(h => ({ ...h, wo_number: e.target.value }))} className={inp} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-900 font-medium mb-1">Start Date</label>
                  <input type="date" value={header.start_date || ''} onChange={e => setHeader(h => ({ ...h, start_date: e.target.value }))} className={inp} />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-900 font-medium mb-1">Subject / Scope</label>
                  <input value={header.subject || ''} onChange={e => setHeader(h => ({ ...h, subject: e.target.value }))} className={inp} />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-slate-600">Scope Items ({items.length})</p>
                  <button onClick={() => setItems(p => [...p, { description:'', unit:'LS', quantity:0, rate:0, remarks:'' }])}
                    className="text-xs text-indigo-600 hover:underline font-semibold">+ Add Row</button>
                </div>
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50">
                      <tr>
                        {['Description','Unit','Qty','Rate (₹)','Remarks',''].map(h => (
                          <th key={h} className="px-3 py-2 text-left font-medium text-slate-500">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {items.length === 0 && <tr><td colSpan={6} className="px-3 py-4 text-center text-slate-400">No items — add manually</td></tr>}
                      {items.map((it, i) => (
                        <tr key={i}>
                          <td className="px-2 py-1"><input value={it.description||''} onChange={e => setItems(p => p.map((x,j) => j===i?{...x,description:e.target.value}:x))} className="w-full border border-slate-200 rounded px-2 py-1 text-xs outline-none min-w-[160px]" /></td>
                          <td className="px-2 py-1">
                            <select value={it.unit||'LS'} onChange={e => setItems(p => p.map((x,j) => j===i?{...x,unit:e.target.value}:x))} className="border border-slate-200 rounded px-1 py-1 text-xs outline-none">
                              {UNITS.map(u => <option key={u}>{u}</option>)}
                            </select>
                          </td>
                          <td className="px-2 py-1"><input type="number" value={it.quantity||''} onChange={e => setItems(p => p.map((x,j) => j===i?{...x,quantity:e.target.value}:x))} className="w-16 border border-slate-200 rounded px-2 py-1 text-xs outline-none" /></td>
                          <td className="px-2 py-1"><input type="number" value={it.rate||''} onChange={e => setItems(p => p.map((x,j) => j===i?{...x,rate:e.target.value}:x))} className="w-20 border border-slate-200 rounded px-2 py-1 text-xs outline-none" /></td>
                          <td className="px-2 py-1"><input value={it.remarks||''} onChange={e => setItems(p => p.map((x,j) => j===i?{...x,remarks:e.target.value}:x))} className="w-28 border border-slate-200 rounded px-2 py-1 text-xs outline-none" /></td>
                          <td className="px-2 py-1"><button onClick={() => setItems(p => p.filter((_,j) => j!==i))} className="text-red-400 hover:text-red-600"><X className="w-3.5 h-3.5"/></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex gap-3">
                <button onClick={() => setStep(1)} className="px-4 py-2 border border-slate-200 text-slate-900 text-sm font-medium rounded-lg hover:bg-slate-50">← Back</button>
                <button onClick={handleConfirm} disabled={loading}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg">
                  {loading ? <><RefreshCw className="w-4 h-4 animate-spin" /> Saving…</> : 'Confirm & Import WO'}
                </button>
              </div>
            </div>
          )}

          {step === 3 && result && (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-emerald-600" />
              </div>
              <h3 className="text-lg font-medium text-slate-900 font-medium mb-1">Work Order Imported!</h3>
              <p className="text-sm text-slate-500">WO <strong>{result.wo_number}</strong> created with status Draft.</p>
              <button onClick={onClose} className="mt-6 px-6 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800">Close</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Create WO Modal ─────────────────────────────────────────────────────── */
/* ── Section shell — consistent card with header + icon ─────────────────── */
function FormSection({ icon: Icon, title, subtitle, right, children }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 bg-gradient-to-r from-slate-50 to-white border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center">
            <Icon className="w-3.5 h-3.5 text-indigo-600" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-800 uppercase tracking-wider">{title}</p>
            {subtitle && <p className="text-[11px] text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {right}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

const Lbl = ({ children, req }) => (
  <label className="block text-[11px] font-semibold text-slate-600 uppercase tracking-wide mb-1.5">
    {children}{req && <span className="text-red-500 ml-0.5">*</span>}
  </label>
);

function CreateWOModal({ onClose, vendors, projects, onCreate, onUpdate, isPending, editingWO }) {
  const isEditing = !!editingWO;
  const [form, setForm] = useState({
    project_id:           editingWO?.project_id   || '',
    vendor_id:            editingWO?.vendor_id     || '',
    wo_number:            editingWO?.wo_number     || '',
    wo_date:              editingWO?.wo_date ? dayjs(editingWO.wo_date).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
    start_date:           editingWO?.start_date ? dayjs(editingWO.start_date).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
    end_date:             editingWO?.end_date ? dayjs(editingWO.end_date).format('YYYY-MM-DD') : '',
    subject:              editingWO?.subject       || editingWO?.work_description || '',
    scope_of_work:        editingWO?.scope_of_work || '',
    work_category:        editingWO?.work_category || '',
    tower_block:          editingWO?.tower_block   || '',
    cost_head:            editingWO?.cost_head     || '',
    gst_pct:              editingWO?.gst_pct       ?? 18,
    tds_pct:              editingWO?.tds_pct       ?? 2,
    retention_pct:        editingWO?.retention_pct ?? 5,
    advance_recovery_pct: editingWO?.advance_recovery_pct ?? 10,
    terms_conditions:     editingWO?.terms_conditions || DEFAULT_WO_TERMS,
  });
  const [items, setItems] = useState(
    editingWO?.items?.length
      ? editingWO.items.map(it => ({
          description: it.description || '',
          quantity:    String(it.quantity || ''),
          unit:        it.unit || 'SQM',
          rate:        String(it.rate || ''),
          remarks:     it.remarks || '',
        }))
      : [{ description:'', quantity:'', unit:'SQM', rate:'', remarks:'' }]
  );
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const vendor = (vendors || []).find(v => String(v.id) === String(form.vendor_id));
  const project = (projects || []).find(p => String(p.id) === String(form.project_id));

  const formTotal  = items.reduce((s, it) => s + parseFloat(it.quantity||0) * parseFloat(it.rate||0), 0);
  const gstAmt     = formTotal * (parseFloat(form.gst_pct||0) / 100);
  const grandTotal = formTotal + gstAmt;
  const retentionAmt = formTotal * (parseFloat(form.retention_pct||0) / 100);
  const tdsAmt       = formTotal * (parseFloat(form.tds_pct||0) / 100);

  const durationDays = form.start_date && form.end_date
    ? Math.max(0, dayjs(form.end_date).diff(dayjs(form.start_date), 'day'))
    : null;

  const valid = form.project_id && form.vendor_id && form.subject;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-slate-50 w-full max-w-5xl rounded-2xl flex flex-col max-h-[94vh] shadow-2xl overflow-hidden border border-slate-200">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center">
              <Hammer className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-base font-bold text-white">{isEditing ? `Edit Work Order — ${editingWO.wo_number}` : 'New Work Order'}</p>
              <p className="text-xs text-white/60">{isEditing ? 'Edit draft details before submitting for approval' : 'Procurement · engage a contractor for works & services'}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all">
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* ── 1. Work Order Information ── */}
          <FormSection icon={ClipboardList} title="Work Order Information" subtitle="Project, reference & contractor">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="col-span-2">
                <Lbl req>Project</Lbl>
                <select className={inp} value={form.project_id} onChange={e => f('project_id', e.target.value)}>
                  <option value="">Select project…</option>
                  {(projects||[]).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <Lbl>WO Number</Lbl>
                <div className="relative">
                  <Hash className="w-3.5 h-3.5 text-slate-300 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  {isEditing
                    ? <input className={`${inp} pl-8 font-mono text-indigo-700`} value={form.wo_number} onChange={e => f('wo_number', e.target.value)} />
                    : <input className={`${inp} pl-8 bg-slate-100 font-mono text-indigo-700`} value={form.wo_number || 'Auto WO-###'} readOnly />
                  }
                </div>
              </div>
              <div>
                <Lbl>WO Date</Lbl>
                <input type="date" className={inp} value={form.wo_date} onChange={e => f('wo_date', e.target.value)} />
              </div>
              <div className="col-span-2 md:col-span-2">
                <Lbl req>Contractor / Vendor</Lbl>
                <select className={inp} value={form.vendor_id} onChange={e => f('vendor_id', e.target.value)}>
                  <option value="">Select contractor…</option>
                  {(vendors||[]).map(v => <option key={v.id} value={v.id}>{v.name}{v.vendor_type ? ` · ${v.vendor_type.replace(/_/g,' ')}` : ''}</option>)}
                </select>
              </div>
              <div>
                <Lbl>Work Category</Lbl>
                <select className={inp} value={form.work_category} onChange={e => f('work_category', e.target.value)}>
                  <option value="">Select…</option>
                  {WORK_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <Lbl>Cost Head</Lbl>
                <input className={inp} placeholder="e.g. Civil Works" value={form.cost_head} onChange={e => f('cost_head', e.target.value)} />
              </div>
            </div>

            {/* Vendor auto-detail card */}
            {vendor && (
              <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/50 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Building2 className="w-4 h-4 text-indigo-600" />
                  <p className="text-sm font-bold text-slate-800">{vendor.name}</p>
                  {vendor.vendor_type && <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">{vendor.vendor_type.replace(/_/g,' ')}</span>}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  {vendor.contact_person && <div className="flex items-center gap-1.5 text-slate-600"><User className="w-3.5 h-3.5 text-slate-400" /> {vendor.contact_person}</div>}
                  {vendor.phone && <div className="flex items-center gap-1.5 text-slate-600"><Phone className="w-3.5 h-3.5 text-slate-400" /> {vendor.phone}</div>}
                  {vendor.email && <div className="flex items-center gap-1.5 text-slate-600 truncate"><Mail className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" /> {vendor.email}</div>}
                  {vendor.gstin && <div className="flex items-center gap-1.5 text-slate-600"><FileText className="w-3.5 h-3.5 text-slate-400" /> <span className="font-mono">{vendor.gstin}</span></div>}
                  {(vendor.address || vendor.city) && <div className="col-span-2 md:col-span-4 flex items-start gap-1.5 text-slate-600"><MapPin className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" /> <span>{[vendor.address, vendor.city, vendor.state].filter(Boolean).join(', ')}</span></div>}
                </div>
              </div>
            )}
          </FormSection>

          {/* ── 2. Scope & Location ── */}
          <FormSection icon={MapPin} title="Scope & Location" subtitle="What work, where">
            <div className="grid grid-cols-2 md:grid-cols-2 gap-4">
              <div className="col-span-2 md:col-span-1">
                <Lbl req>Subject / Title of Work</Lbl>
                <input className={inp} placeholder="e.g. Supply & erection of structural steel – Tower A" value={form.subject} onChange={e => f('subject', e.target.value)} />
              </div>
              <div className="col-span-2 md:col-span-1">
                <Lbl>Tower / Block / Location</Lbl>
                <input className={inp} placeholder="e.g. Tower A / Block 1 / Basement" value={form.tower_block} onChange={e => f('tower_block', e.target.value)} />
              </div>
              <div className="col-span-2">
                <Lbl>Detailed Scope of Work</Lbl>
                <textarea rows={3} className={inp} placeholder="Describe the full scope, deliverables, specifications, materials in scope / out of scope…" value={form.scope_of_work} onChange={e => f('scope_of_work', e.target.value)} />
              </div>
            </div>
          </FormSection>

          {/* ── 3. Execution Timeline ── */}
          <FormSection icon={Calendar} title="Execution Timeline"
            right={durationDays != null && <span className="text-[11px] font-semibold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full">{durationDays} days duration</span>}>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <Lbl>Start Date</Lbl>
                <input type="date" className={inp} value={form.start_date} onChange={e => f('start_date', e.target.value)} />
              </div>
              <div>
                <Lbl>Completion Date</Lbl>
                <input type="date" className={inp} value={form.end_date} onChange={e => f('end_date', e.target.value)} />
              </div>
              <div className="flex items-end">
                <div className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-500">
                  {durationDays != null ? <><span className="font-semibold text-slate-700">{durationDays}</span> calendar days</> : 'Set both dates to see duration'}
                </div>
              </div>
            </div>
          </FormSection>

          {/* ── 4. Scope of Work / BOQ Items ── */}
          <FormSection icon={Package} title="Scope of Work — Line Items" subtitle="Itemised work with quantities & rates"
            right={
              <button onClick={() => setItems(p => [...p, { description:'', quantity:'', unit:'SQM', rate:'', remarks:'' }])}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition-all shadow-sm">
                <Plus className="w-3 h-3" /> Add Item
              </button>
            }>
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="pb-2 px-1 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider w-8">#</th>
                    <th className="pb-2 px-1 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Description of Work</th>
                    <th className="pb-2 px-1 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider w-24">Unit</th>
                    <th className="pb-2 px-1 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider w-24">Qty</th>
                    <th className="pb-2 px-1 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider w-32">Rate (₹)</th>
                    <th className="pb-2 px-1 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider w-32">Amount</th>
                    <th className="pb-2 px-1 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, i) => (
                    <tr key={i} className="border-b border-slate-50">
                      <td className="px-1 py-1.5 text-xs text-slate-400 font-mono">{i + 1}</td>
                      <td className="px-1 py-1.5">
                        <input className={inp} placeholder="Description of work item" value={it.description}
                          onChange={e => setItems(p => p.map((x,j) => j===i?{...x,description:e.target.value}:x))} />
                      </td>
                      <td className="px-1 py-1.5">
                        <select className={inp} value={it.unit} onChange={e => setItems(p => p.map((x,j) => j===i?{...x,unit:e.target.value}:x))}>
                          {UNITS.map(u => <option key={u}>{u}</option>)}
                        </select>
                      </td>
                      <td className="px-1 py-1.5">
                        <input type="number" min="0" className={`${inp} text-right`} placeholder="0" value={it.quantity}
                          onChange={e => setItems(p => p.map((x,j) => j===i?{...x,quantity:e.target.value}:x))} />
                      </td>
                      <td className="px-1 py-1.5">
                        <input type="number" min="0" className={`${inp} text-right`} placeholder="0.00" value={it.rate}
                          onChange={e => setItems(p => p.map((x,j) => j===i?{...x,rate:e.target.value}:x))} />
                      </td>
                      <td className="px-1 py-1.5">
                        <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono text-right text-slate-700 font-semibold">
                          {inr(parseFloat(it.quantity||0)*parseFloat(it.rate||0))}
                        </div>
                      </td>
                      <td className="px-1 py-1.5">
                        <button onClick={() => setItems(p => p.filter((_,j) => j!==i))} disabled={items.length===1}
                          className="w-9 h-9 flex items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:text-red-500 hover:border-red-200 transition-all disabled:opacity-30">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </FormSection>

          {/* ── 5. Commercial & Tax Terms ── */}
          <FormSection icon={Percent} title="Commercial & Tax Terms">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <Lbl>GST %</Lbl>
                <input type="number" min="0" max="100" className={inp} value={form.gst_pct} onChange={e => f('gst_pct', e.target.value)} />
              </div>
              <div>
                <Lbl>TDS %</Lbl>
                <input type="number" min="0" max="100" className={inp} value={form.tds_pct} onChange={e => f('tds_pct', e.target.value)} />
              </div>
              <div>
                <Lbl>Retention %</Lbl>
                <input type="number" min="0" max="100" className={inp} value={form.retention_pct} onChange={e => f('retention_pct', e.target.value)} />
              </div>
              <div>
                <Lbl>Advance Recovery %</Lbl>
                <input type="number" min="0" max="100" className={inp} value={form.advance_recovery_pct} onChange={e => f('advance_recovery_pct', e.target.value)} />
              </div>
            </div>

            {/* Commercial summary */}
            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Work Value</p>
                <p className="text-sm font-mono font-bold text-slate-800">₹{inr(formTotal)}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">GST ({form.gst_pct||0}%)</p>
                <p className="text-sm font-mono font-bold text-slate-800">₹{inr(gstAmt)}</p>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600 mb-1">Retention ({form.retention_pct||0}%)</p>
                <p className="text-sm font-mono font-bold text-amber-700">₹{inr(retentionAmt)}</p>
              </div>
              <div className="rounded-xl border-2 border-indigo-300 bg-indigo-600 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-100 mb-1">Grand Total</p>
                <p className="text-base font-mono font-bold text-white">₹{inr(grandTotal)}</p>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-slate-400">TDS deduction on payment ≈ <span className="font-mono">₹{inr(tdsAmt)}</span> ({form.tds_pct||0}% of work value).</p>
          </FormSection>

          {/* ── 6. Terms & Conditions ── */}
          <FormSection icon={FileText} title="Terms & Conditions" subtitle="Edit per work order before issuing">
            <textarea
              rows={12}
              className={clsx(inp, 'h-auto py-3 font-mono text-xs leading-relaxed resize-y')}
              value={form.terms_conditions}
              onChange={e => f('terms_conditions', e.target.value)}
            />
          </FormSection>
        </div>

        {/* ── Footer ── */}
        <div className="px-6 py-4 border-t border-slate-200 bg-white flex-shrink-0 flex items-center justify-between gap-3">
          <div className="text-xs text-slate-500">
            {project && <span className="font-medium text-slate-700">{project.name}</span>}
            {vendor && <span> · {vendor.name}</span>}
            <span className="ml-2 font-mono font-bold text-indigo-700">₹{inr(grandTotal)}</span>
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-5 py-2.5 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50">Cancel</button>
            <button
              onClick={() => {
                const payload = { ...form, items, total_value: formTotal };
                if (isEditing) onUpdate(payload);
                else onCreate(payload);
              }}
              disabled={!valid || isPending}
              className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 shadow-sm transition-all flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" /> {isPending ? 'Saving…' : isEditing ? 'Save Changes' : 'Issue Work Order'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── WO Detail Panel — Full-Screen Modal ────────────────────────────────── */
function WODetailPanel({ wo, onClose, onEdit, onDelete, onApprove, onMDApprove, onReject, isApproving, isMDApproving, isRejecting, user }) {
  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['work-order-detail', wo?.id],
    queryFn: () => subcontractorAPI.getWorkOrder(wo.id).then(r => r.data),
    enabled: !!wo?.id,
  });

  const printZoneRef = React.useRef(null);
  const displayWO = { ...wo, ...(detail || {}) };
  const lineItems = displayWO.items || [];
  const val     = Number(displayWO.total_value || displayWO.contract_amount || 0);
  const billed  = Number(displayWO.total_billed || 0);
  const paid    = Number(displayWO.total_paid || 0);
  const balance = Math.max(val - billed, 0);
  const liveStatus  = displayWO.status;
  const currentAction = WO_STAGE_ACTIONS.find(a => a.reqStatuses.includes(liveStatus));

  // ── Print in a new isolated window — same approach as Purchase Orders ─────
  const handlePrint = () => {
    if (!printZoneRef.current) return;
    const html = printZoneRef.current.innerHTML;
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) { window.print(); return; }           // fallback if popup blocked
    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>Work Order — ${displayWO.wo_number}</title>
  <style>
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; box-sizing: border-box; }
    body { margin: 0; padding: 0; background: white; font-family: Arial, sans-serif; }
    table { border-collapse: collapse; }
    thead { display: table-header-group; }
    tbody tr { page-break-inside: avoid; }
    .wo-items-table thead { display: table-header-group; }
    .wo-items-table tbody tr { page-break-inside: avoid; page-break-after: auto; }
    /* Signature strip fixed to bottom of every printed page */
    .wo-page-footer { position: fixed; bottom: 0; left: 0; right: 0; background: white; }
    /* Keep totals block together; let T&C flow naturally across pages */
    .wo-totals-block { page-break-inside: avoid; break-inside: avoid; }
    @page { size: A4 portrait; margin: 8mm 8mm 26mm 8mm; }
    @media print { body { margin: 0; } }
  </style>
</head>
<body>${html}</body>
</html>`);
    win.document.close();
    win.onload = () => { win.focus(); win.print(); win.close(); };
    setTimeout(() => { try { win.focus(); win.print(); win.close(); } catch(_) {} }, 1200);
  };

  const itemsTotal = lineItems.reduce((s, it) => s + Number(it.amount || (Number(it.quantity||0)*Number(it.rate||0))), 0);
  const utilPct    = val > 0 ? Math.min(100, (billed / val) * 100) : 0;

  return (
    <>
    {/* Full-window detail — same layout as Purchase Orders */}
    <div className="fixed inset-0 z-[60] bg-[#f4f6f9] flex flex-col overflow-hidden">

        {/* ── Full-window Header ── */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-slate-200 bg-white flex-shrink-0 shadow-sm">
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-900 font-medium hover:text-slate-900 hover:border-slate-300 transition-all mr-1">
              <X className="w-4 h-4" />
            </button>
            <div className="w-9 h-9 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center">
              <Hammer className="w-4 h-4 text-indigo-600" />
            </div>
            <div>
              <p className="text-base font-medium text-slate-900 font-mono">{displayWO.wo_number}</p>
              <p className="text-xs text-slate-900 font-medium mt-0.5">{displayWO.vendor_name || '—'} · {displayWO.start_date ? dayjs(displayWO.start_date).format('DD MMM YYYY') : (displayWO.created_at ? dayjs(displayWO.created_at).format('DD MMM YYYY') : '—')}</p>
            </div>
            <StatusBadge status={liveStatus} />
          </div>
          <div className="flex items-center gap-2">
            {/* KPI pills in header */}
            <div className="hidden md:flex items-center gap-1 mr-4">
              {[
                { label: 'Contract Value', value: `₹${inr(val)}`,     color: 'text-slate-700' },
                { label: 'Billed',         value: `₹${inr(billed)}`,  color: 'text-indigo-600' },
                { label: 'Balance',        value: `₹${inr(balance)}`, color: balance > 0 ? 'text-amber-600 font-extrabold' : 'text-emerald-600 font-extrabold' },
              ].map((k, i) => (
                <div key={i} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg">
                  <span className="text-[10px] text-slate-900 font-medium uppercase tracking-wider">{k.label}</span>
                  <span className={clsx('text-sm font-bold', k.color)}>{k.value}</span>
                </div>
              ))}
            </div>
            {['draft','pending'].includes(liveStatus) && onEdit && (
              <button onClick={() => onEdit({ ...wo, ...(detail || {}) })}
                className="flex items-center gap-1.5 px-3 h-8 rounded-lg border border-amber-300 bg-amber-50 text-amber-700 text-xs font-medium hover:bg-amber-100 transition-all">
                <Edit2 className="w-3.5 h-3.5" /> Edit WO
              </button>
            )}
            <button onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 h-8 rounded-lg border border-slate-200 text-xs font-medium text-slate-900 hover:border-slate-300 transition-all">
              <Printer className="w-3.5 h-3.5" /> Print
            </button>
            <button
              onClick={() => { if (window.confirm(`Delete Work Order ${wo.wo_number}? This cannot be undone.`)) { onDelete(wo.id); } }}
              className="flex items-center gap-1.5 px-3 h-8 rounded-lg bg-white border border-red-200 text-red-600 text-xs font-medium hover:bg-red-50 transition-all">
              <X className="w-3.5 h-3.5" /> Delete
            </button>
          </div>
        </div>

        {/* ── Two-column Body ── */}
        <div className="flex-1 overflow-hidden flex">

          {/* LEFT — WO details + line items */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4 border-r border-slate-200">

          {/* Info grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              ['Vendor / Sub-Con', displayWO.vendor_name || '—'],
              ['Project',          displayWO.project_name || '—'],
              ['Start Date',       displayWO.start_date ? dayjs(displayWO.start_date).format('DD MMM YYYY') : '—'],
              ['End Date',         displayWO.end_date   ? dayjs(displayWO.end_date).format('DD MMM YYYY')   : '—'],
              ['Contract Amount',  `₹ ${inr(displayWO.contract_amount || val)}`],
              ['Work Category',    displayWO.work_category || '—'],
              ['Cost Head',        displayWO.cost_head || '—'],
              ['Tower / Block',    displayWO.tower_block || '—'],
              ['Vendor Type',      displayWO.vendor_type || '—'],
              ['Vendor GSTIN',     displayWO.vendor_gstin || '—'],
              ['Manager',          displayWO.manager_name || '—'],
              ['Created',          displayWO.created_at ? dayjs(displayWO.created_at).format('DD MMM YYYY') : '—'],
            ].map(([label, value]) => (
              <div key={label} className="bg-white border border-slate-200 rounded-lg p-3">
                <p className="text-xs text-slate-900 font-medium uppercase tracking-wider mb-1">{label}</p>
                <p className="text-sm font-medium text-slate-800 break-words">{value}</p>
              </div>
            ))}
          </div>

          {/* Line items */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
              <Package className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-xs font-medium text-slate-900 uppercase tracking-wider">BOQ Line Items</span>
              <span className="ml-auto text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100">
                {detailLoading ? '…' : `${lineItems.length} item${lineItems.length !== 1 ? 's' : ''}`}
              </span>
            </div>
            {detailLoading ? (
              <div className="flex justify-center py-8">
                <div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : lineItems.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-400">No BOQ items added for this work order.</div>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100">
                    {['#', 'Description', 'Unit', 'WO Qty', 'Billed', 'Balance', 'Rate', 'Amount'].map(h => (
                      <th key={h} className="px-3 py-2 text-left font-medium text-slate-900 uppercase tracking-wider bg-slate-50 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {lineItems.map((item, idx) => {
                    const qty       = Number(item.quantity   || 0);
                    const billedQty = Number(item.billed_qty || 0);
                    const remQty    = Number(item.remaining_qty ?? Math.max(qty - billedQty, 0));
                    const rate      = Number(item.rate   || 0);
                    const amount    = Number(item.amount || qty * rate);
                    const billedPct = qty > 0 ? Math.round((billedQty / qty) * 100) : 0;
                    return (
                      <tr key={item.id || idx} className="hover:bg-slate-50 transition-colors">
                        <td className="px-3 py-2.5 text-slate-900 font-medium font-mono">{idx + 1}</td>
                        <td className="px-3 py-2.5 font-medium text-slate-800 max-w-[280px]">
                          {item.description || `Item ${idx + 1}`}
                          {item.remarks && <div className="text-[11px] text-slate-500 mt-0.5 font-normal">{item.remarks}</div>}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-900 border border-slate-200 font-medium uppercase">{item.unit || 'LS'}</span>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-right text-slate-700">{qty.toLocaleString('en-IN', { maximumFractionDigits: 3 })}</td>
                        <td className="px-3 py-2.5 font-mono text-right">
                          <span className="font-semibold text-emerald-700">{billedQty.toLocaleString('en-IN', { maximumFractionDigits: 3 })}</span>
                          {billedPct > 0 && <span className="text-[9px] text-emerald-500 ml-1">({billedPct}%)</span>}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-right">
                          <span className={clsx('font-semibold', remQty > 0 ? 'text-amber-600' : 'text-slate-400')}>
                            {remQty.toLocaleString('en-IN', { maximumFractionDigits: 3 })}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-right text-slate-600">{inr(rate)}</td>
                        <td className="px-3 py-2.5 font-mono text-right font-semibold text-slate-800">{inr(amount)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 bg-slate-50">
                    <td colSpan={7} className="px-3 py-2.5 text-right text-xs font-medium text-slate-700 uppercase tracking-wider">Total</td>
                    <td className="px-3 py-2.5 text-right font-mono text-sm font-bold text-indigo-700">{inr(itemsTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>

          {/* Scope of Work */}
          {(displayWO.scope_of_work || displayWO.work_description) && (
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs font-medium text-slate-900 uppercase tracking-wider mb-2">Scope of Work</p>
              <p className="text-sm text-slate-600 whitespace-pre-line leading-relaxed">
                {displayWO.scope_of_work || displayWO.work_description}
              </p>
            </div>
          )}

          {/* Terms & Conditions */}
          {wo.terms_conditions && (
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs font-medium text-slate-900 uppercase tracking-wider mb-2">Terms &amp; Conditions</p>
              <p className="text-sm text-slate-600 whitespace-pre-line leading-relaxed">{wo.terms_conditions}</p>
            </div>
          )}

          </div>{/* end left column */}

          {/* RIGHT column — billing summary + approval + action */}
          <div className="w-[420px] xl:w-[480px] flex-shrink-0 overflow-y-auto p-6 space-y-4 bg-[#f4f6f9]">

          {/* ── Billing Summary ─────────────────────────────────── */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
              <IndianRupee className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-xs font-medium text-slate-900 uppercase tracking-wider">Billing Summary</span>
            </div>
            <div className="grid grid-cols-3 gap-px bg-slate-100 border-b border-slate-100">
              {[
                { label: 'Billed',  value: inr(billed),  color: 'text-indigo-600' },
                { label: 'Paid',    value: inr(paid),    color: 'text-emerald-600' },
                { label: 'Balance', value: inr(balance), color: balance > 0 ? 'text-amber-600' : 'text-emerald-600' },
              ].map((k, i) => (
                <div key={i} className="bg-white p-3 text-center">
                  <p className="text-[10px] text-slate-900 font-medium mb-0.5">{k.label}</p>
                  <p className={clsx('text-xs font-bold', k.color)}>{k.value}</p>
                </div>
              ))}
            </div>
            {/* Utilisation bar */}
            {val > 0 && (
              <div className="px-4 pb-4 pt-3">
                <div className="flex justify-between text-[10px] text-slate-900 font-medium mb-1">
                  <span>WO Utilisation</span>
                  <span className="font-medium text-slate-600">{utilPct.toFixed(1)}% of ₹{inr(val)}</span>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={clsx('h-full rounded-full transition-all', billed > val ? 'bg-red-500' : 'bg-indigo-500')}
                    style={{ width: `${utilPct}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Approval pipeline */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-xs font-medium text-slate-900 uppercase tracking-wider">Approval Pipeline</span>
            </div>
            <div className="p-4">
              <div className="relative">
                <div className="absolute bg-slate-200 left-[17px] top-5" style={{ width: 1, height: 'calc(100% - 40px)' }} />
                <div className="space-y-3">
                  {WO_STAGE_ACTIONS.map((stage, idx) => {
                    const curStage = WO_STATUS_STAGE[liveStatus] ?? 1;
                    const isDone   = curStage > idx + 1;
                    const isActive = curStage === idx + 1;
                    return (
                      <div key={stage.id} className="flex items-start gap-3 relative">
                        <div className={clsx(
                          'w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 z-10 border-2 mt-0.5',
                          isDone   ? 'bg-emerald-500 border-emerald-500' :
                          isActive ? 'bg-indigo-600 border-indigo-600'   :
                                     'bg-white border-slate-200'
                        )}>
                          {isDone
                            ? <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                            : <span className={clsx('text-xs font-bold', isActive ? 'text-white' : 'text-slate-400')}>{idx + 1}</span>}
                        </div>
                        <div className="flex-1 min-w-0 pt-1.5">
                          <p className={clsx('text-xs font-semibold',
                            isDone ? 'text-slate-500 line-through' : isActive ? 'text-slate-900' : 'text-slate-400'
                          )}>{stage.label}</p>
                        </div>
                        {isDone   && <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100 mt-1.5">Done</span>}
                        {isActive && <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100 animate-pulse mt-1.5">Pending</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Action panel */}
          {currentAction && (() => {
            const authorized = canApproveWOStage(currentAction.id, user);
            return (
              <div className={clsx('border rounded-xl p-4 space-y-3', authorized ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200')}>
                <div className="flex items-center gap-3">
                  <div className={clsx('w-9 h-9 rounded-lg border flex items-center justify-center', authorized ? 'bg-emerald-100 border-emerald-200' : 'bg-slate-100 border-slate-200')}>
                    <CheckCircle2 className={clsx('w-4 h-4', authorized ? 'text-emerald-600' : 'text-slate-400')} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">{authorized ? 'Action Required' : 'Awaiting Authorization'}</p>
                    <p className={clsx('text-xs font-medium', authorized ? 'text-emerald-700' : 'text-slate-500')}>
                      {authorized ? `${currentAction.label} — click to authorize` : `${WO_STAGE_LABELS[currentAction.id]} — not your approval level`}
                    </p>
                  </div>
                </div>
                {authorized ? (
                  <div className="flex gap-3">
                    <button
                      onClick={() => currentAction.id === 'procurement-approve' ? onApprove(wo.id) : onMDApprove(wo.id)}
                      disabled={isApproving || isMDApproving}
                      className="flex-[2] h-9 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {(isApproving || isMDApproving) ? 'Processing…' : currentAction.label}
                    </button>
                    <button
                      onClick={() => onReject(wo.id)}
                      disabled={isRejecting}
                      className="flex-1 h-9 rounded-lg bg-white border border-red-200 text-red-600 text-xs font-medium hover:bg-red-50 transition-colors disabled:opacity-50">
                      {isRejecting ? '…' : 'Reject'}
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic px-1">
                    This WO is waiting for the {WO_STAGE_LABELS[currentAction.id]} team to act.
                  </p>
                )}
              </div>
            );
          })()}

          </div>{/* end right column */}
        </div>{/* end two-column body */}

        {/* Attachments */}
        <div className="px-6 py-4 border-t border-slate-100 bg-white">
          <RecordAttachments
            module="work_order"
            recordId={wo.id}
            projectId={wo.project_id}
            label="WO Attachments — Contracts, Site Photos, BOQ"
          />
        </div>
    </div>

    {/* Hidden print zone — content captured via ref, printed in new window */}
    <div ref={printZoneRef} style={{ display: 'none' }} aria-hidden="true">
      <WOPrintTemplate data={displayWO} />
    </div>
    </>
  );
}

/* ── Main Page ─────────────────────────────────────────────────────────── */
export default function WorkOrderPage() {
  const user = useAuthStore(s => s.user);
  const [showCreate,     setShowCreate]     = useState(false);
  const [showPdfImport,  setShowPdfImport]  = useState(false);
  const [showExcelImport,setShowExcelImport]= useState(false);
  const [selectedWO,     setSelectedWO]     = useState(null);
  const [editingWO,      setEditingWO]      = useState(null);
  const [attachWOId,     setAttachWOId]     = useState(null);
  const [search,         setSearch]         = useState('');
  const [filterStatus,   setFilterStatus]   = useState('');
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const { data: woData = [], isLoading } = useQuery({
    queryKey: ['work-orders'],
    queryFn: () => subcontractorAPI.listWorkOrders().then(r => r.data?.data ?? []),
  });

  const { data: vendorsData = [] } = useQuery({
    queryKey: ['vendors'],
    queryFn: () => vendorAPI.list().then(r => r.data?.data ?? []),
  });

  const { data: projectsData = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectAPI.list().then(r => r.data?.data ?? []),
  });

  // Auto-open WO when navigated from Approvals dashboard (?view=<id>)
  useEffect(() => {
    const viewId = searchParams.get('view');
    if (!viewId || !woData.length) return;
    const found = woData.find(w => w.id === viewId);
    if (found) {
      setSelectedWO(found);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, woData]);

  const createMutation = useMutation({
    mutationFn: d => subcontractorAPI.createWorkOrder(d),
    onSuccess: () => {
      toast.success('Work Order issued successfully');
      setShowCreate(false);
      qc.invalidateQueries({ queryKey: ['work-orders'] });
    },
    onError: e => toast.error(e?.response?.data?.error || 'Failed to issue Work Order'),
  });

  const deleteMutation = useMutation({
    mutationFn: id => subcontractorAPI.deleteWorkOrder(id),
    onSuccess: () => {
      toast.success('Work Order deleted');
      setSelectedWO(null);
      qc.invalidateQueries({ queryKey: ['work-orders'] });
    },
    onError: e => toast.error(e?.response?.data?.error || 'Failed to delete Work Order'),
  });

  const approveMutation = useMutation({
    mutationFn: id => subcontractorAPI.approveWorkOrder(id),
    onSuccess: () => {
      toast.success('Work Order procurement approved');
      qc.invalidateQueries({ queryKey: ['work-orders'] });
    },
    onError: e => toast.error(e?.response?.data?.error || 'Approval failed'),
  });

  const mdApproveMutation = useMutation({
    mutationFn: id => subcontractorAPI.mdApproveWorkOrder(id),
    onSuccess: () => {
      toast.success('Work Order MD authorized');
      setSelectedWO(null);
      qc.invalidateQueries({ queryKey: ['work-orders'] });
    },
    onError: e => toast.error(e?.response?.data?.error || 'MD approval failed'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => subcontractorAPI.updateWorkOrder(id, data),
    onSuccess: () => {
      toast.success('Work Order updated');
      setEditingWO(null);
      qc.invalidateQueries({ queryKey: ['work-orders'] });
      qc.invalidateQueries({ queryKey: ['work-order-detail', selectedWO?.id] });
    },
    onError: e => toast.error(e?.response?.data?.error || 'Failed to update Work Order'),
  });

  const rejectMutation = useMutation({
    mutationFn: id => subcontractorAPI.rejectWorkOrder(id),
    onSuccess: () => {
      toast.success('Work Order rejected');
      setSelectedWO(null);
      qc.invalidateQueries({ queryKey: ['work-orders'] });
    },
    onError: e => toast.error(e?.response?.data?.error || 'Rejection failed'),
  });

  const allWOs = woData;
  const filtered = allWOs.filter(wo => {
    const matchSearch = !search || `${wo.wo_number} ${wo.vendor_name||''} ${wo.project_name||''} ${wo.subject||''}`.toLowerCase().includes(search.toLowerCase());
    const matchStatus = !filterStatus || wo.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const totalValue    = allWOs.reduce((s, w) => s + parseFloat(w.total_value || 0), 0);
  const approvedCount = allWOs.filter(w => w.status === 'approved').length;
  const pendingCount  = allWOs.filter(w => w.status === 'pending').length;

  const refresh = () => qc.invalidateQueries({ queryKey: ['work-orders'] });

  return (
    <div className="min-h-screen bg-slate-50">

      {/* ── Page Header ── */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-1.5 text-xs text-slate-900 font-medium mb-1">
              <Hammer className="w-3.5 h-3.5" />
              <span>Procurement</span>
              <ChevronRight className="w-3 h-3" />
              <span className="text-slate-900 font-medium">Work Orders</span>
            </div>
            <h1 className="text-2xl font-medium text-slate-900 tracking-tight">Work Orders</h1>
            <p className="text-sm text-slate-900 font-medium mt-0.5">Subcontractor & labour work order management</p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => setShowPdfImport(true)}
              className="flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-200 text-slate-900 text-sm font-medium rounded-lg hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm">
              <FileText className="w-3.5 h-3.5" /> Import PDF
            </button>
            <button onClick={() => setShowExcelImport(true)}
              className="flex items-center gap-2 px-3.5 py-2 bg-white border border-emerald-200 text-emerald-700 text-sm font-medium rounded-lg hover:bg-emerald-50 transition-all shadow-sm">
              <FileSpreadsheet className="w-3.5 h-3.5" /> Import Excel
            </button>
            <button onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg shadow-sm transition-all">
              <Plus className="w-3.5 h-3.5" /> New Work Order
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">

        {/* ── KPI Cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total WOs',     value: allWOs.length,   accent: 'border-indigo-500',  bg: 'bg-indigo-50',  text: 'text-indigo-700',  icon: FileText },
            { label: 'Total Value',   value: `₹${inr(totalValue)}`, accent: 'border-blue-500', bg: 'bg-blue-50', text: 'text-blue-700', icon: IndianRupee },
            { label: 'Pending Appvl', value: pendingCount,    accent: 'border-amber-500',   bg: 'bg-amber-50',   text: 'text-amber-700',   icon: Clock },
            { label: 'Approved',      value: approvedCount,   accent: 'border-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-700', icon: CheckCircle2 },
          ].map(({ label, value, accent, bg, text, icon: Icon }) => (
            <div key={label} className={`bg-white border border-slate-200 rounded-xl p-4 shadow-sm border-l-4 ${accent}`}>
              <div className={`inline-flex items-center justify-center w-8 h-8 rounded-lg ${bg} mb-2`}>
                <Icon className={`w-4 h-4 ${text}`} />
              </div>
              <div className={`text-xl font-medium font-mono ${text}`}>{value}</div>
              <div className="text-xs text-slate-900 font-medium mt-0.5">{label}</div>
            </div>
          ))}
        </div>

        {/* ── Search + Filter Bar ── */}
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-center gap-3 shadow-sm">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search WO number, vendor, project…"
              className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-4 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all placeholder:text-slate-400" />
          </div>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-400 transition-all">
            <option value="">All Status</option>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <button onClick={refresh} className="p-2 text-slate-900 font-medium hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-all" title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </button>
          <span className="text-xs text-slate-900 font-medium shrink-0">{filtered.length} of {allWOs.length}</span>
        </div>

        {/* ── Table ── */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  {['WO Number', 'Subject', 'Vendor / Sub-Con', 'Project', 'Date', 'Value', 'Status', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-medium text-slate-900 font-medium uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i} className="border-b border-slate-100">
                      {[...Array(8)].map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 bg-slate-100 rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : filtered.map(wo => (
                  <React.Fragment key={wo.id}>
                  <tr onClick={() => setSelectedWO(wo)}
                    className="border-b border-slate-100 last:border-0 cursor-pointer hover:bg-slate-50 transition-colors group">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center flex-shrink-0">
                          <Hammer className="w-3.5 h-3.5 text-indigo-500" />
                        </div>
                        <span className="text-xs font-medium font-mono text-indigo-700 group-hover:underline">{wo.wo_number}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 max-w-[200px]">
                      <p className="text-xs text-slate-900 truncate">{wo.subject || '—'}</p>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="text-xs font-medium text-slate-900 font-medium max-w-[140px] truncate">{wo.vendor_name || '—'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs text-slate-900 font-medium max-w-[140px] truncate">{wo.project_name || '—'}</p>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-500">
                      {wo.start_date ? dayjs(wo.start_date).format('DD MMM YYYY') : wo.created_at ? dayjs(wo.created_at).format('DD MMM YYYY') : '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-sm font-medium font-mono text-slate-800">₹{inr(wo.total_value)}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <StatusBadge status={wo.status} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setAttachWOId(attachWOId === wo.id ? null : wo.id)}
                          title="Attachments"
                          className={clsx(
                            'flex items-center gap-1 px-2 py-1 rounded-lg border text-xs font-medium transition-all',
                            attachWOId === wo.id
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-indigo-50 text-indigo-600 border-indigo-200 hover:bg-indigo-100 opacity-0 group-hover:opacity-100'
                          )}
                        >
                          <Upload className="w-3 h-3" />
                          {attachWOId === wo.id ? 'Close' : 'Attach'}
                        </button>
                        <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-500 transition-colors ml-auto" />
                      </div>
                    </td>
                  </tr>
                  {attachWOId === wo.id && (
                    <tr>
                      <td colSpan={8} className="px-6 pb-4 bg-indigo-50/30 border-b border-indigo-100">
                        <RecordAttachments
                          module="work_order"
                          recordId={wo.id}
                          projectId={wo.project_id}
                          label="WO Attachments — Contract Document, BOQ, Site Photos, Completion Certificate"
                        />
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                ))}

                {!isLoading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-20 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                          <Hammer className="w-5 h-5 text-slate-300" />
                        </div>
                        <p className="text-sm font-medium text-slate-400">
                          {search || filterStatus ? 'No work orders match your filters' : 'No work orders yet'}
                        </p>
                        {(search || filterStatus) ? (
                          <button onClick={() => { setSearch(''); setFilterStatus(''); }}
                            className="text-xs text-indigo-500 hover:underline font-semibold">Clear filters</button>
                        ) : (
                          <button onClick={() => setShowCreate(true)}
                            className="flex items-center gap-1.5 text-xs text-indigo-600 hover:underline font-semibold">
                            <Plus className="w-3.5 h-3.5" /> Create your first Work Order
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {allWOs.length > 0 && (
            <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
              <span className="text-xs text-slate-400">{allWOs.length} work order{allWOs.length !== 1 ? 's' : ''} total</span>
              <span className="text-xs font-medium font-mono text-slate-600">Total Value: ₹{inr(totalValue)}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Modals ── */}
      {showCreate && (
        <CreateWOModal
          onClose={() => setShowCreate(false)}
          vendors={vendorsData}
          projects={projectsData}
          onCreate={data => createMutation.mutate(data)}
          isPending={createMutation.isPending}
        />
      )}

      {showPdfImport && (
        <PdfImportModal
          onClose={() => setShowPdfImport(false)}
          vendors={vendorsData}
          projects={projectsData}
          onImported={refresh}
        />
      )}

      {showExcelImport && (
        <ExcelImportModal
          onClose={() => setShowExcelImport(false)}
          onImported={refresh}
        />
      )}

      {selectedWO && (
        <WODetailPanel
          wo={selectedWO}
          onClose={() => setSelectedWO(null)}
          onEdit={wo => setEditingWO(wo)}
          onDelete={id => deleteMutation.mutate(id)}
          onApprove={id => approveMutation.mutate(id)}
          onMDApprove={id => mdApproveMutation.mutate(id)}
          onReject={id => rejectMutation.mutate(id)}
          isApproving={approveMutation.isPending}
          isMDApproving={mdApproveMutation.isPending}
          isRejecting={rejectMutation.isPending}
          user={user}
        />
      )}

      {/* Edit WO modal */}
      {editingWO && (
        <CreateWOModal
          onClose={() => setEditingWO(null)}
          vendors={vendorsData}
          projects={projectsData}
          onUpdate={data => updateMutation.mutate({ id: editingWO.id, data })}
          isPending={updateMutation.isPending}
          editingWO={editingWO}
        />
      )}
    </div>
  );
}
