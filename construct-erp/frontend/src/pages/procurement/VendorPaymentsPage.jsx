import React, { useMemo, useState, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import {
  Search, RefreshCw, Download, Upload, Plus, ChevronDown, X,
  SlidersHorizontal, MoreVertical, CheckCircle2, Clock, AlertCircle,
  CreditCard, ChevronLeft, ChevronRight, ExternalLink, FileText,
  Calendar, TrendingUp, TrendingDown, Building2, Paperclip, History,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import { invoiceAPI, paymentAPI, vendorAPI, tqsBillsAPI } from '../../api/client';

dayjs.extend(relativeTime);

/* ── helpers ─────────────────────────────────────────────────────────── */
const asArray = p => Array.isArray(p) ? p : p?.data || p?.rows || p?.items || [];
const money   = v => `₹ ${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const moneyK  = v => { const n = Number(v || 0); if (n >= 1e7) return `₹ ${(n/1e7).toFixed(2)} Cr`; if (n >= 1e5) return `₹ ${(n/1e5).toFixed(2)} L`; return money(n); };
const fmt     = v => v && dayjs(v).isValid() ? dayjs(v).format('DD MMM YYYY') : '—';
const clean   = v => String(v || '').trim().toLowerCase();

const PAYMENT_MODES = ['RTGS', 'NEFT', 'IMPS', 'UPI', 'Cheque', 'Cash', 'DD', 'Bank Transfer'];
const STATUS_LIST   = ['Paid', 'Partial', 'Pending', 'Overdue'];
const PAGE_SIZES    = [10, 25, 50, 100];

const AVATAR_COLORS = [
  '#4f46e5','#0891b2','#059669','#d97706','#dc2626',
  '#7c3aed','#db2777','#ea580c','#65a30d','#0284c7',
];
const avatarColor = name => AVATAR_COLORS[(name || '').charCodeAt(0) % AVATAR_COLORS.length];
const initials    = name => (name || '??').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

const STATUS_CFG = {
  Paid:                { bg: '#f0fdf4', text: '#16a34a', border: '#bbf7d0', icon: CheckCircle2 },
  Partial:             { bg: '#eff6ff', text: '#2563eb', border: '#bfdbfe', icon: Clock },
  Pending:             { bg: '#fffbeb', text: '#d97706', border: '#fde68a', icon: Clock },
  Overdue:             { bg: '#fff1f2', text: '#e11d48', border: '#fecdd3', icon: AlertCircle },
  // TQS workflow stages
  pending:             { bg: '#fffbeb', text: '#d97706', border: '#fde68a', icon: Clock,         label: 'Pending' },
  stores:              { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe', icon: Clock,         label: 'Stores' },
  document_controller: { bg: '#ecfeff', text: '#0e7490', border: '#a5f3fc', icon: Clock,         label: 'Doc Control' },
  qs:                  { bg: '#eef2ff', text: '#4338ca', border: '#c7d2fe', icon: Clock,         label: 'QS' },
  accounts:            { bg: '#f5f3ff', text: '#6d28d9', border: '#ddd6fe', icon: Clock,         label: 'Accounts' },
  procurement:         { bg: '#fff7ed', text: '#c2410c', border: '#fed7aa', icon: Clock,         label: 'Procurement' },
  paid:                { bg: '#f0fdf4', text: '#16a34a', border: '#bbf7d0', icon: CheckCircle2,  label: 'Paid' },
};

/* ── Tiny SVG Sparkline ──────────────────────────────────────────────── */
function Sparkline({ color = '#6366f1', up = true }) {
  const pts = up
    ? [0,28, 10,24, 20,26, 30,20, 40,18, 50,14, 60,16, 70,10, 80,8, 90,4]
    : [0,4,  10,8,  20,6,  30,12, 40,14, 50,18, 60,16, 70,22, 80,20, 90,26];
  const d = pts.reduce((s, v, i) => i % 2 === 0 ? `${s} ${i === 0 ? 'M' : 'L'}${v}` : `${s},${v}`, '');
  return (
    <svg viewBox="0 0 90 32" width="90" height="32" fill="none">
      <path d={d} stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ── KPI Card ────────────────────────────────────────────────────────── */
function KPICard({ label, value, pct, up, color, sparkColor }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '20px 20px 16px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <CreditCard size={18} color={color} />
        </div>
        <Sparkline color={sparkColor || color} up={up} />
      </div>
      <div style={{ marginTop: 12, fontSize: 24, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ marginTop: 2, fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
      {pct != null && (
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: up ? '#16a34a' : '#e11d48' }}>
          {up ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
          {pct}% vs last month
        </div>
      )}
    </div>
  );
}

/* ── Vendor Avatar ───────────────────────────────────────────────────── */
function VendorAvatar({ name, size = 36 }) {
  const bg = avatarColor(name);
  return (
    <div style={{ width: size, height: size, borderRadius: size / 2, background: bg, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: size * 0.35, flexShrink: 0, letterSpacing: '0.02em' }}>
      {initials(name)}
    </div>
  );
}

/* ── Status Badge ────────────────────────────────────────────────────── */
function StatusBadge({ status, workflowStatus }) {
  // For TQS bills, show the workflow stage badge using the raw workflow_status key
  const key = workflowStatus || status;
  const cfg = STATUS_CFG[key] || STATUS_CFG[status] || STATUS_CFG.Pending;
  const Icon = cfg.icon;
  const displayLabel = cfg.label || status;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600, background: cfg.bg, color: cfg.text, border: `1px solid ${cfg.border}` }}>
      <Icon size={12} strokeWidth={2.5} /> {displayLabel}
    </span>
  );
}

/* ── Due Date Cell ───────────────────────────────────────────────────── */
function DueDateCell({ dateStr }) {
  if (!dateStr || !dayjs(dateStr).isValid()) return <span style={{ color: '#94a3b8', fontSize: 13 }}>—</span>;
  const d    = dayjs(dateStr);
  const diff = d.diff(dayjs().startOf('day'), 'day');
  const label = diff < 0
    ? `Overdue by ${Math.abs(diff)} day${Math.abs(diff) !== 1 ? 's' : ''}`
    : diff === 0 ? 'Due today'
    : `${diff} day${diff !== 1 ? 's' : ''} left`;
  const color = diff < 0 ? '#e11d48' : diff <= 3 ? '#d97706' : diff <= 7 ? '#ea580c' : '#16a34a';
  return (
    <div>
      <div style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>{d.format('DD MMM YYYY')}</div>
      <div style={{ fontSize: 11, color, fontWeight: 600, marginTop: 2 }}>{label}</div>
    </div>
  );
}

/* ── CSV Export ──────────────────────────────────────────────────────── */
function downloadCSV(rows) {
  const h = ['Invoice Ref','Vendor','VND Code','Project','Invoice Amt','Paid','Balance','Due Date','Status','Payment Mode'];
  const lines = [h.join(','), ...rows.map(r => [
    `"${r.invoice_number||''}"`, `"${r.vendor_name||''}"`, `"${r.vendor_code||''}"`,
    `"${r.project_name||''}"`,
    Number(r.invoice_total||0).toFixed(2), Number(r.paid_amount||0).toFixed(2), Number(r.balance||0).toFixed(2),
    fmt(r.due_date||r.dueDate), `"${r.status_view||''}"`, `"${r.latest_payment?.payment_mode||''}"`
  ].join(','))];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `vendor-payments-${dayjs().format('YYYY-MM-DD')}.csv` });
  a.click(); URL.revokeObjectURL(a.href);
}

/* ── Print style (injected once) ────────────────────────────────────── */
if (!document.getElementById('vp2-print')) {
  const s = document.createElement('style');
  s.id = 'vp2-print';
  s.textContent = `@media print{body *{visibility:hidden!important}#vp2-root,#vp2-root *{visibility:visible!important}#vp2-root{position:absolute;inset:0;padding:16px}.no-print{display:none!important}table{border-collapse:collapse;width:100%;font-size:10px}th,td{border:1px solid #cbd5e1;padding:4px 6px}th{background:#f1f5f9}@page{margin:1cm;size:landscape}}`;
  document.head.appendChild(s);
}

/* ════════════════════════════════════════════════════════════════════════
   MAIN PAGE
   ════════════════════════════════════════════════════════════════════════ */
export default function VendorPaymentsPage() {
  const qc = useQueryClient();

  /* ── filter state ── */
  const [search,        setSearch]        = useState('');
  const [filterStatus,  setFilterStatus]  = useState('');
  const [filterVendor,  setFilterVendor]  = useState('');
  const [filterMode,    setFilterMode]    = useState('');
  const [dateFrom,      setDateFrom]      = useState('');
  const [dateTo,        setDateTo]        = useState('');
  const [showFilters,   setShowFilters]   = useState(false);
  const [pageSize,      setPageSize]      = useState(10);
  const [page,          setPage]          = useState(1);
  const [selected,      setSelected]      = useState(new Set());
  const [detailRow,     setDetailRow]     = useState(null);
  const [actionMenu,    setActionMenu]    = useState(null); // row id with open menu
  const [payModal,      setPayModal]      = useState(null);
  const [payForm,       setPayForm]       = useState({ amount:'', mode:'NEFT', ref:'', date:'', bank_name:'', remarks:'' });

  /* ── queries ── */
  const vendorQ  = useQuery({ queryKey:['vp2-vendors'],  queryFn:() => vendorAPI.list().then(r=>asArray(r.data)).catch(()=>[]) });
  const invoiceQ = useQuery({ queryKey:['vp2-invoices'], queryFn:() => invoiceAPI.list().then(r=>asArray(r.data)).catch(()=>[]) });
  const paymentQ = useQuery({ queryKey:['vp2-payments'], queryFn:() => paymentAPI.list().then(r=>asArray(r.data)).catch(()=>[]) });
  const tqsQ     = useQuery({ queryKey:['vp2-tqs'],      queryFn:() => tqsBillsAPI.list().then(r=>asArray(r.data)).catch(()=>[]) });
  const ledgerQ  = useQuery({ queryKey:['vp2-ledger'],   queryFn:() => tqsBillsAPI.getVendorLedger({bill_type:'po'}).then(r=>asArray(r.data)).catch(()=>[]) });

  const payMut = useMutation({
    mutationFn: p => paymentAPI.create(p),
    onSuccess: () => {
      toast.success('Payment recorded');
      setPayModal(null);
      setPayForm({ amount:'', mode:'NEFT', ref:'', date:'', bank_name:'', remarks:'' });
      qc.invalidateQueries({ queryKey:['vp2-payments'] });
      qc.invalidateQueries({ queryKey:['vp2-invoices'] });
    },
    onError: e => toast.error(e?.response?.data?.error || 'Unable to record payment'),
  });

  const vendors  = vendorQ.data  || [];
  const invoices = invoiceQ.data || [];
  const payments = paymentQ.data || [];
  const tqsBills = tqsQ.data    || [];
  const ledger   = ledgerQ.data  || [];

  const vendorMap = useMemo(() => { const m=new Map(); vendors.forEach(v=>m.set(v.id,v)); return m; }, [vendors]);

  /* ── enrich rows ── */
  const allRows = useMemo(() => {
    const fin = invoices.map(inv => {
      const total = Number(inv.net_amount ?? inv.total_amount ?? inv.amount ?? 0);
      const invPs = payments.filter(p => String(p.invoice_id||'') === String(inv.id));
      const paid  = invPs.reduce((s,p)=>s+Number(p.amount||p.net_amount||0),0);
      const bal   = Math.max(total-paid,0);
      const vend  = vendorMap.get(inv.vendor_id)||{};
      const due   = inv.due_date||inv.dueDate||null;
      const diff  = due && dayjs(due).isValid() ? dayjs(due).diff(dayjs().startOf('day'),'day') : null;
      const status = bal<=0?'Paid': paid>0?'Partial': (diff!==null&&diff<0)?'Overdue':'Pending';
      return {
        ...inv, vendor_name:inv.vendor_name||vend.name||'—',
        vendor_code: vend.code||vend.vendor_code||`VND-${String(inv.vendor_id||'').padStart(5,'0')}`,
        project_name:inv.project_name||'—', invoice_total:total, paid_amount:paid, balance:bal,
        status_view:status, source_type:'finance', source_label:'Finance',
        latest_payment:invPs[0]||null, all_payments:invPs,
      };
    });
    const tqs = tqsBills.map(bill => {
      const vend  = vendorMap.get(bill.vendor_id)||{};
      const total = Number(bill.certified_net??bill.total_amount??0);
      const paid  = Number(bill.paid_amount??bill.total_paid??0);
      const bal   = Number(bill.liability_balance??bill.balance_to_pay??Math.max(total-paid,0));
      const status = bill.payment_status||bill.workflow_status||(bal<=0?'Paid':paid>0?'Partial':'Pending');
      return {
        id:`tqs-${bill.id}`, source_type:'tqs', source_label:'DQS',
        invoice_number:bill.inv_number||bill.sl_number||bill.bill_number||'DQS Bill',
        po_number:bill.po_number||bill.poRef||'', vendor_id:bill.vendor_id||null,
        vendor_name:bill.vendor_name||vend.name||'—',
        vendor_code:vend.code||vend.vendor_code||`VND-${String(bill.vendor_id||'').padStart(5,'0')}`,
        project_id:bill.project_id, project_name:bill.project_name||'—',
        invoice_total:total, paid_amount:paid, balance:bal,
        status_view:status, workflow_status:bill.workflow_status||null,
        due_date:bill.inv_date||bill.received_date||bill.created_at||null,
        latest_payment:null, all_payments:[],
      };
    });
    return [...fin, ...tqs];
  }, [invoices, payments, tqsBills, vendorMap]);

  /* ── filter ── */
  const filtered = useMemo(() => {
    const q = clean(search);
    return allRows.filter(r => {
      if (filterStatus && r.status_view !== filterStatus) return false;
      if (filterVendor && r.vendor_name !== filterVendor)  return false;
      if (filterMode && r.source_type==='finance' && clean(r.latest_payment?.payment_mode||'') !== clean(filterMode)) return false;
      if (dateFrom && r.due_date && dayjs(r.due_date).isBefore(dayjs(dateFrom))) return false;
      if (dateTo   && r.due_date && dayjs(r.due_date).isAfter(dayjs(dateTo)))    return false;
      if (!q) return true;
      return [r.invoice_number,r.invNo,r.vendor_name,r.project_name,r.po_number,r.reference_number,r.vendor_code]
        .some(v => clean(v).includes(q));
    });
  }, [allRows, filterStatus, filterVendor, filterMode, dateFrom, dateTo, search]);

  /* ── pagination ── */
  const totalPages  = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage    = Math.min(page, totalPages);
  const pageRows    = filtered.slice((safePage-1)*pageSize, safePage*pageSize);

  /* ── KPI totals ── */
  const kpi = useMemo(() => ({
    outstanding: allRows.reduce((s,r)=>s+Number(r.balance||0),0),
    paid:        allRows.reduce((s,r)=>s+Number(r.paid_amount||0),0),
    pending:     allRows.filter(r=>r.status_view==='Pending').reduce((s,r)=>s+Number(r.balance||0),0),
    overdue:     allRows.filter(r=>r.status_view==='Overdue').reduce((s,r)=>s+Number(r.balance||0),0),
  }), [allRows]);

  /* ── vendor options ── */
  const vendorOptions = useMemo(() => [...new Set(allRows.map(r=>r.vendor_name).filter(Boolean))].sort(), [allRows]);

  const activeFilters = [filterStatus,filterVendor,filterMode,dateFrom,dateTo].filter(Boolean).length;
  const resetFilters  = () => { setSearch(''); setFilterStatus(''); setFilterVendor(''); setFilterMode(''); setDateFrom(''); setDateTo(''); setPage(1); };
  const refresh       = async () => { await Promise.all([vendorQ,invoiceQ,paymentQ,tqsQ,ledgerQ].map(q=>q.refetch())); toast.success('Refreshed'); };

  const openPay = row => {
    setPayModal(row);
    setPayForm({ amount:Number(row.balance||0)||'', mode:'NEFT', ref:'', date:dayjs().format('YYYY-MM-DD'), bank_name:'', remarks:'' });
    setActionMenu(null);
  };
  const submitPayment = () => {
    if (!payModal) return;
    if (!payForm.amount||!payForm.ref||!payForm.date) { toast.error('Fill amount, date and reference'); return; }
    const vend = vendorMap.get(payModal.vendor_id)||{};
    payMut.mutate({ project_id:payModal.project_id, payment_type:'vendor_payment', entity_name:payModal.vendor_name,
      entity_pan:vend.pan||payModal.vendor_pan||'', invoice_id:payModal.id, amount:Number(payForm.amount),
      tds_deducted:0, payment_date:payForm.date, payment_mode:payForm.mode, reference_number:payForm.ref,
      bank_name:payForm.bank_name, remarks:payForm.remarks, cost_head:payModal.po_number||payModal.poRef||null });
  };

  const allChecked   = pageRows.length > 0 && pageRows.every(r => selected.has(r.id));
  const toggleAll    = () => { const s = new Set(selected); pageRows.forEach(r => allChecked ? s.delete(r.id) : s.add(r.id)); setSelected(s); };
  const toggleOne    = id => { const s = new Set(selected); s.has(id) ? s.delete(id) : s.add(id); setSelected(s); };

  const loading = invoiceQ.isLoading || paymentQ.isLoading || vendorQ.isLoading || tqsQ.isLoading;

  /* ── styles ── */
  const S = {
    page:    { background:'#f1f4f9', minHeight:'100vh', padding:'24px 28px', fontFamily:'Inter, system-ui, sans-serif' },
    card:    { background:'#fff', border:'1px solid #e2e8f0', borderRadius:16, boxShadow:'0 1px 4px rgba(0,0,0,0.06)' },
    th:      { padding:'10px 14px', fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.1em', color:'#94a3b8', textAlign:'left', whiteSpace:'nowrap', background:'#f8fafc', borderBottom:'1px solid #e2e8f0' },
    td:      { padding:'12px 14px', fontSize:13, color:'#374151', borderBottom:'1px solid #f1f5f9', verticalAlign:'middle' },
    btn:     { display:'inline-flex', alignItems:'center', gap:6, height:36, padding:'0 14px', borderRadius:10, fontSize:13, fontWeight:600, cursor:'pointer', transition:'all .15s', border:'1px solid #e2e8f0', background:'#fff', color:'#374151' },
    btnPrim: { display:'inline-flex', alignItems:'center', gap:6, height:36, padding:'0 16px', borderRadius:10, fontSize:13, fontWeight:700, cursor:'pointer', background:'#4f46e5', color:'#fff', border:'none' },
    input:   { height:36, borderRadius:10, border:'1px solid #e2e8f0', background:'#f8fafc', padding:'0 12px', fontSize:13, color:'#374151', outline:'none', width:'100%' },
    sel:     { height:36, borderRadius:10, border:'1px solid #e2e8f0', background:'#fff', padding:'0 32px 0 12px', fontSize:13, color:'#374151', outline:'none', appearance:'none', cursor:'pointer', minWidth:130 },
  };

  return (
    <div id="vp2-root" style={S.page} onClick={() => setActionMenu(null)}>

      {/* ── Header ── */}
      <div className="no-print" style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:16, marginBottom:24 }}>
        <div>
          <h1 style={{ fontSize:26, fontWeight:800, color:'#0f172a', margin:0, letterSpacing:'-0.02em' }}>Vendor Payments</h1>
          <p style={{ fontSize:13, color:'#64748b', margin:'4px 0 0', fontWeight:500 }}>Track and manage all vendor payments in one place.</p>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <button style={S.btn} onClick={refresh}><RefreshCw size={14} /> Refresh</button>
          <button style={S.btn} onClick={() => downloadCSV(filtered)}><Download size={14} /> Export</button>
          <button style={S.btn} onClick={() => window.print()}><FileText size={14} /> Print</button>
          <button style={{ ...S.btnPrim, borderRadius:'10px 0 0 10px', paddingRight:12 }}>
            <Plus size={14} /> New Payment
          </button>
          <button style={{ ...S.btnPrim, borderRadius:'0 10px 10px 0', padding:'0 10px', borderLeft:'1px solid rgba(255,255,255,0.25)' }}>
            <ChevronDown size={14} />
          </button>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="no-print" style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:20 }}>
        <KPICard label="Outstanding Amount" value={moneyK(kpi.outstanding)} pct={12.5} up={true}  color="#4f46e5" />
        <KPICard label="Paid Amount"         value={moneyK(kpi.paid)}        pct={8.7}  up={true}  color="#10b981" sparkColor="#10b981" />
        <KPICard label="Pending Payments"    value={moneyK(kpi.pending)}     pct={4.5}  up={true}  color="#f59e0b" sparkColor="#f59e0b" />
        <KPICard label="Overdue Amount"      value={moneyK(kpi.overdue)}     pct={2.1}  up={false} color="#e11d48" sparkColor="#e11d48" />
      </div>

      {/* ── Filter Bar ── */}
      <div className="no-print" style={{ ...S.card, padding:'14px 16px', marginBottom:16 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
          {/* search */}
          <div style={{ position:'relative', flex:'1 1 220px', minWidth:0 }}>
            <Search size={14} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'#94a3b8' }} />
            <input style={{ ...S.input, paddingLeft:32 }} placeholder="Search vendor, invoice, ref no…" value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} />
          </div>

          {/* vendor */}
          <div style={{ position:'relative' }}>
            <select style={S.sel} value={filterVendor} onChange={e=>{setFilterVendor(e.target.value);setPage(1);}}>
              <option value="">All Vendors</option>
              {vendorOptions.map(v=><option key={v} value={v}>{v.length>28?v.slice(0,26)+'…':v}</option>)}
            </select>
            <ChevronDown size={13} style={{ position:'absolute', right:8, top:'50%', transform:'translateY(-50%)', color:'#94a3b8', pointerEvents:'none' }} />
          </div>

          {/* status */}
          <div style={{ position:'relative' }}>
            <select style={S.sel} value={filterStatus} onChange={e=>{setFilterStatus(e.target.value);setPage(1);}}>
              <option value="">All Status</option>
              {STATUS_LIST.map(s=><option key={s} value={s}>{s}</option>)}
            </select>
            <ChevronDown size={13} style={{ position:'absolute', right:8, top:'50%', transform:'translateY(-50%)', color:'#94a3b8', pointerEvents:'none' }} />
          </div>

          {/* payment mode */}
          <div style={{ position:'relative' }}>
            <select style={S.sel} value={filterMode} onChange={e=>{setFilterMode(e.target.value);setPage(1);}}>
              <option value="">All Modes</option>
              {PAYMENT_MODES.map(m=><option key={m} value={m}>{m}</option>)}
            </select>
            <ChevronDown size={13} style={{ position:'absolute', right:8, top:'50%', transform:'translateY(-50%)', color:'#94a3b8', pointerEvents:'none' }} />
          </div>

          {/* date range */}
          <div style={{ display:'flex', alignItems:'center', gap:6, border:'1px solid #e2e8f0', borderRadius:10, background:'#fff', padding:'0 10px', height:36 }}>
            <Calendar size={13} style={{ color:'#94a3b8' }} />
            <input type="date" style={{ border:'none', outline:'none', fontSize:12, color:'#374151', background:'transparent', width:110 }} value={dateFrom} onChange={e=>{setDateFrom(e.target.value);setPage(1);}} />
            <span style={{ color:'#94a3b8', fontSize:12 }}>–</span>
            <input type="date" style={{ border:'none', outline:'none', fontSize:12, color:'#374151', background:'transparent', width:110 }} value={dateTo} onChange={e=>{setDateTo(e.target.value);setPage(1);}} />
          </div>

          {/* filters toggle */}
          <button
            onClick={e=>{e.stopPropagation();setShowFilters(v=>!v);}}
            style={{ ...S.btn, background: showFilters?'#4f46e5':'#fff', color: showFilters?'#fff':'#374151', borderColor: showFilters?'#4f46e5':'#e2e8f0' }}>
            <SlidersHorizontal size={14} /> Filters {activeFilters>0 && <span style={{ background:'#fff', color:'#4f46e5', borderRadius:999, padding:'0 6px', fontSize:10, fontWeight:800 }}>{activeFilters}</span>}
          </button>

          {activeFilters>0 && (
            <button onClick={resetFilters} style={{ ...S.btn, borderColor:'#fecdd3', color:'#e11d48' }}>
              <X size={13} /> Clear All
            </button>
          )}
        </div>
      </div>

      {/* ── Main area ── */}
      <div style={{ display:'flex', gap:16, alignItems:'flex-start' }}>

        {/* ── Table ── */}
        <div style={{ ...S.card, flex:1, overflow:'hidden', minWidth:0 }}>

          {/* table header row */}
          <div style={{ padding:'12px 16px', borderBottom:'1px solid #f1f5f9', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <span style={{ fontSize:13, color:'#64748b', fontWeight:600 }}>
              {filtered.length} payment{filtered.length !== 1 ? 's' : ''} found
            </span>
            <div className="no-print" style={{ display:'flex', gap:8 }}>
              {selected.size > 0 && (
                <button style={{ ...S.btn, borderColor:'#fecdd3', color:'#e11d48' }}>
                  {selected.size} selected — actions
                </button>
              )}
              <button style={S.btn} onClick={resetFilters}><X size={13} /> Clear All</button>
            </div>
          </div>

          {loading ? (
            <div style={{ padding:24 }}>
              {[...Array(6)].map((_,i) => (
                <div key={i} style={{ height:52, borderRadius:10, background:'#f1f5f9', marginBottom:8, animation:'pulse 1.5s ease-in-out infinite' }} />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding:64, textAlign:'center' }}>
              <FileText size={40} style={{ color:'#e2e8f0', marginBottom:12, display:'block', margin:'0 auto 12px' }} />
              <p style={{ fontSize:14, fontWeight:600, color:'#94a3b8' }}>No payments match your filters</p>
            </div>
          ) : (
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ ...S.th, width:40 }}>
                      <input type="checkbox" checked={allChecked} onChange={toggleAll} style={{ accentColor:'#4f46e5' }} />
                    </th>
                    <th style={S.th}>Vendor</th>
                    <th style={S.th}>Invoice Ref</th>
                    <th style={S.th}>Due Date</th>
                    <th style={{ ...S.th, textAlign:'right' }}>Amount</th>
                    <th style={{ ...S.th, textAlign:'right' }}>Paid Amount</th>
                    <th style={{ ...S.th, textAlign:'center' }}>Status</th>
                    <th style={S.th}>Payment Mode</th>
                    <th style={{ ...S.th, textAlign:'center', width:50 }} className="no-print">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map(row => {
                    const isActive = detailRow?.id === row.id;
                    return (
                      <tr key={row.id}
                        onClick={() => setDetailRow(isActive ? null : row)}
                        style={{ background: isActive ? '#eef2ff' : 'transparent', cursor:'pointer', transition:'background .12s' }}
                        onMouseEnter={e => { if (!isActive) e.currentTarget.style.background='#f8fafc'; }}
                        onMouseLeave={e => { if (!isActive) e.currentTarget.style.background='transparent'; }}>

                        <td style={S.td} onClick={e=>e.stopPropagation()}>
                          <input type="checkbox" checked={selected.has(row.id)} onChange={()=>toggleOne(row.id)} style={{ accentColor:'#4f46e5' }} />
                        </td>

                        <td style={S.td}>
                          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                            <VendorAvatar name={row.vendor_name} />
                            <div style={{ minWidth:0 }}>
                              <div style={{ fontSize:13, fontWeight:600, color:'#1e293b', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:160 }}>{row.vendor_name}</div>
                              <div style={{ fontSize:11, color:'#94a3b8', fontWeight:500, marginTop:1 }}>{row.vendor_code}</div>
                            </div>
                          </div>
                        </td>

                        <td style={S.td}>
                          <div style={{ fontSize:13, fontWeight:600, color:'#374151' }}>{row.invoice_number||row.invNo||'—'}</div>
                          {row.po_number && <div style={{ fontSize:11, color:'#94a3b8', marginTop:1 }}>{row.po_number}</div>}
                        </td>

                        <td style={S.td}><DueDateCell dateStr={row.due_date||row.dueDate} /></td>

                        <td style={{ ...S.td, textAlign:'right' }}>
                          <span style={{ fontSize:13, fontWeight:700, color:'#1e293b', fontVariantNumeric:'tabular-nums' }}>{money(row.invoice_total)}</span>
                        </td>

                        <td style={{ ...S.td, textAlign:'right' }}>
                          <span style={{ fontSize:13, fontWeight:600, color:'#16a34a', fontVariantNumeric:'tabular-nums' }}>{money(row.paid_amount)}</span>
                        </td>

                        <td style={{ ...S.td, textAlign:'center' }}>
                          <StatusBadge status={row.status_view} workflowStatus={row.source_type === 'tqs' ? row.workflow_status : null} />
                        </td>

                        <td style={S.td}>
                          {row.latest_payment ? (
                            <span style={{ fontSize:12, fontWeight:600, color:'#64748b', background:'#f1f5f9', borderRadius:6, padding:'3px 8px' }}>
                              {row.latest_payment.payment_mode||row.latest_payment.mode||'—'}
                            </span>
                          ) : <span style={{ color:'#cbd5e1' }}>—</span>}
                        </td>

                        <td style={{ ...S.td, textAlign:'center' }} className="no-print" onClick={e=>e.stopPropagation()}>
                          <div style={{ position:'relative', display:'inline-block' }}>
                            <button
                              onClick={e=>{e.stopPropagation();setActionMenu(actionMenu===row.id?null:row.id);}}
                              style={{ width:30, height:30, borderRadius:8, border:'1px solid #e2e8f0', background:'#fff', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#64748b' }}>
                              <MoreVertical size={15} />
                            </button>
                            {actionMenu===row.id && (
                              <div style={{ position:'absolute', right:0, top:34, background:'#fff', border:'1px solid #e2e8f0', borderRadius:12, boxShadow:'0 8px 24px rgba(0,0,0,0.12)', minWidth:160, zIndex:100, overflow:'hidden' }}
                                onClick={e=>e.stopPropagation()}>
                                <button onClick={()=>setDetailRow(row)} style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 14px', width:'100%', background:'none', border:'none', fontSize:13, color:'#374151', cursor:'pointer', fontWeight:500 }}>
                                  <FileText size={13} /> View Details
                                </button>
                                {row.source_type==='finance'&&row.balance>0&&(
                                  <button onClick={()=>openPay(row)} style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 14px', width:'100%', background:'none', border:'none', fontSize:13, color:'#4f46e5', cursor:'pointer', fontWeight:600 }}>
                                    <CreditCard size={13} /> Record Payment
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Pagination ── */}
          {filtered.length > 0 && (
            <div className="no-print" style={{ padding:'12px 16px', borderTop:'1px solid #f1f5f9', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ fontSize:13, color:'#64748b', fontWeight:500 }}>Rows per page</span>
                <div style={{ position:'relative' }}>
                  <select value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setPage(1);}}
                    style={{ ...S.sel, minWidth:60, height:32, fontSize:12, padding:'0 24px 0 8px' }}>
                    {PAGE_SIZES.map(s=><option key={s} value={s}>{s}</option>)}
                  </select>
                  <ChevronDown size={11} style={{ position:'absolute', right:6, top:'50%', transform:'translateY(-50%)', color:'#94a3b8', pointerEvents:'none' }} />
                </div>
              </div>

              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={safePage===1}
                  style={{ ...S.btn, width:32, height:32, padding:0, justifyContent:'center', opacity: safePage===1?.4:1 }}>
                  <ChevronLeft size={14} />
                </button>
                {[...Array(Math.min(totalPages,7))].map((_,i)=>{
                  const pg = totalPages<=7 ? i+1 : i===0?1:i===6?totalPages:safePage-2+i;
                  return (
                    <button key={pg} onClick={()=>setPage(pg)}
                      style={{ width:32, height:32, borderRadius:8, border:'1px solid', fontSize:13, fontWeight:600, cursor:'pointer',
                        background: pg===safePage?'#4f46e5':'#fff',
                        color: pg===safePage?'#fff':'#374151',
                        borderColor: pg===safePage?'#4f46e5':'#e2e8f0' }}>
                      {pg}
                    </button>
                  );
                })}
                <button onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={safePage===totalPages}
                  style={{ ...S.btn, width:32, height:32, padding:0, justifyContent:'center', opacity: safePage===totalPages?.4:1 }}>
                  <ChevronRight size={14} />
                </button>

                <div style={{ display:'flex', alignItems:'center', gap:6, marginLeft:8 }}>
                  <span style={{ fontSize:13, color:'#64748b' }}>Go to page</span>
                  <input type="number" min={1} max={totalPages} defaultValue={safePage}
                    onBlur={e=>{ const n=Number(e.target.value); if(n>=1&&n<=totalPages) setPage(n); }}
                    onKeyDown={e=>{ if(e.key==='Enter'){const n=Number(e.target.value);if(n>=1&&n<=totalPages)setPage(n);} }}
                    style={{ ...S.input, width:56, height:32, textAlign:'center' }} />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Right Detail Panel ── */}
        {detailRow && (
          <div style={{ width:300, flexShrink:0, ...S.card, overflow:'hidden' }}>
            {/* panel header */}
            <div style={{ padding:'14px 16px', borderBottom:'1px solid #f1f5f9', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <span style={{ fontSize:14, fontWeight:700, color:'#0f172a' }}>Payment Details</span>
              <button onClick={()=>setDetailRow(null)} style={{ width:28, height:28, borderRadius:8, border:'1px solid #e2e8f0', background:'#fff', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#64748b' }}>
                <X size={14} />
              </button>
            </div>

            <div style={{ padding:'14px 16px', overflowY:'auto', maxHeight:'calc(100vh - 260px)' }}>

              {/* vendor block */}
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
                <VendorAvatar name={detailRow.vendor_name} size={44} />
                <div>
                  <div style={{ fontSize:14, fontWeight:700, color:'#0f172a' }}>{detailRow.vendor_name}</div>
                  <div style={{ fontSize:11, color:'#94a3b8', fontWeight:500, marginTop:2 }}>{detailRow.vendor_code}</div>
                </div>
              </div>

              <button style={{ ...S.btn, width:'100%', justifyContent:'center', marginBottom:16, fontSize:12 }}>
                <ExternalLink size={12} /> View Vendor Profile
              </button>

              {/* payment summary */}
              <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.1em', color:'#94a3b8', marginBottom:8 }}>Payment Summary</div>
              {[
                ['Invoice Ref',     detailRow.invoice_number||detailRow.invNo||'—'],
                ['Due Date',        fmt(detailRow.due_date||detailRow.dueDate)],
                ['Invoice Amount',  money(detailRow.invoice_total)],
                ['Paid Amount',     money(detailRow.paid_amount)],
                ['Balance Amount',  money(detailRow.balance)],
                ['Payment Mode',    detailRow.latest_payment?.payment_mode||detailRow.latest_payment?.mode||'—'],
                ['Reference No.',   detailRow.latest_payment?.reference_number||'—'],
                ['Payment Date',    fmt(detailRow.latest_payment?.payment_date)],
                ['Project',         detailRow.project_name||'—'],
                ['PO Number',       detailRow.po_number||'—'],
                ['Source',          detailRow.source_label||'Finance'],
              ].map(([k,v]) => (
                <div key={k} style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8, padding:'6px 0', borderBottom:'1px solid #f8fafc' }}>
                  <span style={{ fontSize:12, color:'#64748b', fontWeight:500, flexShrink:0 }}>{k}</span>
                  <span style={{ fontSize:12, color:'#1e293b', fontWeight:600, textAlign:'right', wordBreak:'break-all' }}>{v}</span>
                </div>
              ))}

              <div style={{ marginTop:2 }}>
                <StatusBadge status={detailRow.status_view} workflowStatus={detailRow.source_type === 'tqs' ? detailRow.workflow_status : null} />
              </div>

              {/* record payment CTA */}
              {detailRow.source_type==='finance'&&detailRow.balance>0&&(
                <button onClick={()=>openPay(detailRow)}
                  style={{ ...S.btnPrim, width:'100%', justifyContent:'center', marginTop:14, borderRadius:10 }}>
                  <CreditCard size={14} /> Record Payment
                </button>
              )}

              {/* payment history */}
              {detailRow.all_payments?.length > 0 && (
                <>
                  <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.1em', color:'#94a3b8', margin:'16px 0 8px', display:'flex', alignItems:'center', gap:6 }}>
                    <History size={12} /> Payment History
                  </div>
                  {detailRow.all_payments.map((p,i)=>(
                    <div key={i} style={{ display:'flex', gap:10, marginBottom:10 }}>
                      <div style={{ width:8, height:8, borderRadius:4, background:'#10b981', marginTop:5, flexShrink:0 }} />
                      <div>
                        <div style={{ fontSize:12, fontWeight:700, color:'#10b981' }}>Payment {i===0?'Completed':'Recorded'} · {money(p.amount||p.net_amount)}</div>
                        <div style={{ fontSize:11, color:'#64748b', marginTop:1 }}>{fmt(p.payment_date||p.created_at)} · {p.payment_mode||'—'}</div>
                        {p.reference_number&&<div style={{ fontSize:11, color:'#94a3b8' }}>Ref: {p.reference_number}</div>}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Payment Modal ── */}
      {payModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.55)', backdropFilter:'blur(4px)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'#fff', borderRadius:20, boxShadow:'0 24px 64px rgba(0,0,0,0.18)', width:'100%', maxWidth:480 }}>
            <div style={{ padding:'20px 20px 14px', borderBottom:'1px solid #f1f5f9', display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
              <div>
                <div style={{ fontSize:16, fontWeight:800, color:'#0f172a' }}>Record Vendor Payment</div>
                <div style={{ fontSize:12, color:'#64748b', marginTop:3 }}>{payModal.invoice_number||payModal.invNo||'Invoice'} · {payModal.vendor_name}</div>
                <div style={{ display:'flex', gap:16, marginTop:6 }}>
                  <span style={{ fontSize:12, color:'#64748b' }}>Invoice: <b style={{ color:'#4f46e5' }}>{money(payModal.invoice_total)}</b></span>
                  <span style={{ fontSize:12, color:'#64748b' }}>Balance: <b style={{ color:'#e11d48' }}>{money(payModal.balance)}</b></span>
                </div>
              </div>
              <button onClick={()=>setPayModal(null)} style={{ width:30, height:30, borderRadius:8, border:'1px solid #e2e8f0', background:'#fff', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#64748b', fontSize:18 }}>×</button>
            </div>

            <div style={{ padding:'16px 20px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              {[
                { label:'Amount *',            key:'amount',    type:'number', ph:'' },
                { label:'Payment Date *',      key:'date',      type:'date',   ph:'' },
                { label:'Reference / UTR No *',key:'ref',       type:'text',   ph:'UTR / cheque no.' },
                { label:'Bank Name',           key:'bank_name', type:'text',   ph:'Bank name' },
              ].map(f=>(
                <div key={f.key}>
                  <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:5 }}>{f.label}</label>
                  <input type={f.type} value={payForm[f.key]} placeholder={f.ph}
                    onChange={e=>setPayForm(p=>({...p,[f.key]:e.target.value}))}
                    style={{ ...S.input, height:38, borderRadius:10 }} />
                </div>
              ))}
              <div>
                <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:5 }}>Payment Mode</label>
                <div style={{ position:'relative' }}>
                  <select value={payForm.mode} onChange={e=>setPayForm(p=>({...p,mode:e.target.value}))}
                    style={{ ...S.sel, width:'100%', height:38 }}>
                    {PAYMENT_MODES.map(m=><option key={m}>{m}</option>)}
                  </select>
                  <ChevronDown size={13} style={{ position:'absolute', right:8, top:'50%', transform:'translateY(-50%)', color:'#94a3b8', pointerEvents:'none' }} />
                </div>
              </div>
              <div style={{ gridColumn:'span 2' }}>
                <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:5 }}>Remarks</label>
                <textarea value={payForm.remarks} onChange={e=>setPayForm(p=>({...p,remarks:e.target.value}))}
                  rows={2} style={{ ...S.input, height:'auto', padding:'8px 12px', resize:'none', borderRadius:10, fontFamily:'inherit' }} />
              </div>
            </div>

            <div style={{ display:'flex', gap:10, padding:'0 20px 20px' }}>
              <button onClick={()=>setPayModal(null)} style={{ flex:1, height:40, borderRadius:10, border:'1px solid #e2e8f0', background:'#f8fafc', fontSize:13, fontWeight:600, cursor:'pointer', color:'#374151' }}>Cancel</button>
              <button onClick={submitPayment} disabled={payMut.isPending} style={{ ...S.btnPrim, flex:1, height:40, borderRadius:10, justifyContent:'center', opacity:payMut.isPending?.7:1 }}>
                {payMut.isPending?'Saving…':'Save Payment'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}`}</style>
    </div>
  );
}
