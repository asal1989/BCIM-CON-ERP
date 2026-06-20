// src/pages/qs/VariationStatementTab.jsx — Client-facing Variation Statements
import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, X, ChevronLeft, FileText, Send, Trash2, CheckCircle2,
  Clock, AlertCircle, Download, Edit2,
} from 'lucide-react';
import { variationStatementAPI, projectAPI } from '../../api/client';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import dayjs from 'dayjs';
import * as XLSX from 'xlsx';

// ── helpers ───────────────────────────────────────────────────────────────────
const num  = v => parseFloat(v) || 0;
const inr  = v => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const iCls = 'w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200 bg-white';

const STATUS_CFG = {
  draft:        { label: 'Draft',        cls: 'bg-amber-50 text-amber-600 border-amber-200' },
  submitted:    { label: 'Submitted',    cls: 'bg-indigo-50 text-indigo-600 border-indigo-200' },
  acknowledged: { label: 'Acknowledged', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
};

function computeTotals(items, ntItems, gstRate) {
  const woAmt    = items.reduce((s, it) => s + num(it.rate) * num(it.wo_qty), 0);
  const amendAmt = items.reduce((s, it) => s + num(it.rate) * num(it.amendment_qty), 0);
  const ntAmt    = ntItems.reduce((s, n) => s + num(n.rate) * num(n.qty), 0);
  const grandEx  = amendAmt + ntAmt;
  const half     = (num(gstRate) / 2) / 100;
  const cgst     = grandEx * half;
  const sgst     = grandEx * half;
  return { woAmt, amendAmt, varAmt: amendAmt - woAmt, ntAmt, grandEx, cgst, sgst, grandIncl: grandEx + cgst + sgst };
}

// ── Excel export ──────────────────────────────────────────────────────────────
function exportExcel(stmt, items, ntItems) {
  const t = computeTotals(items, ntItems, stmt.gst_rate || 18);
  const halfGst = num(stmt.gst_rate || 18) / 2;

  const rows = [];
  const push = (...cells) => rows.push(cells);

  push('', 'Project Name',               stmt.project_name || '');
  push('', 'Package Description',        stmt.package_description || '');
  push('', 'Purchase/Work Order No',     stmt.wo_number || '');
  push('', 'Purchase/Work Order Value',  `Rs.${inr(stmt.wo_value_excl_gst)}`);
  push('', 'Vendor Name',               stmt.vendor_name || '');
  push('', 'Subject',                   'Variation Statement');
  push();
  push('Sl.no', 'Items', 'Description', 'Unit', 'Rate',
       'Qty as per WO', 'Amount as per WO',
       'Amendment qty', 'Amendment Amount',
       'Variation Qty', 'Variation Amount', 'Remarks');

  items.forEach((it, i) => {
    const woA  = num(it.rate) * num(it.wo_qty);
    const amA  = num(it.rate) * num(it.amendment_qty);
    push(
      it.sl_no || i + 1, it.item_code, it.description, it.unit, num(it.rate),
      num(it.wo_qty), woA,
      num(it.amendment_qty), amA,
      num(it.amendment_qty) - num(it.wo_qty), amA - woA,
      ''
    );
  });

  push('', '', 'Total of Existing Items', '', '', '', t.woAmt, '', t.amendAmt, '', t.varAmt, '');
  push();

  if (ntItems.length > 0) {
    push('', 'NT Items', 'Description', 'Unit', 'Rate', '', '', 'Qty', 'Amount', '', 'Amount', 'Remarks');
    ntItems.forEach((n, i) => {
      const amt = num(n.rate) * num(n.qty);
      push(`NT-${String(i + 1).padStart(2, '0')}`, n.sl_no || '', n.description, n.unit, num(n.rate),
           '', '', num(n.qty), amt, '', amt, '');
    });
    push('', '', 'Total of NT Items', '', '', '', '', '', t.ntAmt, '', t.ntAmt, '');
    push();
  }

  push('', '', 'Grand Total (Excl. GST)', '', '', '', '', '', t.grandEx, '', t.grandEx, '');
  push('', '', `CGST @ ${halfGst}%`,     '', '', '', '', '', t.cgst,    '', t.cgst,    '');
  push('', '', `SGST @ ${halfGst}%`,     '', '', '', '', '', t.sgst,    '', t.sgst,    '');
  push('', '', 'Grand Total (Incl. GST)','', '', '', '', '', t.grandIncl,'',t.grandIncl,'');

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [6, 14, 40, 8, 10, 12, 16, 12, 16, 12, 16, 18].map(w => ({ wch: w }));

  // Bold header row (row index 7 = row 8 in Excel)
  const headerRowIdx = 7;
  for (let c = 0; c < 12; c++) {
    const cell = XLSX.utils.encode_cell({ r: headerRowIdx, c });
    if (ws[cell]) ws[cell].s = { font: { bold: true }, fill: { fgColor: { rgb: 'E8EAF6' } } };
  }

  const wb = XLSX.utils.book_new();
  const sheetName = `VS-${(stmt.wo_number || 'Statement').replace(/[^A-Za-z0-9-]/g, '').slice(0, 28)}`;
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, `Variation-Statement-${stmt.wo_number || dayjs().format('YYYYMMDD')}.xlsx`);
}

