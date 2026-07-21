// src/pages/tqs/LiabilityRegisterPage.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { liabilityRegisterAPI, projectAPI } from '../../api/client';
import {
  BookOpen, Search, Printer, AlertTriangle,
  IndianRupee, X, ShoppingCart, Hammer, Layers3, HardHat,
  FileSpreadsheet, FileText, ChevronDown, Building2, Filter, Pencil,
  Users, Receipt, Wallet, Percent, TrendingUp, Clock,
  BellRing,
} from 'lucide-react';

// ─── Helpers ────────────────────────────────────────────────────────────────
const inr = (v, d = 2) =>
  Math.abs(parseFloat(v || 0)).toLocaleString('en-IN', {
    minimumFractionDigits: d, maximumFractionDigits: d,
  });

const fmt = (d) => {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return d; }
};

const safeFile = (n) =>
  String(n || 'Vendor').replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();

// Professional, differentiated palette.
//  · indigo  = brand / payable / selection
//  · emerald = money paid out (debit)
//  · amber   = watch / advances / 31–60d aging
//  · rose    = overdue / 61d+ aging
//  · slate   = neutral ink & surfaces
// Legacy keys (blue/red/slate + *Bg/*Border) are kept so existing references
// resolve, but now carry a genuinely distinct hue each.
const C = {
  // brand / payable
  blue: '#4F46E5', blueBg: '#EEF0FE', blueBorder: '#DADCFB',
  // overdue
  red: '#E11D48', redBg: '#FFF1F3', redBorder: '#FBD0D9',
  // neutral
  slate: '#334155', slateBg: '#F4F6FA', slateBorder: '#E5E9F0',
  // paid
  emerald: '#059669', emeraldBg: '#ECFDF5', emeraldBorder: '#B6EBD3',
  // watch / advance
  amber: '#B45309', amberBg: '#FEF6E7', amberBorder: '#F5DDA6',
  // structural
  ink: '#0F172A', sub: '#64748B', muted: '#94A3B8',
  canvas: '#EEF1F6', line: '#E5E9F0', card: '#FFFFFF',
};

const ageTone = (row) => {
  if (parseFloat(row.payable_90_plus || 0) > 0) return { label: '90+D',   color: C.red,     bg: C.redBg,     border: C.redBorder };
  if (parseFloat(row.payable_61_90 || 0) > 0) return { label: '61-90D',  color: C.red,     bg: C.redBg,     border: C.redBorder };
  if (parseFloat(row.payable_31_60 || 0) > 0) return { label: '31-60D',  color: C.amber,   bg: C.amberBg,   border: C.amberBorder };
  if (parseFloat(row.payable_0_30 || 0) > 0) return { label: '0-30D',   color: C.blue,    bg: C.blueBg,    border: C.blueBorder };
  return null;
};

// ─── Entry type config ───────────────────────────────────────────────────────
const ENTRY = {
  'Invoice':          { label: 'Invoice',      color: C.blue,    bg: C.blueBg,    border: C.blueBorder,    side: 'credit' },
  'Payment':          { label: 'Payment',      color: C.emerald, bg: C.emeraldBg, border: C.emeraldBorder, side: 'debit'  },
  'TDS Deduction':    { label: 'TDS',          color: C.slate,   bg: C.slateBg,   border: C.slateBorder,   side: 'debit'  },
  'Other Deduction':  { label: 'Deduction',    color: C.slate,   bg: C.slateBg,   border: C.slateBorder,   side: 'debit'  },
  'Advance Given':    { label: 'Advance',      color: C.amber,   bg: C.amberBg,   border: C.amberBorder,   side: 'debit'  },
  'Advance Recovery': { label: 'Adv.Recovery', color: C.slate,   bg: C.slateBg,   border: C.slateBorder,   side: 'debit'  },
};

function TxnBadge({ type }) {
  const c = ENTRY[type] || { label: type, color: '#4B5563', bg: '#F3F4F6', border: '#D1D5DB' };
  return (
    <span style={{
      display: 'inline-block', fontSize: 10, fontWeight: 600,
      color: c.color, background: c.bg, border: `1px solid ${c.border}`,
      borderRadius: 4, padding: '1px 7px', whiteSpace: 'nowrap',
    }}>
      {c.label}
    </span>
  );
}

