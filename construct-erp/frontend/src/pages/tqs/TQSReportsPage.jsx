import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { tqsBillsAPI, projectAPI } from '../../api/client';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  BarChart3, Printer, Download, Calendar, Users, FileText,
  CreditCard, IndianRupee, Clock, CheckCircle2, Receipt,
  X, FileBarChart, Activity, Filter, RefreshCw,
  ShoppingCart, TrendingUp, AlertTriangle, Layers,
  BookOpen, PieChart, Briefcase, Building2, ListChecks,
  ChevronRight, Menu, ChevronsLeft, FolderOpen,
} from 'lucide-react';
import { clsx } from 'clsx';
import dayjs from 'dayjs';

// ─── Formatters ────────────────────────────────────────────────────────────────
const inr   = v => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt   = d => d ? dayjs(d).format('DD MMM YYYY') : '—';
const fmts  = d => d ? dayjs(d).format('DD MMM YY')   : '—';

const inrFmt = v => {
  const n = Number(v || 0);
  if (n < 0) {
    const abs = Math.abs(n);
    return `-₹${abs.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// ─── Status config ─────────────────────────────────────────────────────────────
const STATUS_CFG = {
  pending:             { label: 'Pending',     cls: 'bg-amber-100 text-amber-700',     dot: '#f59e0b' },
  stores:              { label: 'Stores',      cls: 'bg-blue-100 text-blue-700',       dot: '#3b82f6' },
  document_controller: { label: 'Doc Ctrl',    cls: 'bg-cyan-100 text-cyan-700',       dot: '#06b6d4' },
  qs:                  { label: 'QS',          cls: 'bg-indigo-100 text-indigo-700',   dot: '#6366f1' },
  accounts:            { label: 'Accounts',    cls: 'bg-purple-100 text-purple-700',   dot: '#8b5cf6' },
  procurement:         { label: 'Procurement', cls: 'bg-orange-100 text-orange-700',   dot: '#f97316' },
  paid:                { label: 'Paid',        cls: 'bg-emerald-100 text-emerald-700', dot: '#22c55e' },
};
function StatusBadge({ status }) {
  const c = STATUS_CFG[status] || { label: status, cls: 'bg-slate-100 text-slate-600' };
  return <span className={clsx('text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap', c.cls)}>{c.label}</span>;
}

// ─── Sidebar nav structure ─────────────────────────────────────────────────────
const SIDEBAR = [
  {
    group: 'Overview',
    icon: PieChart,
    items: [
      { key: 'summary',  label: 'Dashboard Summary',   icon: BarChart3  },
    ],
  },
  {
    group: 'Payable Reports',
    icon: Briefcase,
    items: [
      { key: 'register', label: 'Bill Register',       icon: FileText   },
      { key: 'vendor',   label: 'Vendor-wise Payables',icon: Users      },
      { key: 'aging',    label: 'Outstanding / Aging', icon: Clock      },
      { key: 'payment',  label: 'Payment Register',    icon: CreditCard },
    ],
  },
  {
    group: 'Tax Reports',
    icon: Receipt,
    items: [
      { key: 'gst',      label: 'GST Summary',         icon: Receipt          },
      { key: 'tds',      label: 'TDS Deduction Report', icon: IndianRupee     },
    ],
  },
  {
    group: 'Procurement',
    icon: ShoppingCart,
    items: [
      { key: 'po',       label: 'PO-wise Summary',     icon: ShoppingCart },
      { key: 'wo',       label: 'WO-wise Summary',     icon: Layers       },
      { key: 'pc',       label: 'PC Register',         icon: ListChecks   },
    ],
  },
  {
    group: 'Activity',
    icon: Activity,
    items: [
      { key: 'status',   label: 'Status-wise Tracker', icon: Activity     },
      { key: 'monthly',  label: 'Month-wise Summary',  icon: Calendar     },
      { key: 'project',  label: 'Project-wise',        icon: Building2    },
    ],
  },
];

// ─── Date presets ──────────────────────────────────────────────────────────────
const PRESETS = [
  { key: 'all',    label: 'All Time'   },
  { key: '30d',    label: 'Last 30d',  from: () => dayjs().subtract(30,'day'), to: () => dayjs() },
  { key: '90d',    label: 'Last 90d',  from: () => dayjs().subtract(90,'day'), to: () => dayjs() },
  { key: '6m',     label: '6 Months',  from: () => dayjs().subtract(6,'month'), to: () => dayjs() },
  { key: '1y',     label: '1 Year',    from: () => dayjs().subtract(1,'year'), to: () => dayjs() },
  { key: 'custom', label: 'Custom'     },
];

// ─── Table primitives ──────────────────────────────────────────────────────────
function Th({ children, right, center }) {
  return (
    <th className={clsx(
      'px-3 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-slate-50 whitespace-nowrap sticky top-0 z-10 border-b-2 border-slate-200',
      right ? 'text-right' : center ? 'text-center' : 'text-left'
    )}>{children}</th>
  );
}
function Td({ children, right, center, bold, color, mono, small, nowrap = true }) {
  return (
    <td className={clsx(
      'px-3 py-2 border-b border-slate-50',
      nowrap && 'whitespace-nowrap',
      right ? 'text-right' : center ? 'text-center' : '',
      bold ? 'font-semibold' : '',
      mono ? 'font-mono text-xs' : small ? 'text-xs' : 'text-sm',
      color || 'text-slate-700'
    )} style={right ? { fontVariantNumeric: 'tabular-nums' } : undefined}>{children}</td>
  );
}
function TotRow({ cols }) {
  return (
    <tr style={{ background: '#141F38' }}>
      {cols.map((c, i) => (
        <td key={i} className={clsx(
          'px-3 py-2.5 text-xs font-bold whitespace-nowrap',
          c.right ? 'text-right' : '',
        )} style={{
          fontVariantNumeric: 'tabular-nums',
          color: c.color?.includes('red') ? '#FDA4AF' : c.right ? '#A5B4FC' : '#F1F5F9',
        }}>{c.v}</td>
      ))}
    </tr>
  );
}
function Empty({ msg = 'No data for selected filters' }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-slate-300 gap-2">
      <FileBarChart className="w-10 h-10" />
      <p className="text-sm font-medium text-slate-400">{msg}</p>
    </div>
  );
}

// ─── KPI Cards ─────────────────────────────────────────────────────────────────
function KpiGrid({ items }) {
  return (
    <div className={clsx('grid gap-3 mb-5', `grid-cols-2 md:grid-cols-${Math.min(items.length, 4)} lg:grid-cols-${items.length}`)}>
      {items.map((k, i) => (
        <div key={i} className="rounded-2xl border border-slate-200 p-3.5 bg-white shadow-sm transition-shadow hover:shadow-md">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">{k.label}</p>
          <p className={clsx('text-lg font-extrabold leading-tight', k.color || 'text-slate-800')}
            style={{ fontVariantNumeric: 'tabular-nums' }}>{k.value}</p>
          {k.sub && <p className="text-[10px] text-slate-400 font-medium mt-1">{k.sub}</p>}
        </div>
      ))}
    </div>
  );
}

// ─── Section header ────────────────────────────────────────────────────────────
function ReportHeader({ title, subtitle, icon: Icon, iconColor = 'text-indigo-600', actions }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-indigo-50 border border-indigo-100">
          <Icon className={clsx('w-4 h-4', iconColor)} />
        </div>
        <div>
          <h2 className="text-base font-bold text-slate-900 leading-tight">{title}</h2>
          {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

// ─── Export helpers ────────────────────────────────────────────────────────────
function downloadCSV(filename, headers, rows) {
  const escape = v => {
    const s = String(v ?? '').replace(/"/g, '""');
    return /[,"\n]/.test(s) ? `"${s}"` : s;
  };
  const csv = [headers, ...rows].map(r => r.map(escape).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
function pdfHeader(doc, title, sub) {
  doc.setFontSize(13); doc.setTextColor(30);
  doc.text('BCIM Engineering Pvt. Ltd.', 40, 30);
  doc.setFontSize(10); doc.setTextColor(37, 99, 235);
  doc.text(title, 40, 44);
  doc.setFontSize(7.5); doc.setTextColor(100);
  doc.text(sub, 40, 54);
  doc.setDrawColor(200); doc.line(40, 59, doc.internal.pageSize.width - 40, 59);
}
function BtnPDF({ onClick }) {
  return <button onClick={onClick} className="flex items-center gap-1.5 h-7 px-3 text-xs font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50"><Download className="w-3 h-3" />PDF</button>;
}
function BtnCSV({ onClick }) {
  return <button onClick={onClick} className="flex items-center gap-1.5 h-7 px-3 text-xs font-medium text-emerald-600 border border-emerald-200 rounded-lg hover:bg-emerald-50"><Download className="w-3 h-3" />CSV</button>;
}
function BtnPrint({ sectionId }) {
  const handle = () => {
    const el = document.getElementById(sectionId);
    if (!el) { window.print(); return; }
    const s = document.createElement('style');
    s.textContent = `@media print {
      @page { size: A4 landscape; margin:10mm 12mm 14mm 12mm; }
      html,body,#root,body>div,body>div>div,body>div>div>div,main { height:auto!important;max-height:none!important;overflow:visible!important; }
      [data-rpt]:not(#${sectionId}) { display:none!important; }
      #${sectionId} { display:block!important;overflow:visible!important; }
      thead { display:table-header-group!important; }
      tbody tr { page-break-inside:avoid; }
      nav,aside,header,button,select,.no-print { display:none!important; }
    }`;
    document.head.appendChild(s);
    window.print();
    document.head.removeChild(s);
  };
  return <button onClick={handle} className="flex items-center gap-1.5 h-7 px-3 text-xs font-medium text-slate-900 border border-slate-200 rounded-lg hover:bg-slate-50"><Printer className="w-3 h-3" />Print</button>;
}

// ══════════════════════════════════════════════════════════════════════════════
export default function TQSReportsPage() {
  const [tab,         setTab]         = useState('summary');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [projectId,   setProjectId]   = useState('');
  const [statusFilter,setStatusFilter]= useState('');
  const [billType,    setBillType]    = useState('');
  const [vendorQ,     setVendorQ]     = useState('');
  const [preset,      setPreset]      = useState('all');
  const [customFrom,  setCustomFrom]  = useState('');
  const [customTo,    setCustomTo]    = useState('');

  // ── Data ──────────────────────────────────────────────────────────────────
  const { data: allBills = [], isLoading, refetch } = useQuery({
    queryKey: ['tqs-bills', 'reports'],
    queryFn: () => tqsBillsAPI.list({}).then(r => Array.isArray(r.data) ? r.data : (r.data?.data ?? [])),
  });
  const { data: projects = [] } = useQuery({
    queryKey: ['projects-list'],
    queryFn: () => projectAPI.list().then(r => { const d = r.data; return Array.isArray(d) ? d : (d?.projects ?? d?.data ?? []); }),
    staleTime: 300000,
  });

  const vendors = useMemo(() =>
    [...new Set(allBills.map(b => b.vendor_name).filter(Boolean))].sort(), [allBills]);

  // ── Date bounds ────────────────────────────────────────────────────────────
  const { fromDate, toDate } = useMemo(() => {
    if (preset === 'custom') {
      return {
        fromDate: customFrom ? dayjs(customFrom).toDate() : null,
        toDate:   customTo   ? dayjs(customTo).endOf('day').toDate() : null,
      };
    }
    const p = PRESETS.find(x => x.key === preset);
    return {
      fromDate: p?.from ? p.from().toDate() : null,
      toDate:   p?.to   ? p.to().endOf('day').toDate() : null,
    };
  }, [preset, customFrom, customTo]);

  const rangeLabel = useMemo(() => {
    if (preset === 'all') return 'All Time';
    if (preset === 'custom') {
      if (customFrom && customTo) return `${dayjs(customFrom).format('DD MMM YY')} – ${dayjs(customTo).format('DD MMM YY')}`;
      return 'Custom';
    }
    return PRESETS.find(p => p.key === preset)?.label || preset;
  }, [preset, customFrom, customTo]);

  // ── Filtered bills ─────────────────────────────────────────────────────────
  const bills = useMemo(() => allBills.filter(b => {
    if (projectId    && b.project_id !== projectId)         return false;
    if (billType     && b.bill_type  !== billType)          return false;
    if (vendorQ      && b.vendor_name !== vendorQ)          return false;
    if (statusFilter && b.workflow_status !== statusFilter) return false;
    if (fromDate || toDate) {
      const d = b.inv_date ? new Date(b.inv_date) : (b.created_at ? new Date(b.created_at) : null);
      if (!d) return false;
      if (fromDate && d < fromDate) return false;
      if (toDate   && d > toDate)   return false;
    }
    return true;
  }), [allBills, projectId, billType, vendorQ, statusFilter, fromDate, toDate]);

  // ── Totals ─────────────────────────────────────────────────────────────────
  const totBasic     = bills.reduce((s, b) => s + parseFloat(b.basic_amount  || 0), 0);
  const totGst       = bills.reduce((s, b) => s + parseFloat(b.gst_amount    || 0), 0);
  const totInvoice   = bills.reduce((s, b) => s + parseFloat(b.total_amount  || 0), 0);
  const totCertified = bills.reduce((s, b) => s + parseFloat(b.certified_net || 0), 0);
  const totPaid      = bills.reduce((s, b) => s + parseFloat(b.paid_amount   || 0), 0);
  const totTds       = bills.reduce((s, b) => s + parseFloat(b.tds_deduction || 0), 0);
  const totBalance   = totCertified - totPaid;
  const paidPct      = totInvoice > 0 ? ((totPaid / totInvoice) * 100).toFixed(1) : '0.0';
  const projectName  = projects.find(p => p.id === projectId)?.name || 'All Projects';
  const subLine      = `${rangeLabel}  |  ${projectName}  |  Generated: ${dayjs().format('DD MMM YYYY HH:mm')}`;

  // ── Status groups ──────────────────────────────────────────────────────────
  const statusGroups = useMemo(() => {
    const map = {};
    Object.keys(STATUS_CFG).forEach(k => { map[k] = { count: 0, basic: 0, total: 0, certified: 0, paid: 0 }; });
    bills.forEach(b => {
      const s = b.workflow_status;
      if (!map[s]) map[s] = { count: 0, basic: 0, total: 0, certified: 0, paid: 0 };
      map[s].count++;
      map[s].basic     += parseFloat(b.basic_amount  || 0);
      map[s].total     += parseFloat(b.total_amount  || 0);
      map[s].certified += parseFloat(b.certified_net || 0);
      map[s].paid      += parseFloat(b.paid_amount   || 0);
    });
    return map;
  }, [bills]);

  // ── Month-wise ─────────────────────────────────────────────────────────────
  const monthRows = useMemo(() => {
    const map = {};
    bills.forEach(b => {
      const dt  = dayjs(b.inv_date || b.created_at);
      const key = dt.format('YYYY-MM');
      if (!map[key]) map[key] = { key, label: dt.format('MMM YYYY'), bills: 0, basic: 0, gst: 0, total: 0, certified: 0, paid: 0 };
      map[key].bills++;
      map[key].basic     += parseFloat(b.basic_amount  || 0);
      map[key].gst       += parseFloat(b.gst_amount    || 0);
      map[key].total     += parseFloat(b.total_amount  || 0);
      map[key].certified += parseFloat(b.certified_net || 0);
      map[key].paid      += parseFloat(b.paid_amount   || 0);
    });
    return Object.values(map).sort((a, b) => a.key.localeCompare(b.key));
  }, [bills]);

  // ── Vendor-wise ────────────────────────────────────────────────────────────
  const vendorRows = useMemo(() => {
    const map = {};
    bills.forEach(b => {
      const v = b.vendor_name || 'Unknown';
      if (!map[v]) map[v] = { vendor: v, bills: 0, basic: 0, gst: 0, total: 0, certified: 0, paid: 0, tds: 0 };
      map[v].bills++;
      map[v].basic     += parseFloat(b.basic_amount   || 0);
      map[v].gst       += parseFloat(b.gst_amount     || 0);
      map[v].total     += parseFloat(b.total_amount   || 0);
      map[v].certified += parseFloat(b.certified_net  || 0);
      map[v].paid      += parseFloat(b.paid_amount    || 0);
      map[v].tds       += parseFloat(b.tds_deduction  || 0);
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [bills]);

  // ── PO-wise ────────────────────────────────────────────────────────────────
  const isWorkOrderBill = (b) =>
    b.bill_type === 'wo'
    || b.bill_type === 'work_order'
    || Boolean(b.wo_number)
    || /^WO/i.test(String(b.po_number || ''));

  const poRows = useMemo(() => {
    const map = {};
    bills.filter(b => !isWorkOrderBill(b)).forEach(b => {
      const k = b.po_number || '(No PO)';
      if (!map[k]) map[k] = { po_number: k, vendor: b.vendor_name || '—', bills: 0, total: 0, certified: 0, paid: 0 };
      map[k].bills++;
      map[k].total     += parseFloat(b.total_amount  || 0);
      map[k].certified += parseFloat(b.certified_net || 0);
      map[k].paid      += parseFloat(b.paid_amount   || 0);
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [bills]);

  // ── WO-wise ────────────────────────────────────────────────────────────────
  const woRows = useMemo(() => {
    const map = {};
    bills.filter(isWorkOrderBill).forEach(b => {
      const k = b.wo_number || b.po_number || '(No WO)';
      if (!map[k]) map[k] = { wo_number: k, vendor: b.vendor_name || '—', bills: 0, total: 0, certified: 0, paid: 0 };
      map[k].bills++;
      map[k].total     += parseFloat(b.total_amount  || 0);
      map[k].certified += parseFloat(b.certified_net || 0);
      map[k].paid      += parseFloat(b.paid_amount   || 0);
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [bills]);

  // ── PC Register ────────────────────────────────────────────────────────────
  const pcRows = useMemo(() => {
    const map = {};
    bills.filter(b => b.pc_number).forEach(b => {
      const k = b.pc_number;
      if (!map[k]) map[k] = { pc_number: k, vendor: b.vendor_name || '—', bills: 0, certified: 0, paid: 0, tds: 0, balance: 0, pc_date: b.pc_generated_at || b.qs_certified_date };
      map[k].bills++;
      map[k].certified += parseFloat(b.certified_net  || 0);
      map[k].paid      += parseFloat(b.paid_amount    || 0);
      map[k].tds       += parseFloat(b.tds_deduction  || 0);
    });
    return Object.values(map)
      .map(r => ({ ...r, balance: r.certified - r.paid - r.tds }))
      .sort((a, b) => a.pc_number.localeCompare(b.pc_number));
  }, [bills]);

  // ── Project-wise ───────────────────────────────────────────────────────────
  const projectRows = useMemo(() => {
    const map = {};
    bills.forEach(b => {
      const k = b.project_id || 'unknown';
      const lbl = b.project_name || projects.find(p => p.id === b.project_id)?.name || 'Unknown';
      if (!map[k]) map[k] = { project_id: k, label: lbl, bills: 0, basic: 0, gst: 0, total: 0, certified: 0, paid: 0 };
      map[k].bills++;
      map[k].basic     += parseFloat(b.basic_amount  || 0);
      map[k].gst       += parseFloat(b.gst_amount    || 0);
      map[k].total     += parseFloat(b.total_amount  || 0);
      map[k].certified += parseFloat(b.certified_net || 0);
      map[k].paid      += parseFloat(b.paid_amount   || 0);
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [bills, projects]);

  // ── Aging ──────────────────────────────────────────────────────────────────
  const today = new Date();
  const agingRows = useMemo(() =>
    bills
      .filter(b => b.workflow_status !== 'paid' && parseFloat(b.certified_net || 0) > 0)
      .map(b => {
        const certDate = new Date(b.updated_at || b.created_at);
        const days     = Math.floor((today - certDate) / 86400000);
        const balance  = parseFloat(b.certified_net || 0) - parseFloat(b.paid_amount || 0);
        return { ...b, days, balance };
      })
      .sort((a, b) => b.days - a.days),
  [bills]);

  const agingBuckets = useMemo(() => {
    const cnt = { '0–30': 0, '31–60': 0, '61–90': 0, '91–120': 0, '120+': 0 };
    const amt = { '0–30': 0, '31–60': 0, '61–90': 0, '91–120': 0, '120+': 0 };
    agingRows.forEach(r => {
      const k = r.days <= 30 ? '0–30' : r.days <= 60 ? '31–60' : r.days <= 90 ? '61–90' : r.days <= 120 ? '91–120' : '120+';
      cnt[k]++; amt[k] += r.balance;
    });
    return Object.entries(cnt).map(([range, count]) => ({ range, count, amount: amt[range] }));
  }, [agingRows]);

  // ── GST month rows ─────────────────────────────────────────────────────────
  const gstMonthRows = useMemo(() => {
    const map = {};
    bills.forEach(b => {
      const dt  = dayjs(b.inv_date || b.created_at);
      const key = dt.format('YYYY-MM');
      if (!map[key]) map[key] = { key, label: dt.format('MMM YYYY'), bills: 0, basic: 0, cgst: 0, sgst: 0, igst: 0, totalGst: 0, total: 0 };
      map[key].bills++;
      map[key].basic    += parseFloat(b.basic_amount || 0);
      map[key].cgst     += parseFloat(b.cgst_amt     || 0);
      map[key].sgst     += parseFloat(b.sgst_amt     || 0);
      map[key].igst     += parseFloat(b.igst_amt     || 0);
      map[key].totalGst += parseFloat(b.gst_amount   || 0);
      map[key].total    += parseFloat(b.total_amount || 0);
    });
    return Object.values(map).sort((a, b) => a.key.localeCompare(b.key));
  }, [bills]);

  // ── TDS rows ───────────────────────────────────────────────────────────────
  const tdsRows = useMemo(() => {
    const map = {};
    bills.filter(b => parseFloat(b.tds_deduction || 0) > 0).forEach(b => {
      const v = b.vendor_name || 'Unknown';
      if (!map[v]) map[v] = { vendor: v, bills: 0, gross: 0, tds: 0, net: 0 };
      map[v].bills++;
      map[v].gross += parseFloat(b.certified_net   || b.total_amount || 0);
      map[v].tds   += parseFloat(b.tds_deduction   || 0);
      map[v].net   += parseFloat(b.certified_net   || 0) - parseFloat(b.tds_deduction || 0);
    });
    return Object.values(map).sort((a, b) => b.tds - a.tds);
  }, [bills]);

  // ── Payment rows ───────────────────────────────────────────────────────────
  const paymentRows = useMemo(() =>
    bills.filter(b => parseFloat(b.paid_amount || 0) > 0)
      .sort((a, b) => new Date(b.inv_date || b.created_at) - new Date(a.inv_date || a.created_at)),
  [bills]);

  // ── Active filter count ────────────────────────────────────────────────────
  const activeFilters = [billType, vendorQ, statusFilter, preset !== 'all' ? preset : ''].filter(Boolean).length;
  const clearFilters = () => { setBillType(''); setVendorQ(''); setStatusFilter(''); setPreset('all'); setCustomFrom(''); setCustomTo(''); };

  // ── Find current tab label ─────────────────────────────────────────────────
  const activeItem = SIDEBAR.flatMap(g => g.items).find(i => i.key === tab);

  // ── PDF helpers ────────────────────────────────────────────────────────────
  function exportPDF(title, head, body, color = [37,99,235]) {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    pdfHeader(doc, title, subLine);
    autoTable(doc, { startY: 68, head: [head], body, styles: { fontSize: 7.5 }, headStyles: { fillColor: color } });
    doc.save(`DQS-${title.replace(/\s+/g, '-')}-${dayjs().format('YYYYMMDD')}.pdf`);
  }

  // ══ Render ══════════════════════════════════════════════════════════════════
  return (
    <>
    <style>{`
      @media print {
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        html,body,#root,body>div,body>div>div,body>div>div>div,main { height:auto!important;max-height:none!important;overflow:visible!important; }
        .no-print { display:none!important; }
        thead { display:table-header-group!important; }
        tfoot { display:table-footer-group!important; }
        tbody tr { page-break-inside:avoid; }
      }
    `}</style>

    <div className="flex h-screen bg-[#EEF1F6] overflow-hidden" style={{ fontFamily: "'Inter','Segoe UI',system-ui,sans-serif" }}>

      {/* ══ LEFT SIDEBAR ══════════════════════════════════════════════════════ */}
      <aside className={clsx(
        'no-print flex-shrink-0 bg-white border-r border-slate-200 flex flex-col transition-all duration-200',
        sidebarOpen ? 'w-52' : 'w-12'
      )}>
        {/* Sidebar header */}
        <div className={clsx('flex items-center border-b border-slate-100 h-12', sidebarOpen ? 'px-3 gap-2' : 'justify-center')}>
          {sidebarOpen && (
            <>
              <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: 'linear-gradient(135deg,#4F46E5,#4338CA)' }}>
                <BookOpen className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="text-sm font-bold text-slate-900 flex-1 truncate">Reports</span>
            </>
          )}
          <button onClick={() => setSidebarOpen(v => !v)}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all flex-shrink-0">
            {sidebarOpen ? <ChevronsLeft className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>

        {/* Nav groups */}
        <nav className="flex-1 overflow-y-auto py-2 px-1.5">
          {SIDEBAR.map(grp => (
            <div key={grp.group} className="mb-2">
              {sidebarOpen && (
                <p className="px-2 py-1 text-[9px] font-bold text-slate-400 uppercase tracking-widest">{grp.group}</p>
              )}
              {grp.items.map(item => {
                const Icon = item.icon;
                const active = tab === item.key;
                return (
                  <button key={item.key} onClick={() => setTab(item.key)} title={!sidebarOpen ? item.label : undefined}
                    className={clsx(
                      'w-full flex items-center gap-2.5 rounded-lg transition-all mb-0.5',
                      sidebarOpen ? 'px-2.5 py-2 text-xs' : 'px-0 py-2 justify-center',
                      active
                        ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                        : 'text-slate-500 font-medium hover:bg-slate-100 hover:text-slate-800'
                    )}>
                    <Icon className="flex-shrink-0 w-3.5 h-3.5" />
                    {sidebarOpen && <span className="truncate">{item.label}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Bottom: total counts */}
        {sidebarOpen && (
          <div className="border-t border-slate-100 px-3 py-2.5 space-y-0.5 bg-slate-50/60">
            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wide">Loaded</p>
            <p className="text-xs font-semibold text-slate-700">{bills.length} bills{projectId ? '' : ' (all projects)'}</p>
            {totBalance > 0 && <p className="text-[10px] text-rose-600 font-bold" style={{ fontVariantNumeric: 'tabular-nums' }}>{inrFmt(totBalance)} outstanding</p>}
          </div>
        )}
      </aside>

      {/* ══ MAIN CONTENT ═════════════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* ── Top filter bar ── */}
        <header className="no-print bg-white border-b border-slate-200 px-4 py-2.5 flex flex-wrap items-center gap-2 flex-shrink-0">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 text-xs mr-2">
            <span className="text-slate-400 font-semibold">Bill Tracker</span>
            <ChevronRight className="w-3 h-3 text-slate-300" />
            <span className="text-indigo-600 font-bold">{activeItem?.label || tab}</span>
          </div>

          <div className="flex-1" />

          {/* Project */}
          <select value={projectId} onChange={e => setProjectId(e.target.value)}
            className="h-8 text-xs border border-slate-200 rounded-lg px-2 bg-white text-slate-700 outline-none focus:border-indigo-400">
            <option value="">All Projects</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>

          {/* Vendor */}
          <select value={vendorQ} onChange={e => setVendorQ(e.target.value)}
            className="h-8 text-xs border border-slate-200 rounded-lg px-2 bg-white text-slate-700 outline-none focus:border-indigo-400 max-w-[150px]">
            <option value="">All Vendors</option>
            {vendors.map(v => <option key={v} value={v}>{v}</option>)}
          </select>

          {/* Status */}
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="h-8 text-xs border border-slate-200 rounded-lg px-2 bg-white text-slate-700 outline-none focus:border-indigo-400">
            <option value="">All Statuses</option>
            {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>

          {/* Date presets — segmented control */}
          <div className="flex items-center bg-slate-100 rounded-lg p-0.5 gap-0.5">
            {PRESETS.map(p => (
              <button key={p.key} onClick={() => setPreset(p.key)}
                className={clsx('h-7 px-2.5 rounded-md text-[11px] font-semibold transition-all',
                  preset === p.key ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                )}>{p.label}</button>
            ))}
          </div>

          {preset === 'custom' && (
            <>
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                className="h-8 text-xs border border-slate-200 rounded-lg px-2 bg-white outline-none focus:border-indigo-400 w-32" />
              <span className="text-xs text-slate-400">–</span>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                className="h-8 text-xs border border-slate-200 rounded-lg px-2 bg-white outline-none focus:border-indigo-400 w-32" />
            </>
          )}

          {activeFilters > 0 && (
            <button onClick={clearFilters}
              className="h-8 flex items-center gap-1 px-2.5 rounded-lg border border-rose-200 bg-rose-50 text-rose-600 text-xs font-bold hover:bg-rose-100">
              <X className="w-3 h-3" />{activeFilters}
            </button>
          )}
          <button onClick={() => refetch()} title="Refresh data"
            className="h-8 w-8 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:border-indigo-300 transition-all">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </header>

        {/* ── Report content ── */}
        <main className="flex-1 overflow-y-auto p-5">
          {isLoading ? (
            <div className="flex justify-center py-20">
              <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (

          <div className="space-y-4 max-w-full">

          {/* ── SUMMARY DASHBOARD ── */}
          {tab === 'summary' && (
            <div id="rpt-summary" data-rpt>
              <ReportHeader title="Dashboard Summary" subtitle={`${bills.length} bills · ${rangeLabel} · ${projectName}`}
                icon={BarChart3} actions={<><BtnPrint sectionId="rpt-summary" /><BtnPDF onClick={() => exportPDF('Summary Report',
                  ['Status','Bills','Invoice Total (₹)','Certified (₹)','Paid (₹)','Balance (₹)'],
                  Object.entries(STATUS_CFG).map(([k, cfg]) => {
                    const g = statusGroups[k] || {};
                    return [cfg.label, g.count||0, inr(g.total), inr(g.certified), inr(g.paid), inr((g.certified||0)-(g.paid||0))];
                  }))} /></>} />
              <KpiGrid items={[
                { label: 'Total Bills',     value: bills.length,       sub: `of ${allBills.length} all-time`,  color: 'text-blue-700',  border: 'border-blue-100'  },
                { label: 'Invoice Value',   value: inrFmt(totInvoice), sub: 'gross invoiced',                  color: 'text-violet-700',  border: 'border-violet-100'  },
                { label: 'GST Total',       value: inrFmt(totGst),     sub: 'CGST+SGST+IGST',                  color: 'text-amber-700',   border: 'border-amber-100'   },
                { label: 'QS Certified',    value: inrFmt(totCertified),sub: 'certified net',                  color: 'text-blue-700',    border: 'border-blue-100'    },
                { label: 'Amount Paid',     value: inrFmt(totPaid),    sub: `${paidPct}% of invoice`,          color: 'text-emerald-700', border: 'border-emerald-100' },
                { label: 'Balance Pending', value: inrFmt(totBalance), sub: `${agingRows.length} outstanding`, color: totBalance>0?'text-red-600':'text-slate-400', border: totBalance>0?'border-red-100':'border-slate-200' },
              ]} />
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead><tr>
                    {['Stage','Bills','Invoice Total','QS Certified','Paid','Balance','%'].map(h =>
                      <Th key={h} right={!['Stage','Bills'].includes(h)} center={h==='Bills'}>{h}</Th>)}
                  </tr></thead>
                  <tbody className="divide-y divide-slate-50">
                    {Object.entries(STATUS_CFG).map(([k, cfg]) => {
                      const g = statusGroups[k] || { count:0, basic:0, total:0, certified:0, paid:0 };
                      if (!g.count) return null;
                      const pct = g.certified > 0 ? ((g.paid/g.certified)*100).toFixed(1) : '0.0';
                      return (
                        <tr key={k} className="hover:bg-slate-50 transition-colors">
                          <Td><StatusBadge status={k} /></Td>
                          <Td center bold>{g.count}</Td>
                          <Td right bold color="text-blue-700">{inrFmt(g.total)}</Td>
                          <Td right color="text-violet-700">{inrFmt(g.certified)}</Td>
                          <Td right color="text-emerald-700">{inrFmt(g.paid)}</Td>
                          <Td right color={g.certified-g.paid>0?'text-red-600':'text-slate-400'}>{inrFmt(g.certified-g.paid)}</Td>
                          <Td right><span className={clsx('px-1.5 py-0.5 rounded text-[10px] font-bold',parseFloat(pct)>=80?'bg-emerald-50 text-emerald-700':parseFloat(pct)>=40?'bg-amber-50 text-amber-700':'bg-slate-100 text-slate-500')}>{pct}%</span></Td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <TotRow cols={[
                      {v:'TOTAL'},{v:bills.length,right:true},{v:inrFmt(totInvoice),right:true},
                      {v:inrFmt(totCertified),right:true},{v:inrFmt(totPaid),right:true},
                      {v:inrFmt(totBalance),right:true,color:totBalance>0?'text-red-700':'text-blue-700'},
                      {v:paidPct+'%',right:true},
                    ]} />
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* ── BILL REGISTER ── */}
          {tab === 'register' && (
            <div id="rpt-register" data-rpt>
              <ReportHeader title="Bill Register" subtitle={`${bills.length} bills · ${rangeLabel}`}
                icon={FileText} actions={<>
                  <BtnPrint sectionId="rpt-register" />
                  <BtnCSV onClick={() => downloadCSV(`DQS-BillRegister-${dayjs().format('YYYYMMDD')}.csv`,
                    ['SL#','Vendor','Invoice #','Inv Date','Month','PO/WO','Bill Type','Basic (₹)','GST (₹)','Total (₹)','Certified (₹)','TDS (₹)','Paid (₹)','Balance (₹)','Status'],
                    bills.map(b => [b.sl_number, b.vendor_name, b.inv_number, fmt(b.inv_date), b.inv_month||'—', b.po_number||'—', b.bill_type||'—',
                      inr(b.basic_amount), inr(b.gst_amount), inr(b.total_amount), inr(b.certified_net), inr(b.tds_deduction), inr(b.paid_amount),
                      inr(parseFloat(b.certified_net||0)-parseFloat(b.paid_amount||0)), STATUS_CFG[b.workflow_status]?.label||b.workflow_status]))} />
                  <BtnPDF onClick={() => exportPDF('Bill Register',
                    ['SL#','Vendor','Invoice #','Inv Date','PO/WO','Total (₹)','Certified (₹)','Paid (₹)','Status'],
                    bills.map(b => [b.sl_number, b.vendor_name, b.inv_number, fmt(b.inv_date), b.po_number||'—',
                      inr(b.total_amount), inr(b.certified_net), inr(b.paid_amount), STATUS_CFG[b.workflow_status]?.label||b.workflow_status]))} />
                </>} />
              {bills.length === 0 ? <Empty /> : (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="overflow-auto max-h-[calc(100vh-240px)]">
                    <table className="w-full text-xs">
                      <thead><tr>
                        {['SL#','Vendor','Invoice #','Inv Date','Month','PO / WO','Type','Basic','GST','Total','Certified','TDS','Paid','Balance','Stage'].map(h =>
                          <Th key={h} right={['Basic','GST','Total','Certified','TDS','Paid','Balance'].includes(h)}>{h}</Th>)}
                      </tr></thead>
                      <tbody className="divide-y divide-slate-50">
                        {bills.map((b, i) => {
                          const balance = parseFloat(b.certified_net||0) - parseFloat(b.paid_amount||0);
                          return (
                            <tr key={b.id||i} className="hover:bg-slate-50 transition-colors">
                              <Td mono>{b.sl_number}</Td>
                              <Td bold nowrap={false}><span className="max-w-[140px] block truncate">{b.vendor_name}</span></Td>
                              <Td mono>{b.inv_number||'—'}</Td>
                              <Td small>{fmts(b.inv_date)}</Td>
                              <Td small color="text-slate-400">{b.inv_month||'—'}</Td>
                              <Td mono>{b.po_number||'—'}</Td>
                              <Td small color="text-slate-500">{b.bill_type||'po'}</Td>
                              <Td right>{inrFmt(b.basic_amount)}</Td>
                              <Td right color="text-amber-600">{inrFmt(b.gst_amount)}</Td>
                              <Td right bold color="text-blue-700">{inrFmt(b.total_amount)}</Td>
                              <Td right color="text-violet-700">{inrFmt(b.certified_net)}</Td>
                              <Td right color="text-orange-600">{inrFmt(b.tds_deduction)}</Td>
                              <Td right color="text-emerald-700">{inrFmt(b.paid_amount)}</Td>
                              <Td right color={balance>0?'text-red-600':'text-slate-400'}>{inrFmt(balance)}</Td>
                              <Td><StatusBadge status={b.workflow_status} /></Td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <TotRow cols={[
                          {v:'TOTAL'},{v:''},{v:''},{v:''},{v:''},{v:''},{v:''},
                          {v:inrFmt(totBasic),right:true},{v:inrFmt(totGst),right:true},
                          {v:inrFmt(totInvoice),right:true},{v:inrFmt(totCertified),right:true},
                          {v:inrFmt(totTds),right:true},{v:inrFmt(totPaid),right:true},
                          {v:inrFmt(totBalance),right:true,color:totBalance>0?'text-red-700':'text-blue-700'},{v:''},
                        ]} />
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── VENDOR-WISE ── */}
          {tab === 'vendor' && (
            <div id="rpt-vendor" data-rpt>
              <ReportHeader title="Vendor-wise Payables" subtitle={`${vendorRows.length} vendors · ${rangeLabel}`}
                icon={Users} iconColor="text-violet-500" actions={<>
                  <BtnPrint sectionId="rpt-vendor" />
                  <BtnCSV onClick={() => downloadCSV(`DQS-Vendors-${dayjs().format('YYYYMMDD')}.csv`,
                    ['Vendor','Bills','Basic (₹)','GST (₹)','Invoice Total (₹)','Certified (₹)','TDS (₹)','Paid (₹)','Balance (₹)','Paid %'],
                    [...vendorRows.map(v=>[v.vendor,v.bills,inr(v.basic),inr(v.gst),inr(v.total),inr(v.certified),inr(v.tds),inr(v.paid),inr(v.total-v.paid),
                      v.total>0?((v.paid/v.total)*100).toFixed(1)+'%':'0%']),
                     ['TOTAL',bills.length,inr(totBasic),inr(totGst),inr(totInvoice),inr(totCertified),inr(totTds),inr(totPaid),inr(totBalance),paidPct+'%']])} />
                </>} />
              {vendorRows.length === 0 ? <Empty /> : (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="overflow-auto max-h-[calc(100vh-240px)]">
                    <table className="w-full text-sm">
                      <thead><tr>
                        {['#','Vendor','Bills','Basic (₹)','GST (₹)','Invoice Total (₹)','Certified (₹)','TDS (₹)','Paid (₹)','Balance (₹)','%'].map(h =>
                          <Th key={h} right={!['#','Vendor','Bills'].includes(h)} center={h==='Bills'}>{h}</Th>)}
                      </tr></thead>
                      <tbody className="divide-y divide-slate-50">
                        {vendorRows.map((v, i) => {
                          const bal = v.total - v.paid;
                          const pct = v.total > 0 ? ((v.paid/v.total)*100).toFixed(1) : '0.0';
                          return (
                            <tr key={v.vendor} className="hover:bg-slate-50 transition-colors">
                              <Td mono color="text-slate-400">{i+1}</Td>
                              <Td bold>{v.vendor}</Td>
                              <Td center>{v.bills}</Td>
                              <Td right>{inrFmt(v.basic)}</Td>
                              <Td right color="text-amber-600">{inrFmt(v.gst)}</Td>
                              <Td right bold color="text-blue-700">{inrFmt(v.total)}</Td>
                              <Td right color="text-violet-700">{inrFmt(v.certified)}</Td>
                              <Td right color="text-orange-600">{inrFmt(v.tds)}</Td>
                              <Td right color="text-emerald-700">{inrFmt(v.paid)}</Td>
                              <Td right color={bal>0?'text-red-600':'text-slate-400'}>{inrFmt(bal)}</Td>
                              <Td right><span className={clsx('px-1.5 py-0.5 rounded text-[10px] font-bold',parseFloat(pct)>=80?'bg-emerald-50 text-emerald-700':parseFloat(pct)>=40?'bg-amber-50 text-amber-700':'bg-slate-100 text-slate-500')}>{pct}%</span></Td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <TotRow cols={[
                          {v:''},{v:'TOTAL'},{v:bills.length,right:true},
                          {v:inrFmt(totBasic),right:true},{v:inrFmt(totGst),right:true},
                          {v:inrFmt(totInvoice),right:true},{v:inrFmt(totCertified),right:true},
                          {v:inrFmt(totTds),right:true},{v:inrFmt(totPaid),right:true},
                          {v:inrFmt(totBalance),right:true,color:totBalance>0?'text-red-700':'text-blue-700'},
                          {v:paidPct+'%',right:true},
                        ]} />
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── OUTSTANDING / AGING ── */}
          {tab === 'aging' && (
            <div id="rpt-aging" data-rpt>
              <ReportHeader title="Outstanding / Aging Report" subtitle="Certified but unpaid bills"
                icon={Clock} iconColor="text-red-500" actions={<>
                  <BtnPrint sectionId="rpt-aging" />
                  <BtnCSV onClick={() => downloadCSV(`DQS-Aging-${dayjs().format('YYYYMMDD')}.csv`,
                    ['SL#','Vendor','Invoice #','Inv Date','Certified (₹)','Paid (₹)','Balance (₹)','Days','Status'],
                    agingRows.map(b=>[b.sl_number,b.vendor_name,b.inv_number,fmt(b.inv_date),inr(b.certified_net),inr(b.paid_amount),inr(b.balance),b.days+' days',STATUS_CFG[b.workflow_status]?.label||b.workflow_status]))} />
                </>} />

              {/* Bucket cards */}
              <div className="grid grid-cols-5 gap-3 mb-4">
                {agingBuckets.map((b, i) => {
                  const cls=['bg-emerald-50 border-emerald-200 text-emerald-700','bg-yellow-50 border-yellow-200 text-yellow-700','bg-amber-50 border-amber-200 text-amber-700','bg-orange-50 border-orange-200 text-orange-700','bg-red-50 border-red-200 text-red-700'];
                  return (
                    <div key={b.range} className={clsx('rounded-xl border p-3 text-center', cls[i])}>
                      <p className="text-xs font-medium opacity-70 mb-1">{b.range} days</p>
                      <p className="text-2xl font-bold">{b.count}</p>
                      <p className="text-xs mt-1 opacity-80">{inrFmt(b.amount)}</p>
                    </div>
                  );
                })}
              </div>

              {agingRows.length === 0 ? <div className="bg-white rounded-xl border border-emerald-200 p-10 text-center text-emerald-600 font-semibold">No outstanding certified bills 🎉</div> : (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="overflow-auto max-h-[calc(100vh-320px)]">
                    <table className="w-full text-xs">
                      <thead><tr>
                        {['SL#','Vendor','Invoice #','Inv Date','PO/WO','Certified','Paid','Balance','Days','Aging','Stage'].map(h =>
                          <Th key={h} right={['Certified','Paid','Balance','Days'].includes(h)} center={h==='Aging'}>{h}</Th>)}
                      </tr></thead>
                      <tbody className="divide-y divide-slate-50">
                        {agingRows.map((b, i) => {
                          const ac=b.days>120?'bg-red-100 text-red-700':b.days>90?'bg-orange-100 text-orange-700':b.days>60?'bg-amber-100 text-amber-700':b.days>30?'bg-yellow-100 text-yellow-700':'bg-emerald-100 text-emerald-700';
                          return (
                            <tr key={b.id||i} className="hover:bg-slate-50 transition-colors">
                              <Td mono>{b.sl_number}</Td>
                              <Td bold>{b.vendor_name}</Td>
                              <Td mono>{b.inv_number||'—'}</Td>
                              <Td small>{fmts(b.inv_date)}</Td>
                              <Td mono>{b.po_number||'—'}</Td>
                              <Td right color="text-violet-700">{inrFmt(b.certified_net)}</Td>
                              <Td right color="text-emerald-700">{inrFmt(b.paid_amount)}</Td>
                              <Td right bold color="text-red-600">{inrFmt(b.balance)}</Td>
                              <Td right bold color={b.days>60?'text-red-600':b.days>30?'text-amber-600':'text-slate-500'}>{b.days}</Td>
                              <Td center><span className={clsx('text-[10px] font-medium px-1.5 py-0.5 rounded-full',ac)}>{b.days>120?'>120d':b.days>90?'91-120d':b.days>60?'61-90d':b.days>30?'31-60d':'0-30d'}</span></Td>
                              <Td><StatusBadge status={b.workflow_status} /></Td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <TotRow cols={[
                          {v:'TOTAL'},{v:''},{v:''},{v:''},{v:''},
                          {v:inrFmt(agingRows.reduce((s,b)=>s+parseFloat(b.certified_net||0),0)),right:true},
                          {v:inrFmt(agingRows.reduce((s,b)=>s+parseFloat(b.paid_amount||0),0)),right:true},
                          {v:inrFmt(agingRows.reduce((s,b)=>s+b.balance,0)),right:true,color:'text-red-700'},
                          {v:''},{v:''},{v:''},
                        ]} />
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── PAYMENT REGISTER ── */}
          {tab === 'payment' && (
            <div id="rpt-payment" data-rpt>
              <ReportHeader title="Payment Register" subtitle={`${paymentRows.length} paid bills`}
                icon={CreditCard} iconColor="text-emerald-500" actions={<>
                  <BtnPrint sectionId="rpt-payment" />
                  <BtnCSV onClick={() => downloadCSV(`DQS-Payments-${dayjs().format('YYYYMMDD')}.csv`,
                    ['SL#','Vendor','Invoice #','Inv Date','PC #','Invoice Total (₹)','Certified (₹)','TDS (₹)','Paid (₹)','Balance (₹)','UTR / Ref','Status'],
                    paymentRows.map(b=>[b.sl_number,b.vendor_name,b.inv_number,fmt(b.inv_date),b.pc_number||'—',
                      inr(b.total_amount),inr(b.certified_net),inr(b.tds_deduction),inr(b.paid_amount),
                      inr(parseFloat(b.certified_net||0)-parseFloat(b.paid_amount||0)),
                      b.reference_number||'—', STATUS_CFG[b.workflow_status]?.label||b.workflow_status]))} />
                </>} />
              {paymentRows.length === 0 ? <Empty msg="No bills with payment records" /> : (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="overflow-auto max-h-[calc(100vh-240px)]">
                    <table className="w-full text-xs">
                      <thead><tr>
                        {['SL#','Vendor','Invoice #','Inv Date','PC #','Invoice Total','Certified','TDS','Paid','Balance','UTR / Ref','Stage'].map(h =>
                          <Th key={h} right={['Invoice Total','Certified','TDS','Paid','Balance'].includes(h)}>{h}</Th>)}
                      </tr></thead>
                      <tbody className="divide-y divide-slate-50">
                        {paymentRows.map((b, i) => {
                          const bal = parseFloat(b.certified_net||0) - parseFloat(b.paid_amount||0);
                          return (
                            <tr key={b.id||i} className="hover:bg-slate-50">
                              <Td mono>{b.sl_number}</Td>
                              <Td bold>{b.vendor_name}</Td>
                              <Td mono>{b.inv_number||'—'}</Td>
                              <Td small>{fmts(b.inv_date)}</Td>
                              <Td mono color="text-blue-600">{b.pc_number||'—'}</Td>
                              <Td right bold color="text-blue-700">{inrFmt(b.total_amount)}</Td>
                              <Td right color="text-violet-700">{inrFmt(b.certified_net)}</Td>
                              <Td right color="text-orange-600">{inrFmt(b.tds_deduction)}</Td>
                              <Td right bold color="text-emerald-700">{inrFmt(b.paid_amount)}</Td>
                              <Td right color={bal>0?'text-red-600':'text-slate-400'}>{inrFmt(bal)}</Td>
                              <Td mono color="text-slate-500">{b.reference_number||'—'}</Td>
                              <Td><StatusBadge status={b.workflow_status} /></Td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <TotRow cols={[
                          {v:'TOTAL'},{v:''},{v:''},{v:''},{v:''},
                          {v:inrFmt(paymentRows.reduce((s,b)=>s+parseFloat(b.total_amount||0),0)),right:true},
                          {v:inrFmt(paymentRows.reduce((s,b)=>s+parseFloat(b.certified_net||0),0)),right:true},
                          {v:inrFmt(paymentRows.reduce((s,b)=>s+parseFloat(b.tds_deduction||0),0)),right:true},
                          {v:inrFmt(paymentRows.reduce((s,b)=>s+parseFloat(b.paid_amount||0),0)),right:true},
                          {v:inrFmt(paymentRows.reduce((s,b)=>s+(parseFloat(b.certified_net||0)-parseFloat(b.paid_amount||0)),0)),right:true,color:'text-red-700'},
                          {v:''},{v:''},
                        ]} />
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── GST SUMMARY ── */}
          {tab === 'gst' && (
            <div id="rpt-gst" data-rpt>
              <ReportHeader title="GST Summary" subtitle="Month-wise CGST / SGST / IGST"
                icon={Receipt} iconColor="text-amber-500" actions={<>
                  <BtnPrint sectionId="rpt-gst" />
                  <BtnCSV onClick={() => downloadCSV(`DQS-GST-${dayjs().format('YYYYMMDD')}.csv`,
                    ['Month','Bills','Basic (₹)','CGST (₹)','SGST (₹)','IGST (₹)','Total GST (₹)','Invoice Total (₹)'],
                    [...gstMonthRows.map(m=>[m.label,m.bills,inr(m.basic),inr(m.cgst),inr(m.sgst),inr(m.igst),inr(m.totalGst),inr(m.total)]),
                     ['TOTAL',bills.length,inr(totBasic), inr(gstMonthRows.reduce((s,m)=>s+m.cgst,0)), inr(gstMonthRows.reduce((s,m)=>s+m.sgst,0)),
                      inr(gstMonthRows.reduce((s,m)=>s+m.igst,0)), inr(totGst), inr(totInvoice)]])} />
                </>} />
              {gstMonthRows.length === 0 ? <Empty /> : (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <table className="w-full text-sm">
                    <thead><tr>
                      {['Month','Bills','Basic (₹)','CGST (₹)','SGST (₹)','IGST (₹)','Total GST (₹)','Invoice Total (₹)'].map(h =>
                        <Th key={h} right={h!=='Month'&&h!=='Bills'} center={h==='Bills'}>{h}</Th>)}
                    </tr></thead>
                    <tbody className="divide-y divide-slate-50">
                      {gstMonthRows.map((m, i) => (
                        <tr key={m.key} className={clsx('hover:bg-slate-50',i%2===0?'':'bg-slate-50/30')}>
                          <Td bold color="text-slate-700">{m.label}</Td>
                          <Td center>{m.bills}</Td>
                          <Td right>{inrFmt(m.basic)}</Td>
                          <Td right color="text-amber-600">{inrFmt(m.cgst)}</Td>
                          <Td right color="text-amber-600">{inrFmt(m.sgst)}</Td>
                          <Td right color="text-orange-600">{inrFmt(m.igst)}</Td>
                          <Td right bold color="text-amber-700">{inrFmt(m.totalGst)}</Td>
                          <Td right bold color="text-blue-700">{inrFmt(m.total)}</Td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <TotRow cols={[
                        {v:'TOTAL'},{v:bills.length,right:true},{v:inrFmt(totBasic),right:true},
                        {v:inrFmt(gstMonthRows.reduce((s,m)=>s+m.cgst,0)),right:true},
                        {v:inrFmt(gstMonthRows.reduce((s,m)=>s+m.sgst,0)),right:true},
                        {v:inrFmt(gstMonthRows.reduce((s,m)=>s+m.igst,0)),right:true},
                        {v:inrFmt(totGst),right:true,color:'text-amber-700'},{v:inrFmt(totInvoice),right:true},
                      ]} />
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── TDS DEDUCTION REPORT ── */}
          {tab === 'tds' && (
            <div id="rpt-tds" data-rpt>
              <ReportHeader title="TDS Deduction Report" subtitle={`Vendor-wise TDS summary · ${rangeLabel}`}
                icon={IndianRupee} iconColor="text-orange-500" actions={<>
                  <BtnPrint sectionId="rpt-tds" />
                  <BtnCSV onClick={() => downloadCSV(`DQS-TDS-${dayjs().format('YYYYMMDD')}.csv`,
                    ['Vendor','Bills with TDS','Gross Certified (₹)','TDS Deducted (₹)','Net Payable (₹)','TDS %'],
                    [...tdsRows.map(r=>[r.vendor, r.bills, inr(r.gross), inr(r.tds), inr(r.net), r.gross>0?((r.tds/r.gross)*100).toFixed(2)+'%':'—']),
                     ['TOTAL', tdsRows.reduce((s,r)=>s+r.bills,0), inr(tdsRows.reduce((s,r)=>s+r.gross,0)),
                      inr(totTds), inr(tdsRows.reduce((s,r)=>s+r.net,0)), '']])} />
                </>} />
              {tdsRows.length === 0 ? <Empty msg="No TDS deductions in selected period" /> : (
                <>
                  <KpiGrid items={[
                    { label: 'Vendors with TDS', value: tdsRows.length,         color: 'text-indigo-700', border: 'border-indigo-100' },
                    { label: 'Total TDS',         value: inrFmt(totTds),         color: 'text-orange-700', border: 'border-orange-100' },
                    { label: 'Gross Certified',   value: inrFmt(tdsRows.reduce((s,r)=>s+r.gross,0)), color: 'text-violet-700', border: 'border-violet-100' },
                    { label: 'Net Payable',       value: inrFmt(tdsRows.reduce((s,r)=>s+r.net,0)),   color: 'text-emerald-700', border: 'border-emerald-100' },
                  ]} />
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <table className="w-full text-sm">
                      <thead><tr>
                        {['#','Vendor','Bills','Gross Certified (₹)','TDS Deducted (₹)','Net Payable (₹)','TDS %'].map(h =>
                          <Th key={h} right={!['#','Vendor','Bills'].includes(h)} center={h==='Bills'}>{h}</Th>)}
                      </tr></thead>
                      <tbody className="divide-y divide-slate-50">
                        {tdsRows.map((r, i) => {
                          const pct = r.gross > 0 ? ((r.tds/r.gross)*100).toFixed(2) : '0.00';
                          return (
                            <tr key={r.vendor} className="hover:bg-slate-50">
                              <Td mono color="text-slate-400">{i+1}</Td>
                              <Td bold>{r.vendor}</Td>
                              <Td center>{r.bills}</Td>
                              <Td right color="text-violet-700">{inrFmt(r.gross)}</Td>
                              <Td right bold color="text-orange-600">{inrFmt(r.tds)}</Td>
                              <Td right color="text-emerald-700">{inrFmt(r.net)}</Td>
                              <Td right><span className="text-[11px] font-medium text-orange-600">{pct}%</span></Td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <TotRow cols={[
                          {v:''},{v:'TOTAL'},{v:tdsRows.reduce((s,r)=>s+r.bills,0),right:true},
                          {v:inrFmt(tdsRows.reduce((s,r)=>s+r.gross,0)),right:true},
                          {v:inrFmt(totTds),right:true,color:'text-orange-700'},
                          {v:inrFmt(tdsRows.reduce((s,r)=>s+r.net,0)),right:true},{v:''},
                        ]} />
                      </tfoot>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── PO-WISE ── */}
          {tab === 'po' && (
            <div id="rpt-po" data-rpt>
              <ReportHeader title="PO-wise Summary" subtitle={`${poRows.length} purchase orders`}
                icon={ShoppingCart} iconColor="text-amber-500" actions={<>
                  <BtnPrint sectionId="rpt-po" />
                  <BtnCSV onClick={() => downloadCSV(`DQS-POWise-${dayjs().format('YYYYMMDD')}.csv`,
                    ['PO Number','Vendor','Bills','Invoice Total (₹)','Certified (₹)','Paid (₹)','Balance (₹)','Paid %'],
                    poRows.map(p=>[p.po_number,p.vendor,p.bills,inr(p.total),inr(p.certified),inr(p.paid),inr(p.total-p.paid),
                      p.total>0?((p.paid/p.total)*100).toFixed(1)+'%':'0%']))} />
                </>} />
              {poRows.length === 0 ? <Empty /> : (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <table className="w-full text-sm">
                    <thead><tr>
                      {['#','PO Number','Vendor','Bills','Invoice Total (₹)','Certified (₹)','Paid (₹)','Balance (₹)','%'].map(h =>
                        <Th key={h} right={!['#','PO Number','Vendor','Bills'].includes(h)} center={h==='Bills'}>{h}</Th>)}
                    </tr></thead>
                    <tbody className="divide-y divide-slate-50">
                      {poRows.map((p, i) => {
                        const bal = p.total - p.paid;
                        const pct = p.total > 0 ? ((p.paid/p.total)*100).toFixed(1) : '0.0';
                        return (
                          <tr key={p.po_number} className="hover:bg-slate-50">
                            <Td mono color="text-slate-400">{i+1}</Td>
                            <Td mono bold color="text-blue-600">{p.po_number}</Td>
                            <Td>{p.vendor}</Td>
                            <Td center>{p.bills}</Td>
                            <Td right bold color="text-blue-700">{inrFmt(p.total)}</Td>
                            <Td right color="text-violet-700">{inrFmt(p.certified)}</Td>
                            <Td right color="text-emerald-700">{inrFmt(p.paid)}</Td>
                            <Td right color={bal>0?'text-red-600':'text-slate-400'}>{inrFmt(bal)}</Td>
                            <Td right><span className={clsx('px-1.5 py-0.5 rounded text-[10px] font-bold',parseFloat(pct)>=80?'bg-emerald-50 text-emerald-700':parseFloat(pct)>=40?'bg-amber-50 text-amber-700':'bg-slate-100 text-slate-500')}>{pct}%</span></Td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <TotRow cols={[
                        {v:''},{v:'TOTAL'},{v:''},{v:bills.length,right:true},
                        {v:inrFmt(totInvoice),right:true},{v:inrFmt(totCertified),right:true},
                        {v:inrFmt(totPaid),right:true},{v:inrFmt(totBalance),right:true,color:totBalance>0?'text-red-700':'text-blue-700'},
                        {v:paidPct+'%',right:true},
                      ]} />
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── WO-WISE ── */}
          {tab === 'wo' && (
            <div id="rpt-wo" data-rpt>
              <ReportHeader title="Work Order-wise Summary" subtitle={`${woRows.length} work orders`}
                icon={Layers} iconColor="text-purple-500" actions={<>
                  <BtnPrint sectionId="rpt-wo" />
                  <BtnCSV onClick={() => downloadCSV(`DQS-WOWise-${dayjs().format('YYYYMMDD')}.csv`,
                    ['WO Number','Vendor','Bills','Invoice Total (₹)','Certified (₹)','Paid (₹)','Balance (₹)','Paid %'],
                    woRows.map(r=>[r.wo_number,r.vendor,r.bills,inr(r.total),inr(r.certified),inr(r.paid),inr(r.total-r.paid),
                      r.total>0?((r.paid/r.total)*100).toFixed(1)+'%':'0%']))} />
                </>} />
              {woRows.length === 0 ? <Empty msg="No work order bills in selected filters" /> : (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <table className="w-full text-sm">
                    <thead><tr>
                      {['#','WO Number','Vendor','Bills','Invoice Total (₹)','Certified (₹)','Paid (₹)','Balance (₹)','%'].map(h =>
                        <Th key={h} right={!['#','WO Number','Vendor','Bills'].includes(h)} center={h==='Bills'}>{h}</Th>)}
                    </tr></thead>
                    <tbody className="divide-y divide-slate-50">
                      {woRows.map((r, i) => {
                        const bal = r.total - r.paid;
                        const pct = r.total > 0 ? ((r.paid/r.total)*100).toFixed(1) : '0.0';
                        return (
                          <tr key={r.wo_number} className="hover:bg-slate-50">
                            <Td mono color="text-slate-400">{i+1}</Td>
                            <Td mono bold color="text-purple-600">{r.wo_number}</Td>
                            <Td>{r.vendor}</Td>
                            <Td center>{r.bills}</Td>
                            <Td right bold color="text-blue-700">{inrFmt(r.total)}</Td>
                            <Td right color="text-violet-700">{inrFmt(r.certified)}</Td>
                            <Td right color="text-emerald-700">{inrFmt(r.paid)}</Td>
                            <Td right color={bal>0?'text-red-600':'text-slate-400'}>{inrFmt(bal)}</Td>
                            <Td right><span className={clsx('px-1.5 py-0.5 rounded text-[10px] font-bold',parseFloat(pct)>=80?'bg-emerald-50 text-emerald-700':parseFloat(pct)>=40?'bg-amber-50 text-amber-700':'bg-slate-100 text-slate-500')}>{pct}%</span></Td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <TotRow cols={[
                        {v:''},{v:'TOTAL'},{v:''},{v:woRows.reduce((s,r)=>s+r.bills,0),right:true},
                        {v:inrFmt(woRows.reduce((s,r)=>s+r.total,0)),right:true},
                        {v:inrFmt(woRows.reduce((s,r)=>s+r.certified,0)),right:true},
                        {v:inrFmt(woRows.reduce((s,r)=>s+r.paid,0)),right:true},
                        {v:inrFmt(woRows.reduce((s,r)=>s+r.total-r.paid,0)),right:true,color:'text-red-700'},
                        {v:''},
                      ]} />
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── PC REGISTER ── */}
          {tab === 'pc' && (
            <div id="rpt-pc" data-rpt>
              <ReportHeader title="PC Register" subtitle={`${pcRows.length} payment certificates`}
                icon={ListChecks} iconColor="text-teal-500" actions={<>
                  <BtnPrint sectionId="rpt-pc" />
                  <BtnCSV onClick={() => downloadCSV(`DQS-PCRegister-${dayjs().format('YYYYMMDD')}.csv`,
                    ['PC Number','Vendor','Bills','Certified (₹)','TDS (₹)','Paid (₹)','Balance (₹)','PC Date'],
                    pcRows.map(r=>[r.pc_number,r.vendor,r.bills,inr(r.certified),inr(r.tds),inr(r.paid),inr(r.balance),fmt(r.pc_date)]))} />
                </>} />
              {pcRows.length === 0 ? <Empty msg="No Payment Certificates in selected period. Bills need a PC number assigned via QS stage." /> : (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <table className="w-full text-sm">
                    <thead><tr>
                      {['#','PC Number','Vendor','Bills','Certified (₹)','TDS (₹)','Paid (₹)','Balance (₹)','PC Date','Status'].map(h =>
                        <Th key={h} right={['Certified (₹)','TDS (₹)','Paid (₹)','Balance (₹)'].includes(h)} center={h==='Bills'}>{h}</Th>)}
                    </tr></thead>
                    <tbody className="divide-y divide-slate-50">
                      {pcRows.map((r, i) => (
                        <tr key={r.pc_number} className="hover:bg-slate-50">
                          <Td mono color="text-slate-400">{i+1}</Td>
                          <Td mono bold color="text-teal-600">{r.pc_number}</Td>
                          <Td>{r.vendor}</Td>
                          <Td center>{r.bills}</Td>
                          <Td right bold color="text-violet-700">{inrFmt(r.certified)}</Td>
                          <Td right color="text-orange-600">{inrFmt(r.tds)}</Td>
                          <Td right color="text-emerald-700">{inrFmt(r.paid)}</Td>
                          <Td right color={r.balance>0?'text-red-600':'text-slate-400'}>{inrFmt(r.balance)}</Td>
                          <Td small>{fmt(r.pc_date)}</Td>
                          <Td><span className={clsx('text-[10px] font-medium px-2 py-0.5 rounded-full',r.balance<0.01?'bg-emerald-100 text-emerald-700':'bg-amber-100 text-amber-700')}>{r.balance<0.01?'Paid':'Partial'}</span></Td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <TotRow cols={[
                        {v:''},{v:'TOTAL'},{v:''},{v:pcRows.reduce((s,r)=>s+r.bills,0),right:true},
                        {v:inrFmt(pcRows.reduce((s,r)=>s+r.certified,0)),right:true},
                        {v:inrFmt(pcRows.reduce((s,r)=>s+r.tds,0)),right:true},
                        {v:inrFmt(pcRows.reduce((s,r)=>s+r.paid,0)),right:true},
                        {v:inrFmt(pcRows.reduce((s,r)=>s+r.balance,0)),right:true,color:'text-red-700'},
                        {v:''},{v:''},
                      ]} />
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── STATUS-WISE ── */}
          {tab === 'status' && (
            <div id="rpt-status" data-rpt>
              <ReportHeader title="Status-wise Tracker" subtitle={`${bills.length} bills across ${Object.keys(statusGroups).filter(k=>statusGroups[k].count>0).length} stages`}
                icon={Activity} actions={<BtnPrint sectionId="rpt-status" />} />
              <div className="space-y-4">
                {Object.entries(STATUS_CFG).map(([k, cfg]) => {
                  const stageBills = bills.filter(b => b.workflow_status === k);
                  if (!stageBills.length) return null;
                  const stageTotal = stageBills.reduce((s,b)=>s+parseFloat(b.total_amount||0),0);
                  return (
                    <div key={k} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className={clsx('px-4 py-2.5 border-b border-slate-100 flex items-center justify-between')}>
                        <div className="flex items-center gap-2"><StatusBadge status={k} /><span className="text-xs text-slate-500">{stageBills.length} bills · {inrFmt(stageTotal)}</span></div>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead><tr>
                            {['SL#','Vendor','Invoice #','Inv Date','PO/WO','Basic (₹)','GST (₹)','Total (₹)','Certified (₹)','Paid (₹)'].map(h =>
                              <Th key={h} right={['Basic (₹)','GST (₹)','Total (₹)','Certified (₹)','Paid (₹)'].includes(h)}>{h}</Th>)}
                          </tr></thead>
                          <tbody className="divide-y divide-slate-50">
                            {stageBills.map((b, i) => (
                              <tr key={b.id||i} className="hover:bg-slate-50">
                                <Td mono>{b.sl_number}</Td><Td bold>{b.vendor_name}</Td>
                                <Td mono>{b.inv_number||'—'}</Td><Td small>{fmts(b.inv_date)}</Td>
                                <Td mono>{b.po_number||'—'}</Td>
                                <Td right>{inrFmt(b.basic_amount)}</Td>
                                <Td right color="text-amber-600">{inrFmt(b.gst_amount)}</Td>
                                <Td right bold color="text-blue-700">{inrFmt(b.total_amount)}</Td>
                                <Td right color="text-violet-700">{inrFmt(b.certified_net)}</Td>
                                <Td right color="text-emerald-700">{inrFmt(b.paid_amount)}</Td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <TotRow cols={[
                              {v:'TOTAL'},{v:''},{v:''},{v:''},{v:''},
                              {v:inrFmt(stageBills.reduce((s,b)=>s+parseFloat(b.basic_amount||0),0)),right:true},
                              {v:inrFmt(stageBills.reduce((s,b)=>s+parseFloat(b.gst_amount||0),0)),right:true},
                              {v:inrFmt(stageTotal),right:true},
                              {v:inrFmt(stageBills.reduce((s,b)=>s+parseFloat(b.certified_net||0),0)),right:true},
                              {v:inrFmt(stageBills.reduce((s,b)=>s+parseFloat(b.paid_amount||0),0)),right:true},
                            ]} />
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  );
                })}
                {bills.length === 0 && <Empty />}
              </div>
            </div>
          )}

          {/* ── MONTH-WISE ── */}
          {tab === 'monthly' && (
            <div id="rpt-monthly" data-rpt>
              <ReportHeader title="Month-wise Summary" subtitle={`${monthRows.length} months`}
                icon={Calendar} actions={<>
                  <BtnPrint sectionId="rpt-monthly" />
                  <BtnCSV onClick={() => downloadCSV(`DQS-Monthly-${dayjs().format('YYYYMMDD')}.csv`,
                    ['Month','Bills','Basic (₹)','GST (₹)','Invoice Total (₹)','Certified (₹)','Paid (₹)','Balance (₹)'],
                    [...monthRows.map(m=>[m.label,m.bills,inr(m.basic),inr(m.gst),inr(m.total),inr(m.certified),inr(m.paid),inr(m.total-m.paid)]),
                     ['TOTAL',bills.length,inr(totBasic),inr(totGst),inr(totInvoice),inr(totCertified),inr(totPaid),inr(totBalance)]])} />
                </>} />
              {monthRows.length === 0 ? <Empty /> : (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <table className="w-full text-sm">
                    <thead><tr>
                      {['Month','Bills','Basic (₹)','GST (₹)','Invoice Total (₹)','Certified (₹)','Paid (₹)','Balance (₹)','Paid %'].map(h =>
                        <Th key={h} right={h!=='Month'&&h!=='Bills'} center={h==='Bills'}>{h}</Th>)}
                    </tr></thead>
                    <tbody className="divide-y divide-slate-50">
                      {monthRows.map((m, i) => {
                        const bal = m.total - m.paid;
                        const pct = m.total > 0 ? ((m.paid/m.total)*100).toFixed(1) : '0.0';
                        return (
                          <tr key={m.key} className={clsx('hover:bg-slate-50',i%2===0?'':'bg-slate-50/30')}>
                            <Td bold color="text-slate-700">{m.label}</Td>
                            <Td center>{m.bills}</Td>
                            <Td right>{inrFmt(m.basic)}</Td>
                            <Td right color="text-amber-600">{inrFmt(m.gst)}</Td>
                            <Td right bold color="text-blue-700">{inrFmt(m.total)}</Td>
                            <Td right color="text-violet-700">{inrFmt(m.certified)}</Td>
                            <Td right color="text-emerald-700">{inrFmt(m.paid)}</Td>
                            <Td right color={bal>0?'text-red-600':'text-slate-400'}>{inrFmt(bal)}</Td>
                            <Td right><span className={clsx('px-1.5 py-0.5 rounded text-[10px] font-bold',parseFloat(pct)>=80?'bg-emerald-50 text-emerald-700':parseFloat(pct)>=40?'bg-amber-50 text-amber-700':'bg-slate-100 text-slate-500')}>{pct}%</span></Td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <TotRow cols={[
                        {v:'TOTAL'},{v:bills.length,right:true},{v:inrFmt(totBasic),right:true},
                        {v:inrFmt(totGst),right:true},{v:inrFmt(totInvoice),right:true},
                        {v:inrFmt(totCertified),right:true},{v:inrFmt(totPaid),right:true},
                        {v:inrFmt(totBalance),right:true,color:totBalance>0?'text-red-700':'text-blue-700'},
                        {v:paidPct+'%',right:true},
                      ]} />
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── PROJECT-WISE ── */}
          {tab === 'project' && (
            <div id="rpt-project" data-rpt>
              <ReportHeader title="Project-wise Summary" subtitle={`${projectRows.length} projects`}
                icon={Building2} iconColor="text-blue-500" actions={<>
                  <BtnPrint sectionId="rpt-project" />
                  <BtnCSV onClick={() => downloadCSV(`DQS-Projects-${dayjs().format('YYYYMMDD')}.csv`,
                    ['Project','Bills','Basic (₹)','GST (₹)','Invoice Total (₹)','Certified (₹)','Paid (₹)','Balance (₹)','Paid %'],
                    projectRows.map(p=>[p.label,p.bills,inr(p.basic),inr(p.gst),inr(p.total),inr(p.certified),inr(p.paid),inr(p.total-p.paid),
                      p.total>0?((p.paid/p.total)*100).toFixed(1)+'%':'0%']))} />
                </>} />
              {projectRows.length === 0 ? <Empty /> : (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <table className="w-full text-sm">
                    <thead><tr>
                      {['#','Project','Bills','Basic (₹)','GST (₹)','Invoice Total (₹)','Certified (₹)','Paid (₹)','Balance (₹)','%'].map(h =>
                        <Th key={h} right={!['#','Project','Bills'].includes(h)} center={h==='Bills'}>{h}</Th>)}
                    </tr></thead>
                    <tbody className="divide-y divide-slate-50">
                      {projectRows.map((p, i) => {
                        const bal = p.total - p.paid;
                        const pct = p.total > 0 ? ((p.paid/p.total)*100).toFixed(1) : '0.0';
                        return (
                          <tr key={p.project_id} className="hover:bg-slate-50">
                            <Td mono color="text-slate-400">{i+1}</Td>
                            <Td bold color="text-blue-700">{p.label}</Td>
                            <Td center>{p.bills}</Td>
                            <Td right>{inrFmt(p.basic)}</Td>
                            <Td right color="text-amber-600">{inrFmt(p.gst)}</Td>
                            <Td right bold color="text-blue-700">{inrFmt(p.total)}</Td>
                            <Td right color="text-violet-700">{inrFmt(p.certified)}</Td>
                            <Td right color="text-emerald-700">{inrFmt(p.paid)}</Td>
                            <Td right color={bal>0?'text-red-600':'text-slate-400'}>{inrFmt(bal)}</Td>
                            <Td right><span className={clsx('px-1.5 py-0.5 rounded text-[10px] font-bold',parseFloat(pct)>=80?'bg-emerald-50 text-emerald-700':parseFloat(pct)>=40?'bg-amber-50 text-amber-700':'bg-slate-100 text-slate-500')}>{pct}%</span></Td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <TotRow cols={[
                        {v:''},{v:'TOTAL'},{v:bills.length,right:true},
                        {v:inrFmt(totBasic),right:true},{v:inrFmt(totGst),right:true},
                        {v:inrFmt(totInvoice),right:true},{v:inrFmt(totCertified),right:true},
                        {v:inrFmt(totPaid),right:true},
                        {v:inrFmt(totBalance),right:true,color:totBalance>0?'text-red-700':'text-blue-700'},
                        {v:paidPct+'%',right:true},
                      ]} />
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}

          </div>
          )}
        </main>
      </div>
    </div>
    </>
  );
}
