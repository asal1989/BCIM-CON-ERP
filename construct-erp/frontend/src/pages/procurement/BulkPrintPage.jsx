// src/pages/procurement/BulkPrintPage.jsx
// Bulk-print all POs and WOs for a selected project.
// "Print All as PDF" → browser print dialog → Save as PDF → choose your folder.
import React, { useRef, useState, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useReactToPrint } from 'react-to-print';
import { Printer, FileText, FolderOpen, ChevronDown, AlertCircle, Loader2 } from 'lucide-react';
import { poAPI, subcontractorAPI, projectAPI, companySettingsAPI } from '../../api/client';
import POPrintTemplate from './POPrintTemplate';
import WOPrintTemplate from './WOPrintTemplate';

// ─── helpers ─────────────────────────────────────────────────────────────────
const inr = v => `₹${(+v || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

// ─── Main page ───────────────────────────────────────────────────────────────
export default function BulkPrintPage() {
  const [projectId, setProjectId] = useState('');
  const [triggered, setTriggered] = useState(false);
  const printRef = useRef(null);

  // Company settings (for header logo / address in templates)
  const { data: company = {} } = useQuery({
    queryKey: ['company-settings'],
    queryFn:  () => companySettingsAPI.get().then(r => r.data?.data ?? r.data),
    staleTime: 300000,
  });

  // All projects
  const { data: projects = [] } = useQuery({
    queryKey: ['projects-list'],
    queryFn:  () => projectAPI.list().then(r => r.data?.data ?? []),
    staleTime: 120000,
  });

  // Auto-select Lanco / Lancho project on first load
  useEffect(() => {
    if (!projectId && projects.length > 0) {
      const lanco = projects.find(p =>
        /lan[c]?[h]?[o]/i.test(p.name) || /lan[c]?[h]?[o]/i.test(p.project_code)
      );
      if (lanco) setProjectId(lanco.id);
    }
  }, [projects, projectId]);

  // PO list for project (summary, just to get IDs)
  const { data: poList = [], isFetching: poListFetching } = useQuery({
    queryKey: ['bulk-print-po-list', projectId],
    queryFn:  () => poAPI.list({ project_id: projectId }).then(r => r.data?.data ?? []),
    enabled: !!projectId && triggered,
    staleTime: 30000,
  });

  // WO list for project
  const { data: woList = [], isFetching: woListFetching } = useQuery({
    queryKey: ['bulk-print-wo-list', projectId],
    queryFn:  () => subcontractorAPI.listWorkOrders({ project_id: projectId }).then(r => r.data?.data ?? []),
    enabled: !!projectId && triggered,
    staleTime: 30000,
  });

  // Fetch full PO details (with items) in parallel
  const { data: poDetails = [], isFetching: poDetailsFetching } = useQuery({
    queryKey: ['bulk-print-po-details', poList.map(p => p.id)],
    queryFn:  () => Promise.all(poList.map(p => poAPI.get(p.id).then(r => r.data?.data))).then(r => r.filter(Boolean)),
    enabled: poList.length > 0,
    staleTime: 30000,
  });

  // Fetch full WO details (with items) in parallel
  const { data: woDetails = [], isFetching: woDetailsFetching } = useQuery({
    queryKey: ['bulk-print-wo-details', woList.map(w => w.id)],
    queryFn:  () => Promise.all(woList.map(w => subcontractorAPI.getWorkOrder(w.id).then(r => r.data?.data))).then(r => r.filter(Boolean)),
    enabled: woList.length > 0,
    staleTime: 30000,
  });

  const isLoading = poListFetching || woListFetching || poDetailsFetching || woDetailsFetching;
  const ready = triggered && !isLoading && (poDetails.length > 0 || woDetails.length > 0);

  const handlePrint = useReactToPrint({ contentRef: printRef });

  const selectedProject = projects.find(p => p.id === projectId);

  const load = useCallback(() => {
    if (projectId) setTriggered(true);
  }, [projectId]);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ── header ── */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-md bg-indigo-50 flex items-center justify-center">
            <Printer className="w-4 h-4 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-black">Bulk Print — PO &amp; WO</h1>
            <p className="text-xs text-slate-400">Select a project, load documents, then Save as PDF to your local folder</p>
          </div>
        </div>
      </div>

      {/* ── controls ── */}
      <div className="px-6 py-5 max-w-2xl">
        <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          {/* Project selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Project</label>
            <div className="relative">
              <select
                value={projectId}
                onChange={e => { setProjectId(e.target.value); setTriggered(false); }}
                className="w-full appearance-none border border-slate-300 rounded-md px-3 py-2 text-sm pr-8 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              >
                <option value="">-- Select project --</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.project_code} — {p.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
          </div>

          {/* Action row */}
          <div className="flex items-center gap-3">
            <button
              onClick={load}
              disabled={!projectId || isLoading}
              className="px-4 py-2 text-sm font-medium rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 flex items-center gap-2"
            >
              {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FolderOpen className="w-3.5 h-3.5" />}
              {isLoading ? 'Loading…' : 'Load Documents'}
            </button>

            <button
              onClick={handlePrint}
              disabled={!ready}
              className="px-4 py-2 text-sm font-semibold rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 flex items-center gap-2"
            >
              <Printer className="w-3.5 h-3.5" />
              Print All as PDF
            </button>
          </div>

          {/* Instructions */}
          {ready && (
            <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 flex gap-2 text-xs text-amber-800">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>
                In the print dialog: set <strong>Destination</strong> to <em>Save as PDF</em>,
                then choose <strong>D:\QS SHARE</strong> as the save location.
              </span>
            </div>
          )}
        </div>

        {/* Summary */}
        {triggered && !isLoading && (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <SummaryCard
              label="Purchase Orders"
              count={poDetails.length}
              total={poDetails.reduce((s, p) => s + parseFloat(p.total_amount || p.grand_total || 0), 0)}
              items={poDetails.map(p => ({ ref: p.po_ref_no || p.po_number || p.serial_no_formatted, vendor: p.vendor_name }))}
              color="blue"
            />
            <SummaryCard
              label="Work Orders"
              count={woDetails.length}
              total={woDetails.reduce((s, w) => s + parseFloat(w.total_value || w.contract_value || 0), 0)}
              items={woDetails.map(w => ({ ref: w.wo_number, vendor: w.vendor_name }))}
              color="violet"
            />
          </div>
        )}
      </div>

      {/* ── printable area (hidden on screen) ── */}
      <div style={{ display: 'none' }}>
        <div ref={printRef}>
          <style>{`
            @media print {
              @page { margin: 0; size: A4 portrait; }
              .po-wo-page-break { page-break-before: always; }
            }
          `}</style>

          {poDetails.map((po, i) => (
            <div key={po.id} className={i > 0 ? 'po-wo-page-break' : ''}>
              <POPrintTemplate data={po} company={company} />
            </div>
          ))}

          {woDetails.map((wo, i) => (
            <div key={wo.id} className={(poDetails.length > 0 || i > 0) ? 'po-wo-page-break' : ''}>
              <WOPrintTemplate data={wo} company={company} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── summary card ─────────────────────────────────────────────────────────────
function SummaryCard({ label, count, total, items, color }) {
  const cls = {
    blue:   { bg: 'bg-blue-50', border: 'border-blue-200', badge: 'bg-blue-600', text: 'text-blue-800', sub: 'text-blue-500' },
    violet: { bg: 'bg-violet-50', border: 'border-violet-200', badge: 'bg-violet-600', text: 'text-violet-800', sub: 'text-violet-500' },
  }[color];

  return (
    <div className={`rounded-lg border ${cls.border} ${cls.bg} p-3`}>
      <div className="flex items-center gap-2 mb-2">
        <FileText className={`w-3.5 h-3.5 ${cls.sub}`} />
        <span className={`text-xs font-semibold ${cls.text}`}>{label}</span>
        <span className={`ml-auto text-[10px] font-bold text-white px-1.5 py-0.5 rounded-full ${cls.badge}`}>{count}</span>
      </div>
      <div className={`text-sm font-semibold ${cls.text} mb-2`}>{inr(total)}</div>
      <div className="space-y-0.5 max-h-36 overflow-y-auto">
        {items.map((it, i) => (
          <div key={i} className="flex items-baseline gap-1.5">
            <span className={`font-mono text-[10px] font-semibold ${cls.text}`}>{it.ref}</span>
            <span className={`text-[10px] ${cls.sub} truncate`}>{it.vendor}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
