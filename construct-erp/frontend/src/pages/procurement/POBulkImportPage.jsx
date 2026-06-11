// src/pages/procurement/POBulkImportPage.jsx
// Bulk import historical Purchase Orders from scanned PDFs.
// Filenames encode PO number + vendor name: "POTQS042-Bhuwalka & Sons Pvt Ltd.pdf"
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { poAPI, vendorAPI, projectAPI, documentsAPI } from '../../api/client';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import {
  Upload, ChevronLeft, ChevronRight, CheckCircle2,
  SkipForward, AlertCircle, FileText, Loader2, Sparkles, Plus, Trash2,
  Download, TableIcon,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useOCRExtract } from '../../hooks/useOCRExtract';

const inputCls = 'w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 transition-all';
import { CONSTRUCTION_UNITS as UNITS } from '../../constants/units';
const STATUSES = ['approved','pending','part_received','fully_received','rejected'];

const BLANK_ITEM = () => ({ description: '', quantity: '', unit: 'LS', rate: '', gst_rate: '18' });

// ── Parse filename → { poNumber, vendorName }
function parseFilename(name) {
  const base = name.replace(/\.pdf$/i, '');
  const a1 = base.match(/^(POTQS\d+(?:-A\d+)?)-(.+)$/i);
  if (a1) return { poNumber: a1[1].toUpperCase(), vendorName: a1[2].trim() };
  const dash = base.indexOf('-');
  if (dash > 0) return { poNumber: base.slice(0, dash).trim(), vendorName: base.slice(dash + 1).trim() };
  return { poNumber: base, vendorName: '' };
}

// ── Fuzzy vendor match
function matchVendor(vendors, name) {
  if (!name || !vendors?.length) return null;
  const n = name.toLowerCase();
  return (
    vendors.find(v => v.name?.toLowerCase() === n) ||
    vendors.find(v => v.name?.toLowerCase().includes(n)) ||
    vendors.find(v => n.includes(v.name?.toLowerCase()))
  );
}

// ── Compute totals from items array
function computeTotals(items) {
  let subTotal = 0, totalGst = 0;
  for (const it of items) {
    const qty  = parseFloat(it.quantity) || 0;
    const rate = parseFloat(it.rate)     || 0;
    const gst  = parseFloat(it.gst_rate) || 0;
    const base = qty * rate;
    subTotal += base;
    totalGst += base * gst / 100;
  }
  return { subTotal, totalGst, grandTotal: subTotal + totalGst };
}

const inr = (v) => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

