// src/pages/sc/SCLabour.jsx — Worker Registry + Daily Attendance + NMR (Muster Roll)
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { scAPI, projectAPI, hrEsslAPI } from '../../api/client';
import useAuthStore from '../../store/authStore';
import { PageHeader, KpiCard as ThemeKpiCard, Theme } from '../../theme';
import {
  Plus, Search, RefreshCw, HardHat, Users, CheckCircle, X,
  FileText, ChevronRight, ThumbsUp, ThumbsDown, IndianRupee,
  Clock, Send, Receipt, Eye, AlertTriangle, CheckCircle2, Trash2,
  Printer, Download, FileSpreadsheet,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import dayjs from 'dayjs';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  REPORT_PRINT_CSS_LANDSCAPE, ReportPrintHeader, ReportPrintSignature,
} from '../../components/reports/ReportPrintKit';

// Signatories for the Nominal Muster Roll — a statutory record under the
// Contract Labour (R&A) Act 1970, so it carries the site/contractor chain.
const NMR_SIGNATORIES = [
  { role: 'Prepared By',   name: 'Site Engineer' },
  { role: 'Checked By',    name: 'QS / Billing Engineer' },
  { role: 'Site Incharge', name: 'Project Manager' },
  { role: 'Contractor',    name: 'Labour Contractor' },
];

// The muster roll lives in a fixed full-screen drawer whose scroll containers
// and sticky first column would clip the printed sheet — unwind all of that
// and let the wide date matrix flow across the page instead.
const NMR_PRINT_CSS = `
@media print {
  .nmr-drawer-root {
    position: static !important; inset: auto !important; display: block !important;
    z-index: auto !important; overflow: visible !important;
  }
  .nmr-drawer-panel {
    position: static !important; display: block !important; width: 100% !important;
    box-shadow: none !important; overflow: visible !important;
  }
  #report-print-root, #report-print-root * { overflow: visible !important; }
  #report-print-root .overflow-x-auto,
  #report-print-root .overflow-y-auto,
  #report-print-root .overflow-hidden { overflow: visible !important; max-height: none !important; }
  #report-print-root [class*="sticky"] {
    position: static !important; left: auto !important; z-index: auto !important;
  }
  .nmr-matrix-table {
    width: 100% !important; border-collapse: collapse !important;
    font-size: 5.5pt !important; table-layout: auto !important;
  }
  .nmr-matrix-table thead { display: table-header-group !important; }
  .nmr-matrix-table th {
    background: #1B3A6B !important; color: #fff !important;
    border: 0.5px solid #1B3A6B !important; padding: 2px 1px !important;
    font-size: 5pt !important; font-weight: 700 !important;
  }
  .nmr-matrix-table td {
    border: 0.5px solid #bbb !important; padding: 1.5px 2px !important;
    font-size: 5.5pt !important;
  }
  .nmr-matrix-table tr { page-break-inside: avoid !important; }
  .nmr-matrix-table span {
    width: auto !important; height: auto !important; display: inline !important;
    border-radius: 0 !important; background: transparent !important;
  }
  /* Hours live in a hover tooltip on screen — surface them in print, where
     there is nothing to hover. */
  .nmr-print-hrs { display: inline !important; color: #444 !important; }
}
@media screen {
  .nmr-print-hrs { display: none !important; }
  .nmr-boq-table { width: 100% !important; border-collapse: collapse !important; font-size: 7pt !important; }
  .nmr-boq-table th { background: #1B3A6B !important; color: #fff !important; border: 0.5px solid #1B3A6B !important; padding: 3px 4px !important; font-size: 6.5pt !important; }
  .nmr-boq-table td { border: 0.5px solid #bbb !important; padding: 2.5px 4px !important; }
  .nmr-summary-cards { page-break-inside: avoid !important; }
  .nmr-summary-cards > div { border: 0.5px solid #999 !important; padding: 4px !important; }
}
`;

const SKILL_TYPES = ['Mason','Carpenter','Barbender','Scaffolder','Plumber','Electrician','Painter','Helper','Unskilled','Supervisor','Engineer','Other'];
const ATT_STATUS  = { present:'bg-emerald-100 text-emerald-700', absent:'bg-red-100 text-red-700', half_day:'bg-amber-100 text-amber-700', holiday:'bg-blue-100 text-blue-700' };
const ATT_CELL    = { present:'P', absent:'A', half_day:'H', holiday:'–' };
const ATT_CELL_BG = { present:'bg-emerald-100 text-emerald-800', absent:'bg-red-100 text-red-700', half_day:'bg-amber-100 text-amber-700', holiday:'bg-slate-100 text-slate-500' };

const NMR_STATUS = {
  draft:     { bg:'bg-slate-100',   text:'text-slate-600',   label:'Draft' },
  submitted: { bg:'bg-blue-100',    text:'text-blue-700',    label:'Submitted' },
  checked:   { bg:'bg-amber-100',   text:'text-amber-700',   label:'Checked' },
  approved:  { bg:'bg-emerald-100', text:'text-emerald-700', label:'Approved' },
  billed:    { bg:'bg-purple-100',  text:'text-purple-700',  label:'Billed' },
};

const fmt = (n) => `₹${Number(n||0).toLocaleString('en-IN',{maximumFractionDigits:0})}`;
const inp = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-300 transition';

// ─── Inline-editable ESSL biometric code cell ────────────────────────────────
// Links a worker to the numeric EmployeeCode ESSL uses on the biometric device
// (worker_code like WKR-0001 is an internal ERP id and never matches ESSL).
function EsslCodeCell({ worker, onSave }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(worker.essl_emp_code || '');

  const commit = () => {
    setEditing(false);
    if ((val || '') !== (worker.essl_emp_code || '')) onSave(val || null);
  };

  if (editing) return (
    <input autoFocus value={val} onChange={e=>setVal(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key==='Enter') commit(); if (e.key==='Escape') setEditing(false); }}
      placeholder="e.g. 2230120"
      className="w-24 border border-blue-400 rounded-lg px-2 py-1 text-xs font-mono outline-none focus:ring-2 focus:ring-blue-200"
    />
  );
  return (
    <button onClick={()=>{ setVal(worker.essl_emp_code||''); setEditing(true); }}
      className="text-xs font-mono px-2 py-1 rounded-lg hover:bg-blue-50 border border-transparent hover:border-blue-200 transition min-w-[70px] text-left">
      {worker.essl_emp_code
        ? <span className="text-slate-700 font-semibold">{worker.essl_emp_code}</span>
        : <span className="text-amber-600 flex items-center gap-1"><AlertTriangle className="w-3 h-3"/> Not set</span>}
    </button>
  );
}

