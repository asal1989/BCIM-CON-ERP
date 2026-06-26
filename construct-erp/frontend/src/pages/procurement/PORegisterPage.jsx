import React, { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import {
  Download, ClipboardList, Building2, AlertCircle,
  Upload, X, CheckCircle2, AlertTriangle, Loader2,
} from 'lucide-react';
import { poAPI, projectAPI, vendorAPI } from '../../api/client';
import toast from 'react-hot-toast';

const STATUS_CFG = {
  pending:          { label: 'Pending',         bg: 'bg-yellow-100', text: 'text-yellow-800' },
  verified_audit:   { label: 'Audit ✓',  bg: 'bg-blue-100',   text: 'text-blue-800'   },
  released_mgmt:    { label: 'Mgmt ✓',   bg: 'bg-purple-100', text: 'text-purple-800' },
  approved:         { label: 'Approved',         bg: 'bg-green-100',  text: 'text-green-800'  },
  sent:             { label: 'Sent',             bg: 'bg-teal-100',   text: 'text-teal-800'   },
  part_received:    { label: 'Part Received',    bg: 'bg-orange-100', text: 'text-orange-800' },
  fully_received:   { label: 'Received',         bg: 'bg-emerald-100',text: 'text-emerald-800'},
  cancelled:        { label: 'Cancelled',        bg: 'bg-red-100',    text: 'text-red-800'    },
  draft:            { label: 'Draft',            bg: 'bg-slate-100',  text: 'text-slate-600'  },
};

const fmt     = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d) => {
  if (!d) return '—';
  const x = new Date(d);
  if (isNaN(x.getTime())) return '—';
  return `${String(x.getDate()).padStart(2,'0')}-${String(x.getMonth()+1).padStart(2,'0')}-${x.getFullYear()}`;
};

// ── Fuzzy vendor match (strips M/s., normalises spaces)
function matchVendor(vendors, name) {
  if (!name || !vendors?.length) return null;
  const clean = (s) => s.toLowerCase().replace(/^m\/s\.?\s*/i, '').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
  const n = clean(name);
  return (
    vendors.find(v => clean(v.name) === n) ||
    vendors.find(v => clean(v.name).includes(n)) ||
    vendors.find(v => n.includes(clean(v.name)))
  );
}

// ── Parse Excel date cell to YYYY-MM-DD
function parseXlDate(val) {
  if (!val) return null;
  if (val instanceof Date) {
    const y = val.getFullYear(), m = String(val.getMonth()+1).padStart(2,'0'), d = String(val.getDate()).padStart(2,'0');
    return `${y}-${m}-${d}`;
  }
  const s = String(val).trim();
  // DD.MM.YYYY or DD/MM/YYYY
  const p = s.split(/[\/\-\.]/);
  if (p.length === 3 && p[0].length <= 2 && p[2].length === 4)
    return `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`;
  return null;
}

const TH = ({ children, right }) => (
  <th className={`px-3 py-2.5 text-xs font-medium uppercase tracking-wider text-slate-900 font-medium whitespace-nowrap ${right ? 'text-right' : 'text-left'}`}>{children}</th>
);
const TD = ({ children, right, bold, mono, className = '' }) => (
  <td className={`px-3 py-2 text-sm ${right ? 'text-right' : 'text-left'} ${bold ? 'font-medium text-slate-900' : 'text-slate-700'} ${mono ? 'font-mono text-xs' : ''} ${className}`}>{children}</td>
);