// ── BLANK STATE ───────────────────────────────────────────────────────────────
const BLANK_HDR  = { project_id: '', wo_number: '', vendor_name: '', package_description: '', wo_value_excl_gst: '', gst_rate: 18, remarks: '' };
const BLANK_ITEM = () => ({ _key: Math.random(), sl_no: '', item_code: '', description: '', unit: '', rate: '', wo_qty: '', amendment_qty: '' });
const BLANK_NT   = () => ({ _key: Math.random(), sl_no: '', description: '', unit: '', rate: '', qty: '' });

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────
export default function VariationStatementTab({ projectId: parentProjectId }) {
  const qc = useQueryClient();
  const [projFilter, setProjFilter] = useState(parentProjectId || '');
  const [view,       setView]       = useState('list');   // 'list' | 'detail'
  const [stmtId,     setStmtId]     = useState(null);
  const [showCreate, setShowCreate] = useState(false);

  // Detail-view form state
  const [hdr,     setHdr]     = useState(BLANK_HDR);
  const [items,   setItems]   = useState([]);
  const [ntItems, setNtItems] = useState([]);

  // ── Queries ─────────────────────────────────────────────────────────────────
  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn:  () => projectAPI.list().then(r => r.data?.data || []),
  });

  const { data: list = [], isLoading: listLoading, refetch } = useQuery({
    queryKey: ['vstmt-list', projFilter],
    queryFn:  () => variationStatementAPI.list({ project_id: projFilter || undefined }).then(r => r.data?.data || []),
  });

  const { data: detail } = useQuery({
    queryKey: ['vstmt-detail', stmtId],
    queryFn:  () => variationStatementAPI.get(stmtId).then(r => r.data?.data),
    enabled:  !!stmtId,
  });

  // Populate form when detail loads
  useEffect(() => {
    if (!detail) return;
    setHdr({
      project_id: detail.project_id || '',
      wo_number: detail.wo_number || '',
      vendor_name: detail.vendor_name || '',
      package_description: detail.package_description || '',
      wo_value_excl_gst: detail.wo_value_excl_gst || '',
      gst_rate: detail.gst_rate || 18,
      remarks: detail.remarks || '',
    });
    setItems((detail.items || []).map(i => ({ ...i, _key: Math.random() })));
    setNtItems((detail.nt_items || []).map(n => ({ ...n, _key: Math.random() })));
  }, [detail]);

  // ── Mutations ────────────────────────────────────────────────────────────────
  const createMut = useMutation({
    mutationFn: d => variationStatementAPI.create(d),
    onSuccess: r => {
      toast.success('Statement created');
      qc.invalidateQueries({ queryKey: ['vstmt-list'] });
      setStmtId(r.data.data.id);
      setView('detail');
      setShowCreate(false);
    },
    onError: e => toast.error(e?.response?.data?.error || 'Create failed'),
  });

  const saveMut = useMutation({
    mutationFn: ({ id, data }) => variationStatementAPI.update(id, data),
    onSuccess: () => {
      toast.success('Saved');
      qc.invalidateQueries({ queryKey: ['vstmt-list'] });
      qc.invalidateQueries({ queryKey: ['vstmt-detail', stmtId] });
    },
    onError: e => toast.error(e?.response?.data?.error || 'Save failed'),
  });

  const submitMut = useMutation({
    mutationFn: id => variationStatementAPI.submit(id),
    onSuccess: () => {
      toast.success('Marked as submitted to client');
      qc.invalidateQueries({ queryKey: ['vstmt-list'] });
      qc.invalidateQueries({ queryKey: ['vstmt-detail', stmtId] });
    },
    onError: e => toast.error(e?.response?.data?.error || 'Failed'),
  });

  const deleteMut = useMutation({
    mutationFn: id => variationStatementAPI.remove(id),
    onSuccess: () => {
      toast.success('Deleted');
      qc.invalidateQueries({ queryKey: ['vstmt-list'] });
      backToList();
    },
    onError: e => toast.error(e?.response?.data?.error || 'Delete failed'),
  });

  // ── Navigation ───────────────────────────────────────────────────────────────
  const openDetail = (id) => { setStmtId(id); setView('detail'); };
  const backToList = () => { setView('list'); setStmtId(null); setHdr(BLANK_HDR); setItems([]); setNtItems([]); };

  // ── Save helper ──────────────────────────────────────────────────────────────
  const handleSave = () => {
    if (!hdr.project_id) return toast.error('Select a project');
    saveMut.mutate({
      id: stmtId,
      data: { ...hdr, items, nt_items: ntItems },
    });
  };

  // ── Item helpers ─────────────────────────────────────────────────────────────
  const updItem = (key, field, val) =>
    setItems(prev => prev.map(it => it._key === key ? { ...it, [field]: val } : it));
  const addItem = () => setItems(prev => [...prev, BLANK_ITEM()]);
  const delItem = key => setItems(prev => prev.filter(it => it._key !== key));

  const updNT = (key, field, val) =>
    setNtItems(prev => prev.map(n => n._key === key ? { ...n, [field]: val } : n));
  const addNT = () => setNtItems(prev => [...prev, BLANK_NT()]);
  const delNT = key => setNtItems(prev => prev.filter(n => n._key !== key));

  // ── Totals ───────────────────────────────────────────────────────────────────
  const totals = computeTotals(items, ntItems, hdr.gst_rate);

  // ════════════════════════════════════════════════════════════════════════════
  // LIST VIEW
  // ════════════════════════════════════════════════════════════════════════════
  if (view === 'list') {
    const stats = {
      total:     list.length,
      draft:     list.filter(s => s.status === 'draft').length,
      submitted: list.filter(s => s.status === 'submitted').length,
      value:     list.reduce((s, r) => s + num(r.amendment_total) + num(r.nt_total), 0),
    };
    return (
      <div className="space-y-5">
        {/* KPI strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Statements', val: stats.total,     cls: 'text-indigo-600' },
            { label: 'Draft',            val: stats.draft,     cls: 'text-amber-500'  },
            { label: 'Submitted',        val: stats.submitted, cls: 'text-blue-600'   },
            { label: 'Total Amend. Value', val: `₹${inr(stats.value)}`, cls: 'text-emerald-600' },
          ].map(k => (
            <div key={k.label} className="bg-white border border-[#e2e6ec] rounded-2xl shadow-sm px-4 py-4 text-center">
              <div className={clsx('text-xl font-medium', k.cls)}>{k.val}</div>
              <div className="text-[10px] text-[#8e94a3] font-medium uppercase tracking-wider mt-1">{k.label}</div>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-3 flex-wrap">
          <select value={projFilter} onChange={e => setProjFilter(e.target.value)}
            className="h-9 pl-3 pr-8 rounded-xl border border-[#d8dce1] bg-white text-xs outline-none focus:border-indigo-400">
            <option value="">All Projects</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button onClick={() => refetch()}
            className="h-9 w-9 flex items-center justify-center rounded-xl border border-[#e2e6ec] bg-white text-[#6a6f7d] hover:bg-[#f4f6f9]">
            <Edit2 className="w-4 h-4" />
          </button>
          <div className="flex-1" />
          <button onClick={() => setShowCreate(true)}
            className="h-9 flex items-center gap-1.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium shadow">
            <Plus className="w-4 h-4" /> New Statement
          </button>
        </div>

        {/* Table */}
        <div className="bg-white border border-[#e2e6ec] rounded-2xl shadow-sm overflow-hidden">
          {listLoading ? (
            <div className="py-16 text-center text-sm text-[#8e94a3]">Loading…</div>
          ) : list.length === 0 ? (
            <div className="py-16 flex flex-col items-center gap-2 text-[#8e94a3]">
              <AlertCircle className="w-10 h-10 text-slate-200" />
              <p className="text-sm font-medium">No variation statements yet</p>
              <p className="text-xs">Click "New Statement" to create one</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#e2e6ec] bg-[#f8f9fb]">
                    {['WO Number','Package','Vendor','WO Value','Amend. Value','Variation','Status','Created',''].map((h, i) => (
                      <th key={i} className={clsx('py-3 px-4 font-semibold text-[10px] text-[#6a6f7d] uppercase tracking-wider', i >= 3 && i <= 5 ? 'text-right' : 'text-left')}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f3f6]">
                  {list.map(s => {
                    const cfg = STATUS_CFG[s.status] || STATUS_CFG.draft;
                    const amendVal = num(s.amendment_total) + num(s.nt_total);
                    const gstMult = 1 + num(s.gst_rate) / 100;
                    const varVal  = amendVal - num(s.wo_total);
                    return (
                      <tr key={s.id} onClick={() => openDetail(s.id)}
                        className="hover:bg-[#f8f9fb] cursor-pointer transition-colors group">
                        <td className="py-3 px-4 font-mono font-medium text-indigo-600 whitespace-nowrap">{s.wo_number || '—'}</td>
                        <td className="py-3 px-4 max-w-[200px] truncate text-[#1a1c21]" title={s.package_description}>{s.package_description || '—'}</td>
                        <td className="py-3 px-4 max-w-[160px] truncate text-[#6a6f7d]">{s.vendor_name || '—'}</td>
                        <td className="py-3 px-4 text-right font-mono text-[#1a1c21] whitespace-nowrap">₹{inr(num(s.wo_value_excl_gst) * gstMult)}</td>
                        <td className="py-3 px-4 text-right font-mono font-semibold text-indigo-700 whitespace-nowrap">₹{inr(amendVal * gstMult)}</td>
                        <td className="py-3 px-4 text-right font-mono text-emerald-600 whitespace-nowrap">₹{inr(varVal * gstMult)}</td>
                        <td className="py-3 px-4">
                          <span className={clsx('inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border', cfg.cls)}>{cfg.label}</span>
                        </td>
                        <td className="py-3 px-4 text-[#8e94a3] whitespace-nowrap">{dayjs(s.created_at).format('DD MMM YYYY')}</td>
                        <td className="py-3 px-4">
                          <button onClick={e => { e.stopPropagation(); openDetail(s.id); }}
                            className="opacity-0 group-hover:opacity-100 h-7 w-7 rounded-lg border border-[#e2e6ec] bg-white flex items-center justify-center hover:bg-indigo-50 hover:border-indigo-200">
                            <Edit2 className="w-3.5 h-3.5 text-indigo-600" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Create modal */}
        {showCreate && (
          <CreateModal
            projects={projects}
            defaultProjectId={projFilter}
            onClose={() => setShowCreate(false)}
            onSave={data => createMut.mutate(data)}
            isPending={createMut.isPending}
          />
        )}
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // DETAIL / EDIT VIEW
  // ════════════════════════════════════════════════════════════════════════════
  const isSubmitted = detail?.status === 'submitted' || detail?.status === 'acknowledged';

  return (
    <div className="space-y-5">
      {/* Header bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <button onClick={backToList} className="flex items-center gap-1.5 text-sm text-[#6a6f7d] hover:text-indigo-600 font-medium">
          <ChevronLeft className="w-4 h-4" /> Back to list
        </button>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => detail && exportExcel({ ...detail, ...hdr, project_name: detail?.project_name }, items, ntItems)}
            className="h-9 flex items-center gap-1.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium shadow">
            <Download className="w-4 h-4" /> Export Excel
          </button>
          {!isSubmitted && (
            <>
              <button onClick={handleSave} disabled={saveMut.isPending}
                className="h-9 flex items-center gap-1.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium shadow disabled:opacity-50">
                <FileText className="w-4 h-4" /> {saveMut.isPending ? 'Saving…' : 'Save Draft'}
              </button>
              <button
                onClick={() => { if (window.confirm('Mark this statement as submitted to client?')) submitMut.mutate(stmtId); }}
                disabled={submitMut.isPending}
                className="h-9 flex items-center gap-1.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium shadow disabled:opacity-50">
                <Send className="w-4 h-4" /> Submit to Client
              </button>
              <button
                onClick={() => { if (window.confirm('Delete this variation statement?')) deleteMut.mutate(stmtId); }}
                className="h-9 w-9 flex items-center justify-center rounded-xl border border-red-200 bg-red-50 text-red-500 hover:bg-red-500 hover:text-white">
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
          {isSubmitted && (
            <span className={clsx('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border', STATUS_CFG.submitted.cls)}>
              <CheckCircle2 className="w-3.5 h-3.5" /> Submitted to Client
            </span>
          )}
        </div>
      </div>

      {/* Header form */}
      <div className="bg-white border border-[#e2e6ec] rounded-2xl shadow-sm p-5">
        <h3 className="text-sm font-semibold text-[#1a1c21] mb-4">Statement Details</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-[10px] font-semibold text-[#8e94a3] uppercase tracking-wider mb-1">Project *</label>
            <select value={hdr.project_id} onChange={e => setHdr(h => ({ ...h, project_id: e.target.value }))}
              disabled={isSubmitted}
              className={iCls}>
              <option value="">Select project…</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-[#8e94a3] uppercase tracking-wider mb-1">Work Order No.</label>
            <input value={hdr.wo_number} onChange={e => setHdr(h => ({ ...h, wo_number: e.target.value }))}
              disabled={isSubmitted} placeholder="WDIRY0194" className={iCls} />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-[#8e94a3] uppercase tracking-wider mb-1">Vendor Name</label>
            <input value={hdr.vendor_name} onChange={e => setHdr(h => ({ ...h, vendor_name: e.target.value }))}
              disabled={isSubmitted} placeholder="Vendor / Contractor name" className={iCls} />
          </div>
          <div className="col-span-2 md:col-span-2">
            <label className="block text-[10px] font-semibold text-[#8e94a3] uppercase tracking-wider mb-1">Package Description</label>
            <input value={hdr.package_description} onChange={e => setHdr(h => ({ ...h, package_description: e.target.value }))}
              disabled={isSubmitted} placeholder="Civil works for Retaining wall and STP" className={iCls} />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-[#8e94a3] uppercase tracking-wider mb-1">WO Value (Excl. GST) ₹</label>
            <input type="number" value={hdr.wo_value_excl_gst} onChange={e => setHdr(h => ({ ...h, wo_value_excl_gst: e.target.value }))}
              disabled={isSubmitted} placeholder="0.00" className={iCls} />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-[#8e94a3] uppercase tracking-wider mb-1">GST Rate %</label>
            <select value={hdr.gst_rate} onChange={e => setHdr(h => ({ ...h, gst_rate: e.target.value }))}
              disabled={isSubmitted} className={iCls}>
              {[5, 12, 18, 28].map(r => <option key={r} value={r}>{r}% ({r/2}% CGST + {r/2}% SGST)</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-[#8e94a3] uppercase tracking-wider mb-1">Remarks</label>
            <input value={hdr.remarks} onChange={e => setHdr(h => ({ ...h, remarks: e.target.value }))}
              disabled={isSubmitted} placeholder="Optional remarks" className={iCls} />
          </div>
        </div>
      </div>

      {/* ── Existing Items ── */}
      <div className="bg-white border border-[#e2e6ec] rounded-2xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#e2e6ec] bg-[#f8f9fb]">
          <h3 className="text-sm font-semibold text-[#1a1c21]">Existing Items (WO + Amendment)</h3>
          {!isSubmitted && (
            <button onClick={addItem}
              className="h-7 flex items-center gap-1 px-3 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700">
              <Plus className="w-3.5 h-3.5" /> Add Item
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#e2e6ec]">
                {['Sl.No','Item Code','Description','Unit','Rate (₹)','WO Qty','WO Amt','Amend Qty','Amend Amt','Var Qty','Var Amt',''].map((h, i) => (
                  <th key={i} className={clsx('px-3 py-2.5 text-[10px] font-semibold text-[#6a6f7d] uppercase tracking-wider whitespace-nowrap',
                    i >= 4 ? 'text-right' : 'text-left')}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1f3f6]">
              {items.length === 0 && (
                <tr><td colSpan={12} className="py-8 text-center text-xs text-[#8e94a3]">No items yet — click "Add Item"</td></tr>
              )}
              {items.map(it => {
                const woAmt   = num(it.rate) * num(it.wo_qty);
                const amAmt   = num(it.rate) * num(it.amendment_qty);
                const varQty  = num(it.amendment_qty) - num(it.wo_qty);
                const varAmt  = amAmt - woAmt;
                return (
                  <tr key={it._key} className="hover:bg-[#f8f9fb]">
                    <td className="px-3 py-2"><input value={it.sl_no} onChange={e => updItem(it._key,'sl_no',e.target.value)} disabled={isSubmitted} className={clsx(iCls,'w-14')} /></td>
                    <td className="px-3 py-2"><input value={it.item_code} onChange={e => updItem(it._key,'item_code',e.target.value)} disabled={isSubmitted} className={clsx(iCls,'w-20')} /></td>
                    <td className="px-3 py-2"><input value={it.description} onChange={e => updItem(it._key,'description',e.target.value)} disabled={isSubmitted} className={clsx(iCls,'w-56')} /></td>
                    <td className="px-3 py-2"><input value={it.unit} onChange={e => updItem(it._key,'unit',e.target.value)} disabled={isSubmitted} className={clsx(iCls,'w-16')} /></td>
                    <td className="px-3 py-2 text-right"><input type="number" value={it.rate} onChange={e => updItem(it._key,'rate',e.target.value)} disabled={isSubmitted} className={clsx(iCls,'w-24 text-right')} /></td>
                    <td className="px-3 py-2 text-right"><input type="number" value={it.wo_qty} onChange={e => updItem(it._key,'wo_qty',e.target.value)} disabled={isSubmitted} className={clsx(iCls,'w-20 text-right')} /></td>
                    <td className="px-3 py-2 text-right font-mono text-[#1a1c21]">{inr(woAmt)}</td>
                    <td className="px-3 py-2 text-right"><input type="number" value={it.amendment_qty} onChange={e => updItem(it._key,'amendment_qty',e.target.value)} disabled={isSubmitted} className={clsx(iCls,'w-20 text-right')} /></td>
                    <td className="px-3 py-2 text-right font-mono text-[#1a1c21]">{inr(amAmt)}</td>
                    <td className={clsx('px-3 py-2 text-right font-mono font-medium', varQty >= 0 ? 'text-emerald-600' : 'text-red-500')}>{inr(varQty)}</td>
                    <td className={clsx('px-3 py-2 text-right font-mono font-medium', varAmt >= 0 ? 'text-emerald-600' : 'text-red-500')}>₹{inr(varAmt)}</td>
                    <td className="px-3 py-2">
                      {!isSubmitted && (
                        <button onClick={() => delItem(it._key)} className="w-6 h-6 flex items-center justify-center rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {items.length > 0 && (
              <tfoot>
                <tr className="bg-slate-50 border-t-2 border-slate-200 font-semibold">
                  <td colSpan={6} className="px-3 py-2.5 text-xs text-[#1a1c21]">Total of Existing Items</td>
                  <td className="px-3 py-2.5 text-right font-mono text-[#1a1c21]">₹{inr(totals.woAmt)}</td>
                  <td className="px-3 py-2.5" />
                  <td className="px-3 py-2.5 text-right font-mono text-indigo-700">₹{inr(totals.amendAmt)}</td>
                  <td className={clsx('px-3 py-2.5 text-right font-mono', totals.varAmt >= 0 ? 'text-emerald-700' : 'text-red-600')}>{inr(totals.varAmt)}</td>
                  <td className={clsx('px-3 py-2.5 text-right font-mono', totals.varAmt >= 0 ? 'text-emerald-700' : 'text-red-600')}>₹{inr(totals.varAmt)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* ── NT Items ── */}
      <div className="bg-white border border-[#e2e6ec] rounded-2xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#e2e6ec] bg-[#f8f9fb]">
          <h3 className="text-sm font-semibold text-[#1a1c21]">NT Items <span className="text-[10px] font-normal text-[#8e94a3] ml-1">(New items not in original WO)</span></h3>
          {!isSubmitted && (
            <button onClick={addNT}
              className="h-7 flex items-center gap-1 px-3 rounded-lg bg-amber-500 text-white text-xs font-medium hover:bg-amber-600">
              <Plus className="w-3.5 h-3.5" /> Add NT Item
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#e2e6ec]">
                {['Sl.No','Description','Unit','Rate (₹)','Qty','Amount',''].map((h, i) => (
                  <th key={i} className={clsx('px-3 py-2.5 text-[10px] font-semibold text-[#6a6f7d] uppercase tracking-wider whitespace-nowrap',
                    i >= 3 ? 'text-right' : 'text-left')}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1f3f6]">
              {ntItems.length === 0 && (
                <tr><td colSpan={7} className="py-8 text-center text-xs text-[#8e94a3]">No NT items — click "Add NT Item"</td></tr>
              )}
              {ntItems.map(n => {
                const amt = num(n.rate) * num(n.qty);
                return (
                  <tr key={n._key} className="hover:bg-[#f8f9fb]">
                    <td className="px-3 py-2"><input value={n.sl_no} onChange={e => updNT(n._key,'sl_no',e.target.value)} disabled={isSubmitted} placeholder="NT-01" className={clsx(iCls,'w-16')} /></td>
                    <td className="px-3 py-2"><input value={n.description} onChange={e => updNT(n._key,'description',e.target.value)} disabled={isSubmitted} className={clsx(iCls,'w-64')} /></td>
                    <td className="px-3 py-2"><input value={n.unit} onChange={e => updNT(n._key,'unit',e.target.value)} disabled={isSubmitted} className={clsx(iCls,'w-16')} /></td>
                    <td className="px-3 py-2 text-right"><input type="number" value={n.rate} onChange={e => updNT(n._key,'rate',e.target.value)} disabled={isSubmitted} className={clsx(iCls,'w-24 text-right')} /></td>
                    <td className="px-3 py-2 text-right"><input type="number" value={n.qty} onChange={e => updNT(n._key,'qty',e.target.value)} disabled={isSubmitted} className={clsx(iCls,'w-20 text-right')} /></td>
                    <td className="px-3 py-2 text-right font-mono font-medium text-amber-700">₹{inr(amt)}</td>
                    <td className="px-3 py-2">
                      {!isSubmitted && (
                        <button onClick={() => delNT(n._key)} className="w-6 h-6 flex items-center justify-center rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {ntItems.length > 0 && (
              <tfoot>
                <tr className="bg-amber-50 border-t-2 border-amber-100 font-semibold">
                  <td colSpan={5} className="px-3 py-2.5 text-xs text-[#1a1c21]">Total of NT Items</td>
                  <td className="px-3 py-2.5 text-right font-mono text-amber-700">₹{inr(totals.ntAmt)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* ── Summary ── */}
      <div className="bg-white border border-[#e2e6ec] rounded-2xl shadow-sm p-5">
        <h3 className="text-sm font-semibold text-[#1a1c21] mb-4">Summary</h3>
        <div className="max-w-md ml-auto space-y-1.5 text-xs">
          {[
            { label: 'Total Existing Items (Amendment)', val: totals.amendAmt, cls: 'text-[#1a1c21]' },
            { label: 'Total NT Items',                   val: totals.ntAmt,    cls: 'text-amber-700' },
          ].map(r => (
            <div key={r.label} className="flex justify-between py-1.5 border-b border-[#f1f3f6]">
              <span className="text-[#6a6f7d]">{r.label}</span>
              <span className={clsx('font-mono font-medium', r.cls)}>₹{inr(r.val)}</span>
            </div>
          ))}
          <div className="flex justify-between py-1.5 border-b border-[#e2e6ec] font-semibold">
            <span className="text-[#1a1c21]">Grand Total (Excl. GST)</span>
            <span className="font-mono text-indigo-700">₹{inr(totals.grandEx)}</span>
          </div>
          <div className="flex justify-between py-1.5 border-b border-[#f1f3f6]">
            <span className="text-[#6a6f7d]">CGST @ {num(hdr.gst_rate) / 2}%</span>
            <span className="font-mono text-[#6a6f7d]">₹{inr(totals.cgst)}</span>
          </div>
          <div className="flex justify-between py-1.5 border-b border-[#f1f3f6]">
            <span className="text-[#6a6f7d]">SGST @ {num(hdr.gst_rate) / 2}%</span>
            <span className="font-mono text-[#6a6f7d]">₹{inr(totals.sgst)}</span>
          </div>
          <div className="flex justify-between py-2 mt-1 rounded-xl bg-indigo-50 px-3">
            <span className="font-semibold text-indigo-900">Grand Total (Incl. GST)</span>
            <span className="font-mono font-bold text-indigo-700 text-sm">₹{inr(totals.grandIncl)}</span>
          </div>
          {num(hdr.wo_value_excl_gst) > 0 && (
            <div className="flex justify-between py-1.5 text-[10px] text-[#8e94a3]">
              <span>Variation over Original WO (Incl. GST)</span>
              <span className={clsx('font-mono', totals.grandIncl - num(hdr.wo_value_excl_gst) * (1 + num(hdr.gst_rate)/100) >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                ₹{inr(totals.grandIncl - num(hdr.wo_value_excl_gst) * (1 + num(hdr.gst_rate) / 100))}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Create Modal ──────────────────────────────────────────────────────────────
function CreateModal({ projects, defaultProjectId, onClose, onSave, isPending }) {
  const [f, setF] = useState({
    project_id: defaultProjectId || '',
    wo_number: '',
    vendor_name: '',
    package_description: '',
    wo_value_excl_gst: '',
    gst_rate: 18,
  });
  const iCls2 = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100';
  const lCls  = 'block text-[10px] font-semibold text-[#8e94a3] uppercase tracking-wider mb-1.5';
  const set   = (k, v) => setF(p => ({ ...p, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-5 py-4 bg-indigo-700 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-white">New Variation Statement</p>
            <p className="text-xs text-indigo-200 mt-0.5">Fill in the work order details</p>
          </div>
          <button onClick={onClose} className="text-indigo-200 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className={lCls}>Project *</label>
            <select value={f.project_id} onChange={e => set('project_id', e.target.value)} className={iCls2}>
              <option value="">Select project…</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className={lCls}>Work Order No.</label>
            <input value={f.wo_number} onChange={e => set('wo_number', e.target.value)} placeholder="WDIRY0194" className={iCls2} />
          </div>
          <div>
            <label className={lCls}>Vendor Name</label>
            <input value={f.vendor_name} onChange={e => set('vendor_name', e.target.value)} placeholder="Contractor name" className={iCls2} />
          </div>
          <div>
            <label className={lCls}>Package Description</label>
            <input value={f.package_description} onChange={e => set('package_description', e.target.value)} placeholder="Civil works for…" className={iCls2} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lCls}>WO Value (Excl. GST) ₹</label>
              <input type="number" value={f.wo_value_excl_gst} onChange={e => set('wo_value_excl_gst', e.target.value)} placeholder="0.00" className={iCls2} />
            </div>
            <div>
              <label className={lCls}>GST Rate %</label>
              <select value={f.gst_rate} onChange={e => set('gst_rate', e.target.value)} className={iCls2}>
                {[5, 12, 18, 28].map(r => <option key={r} value={r}>{r}%</option>)}
              </select>
            </div>
          </div>
        </div>
        <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
          <button onClick={() => { if (!f.project_id) return toast.error('Select a project'); onSave(f); }}
            disabled={isPending}
            className="px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50">
            {isPending ? 'Creating…' : 'Create Statement'}
          </button>
        </div>
      </div>
    </div>
  );
}