// ─── Print builder ───────────────────────────────────────────────────────────
function buildPrint({ vendorName, fromDate, toDate, ledger, totals, selRow, projectName }) {
  const cb = parseFloat(totals.closing_balance || 0);
  const rows = ledger.map((r, i) => {
    const bal = parseFloat(r.running_balance || 0);
    const nil = Math.abs(bal) < 0.01;
    const cfg = ENTRY[r.entry_type] || { label: r.entry_type, color: '#4B5563' };
    return `<tr style="background:${i % 2 ? '#f8fafc' : '#fff'}">
      <td>${fmt(r.txn_date)}</td>
      <td><b>${r.narration || ''}</b>${r.invoice_date ? `<br/><small style="color:#94a3b8">Inv Date: ${fmt(r.invoice_date)}</small>` : ''}${r.po_ref ? `<br/><small style="color:#94a3b8">PO: ${r.po_ref}</small>` : ''}</td>
      <td><span style="color:${cfg.color};font-size:8pt;font-weight:700;border:1px solid ${cfg.color}44;padding:1px 6px;border-radius:3px">${cfg.label}</span></td>
      <td style="font-family:monospace">${r.vch_number || '—'}</td>
      <td style="color:#64748b">${r.project_name || '—'}</td>
      <td style="text-align:right;color:#2563eb;font-family:monospace;font-weight:700">${parseFloat(r.debit_amount || 0) > 0 ? `₹${inr(r.debit_amount, 2)}` : '—'}</td>
      <td style="text-align:right;color:#2563eb;font-family:monospace;font-weight:700">${parseFloat(r.credit_amount || 0) > 0 ? `₹${inr(r.credit_amount, 2)}` : '—'}</td>
      <td style="text-align:right;font-family:monospace;font-weight:800;color:${nil ? '#94a3b8' : bal > 0 ? '#2563eb' : '#0f172a'}">${nil ? '—' : `₹${inr(Math.abs(bal), 2)}`}</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
  <title>Vendor Ledger — ${vendorName}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',Arial,sans-serif;font-size:10pt;color:#0f172a;background:#fff}
    @page{size:A4 landscape;margin:10mm}
    .header{background:#1e3a5f;color:#fff;padding:14px 18px;display:flex;justify-content:space-between;align-items:center}
    .header h1{font-size:14pt;font-weight:800;margin:2px 0 0}
    .header .sub{font-size:8pt;opacity:.6;text-transform:uppercase;letter-spacing:1px}
    .header .bal{text-align:right}
    .header .bal-val{font-size:18pt;font-weight:900;color:${cb > 0 ? '#bfdbfe' : '#bfdbfe'}}
    .kpis{display:flex;background:#f8fafc;border-bottom:2px solid #e2e8f0}
    .kpi{flex:1;padding:8px 14px;border-right:1px solid #e2e8f0}
    .kpi:last-child{border-right:none}
    .kpi .k-label{font-size:7pt;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px}
    .kpi .k-val{font-size:12pt;font-weight:800;margin-top:2px}
    table{width:100%;border-collapse:collapse;font-size:9pt}
    thead tr{background:#1e293b}
    thead th{padding:8px 10px;color:#94a3b8;font-size:8pt;font-weight:700;text-transform:uppercase;letter-spacing:.4px;border-bottom:2px solid #334155;white-space:nowrap}
    thead th:nth-child(6),thead th:nth-child(7),thead th:nth-child(8){text-align:right}
    tbody td{padding:7px 10px;border-bottom:1px solid #f1f5f9;vertical-align:top}
    tbody td:nth-child(6),tbody td:nth-child(7),tbody td:nth-child(8){text-align:right;white-space:nowrap}
    .opening td{background:#fffbeb;color:#92400e;font-weight:700;padding:6px 10px;border-bottom:1px solid #fef3c7}
    .closing td{background:#1e293b;padding:9px 10px}
    .footer{margin-top:12px;font-size:8pt;color:#94a3b8;display:flex;justify-content:space-between}
  </style></head>
  <body>
  <div class="header">
    <div><div class="sub">BCIM Engineering · Vendor Account Statement</div>
      <h1>${vendorName}</h1>
      ${(fromDate || toDate) ? `<div style="font-size:9pt;opacity:.7;margin-top:3px">${fromDate ? fmt(fromDate) : '∞'} → ${toDate ? fmt(toDate) : '∞'}</div>` : ''}
      ${projectName ? `<div style="font-size:9pt;opacity:.6;margin-top:1px">${projectName}</div>` : ''}
    </div>
    <div class="bal">
      <div style="font-size:8pt;opacity:.6">BALANCE DUE</div>
      <div class="bal-val">₹${inr(Math.abs(cb), 2)}</div>
      <div style="font-size:9pt;opacity:.6">${cb > 0 ? 'Payable to vendor' : cb < 0 ? 'Excess paid' : 'Fully settled'}</div>
    </div>
  </div>
  <div class="kpis">
    ${[
      { l: 'Total Invoiced', v: selRow.total_invoiced, c: '#2563eb' },
      { l: 'Payments Made',  v: selRow.total_paid,     c: '#2563eb' },
      { l: 'TDS Deducted',   v: selRow.total_tds,      c: '#0f172a' },
      { l: 'Advance Given',  v: selRow.total_advance_given, c: '#2563eb' },
      { l: 'Net Payable',    v: cb, c: cb > 0 ? '#2563eb' : '#0f172a' },
      { l: 'Transactions',   v: null, c: '#0f172a', count: ledger.length },
    ].map(s => `<div class="kpi"><div class="k-label">${s.l}</div><div class="k-val" style="color:${s.c}">${s.count !== undefined ? s.count : `₹${inr(Math.abs(parseFloat(s.v || 0)), 2)}`}</div></div>`).join('')}
  </div>
  <table>
    <thead><tr>
      <th style="width:90px">Date</th><th>Particulars</th><th style="width:90px">Type</th>
      <th style="width:130px">Voucher No.</th><th style="width:150px">Project</th>
      <th style="width:110px;text-align:right">Debit</th>
      <th style="width:110px;text-align:right">Credit</th>
      <th style="width:120px;text-align:right">Balance</th>
    </tr></thead>
    <tbody>
      <tr class="opening"><td>—</td><td>Opening Balance</td><td></td><td></td><td></td><td></td><td></td><td style="text-align:right">₹0.00</td></tr>
      ${rows}
      <tr class="closing">
        <td colspan="5"><span style="color:#fff;font-weight:800;font-size:10pt;text-transform:uppercase;letter-spacing:.4px">Closing Balance</span></td>
        <td style="text-align:right"><div style="color:#bfdbfe;font-family:monospace;font-weight:800">₹${inr(totals.total_debit, 2)}</div><div style="color:rgba(255,255,255,.4);font-size:8pt">Total Debit</div></td>
        <td style="text-align:right"><div style="color:#bfdbfe;font-family:monospace;font-weight:800">₹${inr(totals.total_credit, 2)}</div><div style="color:rgba(255,255,255,.4);font-size:8pt">Total Credit</div></td>
        <td style="text-align:right"><div style="color:${cb > 0 ? '#bfdbfe' : '#bfdbfe'};font-family:monospace;font-weight:900;font-size:11pt">₹${inr(Math.abs(cb), 2)}</div><div style="color:rgba(255,255,255,.4);font-size:8pt">${cb > 0 ? 'Payable' : cb < 0 ? 'Excess' : 'Settled'}</div></td>
      </tr>
    </tbody>
  </table>
  <div class="footer">
    <span>Printed on ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })} · BCIM Engineering ERP</span>
    <span>Debit = paid / deducted · Credit = payable to vendor</span>
  </div>
  </body></html>`;
}

// ─── Column widths ───────────────────────────────────────────────────────────
const COL = { date: 100, type: 88, vch: 128, project: 148, dr: 118, cr: 118, bal: 128 };

// ─── Edit Advance Modal ──────────────────────────────────────────────────────
function EditAdvanceModal({ row, onClose, onSaved }) {
  const [amount,    setAmount]    = useState(String(parseFloat(row.debit_amount || 0)));
  const [tds,       setTds]       = useState('');
  const [tdsMode,   setTdsMode]   = useState('pct'); // 'pct' | 'fixed'
  const [tdsPct,    setTdsPct]    = useState('1');

  const gross = parseFloat(amount || 0);
  const effectiveTds = tdsMode === 'pct'
    ? Math.round((gross * parseFloat(tdsPct || 0)) / 100 * 100) / 100
    : parseFloat(tds || 0);
  const net = gross - effectiveTds;

  const mut = useMutation({
    mutationFn: () => liabilityRegisterAPI.updateAdvance(row.source_id, {
      amount:     gross,
      tds_amount: effectiveTds,
    }),
    onSuccess: () => {
      toast.success('Advance updated — TDS deduction applied');
      onSaved();
      onClose();
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Update failed'),
  });

  return (
    <div style={{ position:'fixed', inset:0, zIndex:9999, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'#fff', borderRadius:12, width:'100%', maxWidth:460, boxShadow:'0 20px 60px rgba(0,0,0,0.2)', overflow:'hidden' }}>
        {/* Header */}
        <div style={{ background:'#1E293B', padding:'14px 20px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontSize:12, color:'#94A3B8', fontWeight:600, textTransform:'uppercase', letterSpacing:0.5 }}>Edit Advance Payment</div>
            <div style={{ fontSize:14, fontWeight:700, color:'#fff', marginTop:2 }}>{row.narration}</div>
          </div>
          <button onClick={onClose} style={{ background:'transparent', border:'none', cursor:'pointer', color:'#94A3B8', padding:4 }}><X size={18}/></button>
        </div>

        <div style={{ padding:'20px 20px 0' }}>
          {/* Amount */}
          <div style={{ marginBottom:14 }}>
            <label style={{ fontSize:11, fontWeight:700, color:'#475569', textTransform:'uppercase', letterSpacing:0.4, display:'block', marginBottom:5 }}>
              Advance Amount (₹)
            </label>
            <input
              type="number" min="0" step="0.01"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              style={{ width:'100%', border:'1px solid #CBD5E1', borderRadius:8, padding:'8px 12px', fontSize:14, fontWeight:600, outline:'none', boxSizing:'border-box' }}
            />
          </div>

          {/* TDS mode toggle */}
          <div style={{ marginBottom:10 }}>
            <label style={{ fontSize:11, fontWeight:700, color:'#475569', textTransform:'uppercase', letterSpacing:0.4, display:'block', marginBottom:5 }}>
              TDS Deduction
            </label>
            <div style={{ display:'flex', gap:6, marginBottom:8 }}>
              {[['pct','% of Amount'],['fixed','Fixed Amount']].map(([k,l]) => (
                <button key={k} onClick={() => setTdsMode(k)}
                  style={{ flex:1, padding:'6px 0', borderRadius:7, border:`1.5px solid ${tdsMode===k?C.blue:C.slateBorder}`, background:tdsMode===k?C.blueBg:C.slateBg, color:tdsMode===k?C.blue:'#64748B', fontSize:12, fontWeight:600, cursor:'pointer' }}>
                  {l}
                </button>
              ))}
            </div>
            {tdsMode === 'pct' ? (
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <input
                  type="number" min="0" max="30" step="0.01"
                  value={tdsPct}
                  onChange={e => setTdsPct(e.target.value)}
                  style={{ width:90, border:'1px solid #CBD5E1', borderRadius:8, padding:'8px 10px', fontSize:14, fontWeight:600, outline:'none' }}
                />
                <span style={{ fontSize:13, color:'#64748B', fontWeight:600 }}>% of ₹{inr(gross)} = <strong style={{color:C.slate}}>₹{inr(effectiveTds,2)}</strong></span>
              </div>
            ) : (
              <input
                type="number" min="0" step="0.01"
                value={tds}
                onChange={e => setTds(e.target.value)}
                placeholder="Enter TDS amount"
                style={{ width:'100%', border:'1px solid #CBD5E1', borderRadius:8, padding:'8px 12px', fontSize:14, fontWeight:600, outline:'none', boxSizing:'border-box' }}
              />
            )}
          </div>

          {/* Summary */}
          <div style={{ background:'#F8FAFC', border:'1px solid #E2E8F0', borderRadius:8, padding:'10px 14px', marginBottom:16, display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
            {[
              { label:'Advance',    val:gross,          color:C.blue },
              { label:'TDS',        val:effectiveTds,   color:C.slate },
              { label:'Net Paid',   val:net,            color:C.blue },
            ].map(s => (
              <div key={s.label} style={{ textAlign:'center' }}>
                <div style={{ fontSize:9, fontWeight:700, color:'#94A3B8', textTransform:'uppercase' }}>{s.label}</div>
                <div style={{ fontSize:14, fontWeight:800, color:s.color }}>₹{inr(s.val,2)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding:'0 20px 16px', display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button onClick={onClose} style={{ padding:'8px 18px', border:'1px solid #E2E8F0', borderRadius:8, background:'#fff', color:'#475569', fontSize:13, fontWeight:600, cursor:'pointer' }}>
            Cancel
          </button>
          <button
            onClick={() => mut.mutate()}
            disabled={mut.isPending || gross <= 0}
            style={{ padding:'8px 22px', border:'none', borderRadius:8, background:'#1E293B', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', opacity: mut.isPending ? 0.6 : 1 }}
          >
            {mut.isPending ? 'Saving…' : 'Save & Apply TDS'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────
export default function LiabilityRegisterPage() {
  const [projectId,      setProjectId]      = useState('');
  const [fromDate,       setFromDate]       = useState('');
  const [toDate,         setToDate]         = useState('');
  const [search,         setSearch]         = useState('');
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [showFilters,    setShowFilters]    = useState(false);
  const [sourceType,     setSourceType]     = useState('all');
  const [balanceFilter,  setBalanceFilter]  = useState('all');
  const [editRow,        setEditRow]        = useState(null);
  const qc = useQueryClient();

  useEffect(() => {
    const main = document.querySelector('main');
    if (!main) return;
    // page-enter div is the direct child — needs explicit height so
    // height:100% on this page's root has a proper containing block
    const pageWrap = main.firstElementChild;
    const prevOverflow   = main.style.overflow;
    const prevHeight     = main.style.height;
    const prevWrapHeight = pageWrap?.style.height ?? '';
    main.style.overflow = 'hidden';
    main.style.height   = '100%';
    if (pageWrap) pageWrap.style.height = '100%';
    return () => {
      main.style.overflow = prevOverflow;
      main.style.height   = prevHeight;
      if (pageWrap) pageWrap.style.height = prevWrapHeight;
    };
  }, []);

  const { data: projects = [] } = useQuery({
    queryKey: ['projects-list'],
    queryFn: () => projectAPI.list({}).then(r => r.data?.data ?? r.data ?? []),
    staleTime: 5 * 60 * 1000,
  });

  const { data: vendors = [], isLoading: loadingVendors } = useQuery({
    queryKey: ['liability-summary', projectId, fromDate, toDate, search, sourceType],
    queryFn: () => liabilityRegisterAPI.summary({
      project_id:  projectId  || undefined,
      from_date:   fromDate   || undefined,
      to_date:     toDate     || undefined,
      search:      search     || undefined,
      source_type: sourceType === 'all' ? undefined : sourceType,
    }).then(r => r.data ?? []),
    staleTime: 5 * 60 * 1000,
  });

  const { data: ledgerData, isLoading: loadingLedger } = useQuery({
    queryKey: ['liability-ledger', selectedVendor, projectId, fromDate, toDate, sourceType],
    queryFn: () => liabilityRegisterAPI.ledger({
      vendor_name: selectedVendor,
      project_id:  projectId  || undefined,
      from_date:   fromDate   || undefined,
      to_date:     toDate     || undefined,
      source_type: sourceType === 'all' ? undefined : sourceType,
    }).then(r => r.data),
    enabled: !!selectedVendor,
    staleTime: 5 * 60 * 1000,
  });

  const ledger = ledgerData?.ledger ?? [];
  const totals = ledgerData?.totals ?? { total_credit: 0, total_debit: 0, closing_balance: 0 };

  const visibleVendors = useMemo(() => vendors.filter(v => {
    const b = parseFloat(v.net_balance || 0);
    if (balanceFilter === 'payable') return b > 0;
    if (balanceFilter === 'settled') return Math.abs(b) < 1;
    if (balanceFilter === 'advance') return parseFloat(v.total_advance_given || 0) > 0;
    return true;
  }), [vendors, balanceFilter]);

  useEffect(() => {
    if (selectedVendor && !visibleVendors.some(v => v.vendor_name === selectedVendor))
      setSelectedVendor(null);
  }, [selectedVendor, visibleVendors]);

  const totalInvoiced = visibleVendors.reduce((s, v) => s + parseFloat(v.total_invoiced      || 0), 0);
  const totalPaid     = visibleVendors.reduce((s, v) => s + parseFloat(v.total_paid          || 0), 0);
  const totalAdvance  = visibleVendors.reduce((s, v) => s + parseFloat(v.total_advance_given || 0), 0);
  const totalBalance  = visibleVendors.reduce((s, v) => s + parseFloat(v.net_balance         || 0), 0);
  const totalTDS      = visibleVendors.reduce((s, v) => s + parseFloat(v.total_tds           || 0), 0);
  const totalPayable  = visibleVendors.reduce((s, v) => s + parseFloat(v.payable_balance     || 0), 0);
  const totalAdvanceOpen = visibleVendors.reduce((s, v) => s + parseFloat(v.total_advance_open || 0), 0);
  const totalOver90   = visibleVendors.reduce((s, v) => s + parseFloat(v.payable_90_plus      || 0), 0);
  const vendorsOver90 = visibleVendors.filter(v => parseFloat(v.payable_90_plus || 0) > 0).length;

  const selRow    = visibleVendors.find(v => v.vendor_name === selectedVendor) ?? {};
  const closingBal = parseFloat(totals.closing_balance || 0);

  const automationMut = useMutation({
    mutationFn: () => liabilityRegisterAPI.runAutomation(),
    onSuccess: (res) => {
      const checked = res?.data?.companies_checked || 0;
      const alerted = (res?.data?.results || []).reduce((s, r) => s + Number(r.vendors_over90 || 0), 0);
      qc.invalidateQueries({ queryKey: ['notifications'] });
      toast.success(`Liability automation checked ${checked} company(s), ${alerted} overdue vendor(s) found`);
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Liability automation failed'),
  });

  // ── Export ──
  const exportExcel = () => {
    if (!selectedVendor || !ledger.length) return;
    const pName = projectId ? (projects.find(p => p.id === projectId)?.name ?? 'All Projects') : 'All Projects';
    const ws = XLSX.utils.aoa_to_sheet([
      ['Vendor Liability Ledger'], ['Vendor', selectedVendor], ['Project', pName],
      ['Period', `${fromDate || 'Start'} to ${toDate || 'Today'}`], [],
      ['Total Invoiced', +selRow.total_invoiced || 0], ['Total Paid', +selRow.total_paid || 0],
      ['TDS', +selRow.total_tds || 0], ['Advance', +selRow.total_advance_given || 0],
      ['Closing Balance', +totals.closing_balance || 0], [],
    ]);
    XLSX.utils.sheet_add_json(ws, ledger.map(r => ({
      Date: fmt(r.txn_date), Type: ENTRY[r.entry_type]?.label || r.entry_type || '',
      Particulars: r.narration || '', 'Invoice No.': r.invoice_ref || '',
      'Invoice Date': r.invoice_date ? fmt(r.invoice_date) : '',
      'PO No.': r.po_ref || '', 'Voucher No.': r.vch_number || '',
      Project: r.project_name || '',
      'Debit': +r.debit_amount || 0, 'Credit': +r.credit_amount || 0,
      Balance: +r.running_balance || 0,
    })), { origin: -1 });
    ws['!cols'] = [14, 14, 45, 18, 14, 18, 18, 26, 12, 12, 12].map(w => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ledger');
    XLSX.writeFile(wb, `Liability_${safeFile(selectedVendor)}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const exportPDF = () => {
    if (!selectedVendor || !ledger.length) return;
    const pName = projectId ? (projects.find(p => p.id === projectId)?.name ?? 'All Projects') : 'All Projects';
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    doc.setFontSize(13); doc.setFont(undefined, 'bold');
    doc.text('BCIM Engineering - Vendor Liability Ledger', 14, 12);
    doc.setFontSize(9); doc.setFont(undefined, 'normal');
    doc.text(`Vendor: ${selectedVendor}   Project: ${pName}   Period: ${fromDate || 'Start'} to ${toDate || 'Today'}`, 14, 20);
    autoTable(doc, {
      startY: 27,
      head: [['Invoiced', 'Paid', 'TDS', 'Advance', 'Total Debit', 'Total Credit', 'Balance']],
      body: [[
        `₹${inr(selRow.total_invoiced, 2)}`, `₹${inr(selRow.total_paid, 2)}`,
        `₹${inr(selRow.total_tds, 2)}`, `₹${inr(selRow.total_advance_given, 2)}`,
        `₹${inr(totals.total_debit, 2)}`, `₹${inr(totals.total_credit, 2)}`,
        `₹${inr(Math.abs(totals.closing_balance), 2)}`,
      ]],
      theme: 'grid', styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 58, 95] }, margin: { left: 14, right: 14 },
    });
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 5,
      head: [['Date', 'Particulars', 'Type', 'Voucher No.', 'Project', 'Debit', 'Credit', 'Balance']],
      body: ledger.map(r => [
        fmt(r.txn_date),
        (r.narration || '')
          + (r.invoice_date ? `\nInv Date: ${fmt(r.invoice_date)}` : '')
          + (r.po_ref ? `\nPO: ${r.po_ref}` : ''),
        ENTRY[r.entry_type]?.label || r.entry_type || '',
        r.vch_number || '', r.project_name || '',
        +r.debit_amount > 0  ? `₹${inr(r.debit_amount, 2)}`  : '-',
        +r.credit_amount > 0 ? `₹${inr(r.credit_amount, 2)}` : '-',
        Math.abs(+r.running_balance) < 0.01 ? '-' : `₹${inr(Math.abs(r.running_balance), 2)}`,
      ]),
      theme: 'striped', styles: { fontSize: 7, cellPadding: 1.8 },
      headStyles: { fillColor: [30, 41, 59] },
      columnStyles: {
        0: { cellWidth: 20 }, 1: { cellWidth: 75 }, 2: { cellWidth: 22 },
        3: { cellWidth: 30 }, 4: { cellWidth: 38 },
        5: { cellWidth: 28, halign: 'right' }, 6: { cellWidth: 28, halign: 'right' }, 7: { cellWidth: 30, halign: 'right' },
      },
      margin: { left: 14, right: 14 },
    });
    doc.save(`Liability_${safeFile(selectedVendor)}_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  // ─── RENDER ─────────────────────────────────────────────────────────────────
  const S = {
    root: {
      height: '100%', display: 'flex', flexDirection: 'column',
      overflow: 'hidden', background: C.canvas, minHeight: 0,
      fontFamily: "'Geist Variable','Segoe UI',system-ui,sans-serif",
    },
    // ── Top bar ──
    topBar: {
      background: C.card, borderBottom: `1px solid ${C.line}`,
      flexShrink: 0, padding: '0 14px',
      boxShadow: '0 1px 2px rgba(15,23,42,.03)',
    },
    topRow: {
      display: 'flex', alignItems: 'center', gap: 8,
      height: 46, borderBottom: '1px solid #F1F5F9',
    },
    pageTitle: { fontSize: 13.5, fontWeight: 700, color: '#0F172A', margin: 0, whiteSpace: 'nowrap' },
    pageSub:   { fontSize: 10, color: '#94A3B8', margin: '1px 0 0', whiteSpace: 'nowrap' },
    // ── KPI strip ──
    kpiStrip: {
      display: 'flex', gap: 8, padding: '8px 14px',
      flexShrink: 0, overflowX: 'auto',
    },
    // ── Split pane ──
    pane: { flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0, padding: '0 14px 10px', gap: 8 },
  };

  return (
    <div style={S.root}>
      {/* ═══════════════════════════ TOP BAR ═══════════════════════════ */}
      <div style={S.topBar}>
        <div style={S.topRow}>
          {/* Icon + title */}
          <div style={{ width: 26, height: 26, borderRadius: 7, background: C.blueBg, border: `1px solid ${C.blueBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <BookOpen size={13} color={C.blue} />
          </div>
          <div style={{ flexShrink: 0 }}>
            <p style={S.pageTitle}>Liability Register</p>
            <p style={S.pageSub}>Payables · Statement of accounts</p>
          </div>
          <div style={{ flex: 1 }} />

          {/* Source segmented control */}
          <div style={{ display: 'flex', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: 3, gap: 2 }}>
            {[
              { key: 'all', label: 'All',  Icon: Layers3 },
              { key: 'po',  label: 'PO',   Icon: ShoppingCart },
              { key: 'wo',  label: 'WO',   Icon: Hammer },
              { key: 'sc',  label: 'SC',   Icon: HardHat },
            ].map(({ key, label, Icon }) => {
              const on = sourceType === key;
              return (
                <button key={key} onClick={() => { setSourceType(key); setSelectedVendor(null); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                    fontSize: 12, fontWeight: 600, transition: 'all .12s',
                    background: on ? '#fff' : 'transparent',
                    color: on ? '#2563EB' : '#64748B',
                    boxShadow: on ? '0 1px 3px rgba(0,0,0,.1),0 0 0 1px #E2E8F0' : 'none',
                  }}>
                  <Icon size={12} /> {label}
                </button>
              );
            })}
          </div>

          {/* Project select */}
          <div style={{ position: 'relative' }}>
            <select value={projectId} onChange={e => setProjectId(e.target.value)}
              style={{ height: 30, padding: '0 30px 0 10px', border: '1px solid #E2E8F0', borderRadius: 7, background: '#fff', fontSize: 12, color: '#334155', outline: 'none', minWidth: 155, maxWidth: 215, appearance: 'none', fontFamily: 'inherit', cursor: 'pointer' }}>
              <option value="">All Projects</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <ChevronDown size={12} color="#94A3B8" style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
          </div>

          {/* Filters toggle */}
          <button onClick={() => setShowFilters(f => !f)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5, height: 30, padding: '0 12px',
              border: `1px solid ${showFilters || fromDate || toDate ? '#2563EB' : '#E2E8F0'}`,
              borderRadius: 7, background: showFilters || fromDate || toDate ? '#EFF6FF' : '#fff',
              color: showFilters || fromDate || toDate ? '#2563EB' : '#64748B',
              fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all .12s',
            }}>
            <Filter size={13} /> {fromDate || toDate ? 'Active' : 'Filters'}
          </button>

          {/* Export/Print — visible when vendor selected */}
          <button
            onClick={() => automationMut.mutate()}
            disabled={automationMut.isPending}
            title="Run liability aging alerts now"
            style={{
              display: 'flex', alignItems: 'center', gap: 6, height: 30, padding: '0 12px',
              border: '1px solid #BFDBFE', borderRadius: 7, background: '#EFF6FF',
              color: C.red, fontSize: 12, fontWeight: 700, cursor: automationMut.isPending ? 'wait' : 'pointer',
              opacity: automationMut.isPending ? 0.65 : 1,
            }}
          >
            <BellRing size={13} /> {automationMut.isPending ? 'Running...' : 'Run Alert'}
          </button>

          {selectedVendor && (
            <div style={{ display: 'flex', gap: 6, marginLeft: 2 }}>
              {[
                { label: 'Excel', Icon: FileSpreadsheet, color: C.blue, fn: exportExcel },
                { label: 'PDF',   Icon: FileText,        color: C.red, fn: exportPDF  },
                { label: 'Print', Icon: Printer,         color: C.slate,
                  fn: () => {
                    const pName = projectId ? (projects.find(p => p.id === projectId)?.name ?? '') : '';
                    const html = buildPrint({ vendorName: selectedVendor, fromDate, toDate, ledger, totals, selRow, projectName: pName });
                    const w = window.open('', '_blank', 'width=1100,height=750');
                    w.document.write(html); w.document.close(); w.focus();
                    setTimeout(() => w.print(), 400);
                  }
                },
              ].map(({ label, Icon, color, fn }) => (
                <button key={label} onClick={fn} disabled={label !== 'Print' && !ledger.length}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5, height: 30, padding: '0 11px',
                    border: '1px solid #E2E8F0', borderRadius: 7, background: '#fff',
                    color: '#475569', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    opacity: label !== 'Print' && !ledger.length ? 0.45 : 1,
                    transition: 'all .12s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = color; e.currentTarget.style.color = color; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.color = '#475569'; }}>
                  <Icon size={13} color={color} /> {label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Date filter row — collapsible */}
        {showFilters && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0 10px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#64748B' }}>Date range</span>
            {['From', 'To'].map((lbl, i) => (
              <React.Fragment key={lbl}>
                <span style={{ fontSize: 11, color: '#94A3B8' }}>{lbl}</span>
                <input type="date" value={i === 0 ? fromDate : toDate}
                  onChange={e => i === 0 ? setFromDate(e.target.value) : setToDate(e.target.value)}
                  style={{ height: 32, padding: '0 8px', border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 12, color: '#334155', outline: 'none', fontFamily: 'inherit' }} />
              </React.Fragment>
            ))}
            {(fromDate || toDate) && (
              <button onClick={() => { setFromDate(''); setToDate(''); }}
                style={{ display: 'flex', alignItems: 'center', gap: 4, height: 32, padding: '0 10px', border: '1px solid #BFDBFE', borderRadius: 6, background: '#EFF6FF', color: '#2563EB', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                <X size={11} /> Clear
              </button>
            )}
          </div>
        )}
      </div>

      {/* ═══════════════════════════ KPI CARDS ═══════════════════════════ */}
      <div style={S.kpiStrip}>
        {[
          { label: 'Vendors',        val: visibleVendors.length, isN: true,  accent: C.blue, light: C.blueBg, border: C.blueBorder, Icon: Users },
          { label: 'Total Invoiced', val: totalInvoiced,         isN: false, accent: C.blue, light: C.blueBg, border: C.blueBorder, Icon: Receipt },
          { label: 'Total Paid',     val: totalPaid,             isN: false, accent: C.blue, light: C.blueBg, border: C.blueBorder, Icon: Wallet },
          { label: 'TDS Deducted',   val: totalTDS,              isN: false, accent: C.slate, light: C.slateBg, border: C.slateBorder, Icon: Percent },
          { label: 'Advance Open',   val: totalAdvanceOpen || totalAdvance, isN: false, accent: C.red, light: C.redBg, border: C.redBorder, Icon: TrendingUp },
          { label: 'Net Payable',    val: totalPayable || totalBalance,     isN: false, accent: C.slate, light: C.slateBg, border: C.slateBorder, Icon: IndianRupee },
          { label: `90+ Days (${vendorsOver90})`, val: totalOver90,         isN: false, accent: C.red, light: C.redBg, border: C.redBorder, Icon: Clock },
        ].map(k => (
          <div key={k.label} style={{
            flex: '1 1 118px', minWidth: 118, position: 'relative',
            background: C.card, borderRadius: 10,
            border: `1px solid ${C.line}`,
            padding: '8px 11px 8px',
            boxShadow: '0 1px 2px rgba(15,23,42,.05)',
            overflow: 'hidden',
            transition: 'box-shadow .15s, border-color .15s',
          }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(15,23,42,.08)'; e.currentTarget.style.borderColor = k.border; }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 2px rgba(15,23,42,.05)'; e.currentTarget.style.borderColor = C.line; }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
              <div style={{ width: 20, height: 20, borderRadius: 6, background: k.light, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <k.Icon size={11} color={k.accent} strokeWidth={2.4} />
              </div>
              <div style={{ fontSize: 8.5, fontWeight: 700, color: C.sub, textTransform: 'uppercase', letterSpacing: 0.5, lineHeight: 1.2, whiteSpace: 'nowrap' }}>{k.label}</div>
            </div>
            <div style={{ fontSize: k.isN ? 18 : 14, fontWeight: 800, color: k.isN ? C.ink : k.accent, lineHeight: 1, letterSpacing: -0.4, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
              {k.isN ? k.val : <><span style={{ fontSize: 11, opacity: .55, marginRight: 1, fontWeight: 700 }}>₹</span>{inr(k.val)}</>}
            </div>
          </div>
        ))}
      </div>

      {/* ═══════════════════════════ SPLIT PANE ═══════════════════════════ */}
      <div style={S.pane}>

        {/* ── LEFT: Vendor list ── */}
        <div style={{
          width: 246, flexShrink: 0,
          display: 'flex', flexDirection: 'column',
          background: C.card, borderRadius: 14,
          border: `1px solid ${C.line}`,
          boxShadow: '0 1px 3px rgba(15,23,42,.05)',
          overflow: 'hidden',
        }}>
          {/* Search */}
          <div style={{ padding: '10px 10px 6px', flexShrink: 0 }}>
            <div style={{ position: 'relative' }}>
              <Search size={13} color="#94A3B8" style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search vendors…"
                style={{ width: '100%', paddingLeft: 28, paddingRight: 8, height: 32, border: '1px solid #E2E8F0', borderRadius: 7, fontSize: 12, color: '#334155', background: '#F8FAFC', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', transition: 'border-color .12s' }}
                onFocus={e => { e.target.style.borderColor = '#93C5FD'; e.target.style.background = '#fff'; }}
                onBlur={e => { e.target.style.borderColor = '#E2E8F0'; e.target.style.background = '#F8FAFC'; }} />
            </div>
          </div>

          {/* Balance filter tabs */}
          <div style={{ display: 'flex', borderBottom: '2px solid #F1F5F9', flexShrink: 0, padding: '0 4px' }}>
            {[
              { key: 'all',     label: 'All'      },
              { key: 'payable', label: 'Payable'  },
              { key: 'advance', label: 'Advance'  },
              { key: 'settled', label: 'Settled'  },
            ].map(t => {
              const on = balanceFilter === t.key;
              return (
                <button key={t.key} onClick={() => { setBalanceFilter(t.key); setSelectedVendor(null); }}
                  style={{
                    flex: 1, height: 30, border: 'none', cursor: 'pointer',
                    background: 'transparent', fontSize: 10, fontWeight: on ? 700 : 500,
                    color: on ? '#2563EB' : '#64748B',
                    borderBottom: `2px solid ${on ? '#2563EB' : 'transparent'}`,
                    marginBottom: -2, transition: 'all .12s',
                  }}>
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* Count */}
          <div style={{ padding: '5px 12px', borderBottom: '1px solid #F8FAFC', flexShrink: 0 }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: '#94A3B8' }}>
              {visibleVendors.length} account{visibleVendors.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {loadingVendors ? (
              <div style={{ padding: 20, textAlign: 'center' }}>
                <div style={{ width: 18, height: 18, border: '2px solid #93C5FD', borderTopColor: '#2563EB', borderRadius: '50%', animation: 'spin .7s linear infinite', margin: '0 auto' }} />
              </div>
            ) : visibleVendors.length === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center', color: '#94A3B8' }}>
                <Building2 size={26} style={{ opacity: .25, margin: '0 auto 8px', display: 'block' }} />
                <p style={{ fontSize: 12, margin: 0 }}>No vendors found</p>
              </div>
            ) : visibleVendors.map(v => {
              const bal = parseFloat(v.net_balance || 0);
              const nil = Math.abs(bal) < 1;
              const sel = selectedVendor === v.vendor_name;
              const tone = ageTone(v);
              return (
                <button key={v.vendor_name} onClick={() => setSelectedVendor(v.vendor_name)}
                  style={{
                    width: '100%', textAlign: 'left', cursor: 'pointer', outline: 'none',
                    padding: '10px 12px', border: 'none',
                    borderLeft: `3px solid ${sel ? '#2563EB' : 'transparent'}`,
                    borderBottom: '1px solid #F8FAFC',
                    background: sel ? '#EFF6FF' : 'transparent',
                    display: 'flex', flexDirection: 'column', gap: 3, transition: 'background .1s',
                  }}
                  onMouseEnter={e => { if (!sel) e.currentTarget.style.background = '#F8FAFC'; }}
                  onMouseLeave={e => { if (!sel) e.currentTarget.style.background = 'transparent'; }}>

                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: sel ? 700 : 600, color: sel ? '#1E40AF' : '#1E293B', flex: 1, lineHeight: 1.35, wordBreak: 'break-word' }}>
                      {(v.vendor_name || '').toUpperCase()}
                    </span>
                    <span style={{
                      fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0,
                      padding: '2px 8px', borderRadius: 20, marginTop: 1,
                      fontVariantNumeric: 'tabular-nums',
                      color: nil ? C.emerald : C.red,
                      background: nil ? C.emeraldBg : C.redBg,
                      border: `1px solid ${nil ? C.emeraldBorder : C.redBorder}`,
                    }}>
                      {nil ? '✓ Nil' : `₹${inr(Math.abs(bal))}`}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ fontSize: 10, color: '#94A3B8' }}>{v.bill_count} bill{v.bill_count !== 1 ? 's' : ''}</span>
                    <span style={{ color: '#CBD5E1', fontSize: 10 }}>·</span>
                    <span style={{ fontSize: 10, color: '#94A3B8' }}>₹{inr(v.total_invoiced)}</span>
                  </div>

                  {parseFloat(v.total_advance_given || 0) > 0 && (
                    <span style={{ fontSize: 10, fontWeight: 600, color: C.red }}>Open Adv: ₹{inr(v.total_advance_open || v.total_advance_given)}</span>
                  )}

                  {(tone || v.unpaid_bill_count > 0) && (
                    <div style={{ display:'flex', alignItems:'center', gap:5, flexWrap:'wrap' }}>
                      {tone && (
                        <span style={{ fontSize: 9, fontWeight: 800, color: tone.color, background: tone.bg, border: `1px solid ${tone.border}`, borderRadius: 4, padding: '1px 5px' }}>
                          {tone.label}
                        </span>
                      )}
                      {v.unpaid_bill_count > 0 && (
                        <span style={{ fontSize: 9, fontWeight: 700, color: '#64748B', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 4, padding: '1px 5px' }}>
                          {v.unpaid_bill_count} unpaid
                        </span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── RIGHT: Statement panel ── */}
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          overflow: 'hidden', minWidth: 0, minHeight: 0,
          background: C.card, borderRadius: 14,
          border: `1px solid ${C.line}`,
          boxShadow: '0 1px 3px rgba(15,23,42,.05)',
        }}>
          {!selectedVendor ? (
            /* Empty state */
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: '#94A3B8' }}>
              <div style={{ width: 64, height: 64, borderRadius: 18, background: '#EFF6FF', border: '1px solid #BFDBFE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <BookOpen size={28} color="#93C5FD" />
              </div>
              <div style={{ textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#334155' }}>Select a vendor</p>
                <p style={{ margin: '4px 0 0', fontSize: 12 }}>Transaction history and running balance will appear here</p>
              </div>
            </div>

          ) : (
            <>
              {/* ── Account header ── */}
              <div style={{ borderBottom: '1px solid #F1F5F9', padding: '9px 14px 8px', flexShrink: 0 }}>
                {/* Row 1: vendor name + balance due */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                  <div>
                    <p style={{ margin: 0, fontSize: 8.5, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.7 }}>Statement of Account</p>
                    <h2 style={{ margin: '2px 0 0', fontSize: 15, fontWeight: 800, color: '#0F172A', lineHeight: 1.2 }}>{selectedVendor}</h2>
                    {(fromDate || toDate) && (
                      <p style={{ margin: '3px 0 0', fontSize: 11, color: '#94A3B8' }}>
                        {fromDate ? fmt(fromDate) : 'All time'} &rarr; {toDate ? fmt(toDate) : 'Today'}
                      </p>
                    )}
                  </div>

                  {/* Balance Due — main highlight */}
                  <div style={{
                    borderRadius: 9, padding: '6px 12px', textAlign: 'right', minWidth: 120, flexShrink: 0,
                    background: closingBal > 0 ? C.redBg : C.slateBg,
                    border: `1.5px solid ${closingBal > 0 ? C.redBorder : C.slateBorder}`,
                  }}>
                    <p style={{ margin: 0, fontSize: 8.5, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.5 }}>Balance Due</p>
                    <p style={{ margin: '2px 0 0', fontSize: 16, fontWeight: 900, color: closingBal > 0 ? C.red : C.slate, lineHeight: 1, letterSpacing: -0.4, fontVariantNumeric: 'tabular-nums' }}>
                      ₹{inr(Math.abs(closingBal), 2)}
                    </p>
                    <p style={{ margin: '2px 0 0', fontSize: 9, fontWeight: 600, color: closingBal > 0 ? C.red : '#94A3B8' }}>
                      {closingBal > 0 ? 'Payable to vendor' : closingBal < 0 ? 'Excess paid' : '✓ Settled'}
                    </p>
                  </div>
                </div>

                {/* Row 2: 4 summary stat pills */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {[
                    { label: 'Invoiced', val: selRow.total_invoiced,      color: C.blue, bg: C.blueBg, border: C.blueBorder },
                    { label: 'Paid',     val: selRow.total_paid,          color: C.blue, bg: C.blueBg, border: C.blueBorder },
                    { label: 'TDS',      val: selRow.total_tds,           color: C.slate, bg: C.slateBg, border: C.slateBorder },
                    { label: 'Advance Open', val: selRow.total_advance_open || selRow.total_advance_given, color: C.amber, bg: C.amberBg, border: C.amberBorder },
                    { label: '90+ Due',  val: selRow.payable_90_plus,     color: C.red, bg: C.redBg, border: C.redBorder },
                  ].map(s => (
                    <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 5, background: s.bg, border: `1px solid ${s.border}`, borderRadius: 7, padding: '3px 9px' }}>
                      <span style={{ fontSize: 9, fontWeight: 700, color: C.sub, textTransform: 'uppercase', letterSpacing: 0.3 }}>{s.label}</span>
                      <span style={{ fontSize: 11.5, fontWeight: 800, color: s.color, letterSpacing: -0.2, fontVariantNumeric: 'tabular-nums' }}>₹{inr(s.val)}</span>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(80px, 1fr))', gap: 6, marginTop: 7 }}>
                  {[
                    { label: '0-30 Days', val: selRow.payable_0_30, color: C.blue },
                    { label: '31-60 Days', val: selRow.payable_31_60, color: C.amber },
                    { label: '61-90 Days', val: selRow.payable_61_90, color: C.red },
                    { label: '90+ Days', val: selRow.payable_90_plus, color: C.red },
                  ].map(s => (
                    <div key={s.label} style={{ background: C.slateBg, border: `1px solid ${C.line}`, borderRadius: 7, padding: '4px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                      <div style={{ fontSize: 8.5, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.3, whiteSpace: 'nowrap' }}>{s.label}</div>
                      <div style={{ fontSize: 11.5, fontWeight: 900, color: s.color, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>₹{inr(s.val)}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Transaction table ── */}
              {loadingLedger ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: '#94A3B8' }}>
                  <div style={{ width: 18, height: 18, border: '2px solid #93C5FD', borderTopColor: '#2563EB', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
                  <span style={{ fontSize: 13 }}>Loading transactions…</span>
                </div>
              ) : ledger.length === 0 ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: '#94A3B8' }}>
                  <AlertTriangle size={30} style={{ opacity: .25 }} />
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#475569' }}>No transactions found</p>
                  <p style={{ margin: 0, fontSize: 11 }}>Try changing the date range or filters</p>
                </div>
              ) : (
                <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
                  <table style={{ width: '100%', minWidth: 920, borderCollapse: 'collapse', fontSize: 12, tableLayout: 'fixed' }}>
                    <colgroup>
                      <col style={{ width: COL.date }} />
                      <col /> {/* fluid */}
                      <col style={{ width: COL.type }} />
                      <col style={{ width: COL.vch }} />
                      <col style={{ width: COL.project }} />
                      <col style={{ width: COL.dr }} />
                      <col style={{ width: COL.cr }} />
                      <col style={{ width: COL.bal }} />
                    </colgroup>

                    {/* Sticky thead */}
                    <thead style={{ position: 'sticky', top: 0, zIndex: 5 }}>
                      <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #E2E8F0' }}>
                        {[
                          { h: 'Date',        align: 'left'  },
                          { h: 'Particulars', align: 'left'  },
                          { h: 'Type',        align: 'left'  },
                          { h: 'Voucher No.', align: 'left'  },
                          { h: 'Project',     align: 'left'  },
                          { h: 'Debit',  align: 'right' },
                          { h: 'Credit', align: 'right' },
                          { h: 'Balance',     align: 'right' },
                        ].map(col => (
                          <th key={col.h} style={{
                            padding: '9px 12px', textAlign: col.align,
                            fontSize: 10, fontWeight: 700, color: '#64748B',
                            textTransform: 'uppercase', letterSpacing: 0.45,
                            whiteSpace: 'nowrap', background: '#F8FAFC',
                          }}>
                            {col.h}
                          </th>
                        ))}
                      </tr>
                    </thead>

                    <tbody>
                      {/* Opening */}
                      <tr style={{ background: C.slateBg, borderBottom: `1px solid ${C.slateBorder}` }}>
                        <td style={{ padding: '7px 12px', fontSize: 11, color: C.slate, whiteSpace: 'nowrap' }}>—</td>
                        <td style={{ padding: '7px 12px', fontSize: 11, fontWeight: 700, color: C.slate }}>Opening Balance</td>
                        <td colSpan={5} />
                        <td style={{ padding: '7px 12px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: C.slate, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>₹0.00</td>
                      </tr>

                      {ledger.map((row, idx) => {
                        const bal = parseFloat(row.running_balance || 0);
                        const nil = Math.abs(bal) < 0.01;
                        const even = idx % 2 === 0;
                        return (
                          <tr key={idx}
                            style={{ background: even ? '#fff' : '#FAFBFD', borderBottom: '1px solid #F1F4F9', transition: 'background .1s' }}
                            onMouseEnter={e => { e.currentTarget.style.background = C.blueBg; }}
                            onMouseLeave={e => { e.currentTarget.style.background = even ? '#fff' : '#FAFBFD'; }}>

                            <td style={{ padding: '9px 12px', fontSize: 11, color: '#64748B', whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                              {fmt(row.txn_date)}
                            </td>
                            <td style={{ padding: '9px 12px', verticalAlign: 'top', overflow: 'hidden' }}>
                              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: '#1E293B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex:1 }}>{row.narration}</div>
                                {row.entry_type === 'Advance Given' && (
                                  <button
                                    onClick={() => setEditRow(row)}
                                    title="Edit advance amount / add TDS"
                                    style={{ flexShrink:0, background:C.slateBg, border:`1px solid ${C.slateBorder}`, borderRadius:5, padding:'2px 6px', cursor:'pointer', display:'flex', alignItems:'center', gap:3, color:C.slate }}
                                  >
                                    <Pencil size={10}/><span style={{fontSize:10,fontWeight:700}}>Edit</span>
                                  </button>
                                )}
                              </div>
                              {row.invoice_date && (
                                <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 1 }}>
                                  Inv Date: {fmt(row.invoice_date)}
                                </div>
                              )}
                              {row.po_ref && (
                                <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 1 }}>
                                  PO: {row.po_ref}
                                </div>
                              )}
                            </td>
                            <td style={{ padding: '9px 12px', verticalAlign: 'top' }}>
                              <TxnBadge type={row.entry_type} />
                            </td>
                            <td style={{ padding: '9px 12px', fontSize: 11, color: '#475569', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                              {row.vch_number || '—'}
                            </td>
                            <td style={{ padding: '9px 12px', fontSize: 11, color: '#94A3B8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                              {row.project_name || '—'}
                            </td>
                            <td style={{ padding: '9px 12px', textAlign: 'right', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                              {parseFloat(row.debit_amount || 0) > 0
                                ? <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: C.emerald, fontSize: 12 }}>₹{inr(row.debit_amount, 2)}</span>
                                : <span style={{ color: '#CBD5E1' }}>—</span>}
                            </td>
                            <td style={{ padding: '9px 12px', textAlign: 'right', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                              {parseFloat(row.credit_amount || 0) > 0
                                ? <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: C.blue, fontSize: 12 }}>₹{inr(row.credit_amount, 2)}</span>
                                : <span style={{ color: '#CBD5E1' }}>—</span>}
                            </td>
                            <td style={{ padding: '9px 12px', textAlign: 'right', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                              {nil ? (
                                <span style={{ color: '#CBD5E1' }}>—</span>
                              ) : (
                                <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 800, fontSize: 12, color: bal > 0 ? C.red : C.slate }}>
                                  ₹{inr(Math.abs(bal), 2)}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}

                      {/* Closing footer */}
                      <tr style={{ background: 'linear-gradient(90deg,#111C34 0%,#1B2A4A 100%)' }}>
                        <td colSpan={5} style={{ padding: '11px 14px', background: '#141F38' }}>
                          <span style={{ fontSize: 11, fontWeight: 800, color: '#F8FAFC', textTransform: 'uppercase', letterSpacing: 0.6 }}>Closing Balance</span>
                        </td>
                        <td style={{ padding: '11px 12px', textAlign: 'right', background: '#141F38' }}>
                          <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 800, fontSize: 12, color: '#6EE7B7' }}>₹{inr(totals.total_debit, 2)}</div>
                          <div style={{ fontSize: 9, color: 'rgba(255,255,255,.4)', marginTop: 1, textTransform: 'uppercase', letterSpacing: 0.4 }}>Total Debit</div>
                        </td>
                        <td style={{ padding: '11px 12px', textAlign: 'right', background: '#141F38' }}>
                          <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 800, fontSize: 12, color: '#A5B4FC' }}>₹{inr(totals.total_credit, 2)}</div>
                          <div style={{ fontSize: 9, color: 'rgba(255,255,255,.4)', marginTop: 1, textTransform: 'uppercase', letterSpacing: 0.4 }}>Total Credit</div>
                        </td>
                        <td style={{ padding: '11px 12px', textAlign: 'right', background: '#141F38' }}>
                          <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 900, fontSize: 15, color: closingBal > 0 ? '#FDA4AF' : '#6EE7B7', lineHeight: 1.1 }}>
                            ₹{inr(Math.abs(closingBal), 2)}
                          </div>
                          <div style={{ fontSize: 9, color: 'rgba(255,255,255,.4)', marginTop: 1, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                            {closingBal > 0 ? 'Payable' : closingBal < 0 ? 'Excess' : 'Settled'}
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              {/* ── Legend ── */}
              <div style={{ flexShrink: 0, borderTop: '1px solid #F1F5F9', padding: '6px 16px', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', background: '#FAFAFA' }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.4 }}>Legend</span>
                {Object.entries(ENTRY).map(([type, cfg]) => (
                  <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <TxnBadge type={type} />
                    <span style={{ fontSize: 9, color: '#94A3B8' }}>{cfg.side === 'credit' ? 'Credit' : 'Debit'}</span>
                  </div>
                ))}
                <span style={{ fontSize: 9, color: '#CBD5E1', marginLeft: 4 }}>Credit = payable to vendor · Debit = paid / deducted</span>
              </div>
            </>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 10px; }
        ::-webkit-scrollbar-thumb:hover { background: #94A3B8; }
      `}</style>

      {editRow && (
        <EditAdvanceModal
          row={editRow}
          onClose={() => setEditRow(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['liability-ledger', selectedVendor] });
            qc.invalidateQueries({ queryKey: ['liability-summary'] });
          }}
        />
      )}
    </div>
  );
}