function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] || STATUS_CFG.pending;
  return <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide ${cfg.bg} ${cfg.text}`}>{cfg.label}</span>;
}

// ════════════════════════════════════════════════════════
// Import Modal
// ════════════════════════════════════════════════════════
function ImportModal({ vendors, projects, onClose, onDone }) {
  const qc          = useQueryClient();
  const fileRef     = useRef();
  const [step, setStep]         = useState('upload');   // upload → preview → done
  const [preview, setPreview]   = useState([]);         // parsed POs
  const [projectId, setProjectId] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult]     = useState(null);

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'array', cellDates: true });

        // ── Sheet 1: PO Summary (header info per PO)
        const s1 = wb.Sheets['PO Summary'] || wb.Sheets[wb.SheetNames[0]];
        const s1rows = XLSX.utils.sheet_to_json(s1, { header: 1, defval: '' });
        // Find header row (contains "PO No")
        const hIdx = s1rows.findIndex(r => String(r[0]).toLowerCase().includes('po no') || String(r[0]).toLowerCase().includes('po number'));
        const headerMap = {}; // poNumber → { narration, payment_terms, status, tcs_amount }
        if (hIdx >= 0) {
          const headers = s1rows[hIdx].map(h => String(h).toLowerCase().trim());
          for (const row of s1rows.slice(hIdx + 1)) {
            const poNum = String(row[0] || '').trim();
            if (!poNum || poNum.toLowerCase().includes('grand') || poNum.toLowerCase().includes('total')) continue;
            const get = (key) => {
              const i = headers.findIndex(h => h.includes(key));
              return i >= 0 ? row[i] : '';
            };
            headerMap[poNum] = {
              vendor_name:   String(get('supplier') || get('vendor') || row[2] || '').trim(),
              narration:     String(get('narration') || get('description') || '').trim(),
              payment_terms: String(get('payment') || '').trim(),
              tcs_amount:    parseFloat(get('other tax') || get('tcs') || 0) || 0,
              status:        String(get('status') || 'approved').trim().toLowerCase() === 'cancelled' ? 'cancelled' : 'approved',
              po_date:       parseXlDate(row[1]),
            };
          }
        }

        // ── Sheet 2: Line Item Details
        const s2 = wb.Sheets['Line Item Details'] || wb.Sheets[wb.SheetNames[1]];
        const s2rows = s2 ? XLSX.utils.sheet_to_json(s2, { header: 1, defval: '' }) : [];
        const h2Idx = s2rows.findIndex(r => String(r[0]).toLowerCase().includes('po no') || String(r[0]).toLowerCase().includes('po number'));
        const itemsByPO = {}; // poNumber → items[]
        if (h2Idx >= 0) {
          const h2 = s2rows[h2Idx].map(h => String(h).toLowerCase().trim());
          const ci = (key) => h2.findIndex(h => h.includes(key));
          const iPoNo = ci('po no') >= 0 ? ci('po no') : ci('po number') >= 0 ? ci('po number') : 0;
          const iDate = ci('date');
          const iSupp = ci('supplier');
          const iDesc = h2.findIndex(h => h.includes('description') || h.includes('material') || h === 'item');
          const iUOM  = ci('uom') >= 0 ? ci('uom') : ci('unit');
          const iQty  = ci('qty') >= 0 ? ci('qty') : ci('quantity');
          const iRate = ci('rate');
          const iAmt  = ci('amount');
          const iRem  = ci('remarks') >= 0 ? ci('remarks') : ci('purpose');

          for (const row of s2rows.slice(h2Idx + 1)) {
            const poNum = String(row[iPoNo] || '').trim();
            if (!poNum || poNum.toLowerCase().includes('total')) continue;
            if (!itemsByPO[poNum]) {
              // If PO wasn't in sheet 1, grab vendor from this sheet
              if (!headerMap[poNum]) {
                headerMap[poNum] = {
                  vendor_name:   iSupp >= 0 ? String(row[iSupp] || '').trim() : '',
                  narration:     '',
                  payment_terms: '',
                  tcs_amount:    0,
                  status:        'approved',
                  po_date:       iDate >= 0 ? parseXlDate(row[iDate]) : null,
                };
              }
              itemsByPO[poNum] = [];
            }
            const desc = iDesc >= 0 ? String(row[iDesc] || '').trim() : '';
            const qty      = parseFloat(row[iQty]  || 0);
            const rateRaw  = row[iRate];
            const rate     = parseFloat(rateRaw) || 0;   // "Inclusive" → 0
            const rateNote = (isNaN(parseFloat(rateRaw)) && rateRaw) ? String(rateRaw).trim() : '';
            if (desc && qty > 0) {
              itemsByPO[poNum].push({
                description: desc,
                unit:        iUOM >= 0  ? String(row[iUOM] || 'LS').trim() : 'LS',
                quantity:    qty,
                rate:        rate,
                gst_rate:    0,
                purpose:     [iRem >= 0 ? String(row[iRem] || '').trim() : '', rateNote].filter(Boolean).join(' — ') || '',
              });
            }
          }
        }

        // ── If no Sheet 2 or no items, fall back: create one item per PO from totals
        for (const [poNum, hdr] of Object.entries(headerMap)) {
          if (!itemsByPO[poNum] || !itemsByPO[poNum].length) {
            itemsByPO[poNum] = [{
              description: hdr.narration || poNum,
              unit: 'LS', quantity: 1, rate: 0, gst_rate: 0,
            }];
          }
        }

        // ── Build preview records
        const records = Object.entries(headerMap).map(([poNum, hdr]) => {
          const matched = matchVendor(vendors, hdr.vendor_name);
          return {
            po_number:     poNum,
            vendor_name:   hdr.vendor_name,
            vendor_id:     matched?.id || null,
            vendor_matched: matched?.name || null,
            po_date:       hdr.po_date,
            narration:     hdr.narration,
            payment_terms: hdr.payment_terms,
            tcs_amount:    hdr.tcs_amount,
            status:        hdr.status,
            items:         itemsByPO[poNum] || [],
          };
        });

        setPreview(records);
        setStep('preview');
      } catch (err) {
        toast.error('Could not parse Excel: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleImport = async () => {
    if (!projectId) return toast.error('Select a project first');
    const unmatched = preview.filter(r => !r.vendor_id);
    if (unmatched.length) {
      toast.error(`${unmatched.length} vendor(s) could not be matched. Please select them manually.`);
      return;
    }
    setImporting(true);
    try {
      const records = preview.map(r => ({
        po_number:    r.po_number,
        vendor_id:    r.vendor_id,
        po_date:      r.po_date,
        notes:        r.narration,
        payment_terms: r.payment_terms,
        tcs_amount:   r.tcs_amount,
        status:       r.status,
        items:        r.items,
      }));
      const res = await poAPI.bulkImport({ project_id: projectId, records });
      const { created, skipped, errors } = res.data;
      setResult({ created, skipped, errors });
      setStep('done');
      qc.invalidateQueries({ queryKey: ['po-register'] });
      toast.success(`Imported ${created} POs`);
    } catch (err) {
      toast.error('Import failed: ' + (err?.response?.data?.error || err.message));
    } finally {
      setImporting(false);
    }
  };

  const matchedCount   = preview.filter(r => r.vendor_id).length;
  const unmatchedCount = preview.filter(r => !r.vendor_id).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center">
              <Upload className="w-4 h-4 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-900">Import POs from Excel</p>
              <p className="text-xs text-slate-400">Reads PO Summary + Line Item Details sheets</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-900 font-medium hover:text-slate-900 transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">

          {/* ── Step: Upload ── */}
          {step === 'upload' && (
            <div className="space-y-4">
              <div
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-slate-300 rounded-xl p-10 text-center cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/40 transition-all"
              >
                <Upload className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-sm font-medium text-slate-700">Click to select your Excel file</p>
                <p className="text-xs text-slate-900 font-medium mt-1">Works with the BCIM PO Register format (.xlsx)</p>
                <p className="text-xs text-slate-400">Needs sheets: <strong>PO Summary</strong> and <strong>Line Item Details</strong></p>
                <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} />
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800 space-y-1">
                <p className="font-semibold">Expected format (matches the sample file):</p>
                <p>• Sheet 1 "PO Summary" — PO No, Date, Supplier Name, Narration, Payment Terms, Status</p>
                <p>• Sheet 2 "Line Item Details" — PO No, Date, Supplier, Description, UOM, Qty, Rate</p>
              </div>
            </div>
          )}

          {/* ── Step: Preview ── */}
          {step === 'preview' && (
            <div className="space-y-4">
              {/* Summary bar */}
              <div className="flex flex-wrap gap-3">
                <div className="flex items-center gap-2 px-4 py-2 bg-slate-100 rounded-lg text-sm">
                  <span className="font-medium text-slate-700">{preview.length}</span>
                  <span className="text-slate-500">POs found</span>
                </div>
                <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 rounded-lg text-sm">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span className="font-medium text-emerald-700">{matchedCount}</span>
                  <span className="text-emerald-600">vendors matched</span>
                </div>
                {unmatchedCount > 0 && (
                  <div className="flex items-center gap-2 px-4 py-2 bg-red-50 rounded-lg text-sm">
                    <AlertTriangle className="w-4 h-4 text-red-500" />
                    <span className="font-medium text-red-700">{unmatchedCount}</span>
                    <span className="text-red-600">need manual selection</span>
                  </div>
                )}
                <div className="ml-auto">
                  <select
                    className="h-9 pl-3 pr-8 text-sm border border-slate-200 rounded-lg bg-white outline-none focus:border-indigo-400 min-w-[200px]"
                    value={projectId}
                    onChange={e => setProjectId(e.target.value)}
                  >
                    <option value="">Select project to import into…</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Preview table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto max-h-[45vh]">
                  <table className="w-full text-left border-collapse min-w-[800px]">
                    <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                      <tr>
                        <TH>PO No</TH>
                        <TH>Date</TH>
                        <TH>Vendor (from Excel)</TH>
                        <TH>Matched Vendor</TH>
                        <TH right>Items</TH>
                        <TH>Payment Terms</TH>
                        <TH>Status</TH>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {preview.map((po, idx) => (
                        <tr key={idx} className={`${!po.vendor_id ? 'bg-red-50' : idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                          <TD mono bold>{po.po_number}</TD>
                          <TD>{fmtDate(po.po_date)}</TD>
                          <TD className="text-xs text-slate-500">{po.vendor_name || '—'}</TD>
                          <TD>
                            {po.vendor_id ? (
                              <span className="flex items-center gap-1.5 text-emerald-700 text-xs font-medium">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                {po.vendor_matched}
                              </span>
                            ) : (
                              <select
                                className="h-8 pl-2 pr-6 text-xs border border-red-300 rounded-lg bg-white outline-none focus:border-indigo-400 max-w-[200px]"
                                value=""
                                onChange={e => {
                                  const v = vendors.find(x => x.id === e.target.value);
                                  setPreview(prev => prev.map((p, i) => i === idx ? { ...p, vendor_id: e.target.value, vendor_matched: v?.name } : p));
                                }}
                              >
                                <option value="">Select vendor…</option>
                                {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                              </select>
                            )}
                          </TD>
                          <TD right>{po.items.length}</TD>
                          <TD className="text-xs">{po.payment_terms || '—'}</TD>
                          <TD><StatusBadge status={po.status} /></TD>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── Step: Done ── */}
          {step === 'done' && result && (
            <div className="space-y-4">
              <div className="flex flex-col items-center py-8 gap-4">
                <CheckCircle2 className="w-14 h-14 text-emerald-500" />
                <p className="text-lg font-medium text-slate-900">Import Complete</p>
                <div className="flex gap-4">
                  <div className="px-5 py-3 bg-emerald-50 rounded-xl text-center">
                    <p className="text-2xl font-medium text-emerald-700">{result.created}</p>
                    <p className="text-xs text-emerald-600 mt-0.5">POs created</p>
                  </div>
                  <div className="px-5 py-3 bg-slate-100 rounded-xl text-center">
                    <p className="text-2xl font-medium text-slate-600">{result.skipped}</p>
                    <p className="text-xs text-slate-900 font-medium mt-0.5">skipped (duplicate)</p>
                  </div>
                  {result.errors?.length > 0 && (
                    <div className="px-5 py-3 bg-red-50 rounded-xl text-center">
                      <p className="text-2xl font-medium text-red-600">{result.errors.length}</p>
                      <p className="text-xs text-red-500 mt-0.5">errors</p>
                    </div>
                  )}
                </div>
                {result.errors?.length > 0 && (
                  <div className="w-full max-w-md bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700 space-y-1">
                    {result.errors.map((e, i) => <p key={i}><strong>{e.po_number}</strong>: {e.reason}</p>)}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
          {step === 'preview' && (
            <>
              <button onClick={() => setStep('upload')} className="h-9 px-4 rounded-lg text-sm border border-slate-200 text-slate-900 hover:bg-slate-50 transition-colors">
                Back
              </button>
              <button
                onClick={handleImport}
                disabled={importing || !projectId || unmatchedCount > 0}
                className="flex items-center gap-2 h-9 px-5 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 transition-colors"
              >
                {importing ? <><Loader2 className="w-4 h-4 animate-spin" /> Importing…</> : `Import ${matchedCount} POs`}
              </button>
            </>
          )}
          {(step === 'upload' || step === 'done') && (
            <button onClick={step === 'done' ? onDone : onClose} className="h-9 px-4 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors">
              {step === 'done' ? 'Done' : 'Cancel'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// Main Page
// ════════════════════════════════════════════════════════
export default function PORegisterPage() {
  const [projectId, setProjectId] = useState('');
  const [from, setFrom]           = useState('');
  const [to, setTo]               = useState('');
  const [tab, setTab]             = useState('summary');
  const [exporting, setExporting] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectAPI.list().then(r => r.data?.data || r.data || []),
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors-all'],
    queryFn: () => vendorAPI.list({ limit: 500 }).then(r => r.data?.data || r.data || []),
  });

  const { data: poData = [], isLoading } = useQuery({
    queryKey: ['po-register', projectId, from, to],
    queryFn: () => poAPI.register({ project_id: projectId, from: from || undefined, to: to || undefined }).then(r => r.data?.data || []),
    enabled: !!projectId,
  });

  const vendorSummary = useMemo(() => {
    const map = {};
    for (const po of poData) {
      const key = po.vendor_name || 'Unknown';
      if (!map[key]) map[key] = { gst: po.vendor_gst || '—', pos: [], total: 0, category: po.category || '' };
      map[key].pos.push(po.status === 'cancelled' ? `${po.po_number}(C)` : po.po_number);
      map[key].total += Number(po.grand_total) || 0;
    }
    return Object.entries(map).map(([name, v]) => ({ name, ...v }));
  }, [poData]);

  const lineItems = useMemo(() => {
    const rows = [];
    for (const po of poData) {
      if (!po.items) continue;
      for (const it of po.items) {
        rows.push({ ...it, po_number: po.po_number, po_date: po.po_date, vendor_name: po.vendor_name });
      }
    }
    return rows;
  }, [poData]);

  const grandTotal  = poData.reduce((s, p) => s + (Number(p.grand_total)   || 0), 0);
  const subTotalSum = poData.reduce((s, p) => s + (Number(p.sub_total)     || 0), 0);
  const cgstSum     = poData.reduce((s, p) => s + (Number(p.cgst_amount)   || 0), 0);
  const sgstSum     = poData.reduce((s, p) => s + (Number(p.sgst_amount)   || 0), 0);
  const tcsSum      = poData.reduce((s, p) => s + (Number(p.tcs_amount)    || 0), 0);

  const handleExport = async () => {
    if (!projectId) return toast.error('Select a project first');
    setExporting(true);
    try {
      const res  = await poAPI.registerExport({ project_id: projectId, from: from || undefined, to: to || undefined });
      const url  = URL.createObjectURL(new Blob([res.data], { type: res.headers['content-type'] }));
      const proj = projects.find(p => p.id === projectId);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `PO_Register_${proj?.project_code || 'export'}_${new Date().toISOString().slice(0,10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Excel downloaded');
    } catch (err) {
      toast.error('Export failed: ' + (err?.response?.data?.error || err.message));
    } finally {
      setExporting(false);
    }
  };

  const selectedProject = projects.find(p => p.id === projectId);

  return (
    <div className="min-h-screen bg-slate-50">

      {showImport && (
        <ImportModal
          vendors={vendors}
          projects={projects}
          onClose={() => setShowImport(false)}
          onDone={() => setShowImport(false)}
        />
      )}

      {/* ── Header ── */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3 mr-2">
            <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center">
              <ClipboardList className="w-4 h-4 text-amber-600" />
            </div>
            <div>
              <h1 className="text-sm font-medium text-slate-900">PO Register</h1>
              <p className="text-xs text-slate-500">Procurement register — all POs for a project</p>
            </div>
          </div>

          <select
            className="h-9 pl-3 pr-8 text-sm border border-slate-200 rounded-lg bg-white outline-none focus:border-indigo-400 min-w-[200px]"
            value={projectId}
            onChange={e => setProjectId(e.target.value)}
          >
            <option value="">Select project…</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>

          <input type="date" className="h-9 px-3 text-sm border border-slate-200 rounded-lg bg-white outline-none focus:border-indigo-400"
            value={from} onChange={e => setFrom(e.target.value)} title="From date" />
          <span className="text-slate-900 font-medium text-xs">to</span>
          <input type="date" className="h-9 px-3 text-sm border border-slate-200 rounded-lg bg-white outline-none focus:border-indigo-400"
            value={to} onChange={e => setTo(e.target.value)} title="To date" />

          <div className="ml-auto flex gap-2">
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
            >
              <Upload className="w-4 h-4" />
              Import Excel
            </button>
            <button
              onClick={handleExport}
              disabled={!projectId || exporting}
              className="flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 transition-colors"
            >
              <Download className="w-4 h-4" />
              {exporting ? 'Exporting…' : 'Download Excel'}
            </button>
          </div>
        </div>

        {selectedProject && (
          <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
            <Building2 className="w-3.5 h-3.5" />
            <span className="font-medium text-slate-700">{selectedProject.name}</span>
            <span>·</span>
            <span>{selectedProject.project_code}</span>
            <span>·</span>
            <span className="font-medium text-indigo-700">₹{fmt(grandTotal)}</span>
            <span>({poData.length} POs)</span>
          </div>
        )}
      </div>

      {/* ── Tabs ── */}
      <div className="border-b border-slate-200 bg-white px-6">
        {[
          { id: 'summary', label: 'PO Summary',       count: poData.length },
          { id: 'items',   label: 'Line Item Details', count: lineItems.length },
          { id: 'vendors', label: 'Vendor Summary',    count: vendorSummary.length },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`mr-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${tab === t.id ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-900 font-medium hover:text-slate-700'}`}>
            {t.label}
            {projectId && <span className="ml-2 px-1.5 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-600">{t.count}</span>}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      <div className="p-6">
        {!projectId ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <AlertCircle className="w-10 h-10 mb-3" />
            <p className="text-sm font-medium">Select a project to view the register</p>
            <p className="text-xs mt-1">Or click <strong>Import Excel</strong> to load POs from your register file</p>
          </div>
        ) : isLoading ? (
          <div className="flex justify-center py-20 text-slate-900 font-medium text-sm">Loading…</div>
        ) : poData.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <ClipboardList className="w-10 h-10 mb-3" />
            <p className="text-sm">No Purchase Orders found for this project</p>
            <button onClick={() => setShowImport(true)} className="mt-4 flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors">
              <Upload className="w-4 h-4" /> Import from Excel
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">

              {tab === 'summary' && (
                <table className="w-full text-left border-collapse min-w-[1100px]">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <TH>PO No</TH><TH>Date</TH><TH>Supplier Name</TH><TH>Supplier GST</TH>
                      <TH>Narration / Description</TH>
                      <TH right>Sub Total (₹)</TH><TH right>CGST (₹)</TH><TH right>SGST (₹)</TH>
                      <TH right>Other Tax/TCS (₹)</TH><TH right>Grand Total (₹)</TH>
                      <TH>Payment Terms</TH><TH>Status</TH>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {poData.map((po, idx) => (
                      <tr key={po.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                        <TD mono bold>{po.po_number}</TD>
                        <TD>{fmtDate(po.po_date)}</TD>
                        <TD>{po.vendor_name || '—'}</TD>
                        <TD mono>{po.vendor_gst || '—'}</TD>
                        <TD className="max-w-[220px] truncate" title={po.narration}>{po.narration || '—'}</TD>
                        <TD right>₹{fmt(po.sub_total)}</TD>
                        <TD right>₹{fmt(po.cgst_amount)}</TD>
                        <TD right>₹{fmt(po.sgst_amount)}</TD>
                        <TD right>₹{fmt(po.tcs_amount)}</TD>
                        <TD right bold>₹{fmt(po.grand_total)}</TD>
                        <TD>{po.payment_terms || '—'}</TD>
                        <TD><StatusBadge status={po.status} /></TD>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-indigo-50 border-t-2 border-indigo-200 font-semibold">
                      <td colSpan={5} className="px-3 py-2.5 text-sm font-medium text-indigo-900">GRAND TOTAL — {poData.length} POs</td>
                      <TD right bold>₹{fmt(subTotalSum)}</TD>
                      <TD right bold>₹{fmt(cgstSum)}</TD>
                      <TD right bold>₹{fmt(sgstSum)}</TD>
                      <TD right bold>₹{fmt(tcsSum)}</TD>
                      <TD right bold className="text-indigo-900 text-base">₹{fmt(grandTotal)}</TD>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              )}

              {tab === 'items' && (
                <table className="w-full text-left border-collapse min-w-[900px]">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <TH>PO No</TH><TH>Date</TH><TH>Supplier</TH><TH right>Sl No</TH>
                      <TH>Description</TH><TH>UOM</TH><TH right>PO Qty</TH><TH right>Received</TH><TH right>Invoiced</TH><TH right>Remaining</TH>
                      <TH right>Rate (₹)</TH><TH right>Amount (₹)</TH><TH>Remarks</TH>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {lineItems.map((it, idx) => (
                      <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                        <TD mono>{it.po_number}</TD>
                        <TD>{fmtDate(it.po_date)}</TD>
                        <TD>{it.vendor_name || '—'}</TD>
                        <TD right>{it.sort_order}</TD>
                        <TD>{it.material_name}</TD>
                        <TD>{it.unit}</TD>
                        <TD right>{fmt(it.quantity)}</TD>
                        <TD right className="text-emerald-700 font-semibold">{fmt(it.received_quantity)}</TD>
                        <TD right className="text-blue-700 font-semibold">{fmt(it.invoiced_quantity)}</TD>
                        <TD right className={(Number(it.remaining_quantity || 0) > 0) ? 'text-orange-700 font-semibold' : 'text-slate-500'}>{fmt(it.remaining_quantity)}</TD>
                        <TD right>₹{fmt(it.rate)}</TD>
                        <TD right bold>₹{fmt(it.total_amount)}</TD>
                        <TD>{it.purpose || '—'}</TD>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-indigo-50 border-t-2 border-indigo-200">
                      <td colSpan={11} className="px-3 py-2.5 text-sm font-medium text-indigo-900">TOTAL — {lineItems.length} line items</td>
                      <TD right bold className="text-indigo-900">₹{fmt(lineItems.reduce((s, it) => s + (Number(it.total_amount) || 0), 0))}</TD>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              )}

              {tab === 'vendors' && (
                <table className="w-full text-left border-collapse min-w-[700px]">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <TH>Vendor Name</TH><TH>GST No</TH><TH>PO Numbers</TH>
                      <TH right>No. of POs</TH><TH right>Total Value (₹)</TH><TH>Category</TH>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {vendorSummary.map((v, idx) => (
                      <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                        <TD bold>{v.name}</TD>
                        <TD mono>{v.gst}</TD>
                        <TD className="text-xs text-slate-900 font-medium max-w-[280px]">{v.pos.join(', ')}</TD>
                        <TD right>{v.pos.length}</TD>
                        <TD right bold>₹{fmt(v.total)}</TD>
                        <TD>{v.category || '—'}</TD>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-indigo-50 border-t-2 border-indigo-200">
                      <td colSpan={4} className="px-3 py-2.5 text-sm font-medium text-indigo-900">GRAND TOTAL ({vendorSummary.length} vendors)</td>
                      <TD right bold className="text-indigo-900 text-base">₹{fmt(vendorSummary.reduce((s, v) => s + v.total, 0))}</TD>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              )}

            </div>
          </div>
        )}
      </div>
    </div>
  );
}
