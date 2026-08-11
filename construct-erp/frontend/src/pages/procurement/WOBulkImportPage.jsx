// src/pages/procurement/WOBulkImportPage.jsx
// Bulk import historical Work Orders from scanned PDFs.
// Filenames encode WO number + vendor name: "WOTQS007-Ace Aquatech.pdf"
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { subcontractorAPI, vendorAPI, projectAPI } from '../../api/client';
import toast from 'react-hot-toast';
import {
  Upload, ChevronLeft, ChevronRight, CheckCircle2,
  SkipForward, AlertCircle, FileText, Loader2, Hammer, Sparkles,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useOCRExtract } from '../../hooks/useOCRExtract';

const inputCls = 'w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 transition-all';

function parseFilename(name) {
  const base = name.replace(/\.pdf$/i, '');
  const a1 = base.match(/^(WOTQS\d+(?:-A\d+)?)-(.+)$/i);
  if (a1) return { woNumber: a1[1].toUpperCase(), vendorName: a1[2].trim() };
  const dash = base.indexOf('-');
  if (dash > 0) return { woNumber: base.slice(0, dash).trim(), vendorName: base.slice(dash + 1).trim() };
  return { woNumber: base, vendorName: '' };
}

function normalizeWoNumber(value) {
  return String(value || '').trim().toUpperCase();
}

function matchVendor(vendors, name) {
  if (!name || !vendors?.length) return null;
  const n = name.toLowerCase();
  return (
    vendors.find(v => v.name?.toLowerCase() === n) ||
    vendors.find(v => v.name?.toLowerCase().includes(n)) ||
    vendors.find(v => n.includes(v.name?.toLowerCase()))
  );
}

const STATUSES = ['approved', 'draft', 'active', 'completed', 'terminated'];