export default function POBulkImportPage() {
  const fileInputRef  = useRef();
  const excelInputRef = useRef();

  const [step, setStep]           = useState('select');
  const [projectId, setProjectId] = useState('');
  const [queue, setQueue]         = useState([]);
  const [current, setCurrent]     = useState(0);
  const [saved, setSaved]         = useState([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult]       = useState(null);

  const { data: vendorsData }  = useQuery({ queryKey: ['vendors-all'],  queryFn: () => vendorAPI.list({ limit: 500 }) });
  const { data: projectsData } = useQuery({ queryKey: ['projects-all'], queryFn: () => projectAPI.list() });
  const vendors  = vendorsData?.data?.data  || vendorsData?.data  || [];
  const projects = projectsData?.data?.data || projectsData?.data || [];

  const { extract, ocrLoading } = useOCRExtract();

  // ── Cleanup object URLs on unmount
  useEffect(() => () => queue.forEach(q => q.objectUrl && URL.revokeObjectURL(q.objectUrl)), [queue]);

  // ── File selection handler
  const handleFiles = useCallback((files) => {
    const pdfs = Array.from(files).filter(f => f.name.toLowerCase().endsWith('.pdf'));
    if (!pdfs.length) { toast.error('No PDF files found'); return; }

    const items = pdfs.map(file => {
      const { poNumber, vendorName } = parseFilename(file.name);
      const matched = matchVendor(vendors, vendorName);
      return {
        file, poNumber, vendorName,
        vendorId:  matched?.id || '',
        objectUrl: URL.createObjectURL(file),
        state:     'pending',
        form: {
          po_number:     poNumber,
          vendor_id:     matched?.id || '',
          po_date:       '',
          delivery_date: '',
          notes:         '',
          status:        'approved',
          items: [{ ...BLANK_ITEM(), description: vendorName }],
        },
      };
    });
    setQueue(items);
    setCurrent(0);
  }, [vendors]);

  // ── Download Excel template pre-filled with PO# and vendor from filenames
  const handleDownloadTemplate = () => {
    if (!queue.length) { toast.error('Select PDF files first'); return; }
    const rows = [
      ['PO Number','Vendor Name','PO Date (DD/MM/YYYY)','Delivery Date (DD/MM/YYYY)',
       'Item Description','Qty','Unit','Rate (₹)','GST%','Notes','Status'],
      ...queue.map(q => [
        q.poNumber, q.vendorName, '', '',
        q.vendorName, '1', 'LS', '', '18', '', 'approved',
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    // Column widths
    ws['!cols'] = [14,30,18,18,35,8,8,14,8,25,12].map(w => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'PO Import');
    XLSX.writeFile(wb, 'PO_Import_Template.xlsx');
    toast.success('Template downloaded — fill in dates, qty and rates, then upload');
  };

  // ── Parse uploaded Excel and build saved records
  const handleUploadExcel = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb   = XLSX.read(ev.target.result, { type: 'array', cellDates: true });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        // Skip header row
        const dataRows = rows.slice(1).filter(r => r[0]); // must have PO number

        const parseDate = (val) => {
          if (!val) return '';
          if (val instanceof Date) {
            const y = val.getFullYear();
            const m = String(val.getMonth()+1).padStart(2,'0');
            const d = String(val.getDate()).padStart(2,'0');
            return `${y}-${m}-${d}`;
          }
          // DD/MM/YYYY string
          const s = String(val).trim();
          const parts = s.split(/[\/\-\.]/);
          if (parts.length === 3 && parts[2].length === 4)
            return `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
          return s;
        };

        // Group rows by PO number (multiple rows = multiple line items)
        const poMap = {};
        for (const r of dataRows) {
          const poNum = String(r[0]).trim().toUpperCase();
          if (!poMap[poNum]) {
            const vendorName = String(r[1] || '').trim();
            const matched    = matchVendor(vendors, vendorName);
            poMap[poNum] = {
              po_number:     poNum,
              vendor_id:     matched?.id || '',
              vendor_name:   vendorName,
              po_date:       parseDate(r[2]),
              delivery_date: parseDate(r[3]),
              notes:         String(r[9] || ''),
              status:        String(r[10] || 'approved').toLowerCase(),
              items: [],
            };
          }
          const desc = String(r[4] || '').trim();
          const qty  = parseFloat(r[5]) || 0;
          const rate = parseFloat(r[7]) || 0;
          if (desc && qty > 0 && rate > 0) {
            poMap[poNum].items.push({
              description: desc,
              quantity:    String(qty),
              unit:        String(r[6] || 'LS').trim(),
              rate:        String(rate),
              gst_rate:    String(parseFloat(r[8]) || 18),
            });
          }
        }

        const records = Object.values(poMap);
        const valid   = records.filter(r => r.vendor_id && r.items.length > 0);
        const noVendor = records.filter(r => !r.vendor_id);

        if (!valid.length) {
          toast.error('No valid records found. Check vendor names match the system.');
          return;
        }

        setSaved(valid);
        if (noVendor.length)
          toast(`${valid.length} records ready. ⚠️ ${noVendor.length} skipped (vendor not matched): ${noVendor.map(r=>r.po_number).join(', ')}`, { duration: 8000 });
        else
          toast.success(`${valid.length} PO records loaded from Excel — ready to import!`);
        setStep('done');
      } catch (err) {
        toast.error('Could not read Excel file: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const curItem = queue[current];

  // ── Update header field for current item
  const setField = (key, val) => {
    setQueue(prev => prev.map((q, i) => i !== current ? q : {
      ...q,
      form: { ...q.form, [key]: val },
      vendorId: key === 'vendor_id' ? val : q.vendorId,
    }));
  };

  // ── Update a line item field
  const setItemField = (idx, key, val) => {
    setQueue(prev => prev.map((q, i) => {
      if (i !== current) return q;
      const newItems = q.form.items.map((it, j) => j === idx ? { ...it, [key]: val } : it);
      return { ...q, form: { ...q.form, items: newItems } };
    }));
  };

  // ── Add / remove line items
  const addItem = () => {
    setQueue(prev => prev.map((q, i) => i !== current ? q : {
      ...q, form: { ...q.form, items: [...q.form.items, BLANK_ITEM()] },
    }));
  };
  const removeItem = (idx) => {
    setQueue(prev => prev.map((q, i) => {
      if (i !== current) return q;
      const newItems = q.form.items.filter((_, j) => j !== idx);
      return { ...q, form: { ...q.form, items: newItems.length ? newItems : [BLANK_ITEM()] } };
    }));
  };

  // ── Gemini AI Auto-extract — applies all extracted fields
  const handleAutoExtract = async () => {
    if (!curItem) return;
    const result = await extract(curItem.file);
    if (!result) return;

    const extracted = [];

    setQueue(prev => prev.map((q, i) => {
      if (i !== current) return q;
      const newForm = { ...q.form };

      // ── Date
      if (result.po_date) {
        newForm.po_date = result.po_date;
        extracted.push('date');
      }

      // ── GST at header level
      if (result.gst_pct != null) {
        extracted.push('GST%');
      }

      // ── Line items (Gemini may return full items array)
      if (result.items && result.items.length > 0) {
        newForm.items = result.items.map(it => ({
          description: it.description || '',
          quantity:    it.quantity    != null ? String(it.quantity) : '',
          unit:        it.unit        || 'LS',
          rate:        it.rate        != null ? String(it.rate)     : '',
          gst_rate:    it.gst_rate    != null ? String(it.gst_rate) : (result.gst_pct != null ? String(result.gst_pct) : '18'),
        }));
        extracted.push(`${result.items.length} item${result.items.length > 1 ? 's' : ''}`);
      } else if (result.grand_total) {
        // No items but we have grand total — put into first item as lump sum
        const gst      = parseFloat(result.gst_pct || q.form.items[0]?.gst_rate || 18);
        const grandAmt = parseFloat(result.grand_total);
        const subTotal = gst > 0 ? grandAmt / (1 + gst / 100) : grandAmt;
        newForm.items = [{
          description: q.form.items[0]?.description || q.vendorName || 'Imported Item',
          quantity:    '1',
          unit:        'LS',
          rate:        subTotal.toFixed(2),
          gst_rate:    String(gst),
        }];
        extracted.push('amount');
      }

      return { ...q, form: newForm };
    }));

    if (extracted.length) toast.success(`AI extracted: ${extracted.join(', ')} — review & correct`);
    else toast.error('AI could not extract data — fill manually');
  };

  // ── Save current record and advance
  const handleSaveNext = () => {
    const item = queue[current];
    const { form } = item;
    if (!form.vendor_id) { toast.error('Please select a vendor'); return; }
    if (!form.po_date)   { toast.error('Please enter the Order / Release Date'); return; }

    const hasItems = form.items.some(it => it.description?.trim() && parseFloat(it.quantity) > 0 && parseFloat(it.rate) > 0);
    if (!hasItems) { toast.error('At least one item needs Description, Quantity and Rate'); return; }

    setSaved(prev => [...prev.filter(s => s.po_number !== form.po_number), { ...form }]);
    setQueue(prev => prev.map((q, i) => i === current ? { ...q, state: 'saved' } : q));
    if (current < queue.length - 1) setCurrent(c => c + 1);
  };

  const handleSkip = () => {
    setQueue(prev => prev.map((q, i) => i === current ? { ...q, state: 'skipped' } : q));
    if (current < queue.length - 1) setCurrent(c => c + 1);
  };

  // ── Final bulk import
  const handleImport = async () => {
    if (!projectId) { toast.error('Please select a project'); return; }
    if (!saved.length) { toast.error('No records to import'); return; }
    setImporting(true);
    try {
      const res = await poAPI.bulkImport({ project_id: projectId, records: saved });
      const importResult = res.data;

      const createdIds = importResult.created_ids || [];
      if (createdIds.length > 0) {
        toast(`Uploading ${createdIds.length} PDF files…`, { icon: '📎' });
        let uploaded = 0;
        for (const { po_number, id } of createdIds) {
          const queueItem = queue.find(q => q.form?.po_number === po_number || q.poNumber === po_number);
          if (!queueItem?.file) continue;
          try {
            const fd = new FormData();
            fd.append('file', queueItem.file, queueItem.file.name);
            fd.append('project_id', projectId);
            fd.append('module', 'purchase_order');
            fd.append('module_record_id', id);
            await documentsAPI.upload(fd);
            uploaded++;
          } catch (e) {
            console.warn(`PDF upload failed for ${po_number}:`, e.message);
          }
        }
        importResult.pdfs_uploaded = uploaded;
      }

      setResult(importResult);
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

  // ── Computed totals for current PO
  const totals = curItem ? computeTotals(curItem.form.items) : null;

  // ──────────────────────────── RENDER ────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center">
            <Upload className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-medium text-slate-900">Bulk Import Purchase Orders</h1>
            <p className="text-xs text-slate-500">Import historical POs from scanned PDFs — filename auto-fills PO# and vendor</p>
          </div>
        </div>
      </div>

      {/* Steps indicator */}
      <div className="bg-white border-b border-slate-100 px-6 py-2 flex items-center gap-6 text-xs font-medium">
        {[['select','1. Select Files'],['review','2. Review & Fill'],['done','3. Import']].map(([s, label]) => (
          <span key={s} className={clsx('pb-1.5 border-b-2 transition-colors',
            step === s ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-slate-400')}>
            {label}
          </span>
        ))}
      </div>

      <div className="max-w-screen-xl mx-auto p-6">

        {/* ── STEP 1: SELECT FILES ── */}
        {step === 'select' && (
          <div className="max-w-2xl mx-auto space-y-5">
            <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
              <label className="block text-sm font-medium text-slate-700">Select Project <span className="text-red-500">*</span></label>
              <select value={projectId} onChange={e => setProjectId(e.target.value)} className={inputCls}>
                <option value="">— Choose project —</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name} ({p.project_code})</option>)}
              </select>
              <p className="text-xs text-slate-400">All imported POs will be linked to this project.</p>
            </div>

            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files); setStep('review'); }}
              className="bg-white rounded-xl border-2 border-dashed border-slate-300 p-14 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-all">
              <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-medium text-slate-700">Click to select PO PDFs or drag &amp; drop</p>
              <p className="text-xs text-slate-900 font-medium mt-1">Select all PDFs at once · filenames must follow POTQS###-VendorName.pdf</p>
              <input ref={fileInputRef} type="file" multiple accept=".pdf" className="hidden"
                onChange={e => { handleFiles(e.target.files); if (e.target.files.length) setStep('review'); }} />
            </div>

            {/* Excel workflow */}
            {queue.length > 0 && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-3">
                <p className="text-sm font-medium text-emerald-800">⚡ Faster: Excel Import ({queue.length} files selected)</p>
                <p className="text-xs text-emerald-700">Step 1: Download the template (pre-filled with PO# &amp; vendor names)</p>
                <p className="text-xs text-emerald-700">Step 2: Open in Excel, fill in Date / Qty / Rate while looking at each PDF</p>
                <p className="text-xs text-emerald-700">Step 3: Upload the filled Excel here → import all at once</p>
                <div className="flex gap-2">
                  <button onClick={handleDownloadTemplate}
                    className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg py-2.5">
                    <Download className="w-4 h-4" /> Download Template
                  </button>
                  <button onClick={() => excelInputRef.current?.click()}
                    className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg py-2.5">
                    <Upload className="w-4 h-4" /> Upload Filled Excel
                  </button>
                  <input ref={excelInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleUploadExcel} />
                </div>
              </div>
            )}

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800 space-y-1">
              <p className="font-semibold">How it works:</p>
              <p>• Select all PDF files from your PO folder at once</p>
              <p>• Use the Excel template (faster) or fill each PDF form manually</p>
              <p>• Grand Total is auto-calculated from your line items</p>
              <p>• Duplicate PO numbers are automatically skipped</p>
            </div>
          </div>
        )}

        {/* ── STEP 2: REVIEW QUEUE ── */}
        {step === 'review' && curItem && (
          <div className="flex gap-4 h-[calc(100vh-180px)]">

            {/* Left: queue list */}
            <div className="w-48 flex-shrink-0 bg-white rounded-xl border border-slate-200 overflow-y-auto">
              <div className="p-3 border-b border-slate-100 text-xs font-medium text-slate-900 font-medium uppercase tracking-wide">
                {queue.length} Files
              </div>
              {queue.map((q, i) => (
                <button key={i} onClick={() => setCurrent(i)}
                  className={clsx('w-full text-left px-3 py-2.5 text-xs flex items-center gap-2 transition-colors',
                    i === current ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-slate-900 hover:bg-slate-50')}>
                  <span className={clsx('w-2 h-2 rounded-full flex-shrink-0',
                    q.state === 'saved'   ? 'bg-emerald-500' :
                    q.state === 'skipped' ? 'bg-slate-300' : 'bg-amber-400')} />
                  <span className="truncate">{q.poNumber}</span>
                </button>
              ))}
            </div>

            {/* Centre: PDF viewer */}
            <div className="flex-1 bg-white rounded-xl border border-slate-200 overflow-hidden">
              <iframe src={curItem.objectUrl} className="w-full h-full border-0" title="PO PDF" />
            </div>

            {/* Right: form */}
            <div className="w-96 flex-shrink-0 bg-white rounded-xl border border-slate-200 flex flex-col overflow-hidden">
              {/* Header */}
              <div className="px-4 py-3 bg-slate-900 flex items-center justify-between flex-shrink-0">
                <div>
                  <p className="text-sm font-medium text-white">{curItem.poNumber}</p>
                  <p className="text-xs text-slate-400">{current + 1} / {queue.length}</p>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => setCurrent(c => Math.max(0, c - 1))} disabled={current === 0}
                    className="p-1.5 rounded-lg text-slate-900 font-medium hover:text-white disabled:opacity-30 transition-colors">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button onClick={() => setCurrent(c => Math.min(queue.length - 1, c + 1))} disabled={current === queue.length - 1}
                    className="p-1.5 rounded-lg text-slate-900 font-medium hover:text-white disabled:opacity-30 transition-colors">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Status bar */}
              <div className="flex text-center text-xs flex-shrink-0">
                <div className="flex-1 py-1.5 bg-emerald-50 text-emerald-700 font-semibold">{savedCount} Saved</div>
                <div className="flex-1 py-1.5 bg-amber-50 text-amber-700 font-semibold">{pendingCount} Pending</div>
                <div className="flex-1 py-1.5 bg-slate-50 text-slate-900 font-medium font-semibold">{skippedCount} Skipped</div>
              </div>

              {/* Form fields */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">

                {/* OCR button */}
                <button onClick={handleAutoExtract} disabled={ocrLoading}
                  className="w-full bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white text-xs font-medium rounded-lg py-2 flex items-center justify-center gap-2">
                  {ocrLoading
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Scanning PDF (~15s)…</>
                    : <><Sparkles className="w-3.5 h-3.5" /> Auto-Extract Date &amp; Amount</>}
                </button>

                {/* PO Number */}
                <div>
                  <label className="block text-xs font-medium text-slate-900 font-medium mb-1">PO Number</label>
                  <input value={curItem.form.po_number} onChange={e => setField('po_number', e.target.value)}
                    className={inputCls} placeholder="POTQS001" />
                </div>

                {/* Vendor */}
                <div>
                  <label className="block text-xs font-medium text-slate-900 font-medium mb-1">Vendor <span className="text-red-500">*</span></label>
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

                {/* Dates */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-900 font-medium mb-1">Order Date <span className="text-red-500">*</span></label>
                    <input type="date" value={curItem.form.po_date} onChange={e => setField('po_date', e.target.value)}
                      className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-900 font-medium mb-1">Delivery Date</label>
                    <input type="date" value={curItem.form.delivery_date} onChange={e => setField('delivery_date', e.target.value)}
                      className={inputCls} />
                  </div>
                </div>

                {/* ── LINE ITEMS ── */}
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-200">
                    <p className="text-xs font-medium text-slate-700">Line Items</p>
                    <button onClick={addItem}
                      className="flex items-center gap-1 text-xs text-indigo-600 font-medium hover:text-indigo-800">
                      <Plus className="w-3.5 h-3.5" /> Add Row
                    </button>
                  </div>

                  {curItem.form.items.map((it, idx) => (
                    <div key={idx} className="p-2 border-b border-slate-100 last:border-0 space-y-1.5">
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-slate-900 font-medium w-4 flex-shrink-0">{idx + 1}.</span>
                        <input
                          value={it.description}
                          onChange={e => setItemField(idx, 'description', e.target.value)}
                          className="flex-1 px-2 py-1 text-xs border border-slate-200 rounded outline-none focus:border-indigo-400 bg-white"
                          placeholder="Description / Material name" />
                        {curItem.form.items.length > 1 && (
                          <button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600 p-0.5">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-4 gap-1 ml-5">
                        <div>
                          <label className="block text-xs text-slate-900 font-medium mb-0.5">Qty</label>
                          <input type="number" value={it.quantity}
                            onChange={e => setItemField(idx, 'quantity', e.target.value)}
                            className="w-full px-2 py-1 text-xs border border-slate-200 rounded outline-none focus:border-indigo-400 bg-white"
                            placeholder="0" step="0.001" min="0" />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-900 font-medium mb-0.5">Unit</label>
                          <select value={it.unit} onChange={e => setItemField(idx, 'unit', e.target.value)}
                            className="w-full px-1 py-1 text-xs border border-slate-200 rounded outline-none focus:border-indigo-400 bg-white">
                            {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-slate-900 font-medium mb-0.5">Rate</label>
                          <input type="number" value={it.rate}
                            onChange={e => setItemField(idx, 'rate', e.target.value)}
                            className="w-full px-2 py-1 text-xs border border-slate-200 rounded outline-none focus:border-indigo-400 bg-white"
                            placeholder="0.00" step="0.01" min="0" />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-900 font-medium mb-0.5">GST%</label>
                          <input type="number" value={it.gst_rate}
                            onChange={e => setItemField(idx, 'gst_rate', e.target.value)}
                            className="w-full px-2 py-1 text-xs border border-slate-200 rounded outline-none focus:border-indigo-400 bg-white"
                            placeholder="18" step="1" min="0" />
                        </div>
                      </div>
                      {/* Item subtotal */}
                      {parseFloat(it.quantity) > 0 && parseFloat(it.rate) > 0 && (
                        <div className="ml-5 text-xs text-right text-slate-500">
                          ₹{inr((parseFloat(it.quantity)||0)*(parseFloat(it.rate)||0)*(1+(parseFloat(it.gst_rate)||0)/100))}
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Totals footer */}
                  {totals && totals.grandTotal > 0 && (
                    <div className="bg-indigo-50 px-3 py-2 space-y-0.5 border-t border-indigo-100">
                      <div className="flex justify-between text-xs text-slate-600">
                        <span>Sub Total</span><span>₹{inr(totals.subTotal)}</span>
                      </div>
                      <div className="flex justify-between text-xs text-slate-600">
                        <span>GST</span><span>₹{inr(totals.totalGst)}</span>
                      </div>
                      <div className="flex justify-between text-xs font-medium text-slate-900 pt-0.5 border-t border-indigo-200">
                        <span>Grand Total</span><span>₹{inr(totals.grandTotal)}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Status */}
                <div>
                  <label className="block text-xs font-medium text-slate-900 font-medium mb-1">Status</label>
                  <select value={curItem.form.status} onChange={e => setField('status', e.target.value)} className={inputCls}>
                    {STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}</option>)}
                  </select>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-xs font-medium text-slate-900 font-medium mb-1">Notes</label>
                  <textarea rows={2} value={curItem.form.notes} onChange={e => setField('notes', e.target.value)}
                    className={inputCls} placeholder="Optional notes…" />
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex-shrink-0 p-4 border-t border-slate-100 space-y-2">
                <button onClick={handleSaveNext}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg py-2.5 flex items-center justify-center gap-2">
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

        {/* ── STEP 3: CONFIRM ── */}
        {step === 'done' && !result && (
          <div className="max-w-xl mx-auto space-y-5">
            <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
              <h2 className="text-base font-medium text-slate-800">Ready to Import</h2>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                  <div className="text-2xl font-medium text-emerald-600">{savedCount}</div>
                  <div className="text-xs text-emerald-700 font-medium">Ready to Import</div>
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
                {saved.map((r, i) => {
                  const t = computeTotals(r.items);
                  return (
                    <div key={i} className="flex items-center justify-between px-3 py-2 text-xs">
                      <span className="font-medium text-slate-700">{r.po_number}</span>
                      <span className="text-slate-500">{vendors.find(v => v.id === r.vendor_id)?.name || '—'}</span>
                      <span className="text-slate-400">{r.items.length} item{r.items.length > 1 ? 's' : ''}</span>
                      <span className="font-medium text-slate-900">₹{inr(t.grandTotal)}</span>
                    </div>
                  );
                })}
              </div>

              <div className="flex gap-3">
                <button onClick={() => setStep('review')}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-900 text-sm font-medium rounded-lg py-2.5">
                  ← Back to Review
                </button>
                <button onClick={handleImport} disabled={importing || !projectId || !savedCount}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2.5 flex items-center justify-center gap-2">
                  {importing ? <><Loader2 className="w-4 h-4 animate-spin" /> Importing…</> : `Import ${savedCount} POs to ERP`}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Result screen */}
        {result && (
          <div className="max-w-xl mx-auto space-y-5">
            <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                <div>
                  <h2 className="text-base font-medium text-slate-800">Import Complete</h2>
                  <p className="text-xs text-slate-500">Purchase Orders saved to the ERP</p>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-3">
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                  <div className="text-2xl font-medium text-emerald-600">{result.created}</div>
                  <div className="text-xs text-emerald-700 font-medium">POs Created</div>
                </div>
                <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 text-center">
                  <div className="text-2xl font-medium text-indigo-600">{result.pdfs_uploaded ?? 0}</div>
                  <div className="text-xs text-indigo-700 font-medium">PDFs Saved</div>
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
                  <p className="text-xs font-medium text-red-700 mb-2">Errors:</p>
                  {result.errors.map((e, i) => (
                    <p key={i} className="text-xs text-red-600">{e.po_number}: {e.reason}</p>
                  ))}
                </div>
              )}
              <a href="/procurement/po"
                className="block w-full text-center bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg py-2.5">
                Go to Purchase Orders →
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