// ─── Create NMR Modal ─────────────────────────────────────────────────────────
function CreateNMRModal({ wos, onClose }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    wo_id: '', sc_id: '',
    period_from: dayjs().startOf('week').format('YYYY-MM-DD'),
    period_to:   dayjs().endOf('week').format('YYYY-MM-DD'),
    remarks: '',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // When WO selected, auto-fill sc_id
  const handleWOChange = (id) => {
    const wo = wos.find(w => w.id === id);
    set('wo_id', id);
    if (wo) set('sc_id', wo.sc_id);
  };

  // Preview count
  const { data: preview } = useQuery({
    queryKey: ['nmr-preview-count', form.wo_id, form.period_from, form.period_to],
    queryFn: async () => {
      if (!form.wo_id || !form.period_from || !form.period_to) return null;
      const [att, workers] = await Promise.all([
        scAPI.listAttendance({ sc_id: form.sc_id, from_date: form.period_from, to_date: form.period_to }).then(r => r.data?.data || []),
        scAPI.listWorkers({ sc_id: form.sc_id }).then(r => r.data?.data || []),
      ]);
      return { att: att.length, workers: workers.length };
    },
    enabled: !!form.wo_id,
    staleTime: 0,
  });

  const mut = useMutation({
    mutationFn: () => scAPI.createNMR(form),
    onSuccess: () => { toast.success('NMR created from attendance records'); qc.invalidateQueries({ queryKey: ['sc-nmr'] }); onClose(); },
    onError: e => toast.error(e?.response?.data?.error || 'Failed to create NMR'),
  });

  const labourWOs = wos.filter(w => w.contractor_type === 'labour_contractor' && ['active','approved'].includes(w.status));
  const days = form.period_from && form.period_to
    ? dayjs(form.period_to).diff(dayjs(form.period_from), 'day') + 1 : 0;

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col overflow-hidden">
      <div className="flex-shrink-0 flex items-center justify-between px-6 py-4"
        style={{ background: `linear-gradient(135deg, ${Theme.navy} 0%, ${Theme.navyDark} 100%)` }}>
        <div>
          <h2 className="font-bold text-white text-base">Create Nominal Muster Roll (NMR)</h2>
          <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.65)' }}>
            Attendance for the selected period is auto-pulled and wages computed
          </p>
        </div>
        <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-white"
          style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.20)' }}>
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-5">

        {labourWOs.length === 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-2 text-sm text-amber-800">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            No active Labour Contractor work orders found. Create a WO for a Labour Contractor first.
          </div>
        )}

        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
            Work Order (Labour Contractor) <span className="text-red-400">*</span>
          </label>
          <select value={form.wo_id} onChange={e => handleWOChange(e.target.value)} className={inp}>
            <option value="">— Select Labour Contractor Work Order —</option>
            {labourWOs.map(w => (
              <option key={w.id} value={w.id}>
                {w.wo_number} — {w.sc_name} — {w.project_name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Period From <span className="text-red-400">*</span></label>
            <input type="date" value={form.period_from} onChange={e => set('period_from', e.target.value)} className={inp} />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Period To <span className="text-red-400">*</span></label>
            <input type="date" value={form.period_to} onChange={e => set('period_to', e.target.value)} className={inp} min={form.period_from} />
          </div>
        </div>

        {/* Preview summary */}
        {form.wo_id && (
          <div className={clsx('rounded-xl p-4 border', preview ? 'bg-blue-50 border-blue-200' : 'bg-slate-50 border-slate-200')}>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">Attendance Preview for Period</p>
            <div className="grid grid-cols-3 gap-3">
              {[
                { l: 'Period (days)', v: days, color: 'text-slate-800' },
                { l: 'Workers found', v: preview?.workers ?? '…', color: 'text-blue-700' },
                { l: 'Attendance records', v: preview?.att ?? '…', color: 'text-emerald-700' },
              ].map(({ l, v, color }) => (
                <div key={l} className="bg-white border border-slate-100 rounded-xl p-3 text-center">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">{l}</p>
                  <p className={clsx('text-2xl font-bold', color)}>{v}</p>
                </div>
              ))}
            </div>
            {preview?.att === 0 && (
              <p className="text-xs text-amber-700 mt-2 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> No attendance records found for this period. Mark attendance first, then create the NMR.
              </p>
            )}
          </div>
        )}

        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Remarks</label>
          <textarea value={form.remarks} onChange={e => set('remarks', e.target.value)} rows={2} className={inp + ' resize-none'} placeholder="Optional remarks…" />
        </div>

        <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3 text-xs text-indigo-700">
          <strong>How wages are computed:</strong>
          <ul className="mt-1 space-y-0.5 list-disc list-inside">
            <li>Present (full day) = Daily Rate × 1.0</li>
            <li>Half Day = Daily Rate × 0.5</li>
            <li>Overtime = OT hours × (Daily Rate ÷ 8)</li>
            <li>Absent / Holiday = ₹0</li>
          </ul>
          <p className="mt-1.5">Total wages from NMR become the <strong>Gross Amount</strong> of the Labour Bill.</p>
        </div>
      </div>

      <div className="flex-shrink-0 flex justify-end gap-3 px-6 py-4 border-t bg-slate-50/60">
        <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600">Cancel</button>
        <button onClick={() => mut.mutate()} disabled={!form.wo_id || !form.period_from || !form.period_to || mut.isPending}
          className="px-5 py-2 text-white text-sm font-bold rounded-lg disabled:opacity-40"
          style={{ background: `linear-gradient(135deg, ${Theme.navyLight} 0%, ${Theme.navyDark} 100%)` }}>
          {mut.isPending ? 'Creating…' : 'Create NMR'}
        </button>
      </div>
    </div>
  );
}

// ─── NMR Detail Drawer ────────────────────────────────────────────────────────
function NMRDrawer({ nmrId, onClose }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [comment, setComment] = useState('');

  const { data: raw, isLoading } = useQuery({
    queryKey: ['sc-nmr-detail', nmrId],
    queryFn: () => scAPI.previewNMR(nmrId).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    staleTime: 0, enabled: !!nmrId,
  });

  const mutOpts = (msg) => ({
    onSuccess: () => { toast.success(msg); qc.invalidateQueries({ queryKey: ['sc-nmr'] }); qc.invalidateQueries({ queryKey: ['sc-nmr-detail', nmrId] }); setComment(''); },
    onError: e => toast.error(e?.response?.data?.error || 'Failed'),
  });
  const submitMut  = useMutation({ mutationFn: () => scAPI.submitNMR(nmrId),             ...mutOpts('Submitted') });
  const checkMut   = useMutation({ mutationFn: () => scAPI.checkNMR(nmrId, { remarks: comment }), ...mutOpts('Checked') });
  const approveMut = useMutation({ mutationFn: () => scAPI.approveNMR(nmrId, { remarks: comment }), ...mutOpts('Approved') });
  const billMut    = useMutation({
    mutationFn: () => scAPI.raiseBillNMR(nmrId),
    onSuccess: (r) => {
      const bill = r.data.data.bill;
      toast.success(`Bill ${bill.bill_number} created — ₹${Number(bill.gross_amount).toLocaleString('en-IN',{maximumFractionDigits:0})}. Opening measurement sheet…`);
      qc.invalidateQueries({ queryKey: ['sc-nmr'] });
      qc.invalidateQueries({ queryKey: ['sc-bills'] });
      qc.invalidateQueries({ queryKey: ['sc-nmr-detail', nmrId] });
      onClose();
      // Land straight on the new bill's detail/edit view — the NMR only
      // seeds a single "Labour Charges" line item, so the user needs to
      // get to the measurement sheet immediately to break it down further.
      navigate(`/sc/bill-preparation?bill_id=${bill.id}`);
    },
    onError: e => toast.error(e?.response?.data?.error || 'Failed to raise bill'),
  });

  const nmr     = raw?.nmr;
  const dates   = raw?.dates || [];
  const workers = raw?.workers || [];
  const woSummary = raw?.wo_summary || [];
  const sm      = NMR_STATUS[nmr?.status] || NMR_STATUS.draft;

  // Split the roll into Skilled / Unskilled sections, each with its own
  // subtotals, so the muster roll reads the same way the WO is priced.
  const sections = useMemo(() => {
    const mk = (label, rows, accent) => ({
      label, rows, accent,
      mandays:  rows.reduce((s, w) => s + Number(w.mandays || 0), 0),
      otHours:  rows.reduce((s, w) => s + Number(w.overtime_hours || 0), 0),
      dayWages: rows.reduce((s, w) => s + Number(w.day_wages || 0), 0),
      otWages:  rows.reduce((s, w) => s + Number(w.ot_wages || 0), 0),
      total:    rows.reduce((s, w) => s + Number(w.total_wages || 0), 0),
    });
    const out = [];
    const skilled   = workers.filter(w => w.is_skilled);
    const unskilled = workers.filter(w => !w.is_skilled);
    if (skilled.length)   out.push(mk('Skilled',   skilled,   'emerald'));
    if (unskilled.length) out.push(mk('Unskilled', unskilled, 'blue'));
    return out;
  }, [workers]);

  const grand = useMemo(() => ({
    mandays:  sections.reduce((s, g) => s + g.mandays,  0),
    otHours:  sections.reduce((s, g) => s + g.otHours,  0),
    dayWages: sections.reduce((s, g) => s + g.dayWages, 0),
    otWages:  sections.reduce((s, g) => s + g.otWages,  0),
    total:    sections.reduce((s, g) => s + g.total,    0),
  }), [sections]);

  // ── Export helpers ─────────────────────────────────────────────────────────
  const fileBase   = nmr ? `${nmr.nmr_number}-Muster-Roll` : 'Muster-Roll';
  const periodText = nmr ? `${dayjs(nmr.period_from).format('DD MMM YYYY')} – ${dayjs(nmr.period_to).format('DD MMM YYYY')}` : '';
  const subtitle   = nmr ? `${nmr.sc_name} · ${nmr.project_name} · ${periodText}` : '';

  // Attendance code per day, with hours in the cell so the printed/exported
  // sheet stands on its own without the on-screen hover tooltip.
  const dayCell = (d) => {
    if (!d.status) return '';
    const code = ATT_CELL[d.status] || '';
    if (d.status !== 'present' && d.status !== 'half_day') return code;
    const h = Number(d.hours || 0), ot = Number(d.ot || 0);
    return ot > 0 ? `${code} ${h}+${ot}` : `${code} ${h}`;
  };

  const exportExcel = () => {
    if (!workers.length) return toast.error('Nothing to export');
    const wb = XLSX.utils.book_new();

    // Sheet 1 — the muster roll matrix, grouped by skill grade
    const head = ['Worker Code', 'Worker Name', 'Trade', 'Day Rate', 'OT Rate',
      ...dates.map(d => dayjs(d).format('DD-MMM')),
      'Reg Days', 'Day Amount', 'OT Hrs', 'OT Amount', 'Total'];
    const aoa = [
      ['NOMINAL MUSTER ROLL — Contract Labour (R&A) Act 1970'],
      [`NMR No.: ${nmr.nmr_number}`, '', `Contractor: ${nmr.sc_name || ''}`, '', `Project: ${nmr.project_name || ''}`],
      [`Period: ${periodText}`, '', `Status: ${sm.label}`, '', `Generated: ${dayjs().format('DD MMM YYYY HH:mm')}`],
      [],
      head,
    ];
    for (const g of sections) {
      aoa.push([`${g.label.toUpperCase()} — ${g.rows.length} worker(s)`]);
      for (const w of g.rows) {
        aoa.push([
          w.worker_code || '', w.worker_name || '', w.skill_type || '',
          Number(w.wo_day_rate || 0), Number(w.wo_ot_rate || 0),
          ...w.days.map(dayCell),
          Number(w.mandays || 0), Number(w.day_wages || 0),
          Number(w.overtime_hours || 0), Number(w.ot_wages || 0), Number(w.total_wages || 0),
        ]);
      }
      aoa.push([`${g.label} Subtotal`, '', '', '', '', ...dates.map(() => ''),
        g.mandays, g.dayWages, g.otHours, g.otWages, g.total]);
    }
    aoa.push(['GRAND TOTAL', '', '', '', '', ...dates.map(() => ''),
      grand.mandays, grand.dayWages, grand.otHours, grand.otWages, grand.total]);
    aoa.push([]);
    aoa.push(['Legend: P = Present, A = Absent, H = Half Day. Cell shows "code hours" or "code regular+overtime".']);
    aoa.push(['Regular = hours up to 8/day billed as man-days. Overtime = hours beyond 8/day billed at the WO hourly rate.']);

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 12 }, { wch: 24 }, { wch: 10 }, { wch: 9 }, { wch: 9 },
      ...dates.map(() => ({ wch: 8 })),
      { wch: 9 }, { wch: 12 }, { wch: 8 }, { wch: 12 }, { wch: 12 }];
    ws['!freeze'] = { xSplit: 2, ySplit: 5 };
    XLSX.utils.book_append_sheet(wb, ws, 'Muster Roll');

    // Sheet 2 — how it maps onto the work order's BOQ lines
    if (woSummary.length) {
      const boq = [
        ['BILLING AGAINST WORK ORDER BOQ'],
        [`NMR No.: ${nmr.nmr_number}`, '', `Period: ${periodText}`],
        [],
        ['#', 'Description', 'Basis', 'Trades', 'Unit', 'Qty', 'Rate', 'Amount'],
        ...woSummary.map((r, i) => [
          i + 1, r.description,
          r.basis === 'overtime' ? 'Overtime (>8 hrs/day)' : 'Regular (1 day = 8 hrs)',
          (r.skills || []).join(', '), r.unit,
          Number(r.qty || 0), Number(r.rate || 0), Number(r.amount || 0),
        ]),
        ['', 'GROSS', '', '', '', '', '', woSummary.reduce((s, r) => s + Number(r.amount || 0), 0)],
      ];
      const ws2 = XLSX.utils.aoa_to_sheet(boq);
      ws2['!cols'] = [{ wch: 5 }, { wch: 28 }, { wch: 24 }, { wch: 18 }, { wch: 8 },
        { wch: 12 }, { wch: 10 }, { wch: 14 }];
      XLSX.utils.book_append_sheet(wb, ws2, 'WO BOQ Summary');
    }

    XLSX.writeFile(wb, `${fileBase}.xlsx`);
    toast.success('Excel exported');
  };

  const exportPDF = () => {
    if (!workers.length) return toast.error('Nothing to export');
    // Wide date matrix — landscape, and A3 once the period runs long enough
    // that A4 columns would collapse to unreadable slivers.
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: dates.length > 20 ? 'a3' : 'a4' });
    const pageW = doc.internal.pageSize.getWidth();

    doc.setFontSize(13); doc.setTextColor(27, 58, 107); doc.setFont(undefined, 'bold');
    doc.text('NOMINAL MUSTER ROLL', pageW / 2, 12, { align: 'center' });
    doc.setFontSize(8); doc.setFont(undefined, 'normal'); doc.setTextColor(90);
    doc.text('Contract Labour (Regulation & Abolition) Act, 1970', pageW / 2, 17, { align: 'center' });
    doc.setFontSize(8.5); doc.setTextColor(40);
    doc.text(`NMR No.: ${nmr.nmr_number}   |   ${nmr.sc_name || ''}   |   ${nmr.project_name || ''}`, 10, 24);
    doc.text(`Period: ${periodText}   |   Status: ${sm.label}   |   Generated: ${dayjs().format('DD MMM YYYY HH:mm')}`, 10, 28.5);

    const head = [['Code', 'Worker Name', 'Trade',
      ...dates.map(d => dayjs(d).format('DD')),
      'Reg\nDays', 'Day Amt', 'OT\nHrs', 'OT Amt', 'Total']];

    const body = [];
    for (const g of sections) {
      body.push([{
        content: `${g.label.toUpperCase()}  —  ${g.rows.length} worker${g.rows.length !== 1 ? 's' : ''}`,
        colSpan: head[0].length,
        styles: { fontStyle: 'bold', fillColor: g.accent === 'emerald' ? [209, 250, 229] : [219, 234, 254], textColor: [15, 60, 45] },
      }]);
      for (const w of g.rows) {
        body.push([
          w.worker_code || '', w.worker_name || '', w.skill_type || '',
          ...w.days.map(dayCell),
          Number(w.mandays || 0).toFixed(2), fmt(w.day_wages),
          Number(w.overtime_hours || 0) > 0 ? Number(w.overtime_hours).toFixed(1) : '-',
          Number(w.ot_wages || 0) > 0 ? fmt(w.ot_wages) : '-',
          fmt(w.total_wages),
        ]);
      }
      body.push([
        { content: `${g.label} Subtotal`, colSpan: 3 + dates.length, styles: { fontStyle: 'bold', halign: 'right' } },
        { content: g.mandays.toFixed(2), styles: { fontStyle: 'bold' } },
        { content: fmt(g.dayWages),      styles: { fontStyle: 'bold' } },
        { content: g.otHours.toFixed(1), styles: { fontStyle: 'bold' } },
        { content: fmt(g.otWages),       styles: { fontStyle: 'bold' } },
        { content: fmt(g.total),         styles: { fontStyle: 'bold' } },
      ]);
    }

    autoTable(doc, {
      startY: 32,
      head, body,
      theme: 'grid',
      headStyles: { fillColor: [27, 58, 107], textColor: 255, fontSize: 6, fontStyle: 'bold', halign: 'center', valign: 'middle' },
      bodyStyles: { fontSize: 6, cellPadding: 1 },
      columnStyles: {
        0: { cellWidth: 14 }, 1: { cellWidth: 30 }, 2: { cellWidth: 14 },
        ...Object.fromEntries(dates.map((_, i) => [3 + i, { halign: 'center', cellWidth: 'auto' }])),
      },
      foot: [[
        { content: 'GRAND TOTAL', colSpan: 3 + dates.length, styles: { halign: 'right' } },
        grand.mandays.toFixed(2), fmt(grand.dayWages),
        grand.otHours.toFixed(1), fmt(grand.otWages), fmt(grand.total),
      ]],
      footStyles: { fillColor: [255, 237, 213], textColor: [124, 45, 18], fontStyle: 'bold', fontSize: 6.5 },
      margin: { left: 8, right: 8 },
    });

    // WO BOQ mapping
    if (woSummary.length) {
      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 6,
        head: [['#', 'Work Order BOQ Description', 'Basis', 'Trades', 'Unit', 'Qty', 'Rate', 'Amount']],
        body: woSummary.map((r, i) => [
          i + 1, r.description,
          r.basis === 'overtime' ? 'Overtime (>8 hrs/day)' : 'Regular (1 day = 8 hrs)',
          (r.skills || []).join(', '), r.unit,
          Number(r.qty || 0).toLocaleString('en-IN'),
          `${Number(r.rate || 0).toFixed(2)}`, fmt(r.amount),
        ]),
        foot: [[{ content: 'GROSS', colSpan: 7, styles: { halign: 'right' } },
          fmt(woSummary.reduce((s, r) => s + Number(r.amount || 0), 0))]],
        theme: 'grid',
        headStyles: { fillColor: [27, 58, 107], textColor: 255, fontSize: 7, fontStyle: 'bold' },
        bodyStyles: { fontSize: 7 },
        footStyles: { fillColor: [255, 237, 213], textColor: [124, 45, 18], fontStyle: 'bold', fontSize: 7.5 },
        columnStyles: { 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' } },
        margin: { left: 8, right: 8 },
      });
    }

    // Legend + signatures
    let y = doc.lastAutoTable.finalY + 6;
    doc.setFontSize(6.5); doc.setTextColor(110);
    doc.text('Legend: P = Present, A = Absent, H = Half Day. Cell shows "code hours" or "code regular+overtime".', 8, y);
    doc.text('Regular = hours up to 8/day billed as man-days. Overtime = hours beyond 8/day billed at the WO hourly rate.', 8, y + 3.5);

    y += 16;
    const colW = (pageW - 16) / NMR_SIGNATORIES.length;
    doc.setDrawColor(60);
    NMR_SIGNATORIES.forEach((sig, i) => {
      const x = 8 + i * colW;
      doc.line(x + 4, y, x + colW - 8, y);
      doc.setFontSize(7); doc.setTextColor(27, 58, 107); doc.setFont(undefined, 'bold');
      doc.text(sig.role, x + colW / 2, y + 4, { align: 'center' });
      doc.setFontSize(6.5); doc.setTextColor(110); doc.setFont(undefined, 'normal');
      doc.text(sig.name, x + colW / 2, y + 7.5, { align: 'center' });
    });

    doc.save(`${fileBase}.pdf`);
    toast.success('PDF downloaded');
  };

  return (
    <div className="fixed inset-0 z-50 flex nmr-drawer-root">
      <style>{REPORT_PRINT_CSS_LANDSCAPE}{NMR_PRINT_CSS}</style>
      <div className="w-full bg-white shadow-2xl flex flex-col overflow-hidden nmr-drawer-panel">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 no-print"
          style={{ background: `linear-gradient(135deg, ${Theme.navy} 0%, ${Theme.navyDark} 100%)` }}>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-emerald-300 text-xs font-bold">{nmr?.nmr_number || '…'}</span>
              <span className={clsx('text-[10px] px-2 py-0.5 rounded-full font-bold', sm.bg, sm.text)}>{sm.label}</span>
            </div>
            <p className="font-bold text-white text-sm mt-0.5">{nmr?.sc_name} — {nmr?.project_name}</p>
            <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.6)' }}>
              {nmr ? `${dayjs(nmr.period_from).format('DD MMM')} – ${dayjs(nmr.period_to).format('DD MMM YYYY')}` : ''}
              &nbsp;· {nmr?.total_workers || 0} workers · {nmr?.total_mandays || 0} man-days
            </p>
          </div>
          <div className="flex items-center gap-2">
            {nmr && workers.length > 0 && (
              <>
                <button onClick={() => window.print()} title="Print muster roll (A4 landscape)"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-xs font-bold hover:bg-white/20 transition"
                  style={{ background: 'rgba(255,255,255,0.12)' }}>
                  <Printer className="w-3.5 h-3.5" /> Print
                </button>
                <button onClick={exportPDF} title="Download as PDF"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-xs font-bold hover:bg-white/20 transition"
                  style={{ background: 'rgba(255,255,255,0.12)' }}>
                  <Download className="w-3.5 h-3.5" /> PDF
                </button>
                <button onClick={exportExcel} title="Export to Excel"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-xs font-bold hover:bg-white/20 transition"
                  style={{ background: 'rgba(255,255,255,0.12)' }}>
                  <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
                </button>
                <div className="w-px h-6 mx-1" style={{ background: 'rgba(255,255,255,0.2)' }} />
              </>
            )}
            <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-white" style={{ background: 'rgba(255,255,255,0.10)' }}>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div id="report-print-root" className="flex-1 overflow-y-auto p-4 space-y-4">
          {isLoading ? (
            <div className="space-y-3">{[1,2,3].map(n => <div key={n} className="h-16 bg-slate-100 rounded-xl animate-pulse" />)}</div>
          ) : nmr && (
            <>
              {/* Statutory header — print only */}
              <ReportPrintHeader
                reportTitle="NOMINAL MUSTER ROLL"
                subtitle={`Contract Labour (Regulation & Abolition) Act, 1970  ·  ${nmr.nmr_number}  ·  ${subtitle}  ·  Status: ${sm.label}`}
              />

              {/* Summary cards — regular vs overtime split, priced at WO rates */}
              <div className="grid grid-cols-5 gap-3 nmr-summary-cards">
                {[
                  { l: 'Total Workers',     v: nmr.total_workers,                          color: 'text-blue-700' },
                  { l: 'Regular Man-days',  v: grand.mandays.toFixed(2),                   color: 'text-indigo-700', sub: '≤ 8 hrs/day' },
                  { l: 'Overtime Hours',    v: grand.otHours.toFixed(1),                   color: 'text-amber-700',  sub: '> 8 hrs/day' },
                  { l: 'Day Wages',         v: fmt(grand.dayWages),                        color: 'text-emerald-700' },
                  { l: 'Total Wages',       v: fmt(grand.total || nmr.total_wages),        color: 'text-orange-700', big: true, sub: `incl. ${fmt(grand.otWages)} OT` },
                ].map(({ l, v, color, big, sub }) => (
                  <div key={l} className={clsx('border rounded-xl p-3', big ? 'border-orange-200 bg-orange-50' : 'border-slate-100 bg-white')}>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">{l}</p>
                    <p className={clsx('font-bold', big ? 'text-xl' : 'text-lg', color)}>{v}</p>
                    {sub && <p className="text-[9px] text-slate-400 mt-0.5">{sub}</p>}
                  </div>
                ))}
              </div>

              {/* WO line items this NMR bills against */}
              {woSummary.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                    Billing Against Work Order BOQ
                  </p>
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-xs nmr-boq-table">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          {['#','Description','Basis','Trades','Unit','Qty','Rate','Amount'].map((h,i) => (
                            <th key={h} className={clsx('px-3 py-2 font-bold text-slate-500 uppercase tracking-wider text-[9px]',
                              i >= 5 ? 'text-right' : 'text-left')}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {woSummary.map((r, i) => (
                          <tr key={i} className={clsx('border-t border-slate-100', i % 2 ? 'bg-slate-50/40' : 'bg-white')}>
                            <td className="px-3 py-2 text-slate-400">{i+1}</td>
                            <td className="px-3 py-2 font-semibold text-slate-800">{r.description}</td>
                            <td className="px-3 py-2">
                              <span className={clsx('px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide',
                                r.basis === 'overtime' ? 'bg-amber-100 text-amber-700' : 'bg-indigo-100 text-indigo-700')}>
                                {r.basis === 'overtime' ? 'Overtime' : 'Regular (1 day = 8 hrs)'}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-slate-500">{(r.skills || []).join(', ')}</td>
                            <td className="px-3 py-2 text-slate-500 uppercase text-[10px]">{r.unit}</td>
                            <td className="px-3 py-2 text-right font-bold text-slate-700 tabular-nums">{Number(r.qty).toLocaleString('en-IN')}</td>
                            <td className="px-3 py-2 text-right text-slate-600 tabular-nums">₹{Number(r.rate).toFixed(2)}</td>
                            <td className="px-3 py-2 text-right font-bold text-emerald-700 tabular-nums">{fmt(r.amount)}</td>
                          </tr>
                        ))}
                        <tr className="border-t-2 border-slate-300 bg-slate-50 font-bold">
                          <td className="px-3 py-2.5 text-slate-700" colSpan={7}>GROSS</td>
                          <td className="px-3 py-2.5 text-right text-orange-700 text-sm tabular-nums">
                            {fmt(woSummary.reduce((s,r) => s + Number(r.amount||0), 0))}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Worker-Day Matrix — the actual muster roll */}
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                  Nominal Muster Roll — Worker Attendance Matrix
                </p>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="text-xs nmr-matrix-table">
                      <thead style={{ background: `linear-gradient(90deg, ${Theme.navy} 0%, ${Theme.navyDark} 100%)` }}>
                        <tr>
                          <th className="px-3 py-2 text-left text-white/80 whitespace-nowrap sticky left-0 z-10" style={{ background: Theme.navyDark, minWidth: 140 }}>Worker</th>
                          <th className="px-2 py-2 text-white/80 whitespace-nowrap" style={{ minWidth: 70 }}>Trade / Rate</th>
                          {dates.map(d => (
                            <th key={d} className="px-1.5 py-2 text-center text-white/80 whitespace-nowrap" style={{ minWidth: 36 }}>
                              <div>{dayjs(d).format('ddd')}</div>
                              <div style={{ fontSize: 9 }}>{dayjs(d).format('D')}</div>
                            </th>
                          ))}
                          <th className="px-2 py-2 text-center text-white/80 whitespace-nowrap border-l border-white/20">
                            <div>Reg Days</div><div style={{ fontSize: 8 }}>≤8 hrs</div>
                          </th>
                          <th className="px-2 py-2 text-right text-white/80 whitespace-nowrap">Day ₹</th>
                          <th className="px-2 py-2 text-center text-white/80 whitespace-nowrap border-l border-white/20">
                            <div>OT Hrs</div><div style={{ fontSize: 8 }}>&gt;8 hrs</div>
                          </th>
                          <th className="px-2 py-2 text-right text-white/80 whitespace-nowrap">OT ₹</th>
                          <th className="px-3 py-2 text-right text-white/80 whitespace-nowrap border-l border-white/20">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sections.map(g => (
                          <React.Fragment key={g.label}>
                            {/* Section header — Skilled / Unskilled */}
                            <tr className={clsx('border-t-2', g.accent === 'emerald'
                              ? 'bg-emerald-50 border-emerald-300' : 'bg-blue-50 border-blue-300')}>
                              <td className={clsx('px-3 py-1.5 sticky left-0 z-10 font-bold uppercase tracking-widest text-[10px]',
                                g.accent === 'emerald' ? 'bg-emerald-50 text-emerald-800' : 'bg-blue-50 text-blue-800')}
                                colSpan={2}>
                                {g.label} · {g.rows.length} worker{g.rows.length !== 1 ? 's' : ''}
                              </td>
                              <td colSpan={dates.length + 5} />
                            </tr>

                            {g.rows.map((w, i) => (
                              <tr key={w.id || w.worker_id || i} className={clsx('border-t border-slate-100', i % 2 === 0 ? 'bg-white' : 'bg-slate-50/30')}>
                                <td className="px-3 py-2 sticky left-0 z-10 bg-inherit">
                                  <p className="font-semibold text-slate-800 whitespace-nowrap">{w.worker_name}</p>
                                  <p className="text-[10px] font-mono text-slate-400">{w.worker_code}</p>
                                </td>
                                <td className="px-2 py-2 whitespace-nowrap">
                                  <p className="text-slate-600">{w.skill_type}</p>
                                  <p className="text-[10px] font-bold text-indigo-600">
                                    ₹{Number(w.wo_day_rate || 0).toFixed(0)}/day
                                    {w.wo_ot_rate > 0 && (
                                      <span className="text-amber-600"> · ₹{Number(w.wo_ot_rate).toFixed(2)}/hr</span>
                                    )}
                                  </p>
                                </td>
                                {w.days.map(day => {
                                  const st = day.status;
                                  const bg = st ? ATT_CELL_BG[st] : 'text-slate-400';
                                  const otDay = Number(day.ot || 0) > 0;
                                  return (
                                    <td key={day.date} className="px-1 py-2 text-center">
                                      <span
                                        title={st ? `${day.hours || 0} hrs${otDay ? ` + ${day.ot} OT` : ''}` : 'No record'}
                                        className={clsx('inline-block w-7 h-6 rounded text-[10px] font-bold flex items-center justify-center',
                                          bg || 'text-slate-400', otDay && 'ring-1 ring-amber-400')}>
                                        {st ? ATT_CELL[st] : '–'}
                                      </span>
                                      {st && (day.hours || day.ot) ? (
                                        <span className="nmr-print-hrs">
                                          &nbsp;{Number(day.hours || 0)}{otDay ? `+${Number(day.ot)}` : ''}
                                        </span>
                                      ) : null}
                                    </td>
                                  );
                                })}
                                <td className="px-2 py-2 text-center font-bold text-indigo-700 tabular-nums border-l border-slate-200">{Number(w.mandays).toFixed(2)}</td>
                                <td className="px-2 py-2 text-right text-slate-700 tabular-nums">{fmt(w.day_wages)}</td>
                                <td className="px-2 py-2 text-center font-bold text-amber-700 tabular-nums border-l border-slate-200">{w.overtime_hours > 0 ? Number(w.overtime_hours).toFixed(1) : '—'}</td>
                                <td className="px-2 py-2 text-right text-amber-700 tabular-nums">{w.ot_wages > 0 ? fmt(w.ot_wages) : '—'}</td>
                                <td className="px-3 py-2 text-right font-bold text-emerald-700 tabular-nums border-l border-slate-200">{fmt(w.total_wages)}</td>
                              </tr>
                            ))}

                            {/* Section subtotal */}
                            <tr className={clsx('border-t font-bold',
                              g.accent === 'emerald' ? 'bg-emerald-50/60 border-emerald-200' : 'bg-blue-50/60 border-blue-200')}>
                              <td className={clsx('px-3 py-2 sticky left-0 z-10 text-[11px]',
                                g.accent === 'emerald' ? 'bg-emerald-50 text-emerald-800' : 'bg-blue-50 text-blue-800')}
                                colSpan={2}>
                                {g.label} Subtotal
                              </td>
                              {dates.map(d => <td key={d} />)}
                              <td className="px-2 py-2 text-center text-indigo-700 tabular-nums border-l border-slate-200">{g.mandays.toFixed(2)}</td>
                              <td className="px-2 py-2 text-right text-slate-700 tabular-nums">{fmt(g.dayWages)}</td>
                              <td className="px-2 py-2 text-center text-amber-700 tabular-nums border-l border-slate-200">{g.otHours.toFixed(1)}</td>
                              <td className="px-2 py-2 text-right text-amber-700 tabular-nums">{fmt(g.otWages)}</td>
                              <td className="px-3 py-2 text-right text-emerald-700 tabular-nums border-l border-slate-200">{fmt(g.total)}</td>
                            </tr>
                          </React.Fragment>
                        ))}

                        {/* Grand total row */}
                        <tr className="border-t-2 border-slate-400 bg-slate-100 font-bold">
                          <td className="px-3 py-2.5 sticky left-0 bg-slate-100" colSpan={2}>GRAND TOTAL</td>
                          {dates.map(d => <td key={d} />)}
                          <td className="px-2 py-2.5 text-center text-indigo-700 text-sm tabular-nums border-l border-slate-300">{grand.mandays.toFixed(2)}</td>
                          <td className="px-2 py-2.5 text-right text-slate-800 tabular-nums">{fmt(grand.dayWages)}</td>
                          <td className="px-2 py-2.5 text-center text-amber-700 text-sm tabular-nums border-l border-slate-300">{grand.otHours.toFixed(1)}</td>
                          <td className="px-2 py-2.5 text-right text-amber-700 tabular-nums">{fmt(grand.otWages)}</td>
                          <td className="px-3 py-2.5 text-right text-orange-700 text-base tabular-nums border-l border-slate-300">{fmt(grand.total)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Legend */}
              <div className="flex items-center gap-3 flex-wrap">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Legend:</p>
                {[['P','Present','bg-emerald-100 text-emerald-800'],['A','Absent','bg-red-100 text-red-700'],['H','Half Day','bg-amber-100 text-amber-700'],['–','No Record','text-slate-400']].map(([code,label,cls])=>(
                  <div key={code} className="flex items-center gap-1">
                    <span className={clsx('inline-flex w-6 h-5 rounded text-[10px] font-bold items-center justify-center', cls)}>{code}</span>
                    <span className="text-[11px] text-slate-500">{label}</span>
                  </div>
                ))}
                <div className="flex items-center gap-1">
                  <span className="inline-flex w-6 h-5 rounded text-[10px] font-bold items-center justify-center bg-emerald-100 text-emerald-800 ring-1 ring-amber-400">P</span>
                  <span className="text-[11px] text-slate-500">Worked &gt; 8 hrs (has OT)</span>
                </div>
                <span className="text-[11px] text-slate-400 italic no-print">Hover any cell for hours worked</span>
                <span className="text-[11px] text-slate-500 print-only">
                  Cell shows attendance code followed by hours worked (regular+overtime).
                  Regular = up to 8 hrs/day billed as man-days; overtime = hours beyond 8/day billed at the WO hourly rate.
                </span>
              </div>

              {/* Statutory signatures — print only */}
              <ReportPrintSignature signatories={NMR_SIGNATORIES} />

              {/* Approval actions */}
              {['draft','submitted','checked'].includes(nmr.status) && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3 no-print">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Remarks</label>
                    <textarea value={comment} onChange={e => setComment(e.target.value)} rows={2} className={inp + ' resize-none'} placeholder="Add remarks…" />
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {nmr.status === 'draft' && (
                      <button onClick={() => submitMut.mutate()} disabled={submitMut.isPending}
                        className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700">
                        <Send className="w-3 h-3" /> Submit for Check
                      </button>
                    )}
                    {nmr.status === 'submitted' && (
                      <button onClick={() => checkMut.mutate()} disabled={checkMut.isPending}
                        className="flex items-center gap-1 px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-bold hover:bg-amber-600">
                        <CheckCircle2 className="w-3 h-3" /> Mark Checked
                      </button>
                    )}
                    {['submitted','checked'].includes(nmr.status) && (
                      <button onClick={() => approveMut.mutate()} disabled={approveMut.isPending}
                        className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700">
                        <ThumbsUp className="w-3 h-3" /> Approve NMR
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Raise Bill (approved NMR only) */}
              {nmr.status === 'approved' && !nmr.bill_id && (
                <div className="bg-emerald-50 border-2 border-emerald-300 rounded-xl p-4 flex items-center justify-between no-print">
                  <div>
                    <p className="text-sm font-bold text-emerald-800">NMR Approved — Ready to raise bill</p>
                    <p className="text-xs text-emerald-700 mt-0.5">
                      Bill will be created with Gross Amount = <strong>{fmt(nmr.total_wages)}</strong>
                    </p>
                  </div>
                  <button onClick={() => billMut.mutate()} disabled={billMut.isPending}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 disabled:opacity-50 flex-shrink-0">
                    <Receipt className="w-4 h-4" /> {billMut.isPending ? 'Raising…' : 'Raise Labour Bill'}
                  </button>
                </div>
              )}

              {/* Already billed */}
              {nmr.bill_id && (
                <div className="bg-purple-50 border border-purple-200 rounded-xl px-4 py-3 flex items-center gap-2 text-sm text-purple-800 no-print">
                  <Receipt className="w-4 h-4 flex-shrink-0 text-purple-600" />
                  Bill raised from this NMR. View in <strong>Bill Preparation</strong> to track approval &amp; payment.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── ESSL Sync Modal ──────────────────────────────────────────────────────────
function EsslSyncModal({ onClose }) {
  const qc = useQueryClient();
  const [syncDate,   setSyncDate]   = useState(new Date().toISOString().slice(0,10));
  const [toDate,     setToDate]     = useState(new Date().toISOString().slice(0,10));
  const [overwrite,  setOverwrite]  = useState(false);
  const [preview,    setPreview]    = useState(null);
  const [syncing,    setSyncing]    = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [result,     setResult]     = useState(null);

  const fmtWage = (n) => `₹${Number(n||0).toLocaleString('en-IN',{maximumFractionDigits:0})}`;

  const handlePreview = async () => {
    setPreviewing(true); setPreview(null);
    try {
      const r = await hrEsslAPI.previewSC({ from: syncDate, to: toDate });
      setPreview(r.data?.data);
    } catch(e) {
      toast.error(e?.response?.data?.error || 'Preview failed — check ESSL Settings in HR module');
    } finally { setPreviewing(false); }
  };

  const handleSync = async () => {
    setSyncing(true); setResult(null);
    try {
      const r = await hrEsslAPI.syncSC({ from: syncDate, to: toDate, overwrite });
      setResult(r.data?.data);
      toast.success(r.data.message);
      qc.invalidateQueries({ queryKey:['sc-attendance'] });
    } catch(e) {
      toast.error(e?.response?.data?.error || 'Sync failed');
    } finally { setSyncing(false); }
  };

  const STATUS_BADGE = { present:'bg-emerald-100 text-emerald-700', half_day:'bg-amber-100 text-amber-700', absent:'bg-red-100 text-red-700' };

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col overflow-hidden">
      <div className="flex-shrink-0 flex items-center justify-between px-6 py-4"
        style={{background:`linear-gradient(135deg, ${Theme.navy} 0%, ${Theme.navyDark} 100%)`}}>
        <div>
          <p className="font-bold text-white text-base">Sync Attendance from ESSL Biometric</p>
          <p className="text-xs mt-0.5" style={{color:'rgba(255,255,255,0.65)'}}>Pulls punch records from ESSL server and creates attendance entries</p>
        </div>
        <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-white"
          style={{background:'rgba(255,255,255,0.10)',border:'1px solid rgba(255,255,255,0.20)'}}>
          <X className="w-4 h-4"/>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-5">

        {/* Date range */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">From Date *</label>
            <input type="date" value={syncDate} onChange={e=>setSyncDate(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-300"/>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">To Date</label>
            <input type="date" value={toDate} min={syncDate} onChange={e=>setToDate(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-300"/>
          </div>
        </div>

        {/* Overwrite toggle */}
        <div className={clsx('flex items-center justify-between p-3 rounded-xl border-2',overwrite?'border-amber-300 bg-amber-50':'border-slate-100')}>
          <div>
            <p className="text-sm font-semibold text-slate-700">Overwrite existing records</p>
            <p className="text-xs text-slate-400 mt-0.5">If attendance already marked for a worker+date, overwrite it with ESSL data</p>
          </div>
          <button onClick={()=>setOverwrite(p=>!p)}
            className={clsx('relative inline-flex h-6 w-11 items-center rounded-full transition-colors',overwrite?'bg-amber-500':'bg-slate-300')}>
            <span className={clsx('inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',overwrite?'translate-x-6':'translate-x-1')}/>
          </button>
        </div>

        {/* Preview section */}
        {!result && (
          <div className="flex gap-3">
            <button onClick={handlePreview} disabled={previewing}
              className="flex items-center gap-2 px-4 py-2 border-2 border-indigo-300 bg-indigo-50 text-indigo-700 rounded-xl text-sm font-bold hover:bg-indigo-100 disabled:opacity-50">
              <RefreshCw className={clsx('w-4 h-4',previewing&&'animate-spin')}/> {previewing?'Loading preview…':'Preview (Dry Run)'}
            </button>
            {preview && !result && (
              <button onClick={handleSync} disabled={syncing || preview.mapped===0}
                className="flex items-center gap-2 px-5 py-2 text-white rounded-xl text-sm font-bold disabled:opacity-40"
                style={{background:'linear-gradient(135deg,#059669 0%,#047857 100%)'}}>
                <CheckCircle2 className={clsx('w-4 h-4',syncing&&'animate-spin')}/>
                {syncing?'Syncing…':`Sync ${preview.mapped} Records`}
              </button>
            )}
          </div>
        )}

        {/* Preview results */}
        {preview && !result && (
          <div>
            <div className="flex items-center gap-3 mb-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Preview — {preview.total} ESSL records ({preview.mapped} mapped to workers)</p>
              <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">Schema: {preview.schema}</span>
              {preview.total > preview.mapped && (
                <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">{preview.total-preview.mapped} not mapped</span>
              )}
            </div>
            <div className="border border-slate-200 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
              <table className="w-full text-xs">
                <thead style={{background:`linear-gradient(90deg, ${Theme.navy} 0%, ${Theme.navyDark} 100%)`}}>
                  <tr>{['ESSL Code','Worker','Date','First Punch','Last Punch','Hours','Status','Wage'].map(h=>(
                    <th key={h} className="px-3 py-2 text-left text-[10px] font-bold text-white/80 whitespace-nowrap">{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {(preview.preview||[]).map((r,i)=>(
                    <tr key={i} className={clsx('border-b border-slate-50',i%2===0?'bg-white':'bg-slate-50/30',!r.mapped&&'opacity-50')}>
                      <td className="px-3 py-2 font-mono text-slate-600">{r.emp_code}</td>
                      <td className="px-3 py-2 font-semibold text-slate-800">
                        {r.worker_name}
                        {!r.mapped && <span className="ml-1 text-[9px] bg-red-100 text-red-600 px-1 rounded">NOT MAPPED</span>}
                      </td>
                      <td className="px-3 py-2 text-slate-500">{r.date}</td>
                      <td className="px-3 py-2 font-mono text-slate-500">{r.first_punch ? new Date(r.first_punch).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}) : '—'}</td>
                      <td className="px-3 py-2 font-mono text-slate-500">{r.last_punch && r.last_punch !== r.first_punch ? new Date(r.last_punch).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}) : '—'}</td>
                      <td className="px-3 py-2 text-center">{r.hours_worked}h</td>
                      <td className="px-3 py-2">
                        <span className={clsx('text-[10px] px-2 py-0.5 rounded-full font-bold capitalize', STATUS_BADGE[r.status]||'bg-slate-100 text-slate-600')}>{r.status?.replace('_',' ')}</span>
                      </td>
                      <td className="px-3 py-2 text-right font-bold text-emerald-700">{r.mapped ? fmtWage(r.wage) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Sync result */}
        {result && (
          <div className="bg-emerald-50 border-2 border-emerald-300 rounded-xl p-5">
            <p className="font-bold text-emerald-800 text-base mb-3 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5"/> Sync Complete!
            </p>
            <div className="grid grid-cols-4 gap-3">
              {[
                ['ESSL Records', result.essl_records_found, 'text-slate-800'],
                ['New Created',  result.created,            'text-emerald-700'],
                ['Updated',      result.updated,            'text-blue-700'],
                ['Skipped',      result.skipped,            'text-slate-500'],
              ].map(([l,v,c])=>(
                <div key={l} className="bg-white border border-emerald-100 rounded-xl p-3 text-center">
                  <p className="text-[9px] font-bold text-slate-400 uppercase">{l}</p>
                  <p className={clsx('text-2xl font-bold', c)}>{v}</p>
                </div>
              ))}
            </div>
            {result.errors?.length > 0 && (
              <div className="mt-3 bg-red-50 border border-red-200 rounded-xl p-3">
                <p className="text-xs font-bold text-red-700 mb-1">{result.errors.length} errors:</p>
                {result.errors.slice(0,5).map((e,i)=>(
                  <p key={i} className="text-xs text-red-600">{e.emp_code} / {e.date}: {e.error}</p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Not configured notice */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-600">
          <p className="font-bold mb-1">Prerequisites:</p>
          <ul className="space-y-1 list-disc list-inside">
            <li>ESSL SQL Server credentials saved in <strong>HR &amp; Admin → ESSL Settings</strong></li>
            <li>Each worker must have a <strong>Worker Code</strong> matching their ESSL Employee Code</li>
            <li>ESSL ETimetracklite server must be reachable from this ERP server</li>
          </ul>
        </div>
      </div>

      <div className="flex-shrink-0 flex justify-end gap-3 px-6 py-4 border-t bg-slate-50/60">
        <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600">Close</button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function SCLabour() {
  const [tab, setTab]           = useState('workers');
  const [search, setSearch]     = useState('');
  const { selectedProjectId } = useAuthStore();
  const [projectFilter, setProject] = useState(selectedProjectId || '');
  const [scFilter, setScFilter] = useState('');
  useEffect(() => { setProject(selectedProjectId || ''); }, [selectedProjectId]);
  const [attDate, setAttDate]   = useState(new Date().toISOString().slice(0,10));
  const [showWorkerForm, setShowWorkerForm] = useState(false);
  const [showAttForm,   setShowAttForm]   = useState(false);
  const [showNMRForm,   setShowNMRForm]   = useState(false);
  const [nmrDrawer,     setNmrDrawer]     = useState(null);
  const [workerForm, setWorkerForm] = useState({ project_id:'',sc_id:'',wo_id:'',worker_name:'',skill_type:'Unskilled',daily_rate:0,mobile:'',essl_emp_code:'' });
  const [showEsslSync, setShowEsslSync] = useState(false);
  const [attForm,    setAttForm]    = useState({ project_id:'',sc_id:'',wo_id:'',worker_id:'',attendance_date:new Date().toISOString().slice(0,10),status:'present',hours_worked:8,overtime_hours:0,wage_amount:0,remarks:'' });
  const [nmrStatFilter, setNmrStat] = useState('');
  const qc = useQueryClient();

  const { data: projects=[] } = useQuery({ queryKey:['projects'], queryFn:()=>projectAPI.list().then(r=>r.data?.data??[]) });
  const { data: subs=[] }     = useQuery({ queryKey:['sc-list-all'], queryFn:()=>scAPI.listSC().then(r=>r.data?.data||[]), staleTime:0 });
  const labourContractors      = subs.filter(s => s.contractor_type==='labour_contractor' && s.status==='active');
  const allActiveContractors   = subs.filter(s => s.status==='active');

  const { data: wos=[] } = useQuery({ queryKey:['sc-wo-all'], queryFn:()=>scAPI.listWO({status:'active'}).then(r=>r.data?.data||[]), staleTime:0 });

  const { data: workers=[], refetch:refetchWorkers } = useQuery({
    queryKey:['sc-workers', projectFilter, scFilter],
    queryFn:()=>scAPI.listWorkers({project_id:projectFilter||undefined, sc_id:scFilter||undefined}).then(r=>r.data?.data||[]),
    staleTime:0,
  });
  const { data: attendance=[], refetch:refetchAtt } = useQuery({
    queryKey:['sc-attendance', projectFilter, scFilter, attDate],
    queryFn:()=>scAPI.listAttendance({project_id:projectFilter||undefined, sc_id:scFilter||undefined, from_date:attDate, to_date:attDate}).then(r=>r.data?.data||[]),
    staleTime:0, enabled: tab==='attendance',
  });
  const { data: nmrs=[], refetch:refetchNMR } = useQuery({
    queryKey:['sc-nmr', projectFilter, scFilter, nmrStatFilter],
    queryFn:()=>scAPI.listNMR({project_id:projectFilter||undefined, sc_id:scFilter||undefined, status:nmrStatFilter||undefined}).then(r=>r.data?.data||[]),
    staleTime:0, enabled: tab==='nmr',
  });

  const addWorkerMut = useMutation({
    mutationFn: d=>scAPI.createWorker(d),
    onSuccess:()=>{ toast.success('Worker added'); qc.invalidateQueries({queryKey:['sc-workers']}); setShowWorkerForm(false); setWorkerForm({project_id:'',sc_id:'',wo_id:'',worker_name:'',skill_type:'Unskilled',daily_rate:0,mobile:''}); },
    onError:e=>toast.error(e?.response?.data?.error||'Failed'),
  });
  const updateWorkerMut = useMutation({
    mutationFn: ({id,...d})=>scAPI.updateWorker(id,d),
    onSuccess:()=>{ toast.success('ESSL code saved'); qc.invalidateQueries({queryKey:['sc-workers']}); },
    onError:e=>toast.error(e?.response?.data?.error||'Failed'),
  });
  const deleteNmrMut = useMutation({
    mutationFn: (id) => scAPI.deleteNMR(id),
    onSuccess: () => { toast.success('NMR deleted'); qc.invalidateQueries({ queryKey: ['sc-nmr'] }); },
    onError: e => toast.error(e?.response?.data?.error || 'Failed to delete NMR'),
  });
  const deleteWorkerMut = useMutation({
    mutationFn: (id)=>scAPI.deleteWorker(id),
    onSuccess:()=>{ toast.success('Worker removed'); qc.invalidateQueries({queryKey:['sc-workers']}); },
    onError:e=>toast.error(e?.response?.data?.error||'Failed to delete worker'),
  });
  const markAttMut = useMutation({
    mutationFn: d=>scAPI.markAttendance(d),
    onSuccess:()=>{ toast.success('Attendance saved'); qc.invalidateQueries({queryKey:['sc-attendance']}); setShowAttForm(false); },
    onError:e=>toast.error(e?.response?.data?.error||'Failed'),
  });
  const bulkMut = useMutation({
    mutationFn: ()=>{
      const projWorkers = workers.filter(w=>!projectFilter||w.project_id===projectFilter);
      const entries = projWorkers.map(w=>({ project_id:w.project_id, sc_id:w.sc_id, wo_id:w.wo_id, worker_id:w.id, attendance_date:attDate, status:'present', hours_worked:8, wage_amount:parseFloat(w.daily_rate||0) }));
      return scAPI.bulkAttendance({entries});
    },
    onSuccess:()=>{ toast.success('Bulk attendance marked'); qc.invalidateQueries({queryKey:['sc-attendance']}); },
    onError:e=>toast.error(e?.response?.data?.error||'Failed'),
  });

  const filteredWorkers = workers.filter(w=>!search||[w.worker_name,w.worker_code,w.skill_type].some(v=>v?.toLowerCase().includes(search.toLowerCase())));

  // KPIs
  const kpi = useMemo(()=>({
    totalWorkers: workers.length,
    labourWorkers: workers.filter(w => {
      const sc = subs.find(s => s.id === w.sc_id);
      return sc?.contractor_type === 'labour_contractor';
    }).length,
    presentToday: attendance.filter(a => a.status === 'present').length,
    pendingNMR:   nmrs.filter(n => ['draft','submitted','checked'].includes(n.status)).length,
  }),[workers, attendance, nmrs, subs]);

  const TABS = [
    { k:'workers',    label:'Workers Registry',  icon: Users     },
    { k:'attendance', label:'Daily Attendance',   icon: CheckCircle },
    { k:'nmr',        label:'Muster Roll (NMR)',  icon: FileText  },
  ];

  return (
    <div style={{ background: Theme.pageBg, minHeight:'100vh' }}>
      <PageHeader
        title="Labour / Worker Management"
        subtitle="Worker registry, daily attendance and NMR-based billing"
        breadcrumbs={[{label:'Subcontractors'},{label:'Labour Management'}]}
        actions={
          <div className="flex gap-2">
            {tab==='workers' && (
              <button onClick={()=>setShowWorkerForm(true)}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg shadow-sm"
                style={{background:'#fff', color: Theme.navyDark}}>
                <Plus className="w-3.5 h-3.5"/> Register Worker
              </button>
            )}
            {tab==='attendance' && (
              <>
                <button onClick={()=>setShowEsslSync(true)}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg transition"
                  style={{background:'rgba(255,255,255,0.12)',border:'1px solid rgba(255,255,255,0.25)',color:'#fff'}}>
                  <RefreshCw className="w-3.5 h-3.5"/> Sync from ESSL
                </button>
                <button onClick={()=>bulkMut.mutate()} disabled={bulkMut.isPending}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg transition"
                  style={{background:'rgba(255,255,255,0.12)',border:'1px solid rgba(255,255,255,0.25)',color:'#fff'}}>
                  <CheckCircle className="w-3.5 h-3.5"/> Mark All Present
                </button>
                <button onClick={()=>setShowAttForm(true)}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg shadow-sm"
                  style={{background:'#fff', color: Theme.navyDark}}>
                  <Plus className="w-3.5 h-3.5"/> Mark Attendance
                </button>
              </>
            )}
            {tab==='nmr' && (
              <button onClick={()=>setShowNMRForm(true)}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg shadow-sm"
                style={{background:'#fff', color: Theme.navyDark}}>
                <Plus className="w-3.5 h-3.5"/> Create NMR
              </button>
            )}
          </div>
        }
      />

      <div className="p-5 md:p-6 max-w-[1400px] mx-auto space-y-5">

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <ThemeKpiCard icon={Users}       label="Total Workers"     value={kpi.totalWorkers}  color="blue"    sub="Registered workers"/>
          <ThemeKpiCard icon={HardHat}     label="Labour Workers"    value={kpi.labourWorkers} color="orange"  sub="Under LC contractors"/>
          <ThemeKpiCard icon={CheckCircle} label="Present Today"     value={kpi.presentToday}  color="emerald" sub={`Date: ${dayjs(attDate).format('DD MMM')}`}/>
          <ThemeKpiCard icon={FileText}    label="NMR Pending"       value={kpi.pendingNMR}    color="amber"   sub="Awaiting approval"/>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1 w-fit shadow-sm">
          {TABS.map(({ k, label, icon: Icon }) => (
            <button key={k} onClick={() => setTab(k)}
              className={clsx('flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all whitespace-nowrap',
                tab === k ? 'text-white shadow-sm' : 'text-slate-600 hover:text-slate-800 hover:bg-slate-50')}
              style={tab === k ? { background: `linear-gradient(135deg, ${Theme.navyLight} 0%, ${Theme.navyDark} 100%)` } : {}}>
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          {tab !== 'nmr' && (
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search workers…"
                className="pl-9 pr-3 py-2 border border-slate-200 bg-white rounded-xl text-sm w-full focus:outline-none shadow-sm" />
            </div>
          )}
          <select value={projectFilter} onChange={e=>setProject(e.target.value)}
            className="border border-slate-200 bg-white rounded-xl px-3 py-2 text-sm shadow-sm focus:outline-none min-w-40">
            <option value="">All Projects</option>
            {projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={scFilter} onChange={e=>setScFilter(e.target.value)}
            className="border border-slate-200 bg-white rounded-xl px-3 py-2 text-sm shadow-sm focus:outline-none min-w-44">
            <option value="">All Contractors</option>
            {labourContractors.length > 0 && <optgroup label="── Labour Contractors ──">
              {labourContractors.map(s=><option key={s.id} value={s.id}>[LC] {s.name}</option>)}
            </optgroup>}
            {allActiveContractors.filter(s=>s.contractor_type!=='labour_contractor').length > 0 && <optgroup label="── Sub-Contractors ──">
              {allActiveContractors.filter(s=>s.contractor_type!=='labour_contractor').map(s=><option key={s.id} value={s.id}>[SC] {s.name}</option>)}
            </optgroup>}
          </select>
          {tab === 'attendance' && (
            <input type="date" value={attDate} onChange={e=>setAttDate(e.target.value)}
              className="border border-slate-200 bg-white rounded-xl px-3 py-2 text-sm shadow-sm focus:outline-none" />
          )}
          {tab === 'nmr' && (
            <select value={nmrStatFilter} onChange={e=>setNmrStat(e.target.value)}
              className="border border-slate-200 bg-white rounded-xl px-3 py-2 text-sm shadow-sm focus:outline-none">
              <option value="">All Status</option>
              {Object.entries(NMR_STATUS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
            </select>
          )}
          <button onClick={() => tab==='workers'?refetchWorkers():tab==='attendance'?refetchAtt():refetchNMR()}
            className="p-2 border border-slate-200 bg-white rounded-xl hover:bg-slate-50 shadow-sm">
            <RefreshCw className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        {/* ── Workers Tab ── */}
        {tab === 'workers' && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{background:`linear-gradient(90deg, ${Theme.navy} 0%, ${Theme.navyDark} 100%)`}}>
                    {['Code','Worker Name','Contractor','Skill Type','Daily Rate (₹)','Mobile','ESSL Code','Status',''].map(h=>(
                      <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-white/80 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredWorkers.length===0 ? (
                    <tr><td colSpan={9} className="py-12 text-center">
                      <Users className="w-10 h-10 text-slate-400 mx-auto mb-2"/>
                      <p className="text-slate-400">No workers registered</p>
                    </td></tr>
                  ) : filteredWorkers.map((w,i)=>(
                    <tr key={w.id} className={clsx('border-b border-slate-50 hover:bg-slate-50',i%2===0?'bg-white':'bg-slate-50/30')}>
                      <td className="px-4 py-3 font-mono text-xs font-bold text-blue-600">{w.worker_code}</td>
                      <td className="px-4 py-3 font-semibold text-slate-800">{w.worker_name}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{w.sc_name||'—'}</td>
                      <td className="px-4 py-3"><span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{w.skill_type}</span></td>
                      <td className="px-4 py-3 font-semibold text-slate-700">₹{Number(w.daily_rate||0).toLocaleString()}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{w.mobile||'—'}</td>
                      <td className="px-4 py-3">
                        <EsslCodeCell worker={w} onSave={(code)=>updateWorkerMut.mutate({id:w.id, essl_emp_code:code})} />
                      </td>
                      <td className="px-4 py-3">
                        <span className={clsx('text-xs px-2 py-0.5 rounded-full font-semibold', w.status==='active'?'bg-emerald-100 text-emerald-700':'bg-slate-100 text-slate-500')}>
                          {w.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={()=>{ if (window.confirm(`Remove ${w.worker_name}? This cannot be undone.`)) deleteWorkerMut.mutate(w.id); }}
                          disabled={deleteWorkerMut.isPending}
                          title="Remove worker"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition disabled:opacity-40">
                          <X className="w-4 h-4"/>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Attendance Tab ── */}
        {tab === 'attendance' && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2"
              style={{background:`linear-gradient(90deg, ${Theme.navy}22 0%, transparent 100%)`}}>
              <span className="text-sm font-bold text-slate-700">
                {dayjs(attDate).format('dddd, DD MMMM YYYY')}
              </span>
              <span className="text-xs text-slate-400 ml-1">{attendance.length} records</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{background:`linear-gradient(90deg, ${Theme.navy} 0%, ${Theme.navyDark} 100%)`}}>
                    {['Worker','Contractor','Skill','Status','Hours','Overtime','Wage (₹)','Remarks'].map(h=>(
                      <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-white/80 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {attendance.length===0 ? (
                    <tr><td colSpan={8} className="py-12 text-center text-slate-400 text-sm">
                      No attendance records for this date.<br/>
                      <span className="text-xs">Click "Mark All Present" or "Mark Attendance" to add records.</span>
                    </td></tr>
                  ) : attendance.map((a,i)=>(
                    <tr key={a.id} className={clsx('border-b border-slate-50', i%2===0?'bg-white':'bg-slate-50/30')}>
                      <td className="px-4 py-3 font-semibold text-slate-800">{a.worker_name}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{a.sc_name||'—'}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{a.skill_type}</td>
                      <td className="px-4 py-3">
                        <span className={clsx('text-xs px-2 py-0.5 rounded-full font-semibold capitalize', ATT_STATUS[a.status]||'bg-slate-100 text-slate-600')}>
                          {a.status?.replace('_',' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">{a.hours_worked}h</td>
                      <td className="px-4 py-3 text-center">{a.overtime_hours > 0 ? `${a.overtime_hours}h` : '—'}</td>
                      <td className="px-4 py-3 font-semibold text-slate-700">₹{Number(a.wage_amount||0).toLocaleString()}</td>
                      <td className="px-4 py-3 text-xs text-slate-400">{a.remarks||'—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── NMR Tab ── */}
        {tab === 'nmr' && (
          <div>
            {/* Info banner */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-4 flex items-start gap-2.5 text-xs text-blue-800">
              <FileText className="w-4 h-4 flex-shrink-0 mt-0.5 text-blue-600"/>
              <div>
                <strong>Nominal Muster Roll (NMR):</strong> A formal legal document (under Contract Labour Act 1970) recording daily attendance and wages for Labour Contractors.
                Mark attendance first → Create NMR for a period → Get it checked &amp; approved → Raise Labour Bill automatically.
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
              {nmrs.length === 0 ? (
                <div className="py-20 text-center">
                  <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <FileText className="w-8 h-8 text-slate-300"/>
                  </div>
                  <p className="text-slate-500 font-semibold">No Muster Rolls created yet</p>
                  <p className="text-xs text-slate-400 mt-1">First mark attendance, then create an NMR for the billing period</p>
                  <button onClick={()=>setShowNMRForm(true)}
                    className="mt-4 flex items-center gap-2 px-4 py-2 text-sm font-bold text-white rounded-xl mx-auto"
                    style={{background:`linear-gradient(135deg, ${Theme.navyLight} 0%, ${Theme.navyDark} 100%)`}}>
                    <Plus className="w-4 h-4"/> Create NMR
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{background:`linear-gradient(90deg, ${Theme.navy} 0%, ${Theme.navyDark} 100%)`}}>
                        {['NMR No.','Period','Contractor','Project','Workers','Man-days','Total Wages','Status','Actions'].map(h=>(
                          <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-white/80 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {nmrs.map((n,i)=>{
                        const sm = NMR_STATUS[n.status] || NMR_STATUS.draft;
                        return (
                          <tr key={n.id}
                            className={clsx('border-b border-slate-50 hover:bg-blue-50/30 transition-colors cursor-pointer', i%2===0?'bg-white':'bg-slate-50/30')}
                            onClick={()=>setNmrDrawer(n.id)}>
                            <td className="px-4 py-3">
                              <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">{n.nmr_number}</span>
                            </td>
                            <td className="px-4 py-3 text-xs whitespace-nowrap">
                              <p className="font-semibold text-slate-700">{dayjs(n.period_from).format('DD MMM')} – {dayjs(n.period_to).format('DD MMM YYYY')}</p>
                              <p className="text-slate-400">{dayjs(n.period_to).diff(dayjs(n.period_from),'day')+1} days</p>
                            </td>
                            <td className="px-4 py-3 text-xs font-semibold text-slate-800">{n.sc_name}</td>
                            <td className="px-4 py-3 text-xs text-slate-500">{n.project_name}</td>
                            <td className="px-4 py-3 text-center font-bold text-blue-700">{n.total_workers}</td>
                            <td className="px-4 py-3 text-center font-bold text-indigo-700">{n.total_mandays}</td>
                            <td className="px-4 py-3 text-right font-bold text-emerald-700">{fmt(n.total_wages)}</td>
                            <td className="px-4 py-3">
                              <span className={clsx('text-[10px] px-2 py-0.5 rounded-full font-bold', sm.bg, sm.text)}>{sm.label}</span>
                            </td>
                            <td className="px-4 py-3 flex items-center gap-1" onClick={e=>e.stopPropagation()}>
                              <button onClick={()=>setNmrDrawer(n.id)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50">
                                <Eye className="w-4 h-4"/>
                              </button>
                              {n.status !== 'billed' && (
                                <button
                                  onClick={() => { if (window.confirm(`Delete NMR ${n.nmr_number}? This cannot be undone.`)) deleteNmrMut.mutate(n.id); }}
                                  disabled={deleteNmrMut.isPending}
                                  title="Delete NMR"
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition disabled:opacity-40">
                                  <Trash2 className="w-4 h-4"/>
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Modals ── */}

      {showWorkerForm && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col overflow-hidden">
          <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b bg-blue-600">
            <h2 className="font-bold text-white">Register Worker</h2>
            <button onClick={()=>setShowWorkerForm(false)} className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"><X className="w-4 h-4" /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-5 md:p-8 grid grid-cols-2 gap-4 content-start">
            {[['worker_name','Worker Name *','text'],['skill_type','Skill Type','select'],['daily_rate','Daily Rate (₹)','number'],['mobile','Mobile','text'],['essl_emp_code','ESSL Employee Code','text']].map(([k,l,type])=>(
              <div key={k}>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">{l}</label>
                {type==='select'?(
                  <select value={workerForm[k]||''} onChange={e=>setWorkerForm(f=>({...f,[k]:e.target.value}))} className={inp}>
                    {SKILL_TYPES.map(s=><option key={s}>{s}</option>)}
                  </select>
                ):(
                  <input type={type} value={workerForm[k]||''} onChange={e=>setWorkerForm(f=>({...f,[k]:e.target.value}))} className={inp} />
                )}
              </div>
            ))}
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Project</label>
              <select value={workerForm.project_id} onChange={e=>setWorkerForm(f=>({...f,project_id:e.target.value}))} className={inp}>
                <option value="">Select…</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Contractor</label>
              <select value={workerForm.sc_id} onChange={e=>setWorkerForm(f=>({...f,sc_id:e.target.value}))} className={inp}>
                <option value="">Select…</option>
                {labourContractors.length > 0 && <optgroup label="── Labour Contractors ──">
                  {labourContractors.map(s=><option key={s.id} value={s.id}>{s.sc_code} — {s.name}</option>)}
                </optgroup>}
                {allActiveContractors.filter(s=>s.contractor_type!=='labour_contractor').length > 0 && <optgroup label="── Sub-Contractors ──">
                  {allActiveContractors.filter(s=>s.contractor_type!=='labour_contractor').map(s=><option key={s.id} value={s.id}>{s.sc_code} — {s.name}</option>)}
                </optgroup>}
              </select>
            </div>
          </div>
          <div className="flex-shrink-0 flex justify-end gap-3 px-6 py-4 border-t bg-slate-50">
            <button onClick={()=>setShowWorkerForm(false)} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600">Cancel</button>
            <button onClick={()=>addWorkerMut.mutate(workerForm)} disabled={!workerForm.worker_name||addWorkerMut.isPending}
              className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {addWorkerMut.isPending?'Adding…':'Add Worker'}
            </button>
          </div>
        </div>
      )}

      {showAttForm && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col overflow-hidden">
          <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b bg-emerald-600">
            <h2 className="font-bold text-white">Mark Attendance</h2>
            <button onClick={()=>setShowAttForm(false)} className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"><X className="w-4 h-4" /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-5 md:p-8 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Worker *</label>
              <select value={attForm.worker_id} onChange={e=>setAttForm(f=>({...f,worker_id:e.target.value}))} className={inp}>
                <option value="">Select worker…</option>{workers.map(w=><option key={w.id} value={w.id}>{w.worker_name} — {w.skill_type}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Date</label>
                <input type="date" value={attForm.attendance_date} onChange={e=>setAttForm(f=>({...f,attendance_date:e.target.value}))} className={inp} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Status</label>
                <select value={attForm.status} onChange={e=>setAttForm(f=>({...f,status:e.target.value}))} className={inp}>
                  <option value="present">Present</option><option value="absent">Absent</option>
                  <option value="half_day">Half Day</option><option value="holiday">Holiday</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Hours Worked</label>
                <input type="number" value={attForm.hours_worked} onChange={e=>setAttForm(f=>({...f,hours_worked:e.target.value}))} className={inp} min={0} max={24}/>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Overtime Hours</label>
                <input type="number" value={attForm.overtime_hours} onChange={e=>setAttForm(f=>({...f,overtime_hours:e.target.value}))} className={inp} min={0}/>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Wage Amount (₹)</label>
                <input type="number" value={attForm.wage_amount} onChange={e=>setAttForm(f=>({...f,wage_amount:e.target.value}))} className={inp} min={0}/>
              </div>
            </div>
          </div>
          <div className="flex-shrink-0 flex justify-end gap-3 px-5 py-4 border-t bg-slate-50">
            <button onClick={()=>setShowAttForm(false)} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600">Cancel</button>
            <button onClick={()=>markAttMut.mutate(attForm)} disabled={!attForm.worker_id||markAttMut.isPending}
              className="px-5 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50">
              {markAttMut.isPending?'Saving…':'Save Attendance'}
            </button>
          </div>
        </div>
      )}

      {showNMRForm   && <CreateNMRModal wos={wos} onClose={() => setShowNMRForm(false)} />}
      {nmrDrawer     && <NMRDrawer nmrId={nmrDrawer} onClose={() => setNmrDrawer(null)} />}
      {showEsslSync  && <EsslSyncModal onClose={() => { setShowEsslSync(false); refetchAtt(); }} />}
    </div>
  );
}