export default function WOBulkImportPage() {
  const fileInputRef = useRef();

  const [step, setStep]           = useState('select');
  const [projectId, setProjectId] = useState('');
  const [queue, setQueue]         = useState([]);
  const [current, setCurrent]     = useState(0);
  const [saved, setSaved]         = useState([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult]       = useState(null);

  const { data: vendorsData }  = useQuery({ queryKey: ['vendors-all'], queryFn: () => vendorAPI.list({ limit: 500 }) });
  const { data: projectsData } = useQuery({ queryKey: ['projects-all'], queryFn: () => projectAPI.list() });
  const vendors  = vendorsData?.data?.data || vendorsData?.data || [];
  const projects = projectsData?.data?.data || projectsData?.data || [];

  const { extract, ocrLoading } = useOCRExtract();

  const handleAutoExtract = async () => {
    if (!curItem) return;
    toast('Scanning PDF… this takes ~15 seconds', { icon: '🔍' });
    const result = await extract(curItem.file);
    if (!result) { toast.error('Could not read PDF — please fill manually'); return; }
    const updates = {};
    if (result.date)   updates.wo_date      = result.date;
    if (result.amount) updates.total_value   = result.amount;
    if (Object.keys(updates).length) {
      setQueue(prev => prev.map((q, i) => i === current ? { ...q, form: { ...q.form, ...updates } } : q));
      toast.success(`Extracted: ${Object.keys(updates).join(', ')}`);
    } else {
      toast.error('Could not extract values — please fill manually');
    }
  };

  useEffect(() => () => queue.forEach(q => q.objectUrl && URL.revokeObjectURL(q.objectUrl)), [queue]);

  const handleFiles = useCallback((files) => {
    const pdfs = Array.from(files).filter(f => f.name.toLowerCase().endsWith('.pdf'));
    if (!pdfs.length) { toast.error('No PDF files found'); return; }

    const seen = new Set();
    const duplicates = [];
    const uniquePdfs = pdfs.filter(file => {
      const { woNumber, vendorName } = parseFilename(file.name);
      const key = normalizeWoNumber(woNumber);
      if (seen.has(key)) {
        duplicates.push(woNumber);
        return false;
      }
      seen.add(key);
      return true;
    });

    if (duplicates.length) {
      toast(`${duplicates.length} duplicate WO file${duplicates.length > 1 ? 's were' : ' was'} skipped`);
    }

    const items = uniquePdfs.map(file => {
      const { woNumber, vendorName } = parseFilename(file.name);
      const normalizedWoNumber = normalizeWoNumber(woNumber);
      const matched = matchVendor(vendors, vendorName);
      return {
        file,
        woNumber: normalizedWoNumber,
        vendorName,
        objectUrl: URL.createObjectURL(file),
        state: 'pending',
        form: {
          wo_number:   normalizedWoNumber,
          vendor_id:   matched?.id || '',
          wo_date:     '',
          start_date:  '',
          end_date:    '',
          total_value: '',
          subject:     vendorName,
          scope_of_work: '',
          status:      'approved',
        },
      };
    });
    setQueue(items);
    setCurrent(0);
  }, [vendors]);

  const curItem = queue[current];

  const setField = (key, val) => {
    setQueue(prev => prev.map((q, i) => i === current ? { ...q, form: { ...q.form, [key]: val } } : q));
  };

  const handleSaveNext = () => {
    const item = queue[current];
    if (!item.form.vendor_id)   { toast.error('Please select a vendor'); return; }
    if (!item.form.total_value) { toast.error('Please enter the Contract Value'); return; }

    setSaved(prev => [...prev.filter(s => s.wo_number !== item.form.wo_number), { ...item.form }]);
    setQueue(prev => prev.map((q, i) => i === current ? { ...q, state: 'saved' } : q));
    if (current < queue.length - 1) setCurrent(c => c + 1);
  };

  const handleSkip = () => {
    setQueue(prev => prev.map((q, i) => i === current ? { ...q, state: 'skipped' } : q));
    if (current < queue.length - 1) setCurrent(c => c + 1);
  };

  const handleImport = async () => {
    if (!projectId) { toast.error('Please select a project'); return; }
    if (!saved.length) { toast.error('No records to import'); return; }
    setImporting(true);
    try {
      const res = await subcontractorAPI.bulkImportWOs({ project_id: projectId, records: saved });
      setResult(res.data);
      setStep('done');
    } catch (e) {
      toast.error(e.response?.data?.error || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const savedCount   = queue.filter(q => q.state === 'saved').length;
  const skippedCount = queue.filter(q => q.state === 'skipped').length;
  const pendingCount = queue.filter(q => q.state === 'pending').length;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-600 flex items-center justify-center">
            <Hammer className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-medium text-slate-900">Bulk Import Work Orders</h1>
            <p className="text-xs text-slate-500">Import historical WOs from scanned PDFs — filename auto-fills WO# and vendor</p>
          </div>
        </div>
      </div>

      {/* Steps indicator */}
      <div className="bg-white border-b border-slate-100 px-6 py-2 flex items-center gap-6 text-xs font-medium">
        {[['select','1. Select Files'],['review','2. Review & Fill'],['done','3. Import']].map(([s, label]) => (
          <span key={s} className={clsx('pb-1.5 border-b-2 transition-colors',
            step === s ? 'border-amber-500 text-amber-600' : 'border-transparent text-slate-400')}>
            {label}
          </span>
        ))}
      </div>

      <div className="max-w-screen-xl mx-auto p-6">

        {/* STEP 1 */}
        {step === 'select' && (
          <div className="max-w-2xl mx-auto space-y-5">
            <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
              <label className="block text-sm font-medium text-slate-700">Select Project <span className="text-red-500">*</span></label>
              <select value={projectId} onChange={e => setProjectId(e.target.value)} className={inputCls}>
                <option value="">— Choose project —</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name} ({p.project_code})</option>)}
              </select>
            </div>

            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files); setStep('review'); }}
              className="bg-white rounded-xl border-2 border-dashed border-slate-300 p-14 text-center cursor-pointer hover:border-amber-400 hover:bg-amber-50 transition-all">
              <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-medium text-slate-700">Click to select WO PDFs  or drag &amp; drop</p>
              <p className="text-xs text-slate-900 font-medium mt-1">Filenames must follow WOTQS###-VendorName.pdf</p>
              <input ref={fileInputRef} type="file" multiple accept=".pdf" className="hidden"
                onChange={e => { handleFiles(e.target.files); if (e.target.files.length) setStep('review'); }} />
            </div>
          </div>
        )}

        {/* STEP 2 */}
        {step === 'review' && curItem && (
          <div className="flex gap-4 h-[calc(100vh-180px)]">

            {/* Queue list */}
            <div className="w-56 flex-shrink-0 bg-white rounded-xl border border-slate-200 overflow-y-auto">
              <div className="p-3 border-b border-slate-100 text-xs font-medium text-slate-900 font-medium uppercase tracking-wide">
                {queue.length} Files
              </div>
              {queue.map((q, i) => (
                <button key={i} onClick={() => setCurrent(i)}
                  className={clsx('w-full text-left px-3 py-2.5 text-xs flex items-center gap-2 transition-colors',
                    i === current ? 'bg-amber-50 text-amber-700 font-semibold' : 'text-slate-900 hover:bg-slate-50')}>
                  <span className={clsx('w-2 h-2 rounded-full flex-shrink-0',
                    q.state === 'saved' ? 'bg-emerald-500' : q.state === 'skipped' ? 'bg-slate-300' : 'bg-amber-400')} />
                  <span className="truncate">{q.woNumber}</span>
                </button>
              ))}
            </div>

            {/* PDF viewer */}
            <div className="flex-1 bg-white rounded-xl border border-slate-200 overflow-hidden">
              <iframe src={curItem.objectUrl} className="w-full h-full border-0" title="WO PDF" />
            </div>

            {/* Form */}
            <div className="w-80 flex-shrink-0 bg-white rounded-xl border border-slate-200 flex flex-col overflow-hidden">
              <div className="px-4 py-3 bg-slate-900 flex items-center justify-between flex-shrink-0">
                <div>
                  <p className="text-sm font-medium text-white">{curItem.woNumber}</p>
                  <p className="text-xs text-slate-400">{current + 1} / {queue.length}</p>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => setCurrent(c => Math.max(0, c - 1))} disabled={current === 0}
                    className="p-1.5 rounded-lg text-slate-900 font-medium hover:text-white disabled:opacity-30">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button onClick={() => setCurrent(c => Math.min(queue.length - 1, c + 1))} disabled={current === queue.length - 1}
                    className="p-1.5 rounded-lg text-slate-900 font-medium hover:text-white disabled:opacity-30">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex text-center text-xs flex-shrink-0">
                <div className="flex-1 py-1.5 bg-emerald-50 text-emerald-700 font-semibold">{savedCount} Saved</div>
                <div className="flex-1 py-1.5 bg-amber-50 text-amber-700 font-semibold">{pendingCount} Pending</div>
                <div className="flex-1 py-1.5 bg-slate-50 text-slate-900 font-medium font-semibold">{skippedCount} Skipped</div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">

                {/* Auto-Extract button */}
                <button onClick={handleAutoExtract} disabled={ocrLoading}
                  className="w-full bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white text-xs font-medium rounded-lg py-2 flex items-center justify-center gap-2">
                  {ocrLoading
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Scanning PDF (~15s)…</>
                    : <><Sparkles className="w-3.5 h-3.5" /> Auto-Extract Date &amp; Amount</>}
                </button>
                <p className="text-xs text-slate-900 font-medium text-center -mt-1">Reads the PDF using OCR — review &amp; correct after</p>

                <div>
                  <label className="block text-xs font-medium text-slate-900 font-medium mb-1">WO Number</label>
                  <input value={curItem.form.wo_number} onChange={e => setField('wo_number', e.target.value)} className={inputCls} />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-900 font-medium mb-1">Contractor / Vendor <span className="text-red-500">*</span></label>
                  {!curItem.form.vendor_id && (
                    <p className="text-xs text-amber-600 mb-1 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> "{curItem.vendorName}" not matched
                    </p>
                  )}
                  <select value={curItem.form.vendor_id} onChange={e => setField('vendor_id', e.target.value)} className={inputCls}>
                    <option value="">— Select vendor —</option>
                    {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-900 font-medium mb-1">WO Date</label>
                  <input type="date" value={curItem.form.wo_date} onChange={e => setField('wo_date', e.target.value)} className={inputCls} />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-900 font-medium mb-1">Start Date</label>
                    <input type="date" value={curItem.form.start_date} onChange={e => setField('start_date', e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-900 font-medium mb-1">End Date</label>
                    <input type="date" value={curItem.form.end_date} onChange={e => setField('end_date', e.target.value)} className={inputCls} />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-900 font-medium mb-1">Contract Value (₹) <span className="text-red-500">*</span></label>
                  <input type="number" value={curItem.form.total_value} onChange={e => setField('total_value', e.target.value)}
                    className={inputCls} placeholder="0.00" step="0.01" />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-900 font-medium mb-1">Subject / Work Description</label>
                  <input value={curItem.form.subject} onChange={e => setField('subject', e.target.value)} className={inputCls} />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-900 font-medium mb-1">Scope of Work</label>
                  <textarea rows={2} value={curItem.form.scope_of_work} onChange={e => setField('scope_of_work', e.target.value)}
                    className={inputCls} placeholder="Brief scope description…" />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-900 font-medium mb-1">Status</label>
                  <select value={curItem.form.status} onChange={e => setField('status', e.target.value)} className={inputCls}>
                    {STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex-shrink-0 p-4 border-t border-slate-100 space-y-2">
                <button onClick={handleSaveNext}
                  className="w-full bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg py-2.5 flex items-center justify-center gap-2">
                  <CheckCircle2 className="w-4 h-4" /> Save &amp; Next
                </button>
                <button onClick={handleSkip}
                  className="w-full bg-slate-100 hover:bg-slate-200 text-slate-900 text-sm font-medium rounded-lg py-2 flex items-center justify-center gap-2">
                  <SkipForward className="w-4 h-4" /> Skip
                </button>
                {savedCount > 0 && (
                  <button onClick={() => setStep('done')}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg py-2.5 flex items-center justify-center gap-2">
                    {savedCount} Records Ready → Review &amp; Import
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: Confirm */}
        {step === 'done' && !result && (
          <div className="max-w-xl mx-auto space-y-5">
            <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
              <h2 className="text-base font-medium text-black">Ready to Import</h2>

              <div className="grid grid-cols-3 gap-3">
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                  <div className="text-2xl font-medium text-emerald-600">{savedCount}</div>
                  <div className="text-xs text-emerald-700 font-medium">Ready</div>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-center">
                  <div className="text-2xl font-medium text-slate-400">{skippedCount}</div>
                  <div className="text-xs text-slate-900 font-medium font-medium">Skipped</div>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
                  <div className="text-2xl font-medium text-amber-600">{pendingCount}</div>
                  <div className="text-xs text-amber-700 font-medium">Not Filled</div>
                </div>
              </div>

              {!projectId && (
                <div>
                  <label className="block text-xs font-medium text-slate-900 font-medium mb-1">Project <span className="text-red-500">*</span></label>
                  <select value={projectId} onChange={e => setProjectId(e.target.value)} className={inputCls}>
                    <option value="">— Choose project —</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              )}

              <div className="max-h-64 overflow-y-auto border border-slate-100 rounded-lg divide-y divide-slate-50">
                {saved.map((r, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2 text-xs">
                    <span className="font-medium text-slate-700">{r.wo_number}</span>
                    <span className="text-slate-500">{vendors.find(v => v.id === r.vendor_id)?.name || '—'}</span>
                    <span className="font-medium text-slate-900">₹{Number(r.total_value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                ))}
              </div>

              <div className="flex gap-3">
                <button onClick={() => setStep('review')} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-900 text-sm font-medium rounded-lg py-2.5">
                  ← Back to Review
                </button>
                <button onClick={handleImport} disabled={importing || !projectId || !savedCount}
                  className="flex-1 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2.5 flex items-center justify-center gap-2">
                  {importing ? <><Loader2 className="w-4 h-4 animate-spin" /> Importing…</> : `Import ${savedCount} WOs to ERP`}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="max-w-xl mx-auto">
            <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                <div>
                  <h2 className="text-base font-medium text-black">Import Complete</h2>
                  <p className="text-xs text-slate-500">Work Orders have been saved to the ERP</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                  <div className="text-2xl font-medium text-emerald-600">{result.created}</div>
                  <div className="text-xs text-emerald-700 font-medium">Created</div>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-center">
                  <div className="text-2xl font-medium text-slate-400">{result.skipped}</div>
                  <div className="text-xs text-slate-900 font-medium font-medium">Skipped</div>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
                  <div className="text-2xl font-medium text-red-500">{result.errors?.length || 0}</div>
                  <div className="text-xs text-red-600 font-medium">Errors</div>
                </div>
              </div>
              {result.errors?.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-1">
                  {result.errors.map((e, i) => (
                    <p key={i} className="text-xs text-red-600">{e.wo_number}: {e.reason}</p>
                  ))}
                </div>
              )}
              <a href="/procurement/work-orders"
                className="block w-full text-center bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg py-2.5">
                Go to Work Orders →
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
