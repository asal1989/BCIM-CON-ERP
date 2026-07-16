// src/pages/dashboards/StoresDashboard.jsx
import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Truck, ClipboardList, AlertTriangle, PackageCheck, Clock, Plus,
  ArrowUpRight, Boxes, FileText, ChevronRight, RefreshCw,
  TrendingUp, CheckCircle2, Building2, IndianRupee, BarChart2,
} from 'lucide-react';
import { ignAPI, mrsAPI, minAPI, inventoryAPI } from '../../api/client';
import useAuthStore from '../../store/authStore';
import { PageHeader, Theme } from '../../theme';
import dayjs from 'dayjs';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Cell,
} from 'recharts';

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/* ── helpers ─────────────────────────────────────────────────── */
const inrCr = v => {
  const n = parseFloat(v || 0);
  if (Math.abs(n) >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(1)} L`;
  if (Math.abs(n) >= 1e3) return `₹${(n / 1e3).toFixed(1)} K`;
  return `₹${n.toFixed(0)}`;
};
const pctOf = (a, b) => b > 0 ? ((a / b) * 100).toFixed(1) : '0.0';

/* ── Status configs ─────────────────────────────────────────── */
const MRS_CFG = {
  pending:         { label: 'Pending',        color: '#f59e0b', bg: '#fffbeb' },
  stores_verified: { label: 'Stores ✓',       color: '#0ea5e9', bg: '#f0f9ff' },
  verified_tower:  { label: 'Tower ✓',        color: '#0ea5e9', bg: '#f0f9ff' },
  approved_pm:     { label: 'PM Approved',    color: '#6366f1', bg: '#eef2ff' },
  approved_srpm:   { label: 'Sr PM Approved', color: '#6366f1', bg: '#eef2ff' },
  approved_mgmt:   { label: 'Mgmt Approved',  color: '#8b5cf6', bg: '#f5f3ff' },
  approved_md:     { label: 'MD Approved',    color: '#10b981', bg: '#f0fdf4' },
  issued:          { label: 'Issued',          color: '#14b8a6', bg: '#f0fdfa' },
  rejected:        { label: 'Rejected',        color: '#ef4444', bg: '#fff1f2' },
  draft:           { label: 'Draft',           color: '#94a3b8', bg: '#f8fafc' },
};
const IGN_CFG = {
  gate_received: { label: 'Gate Received', color: '#8b5cf6', bg: '#f5f3ff' },
  pending:       { label: 'Pending',       color: '#f59e0b', bg: '#fffbeb' },
  inspected:     { label: 'Inspected',     color: '#0ea5e9', bg: '#f0f9ff' },
  approved:      { label: 'Approved',      color: '#22c55e', bg: '#f0fdf4' },
  cancelled:     { label: 'Cancelled',     color: '#94a3b8', bg: '#f8fafc' },
};
const CAT_COLORS = ['#6366f1','#0ea5e9','#10b981','#f59e0b','#8b5cf6','#ef4444'];

/* ── Sparkline ───────────────────────────────────────────────── */
function Sparkline({ data, color }) {
  if (!data?.length || data.every(v => v === 0)) return null;
  const w = 90, h = 36;
  const vals = data.map(Number);
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = max - min || 1;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * w},${h - ((v - min) / range) * (h - 4) - 2}`).join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <polyline points={`0,${h} ${pts} ${w},${h}`} fill={color} stroke="none" opacity={0.12} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/* ── KPI Sparkline Card ──────────────────────────────────────── */
function KpiSparkCard({ icon: Icon, label, value, sub, color, accentBg, sparkData }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '16px 18px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon size={15} style={{ color }} />
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#94a3b8' }}>{label}</span>
          </div>
          <div style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', letterSpacing: '-0.02em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
          {sub && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 5 }}>{sub}</div>}
        </div>
        <Sparkline data={sparkData} color={color} />
      </div>
    </div>
  );
}

/* ── Status progress row ─────────────────────────────────────── */
function StatusRow({ cfg, label, count, total }) {
  const c = cfg || { label: label || '—', color: '#94a3b8', bg: '#f8fafc' };
  const w = total > 0 ? (count / total) * 100 : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid #f8fafc' }}>
      <div style={{ width: 28, height: 28, borderRadius: 8, background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.color, display: 'inline-block' }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 3 }}>{c.label}</div>
        <div style={{ height: 4, borderRadius: 999, background: '#f1f5f9' }}>
          <div style={{ height: '100%', borderRadius: 999, background: c.color, width: `${w}%`, transition: 'width .4s ease' }} />
        </div>
      </div>
      <span style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', minWidth: 24, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{count}</span>
      <span style={{ fontSize: 10, color: '#94a3b8', minWidth: 38, textAlign: 'right' }}>{pctOf(count, total)}%</span>
    </div>
  );
}

/* ── Main Dashboard ──────────────────────────────────────────── */
export default function StoresDashboard() {
  const now = dayjs();
  const currentMonth = now.format('YYYY-MM');
  const { selectedProjectId, selectedProjectName } = useAuthStore();
  const projParam = selectedProjectId ? { project_id: selectedProjectId } : {};

  const { data: grns = [], isLoading: loadG, refetch: refetchG } = useQuery({
    queryKey: ['stores-dash-igns', selectedProjectId],
    queryFn: () => ignAPI.list(projParam).then(r => { const d = r.data; return Array.isArray(d) ? d : (d?.data ?? []); }),
    staleTime: 0, refetchOnMount: 'always',
  });
  const { data: mrs = [], isLoading: loadM, refetch: refetchM } = useQuery({
    queryKey: ['stores-dash-mrs', selectedProjectId],
    queryFn: () => mrsAPI.list(projParam).then(r => { const d = r.data; return Array.isArray(d) ? d : (d?.data ?? []); }),
    staleTime: 0, refetchOnMount: 'always',
  });
  const { data: issues = [], isLoading: loadI } = useQuery({
    queryKey: ['stores-dash-issues', selectedProjectId],
    queryFn: () => minAPI.list(projParam).then(r => { const d = r.data; return Array.isArray(d) ? d : (d?.data ?? []); }),
    staleTime: 0, refetchOnMount: 'always',
  });
  const { data: inventory = [], isLoading: loadInv } = useQuery({
    queryKey: ['stores-dash-inventory', selectedProjectId],
    queryFn: () => inventoryAPI.list(projParam).then(r => { const d = r.data; return Array.isArray(d) ? d : (d?.data ?? []); }),
    staleTime: 60000,
  });
  const { data: valuation = [], isLoading: loadVal } = useQuery({
    queryKey: ['stores-dash-valuation', selectedProjectId],
    queryFn: () => inventoryAPI.valuation(projParam).then(r => r.data?.data ?? []),
    staleTime: 60000,
  });
  const { data: monthReport = [], isLoading: loadMonth } = useQuery({
    queryKey: ['stores-dash-monthly', selectedProjectId, currentMonth],
    queryFn: () => inventoryAPI.monthlyReport({ ...projParam, month: currentMonth }).then(r => r.data?.data ?? []),
    staleTime: 60000,
  });
  const { data: lowStockItems = [], isLoading: loadLS } = useQuery({
    queryKey: ['stores-dash-lowstock', selectedProjectId],
    queryFn: () => inventoryAPI.lowStock(projParam).then(r => r.data?.data ?? []),
    staleTime: 60000,
  });

  const refetch = () => { refetchG(); refetchM(); };
  const isLoading = loadG || loadM || loadI || loadInv || loadVal || loadMonth;

  /* ── Inventory derived ──────────────────────────────────────── */
  const totalStockValue = useMemo(() => valuation.reduce((s, r) => s + parseFloat(r.stock_value || 0), 0), [valuation]);
  const totalItems = useMemo(() => inventory.length, [inventory]);
  const outOfStock  = useMemo(() => inventory.filter(i => parseFloat(i.closing_stock ?? i.current_stock ?? 0) <= 0), [inventory]);

  const thisMonthReceived = useMemo(() => monthReport.reduce((s, r) => s + parseFloat(r.received_qty || 0), 0), [monthReport]);
  const thisMonthIssued   = useMemo(() => monthReport.reduce((s, r) => s + parseFloat(r.issued_qty || 0), 0), [monthReport]);
  const thisMonthReceivedCount = useMemo(() => monthReport.filter(r => parseFloat(r.received_qty || 0) > 0).length, [monthReport]);
  const thisMonthIssuedCount   = useMemo(() => monthReport.filter(r => parseFloat(r.issued_qty || 0) > 0).length, [monthReport]);

  /* ── Category breakdown from valuation ──────────────────────── */
  const categoryBreakdown = useMemo(() => {
    const m = {};
    for (const v of valuation) {
      const cat = v.category || 'Other';
      if (!m[cat]) m[cat] = { count: 0, value: 0 };
      m[cat].count += parseInt(v.item_count || 0);
      m[cat].value += parseFloat(v.stock_value || 0);
    }
    return Object.entries(m).sort((a, b) => b[1].value - a[1].value).slice(0, 6);
  }, [valuation]);

  /* ── MRS derived ──────────────────────────────────────────── */
  const MRS_CLOSED      = ['issued','rejected','draft'];
  const MRS_IN_APPROVAL = ['stores_verified','verified_tower','approved_pm','approved_srpm','approved_mgmt','approved_md'];
  const openMRS    = mrs.filter(m => !MRS_CLOSED.includes(m.status));
  const pendingMRS = mrs.filter(m => m.status === 'pending');
  const inApproval = mrs.filter(m => MRS_IN_APPROVAL.includes(m.status));
  const issuedMRS  = mrs.filter(m => m.status === 'issued');
  const recentMRS  = [...mrs].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 8);

  const mrsStatusBuckets = useMemo(() => {
    const b = {};
    for (const m of mrs) { const s = m.status || 'pending'; b[s] = (b[s] || 0) + 1; }
    return b;
  }, [mrs]);

  /* ── IGN derived ─────────────────────────────────────────── */
  const pendingGRNs   = grns.filter(g => g.status === 'pending' || g.status === 'gate_received');
  const inspectedGRNs = grns.filter(g => g.status === 'inspected');
  const awaitingGRNs  = [...pendingGRNs, ...inspectedGRNs];
  const approvedGRNs  = grns.filter(g => g.status === 'approved');
  const thisMonthIGNs = grns.filter(g => dayjs(g.date_time || g.created_at).isSame(now, 'month'));

  /* ── MIN (Issues) derived ─────────────────────────────────── */
  const thisMonthIssuesMIN = issues.filter(i => dayjs(i.issue_date || i.created_at).isSame(now, 'month'));

  /* ── Monthly MRS + IGN trend (12 months) ──────────────────── */
  const monthlyTrend = useMemo(() => {
    const mrsByMonth = {}, ignByMonth = {};
    for (const m of mrs) {
      const k = dayjs(m.created_at).format('YYYY-MM');
      mrsByMonth[k] = (mrsByMonth[k] || 0) + 1;
    }
    for (const g of grns) {
      const k = dayjs(g.date_time || g.created_at).format('YYYY-MM');
      ignByMonth[k] = (ignByMonth[k] || 0) + 1;
    }
    return Array.from({ length: 12 }, (_, i) => {
      const d = now.subtract(11 - i, 'month');
      const k = d.format('YYYY-MM');
      return { month: MONTH_LABELS[d.month()], mrs: mrsByMonth[k] || 0, ign: ignByMonth[k] || 0 };
    });
  }, [mrs, grns]);

  /* ── Sparkline arrays ─────────────────────────────────────── */
  const sparkMRS  = monthlyTrend.map(m => m.mrs);
  const sparkIGN  = monthlyTrend.map(m => m.ign);
  const sparkIss  = useMemo(() => {
    const m = {};
    for (const i of issues) { const k = dayjs(i.issue_date || i.created_at).format('YYYY-MM'); m[k] = (m[k] || 0) + 1; }
    return Array.from({ length: 7 }, (_, i) => m[now.subtract(6 - i, 'month').format('YYYY-MM')] || 0);
  }, [issues]);
  const sparkVal  = useMemo(() => {
    const months = monthlyTrend.map(m => m.mrs + m.ign);
    return months;
  }, [monthlyTrend]);

  /* ── IGN by supplier ──────────────────────────────────────── */
  const topSuppliers = useMemo(() => {
    const m = {};
    for (const g of grns) {
      const name = g.supplier_name || 'Unknown';
      m[name] = (m[name] || 0) + 1;
    }
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [grns]);

  /* ── MRS by project ─────────────────────────────────────── */
  const mrsByProject = useMemo(() => {
    const m = {};
    for (const r of mrs) {
      const name = r.project_name || 'Unknown';
      m[name] = (m[name] || 0) + 1;
    }
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [mrs]);

  const PAGE_SIZE = 6;
  const [page, setPage] = React.useState(1);
  const totalPages = Math.ceil(recentMRS.length / PAGE_SIZE);
  const pageMRS = recentMRS.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div style={{ background: '#f8fafc', minHeight: '100vh' }}>

      <PageHeader
        title="Stores Dashboard"
        subtitle="Inventory valuation, IGN receipts, material requisitions & stock health."
        breadcrumbs={[{ label: 'Stores' }, { label: 'Dashboard' }]}
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={refetch} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.12)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              <RefreshCw size={13} /> Refresh
            </button>
            <Link to="/stores/ign" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.12)', color: '#fff', fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
              <Truck size={13} /> New IGN
            </Link>
            <Link to="/stores/mrs" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 9, background: '#fff', color: Theme.navyDark, fontSize: 12, fontWeight: 800, textDecoration: 'none' }}>
              <Plus size={13} /> New MRS
            </Link>
          </div>
        }
      />

      <div style={{ padding: '20px 24px', maxWidth: 1400, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Project filter banner */}
        {selectedProjectId && (
          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12, padding: '9px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Building2 size={14} style={{ color: '#2563eb', flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: '#1d4ed8' }}>Showing data for: {selectedProjectName}</span>
            <span style={{ fontSize: 12, color: '#64748b', marginLeft: 4 }}>— Switch project from the top bar to view others</span>
          </div>
        )}

        {/* Last updated */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, fontSize: 11, color: '#94a3b8' }}>
          <Clock size={12} /> Last updated: {dayjs().format('hh:mm A, DD MMM YYYY')}
        </div>

        {/* KPI Cards — 6 real data points */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14 }}>
          <KpiSparkCard icon={ClipboardList} label="Open MRS"          value={isLoading ? '—' : openMRS.length}          color="#6366f1" accentBg="#eef2ff" sparkData={sparkMRS} sub={`${mrs.length} total · ${issuedMRS.length} issued`} />
          <KpiSparkCard icon={Clock}         label="In Approval"       value={isLoading ? '—' : inApproval.length}       color="#f59e0b" accentBg="#fffbeb" sparkData={sparkMRS} sub={`${pendingMRS.length} pending sign-off`} />
          <KpiSparkCard icon={Truck}         label="IGN Pending"       value={isLoading ? '—' : awaitingGRNs.length}     color="#0891b2" accentBg="#e0f2fe" sparkData={sparkIGN} sub={`${grns.length} total · ${approvedGRNs.length} approved`} />
          <KpiSparkCard icon={IndianRupee}   label="Stock Value"       value={isLoading || loadVal ? '—' : inrCr(totalStockValue)} color="#22c55e" accentBg="#dcfce7" sparkData={sparkVal} sub={`${totalItems} materials`} />
          <KpiSparkCard icon={ArrowUpRight}  label="Received (Month)"  value={isLoading || loadMonth ? '—' : thisMonthReceivedCount} color="#14b8a6" accentBg="#f0fdfa" sparkData={sparkIGN} sub={`${thisMonthIGNs.length} IGNs this month`} />
          <KpiSparkCard icon={AlertTriangle} label="Low Stock"         value={isLoading || loadLS ? '—' : lowStockItems.length}  color="#ef4444" accentBg="#fee2e2" sparkData={sparkIss} sub={`${outOfStock.length} out of stock`} />
        </div>

        {/* Alerts */}
        {(lowStockItems.length > 0 || awaitingGRNs.length > 0) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {lowStockItems.length > 0 && (
              <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 12, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <AlertTriangle size={14} style={{ color: '#d97706', flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: '#92400e' }}>{lowStockItems.length} item{lowStockItems.length > 1 ? 's' : ''} at or below reorder level — restock needed</span>
                <Link to="/stores/ledger" style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: '#d97706', textDecoration: 'none' }}>View Ledger →</Link>
              </div>
            )}
            {awaitingGRNs.length > 0 && (
              <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <Clock size={14} style={{ color: '#2563eb', flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: '#1e40af' }}>{awaitingGRNs.length} IGN{awaitingGRNs.length > 1 ? 's' : ''} awaiting approval</span>
                <Link to="/stores/ign" style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: '#2563eb', textDecoration: 'none' }}>Review →</Link>
              </div>
            )}
          </div>
        )}

        {/* This Month Summary strip */}
        {!loadMonth && (thisMonthReceived > 0 || thisMonthIssued > 0) && (
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 32, flexWrap: 'wrap', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{now.format('MMMM YYYY')}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e' }} />
              <span style={{ fontSize: 13, color: '#374151' }}>Received: <strong style={{ color: '#22c55e' }}>{thisMonthReceived.toFixed(0)} units</strong> across {thisMonthReceivedCount} items</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#f97316' }} />
              <span style={{ fontSize: 13, color: '#374151' }}>Issued: <strong style={{ color: '#f97316' }}>{thisMonthIssued.toFixed(0)} units</strong> across {thisMonthIssuedCount} items</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#0891b2' }} />
              <span style={{ fontSize: 13, color: '#374151' }}>IGNs: <strong style={{ color: '#0891b2' }}>{thisMonthIGNs.length} received</strong></span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#8b5cf6' }} />
              <span style={{ fontSize: 13, color: '#374151' }}>MRS raised: <strong style={{ color: '#8b5cf6' }}>{mrs.filter(m => dayjs(m.created_at).isSame(now, 'month')).length}</strong></span>
            </div>
          </div>
        )}

        {/* 3-column analytics */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>

          {/* MRS Pipeline */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <h3 style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', margin: 0 }}>MRS Pipeline</h3>
              <Link to="/stores/mrs" style={{ fontSize: 11, fontWeight: 700, color: '#6366f1', textDecoration: 'none' }}>View All</Link>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
              {[
                { label: 'Pending',     count: pendingMRS.length,  color: '#f59e0b', bg: '#fffbeb' },
                { label: 'In Approval', count: inApproval.length,  color: '#6366f1', bg: '#eef2ff' },
                { label: 'Issued',      count: issuedMRS.length,   color: '#22c55e', bg: '#dcfce7' },
              ].map(({ label, count, color, bg }) => (
                <div key={label} style={{ background: bg, borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 900, color }}>{count}</div>
                  <div style={{ fontSize: 9, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 2 }}>{label}</div>
                </div>
              ))}
            </div>
            {Object.keys(mrsStatusBuckets).length === 0
              ? <div style={{ textAlign: 'center', padding: '20px 0', color: '#94a3b8', fontSize: 13 }}>No requisitions</div>
              : Object.entries(mrsStatusBuckets).sort((a, b) => b[1] - a[1]).map(([status, count]) => (
                  <StatusRow key={status} cfg={MRS_CFG[status]} label={status} count={count} total={mrs.length} />
                ))
            }
            {mrsByProject.length > 0 && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #f1f5f9' }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#94a3b8', marginBottom: 8 }}>By Project</div>
                {mrsByProject.map(([proj, count], i) => (
                  <div key={proj} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', fontSize: 11, color: '#374151' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>{proj}</span>
                    <span style={{ fontWeight: 800, color: CAT_COLORS[i % CAT_COLORS.length], flexShrink: 0 }}>{count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* IGN / Goods Receipt Status */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <h3 style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', margin: 0 }}>IGN / Goods Receipt</h3>
              <Link to="/stores/ign" style={{ fontSize: 11, fontWeight: 700, color: '#6366f1', textDecoration: 'none' }}>View All</Link>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 14 }}>
              {[
                { label: 'Total IGNs',  count: grns.length,          color: '#64748b', bg: '#f8fafc' },
                { label: 'Awaiting',    count: awaitingGRNs.length,  color: '#f59e0b', bg: '#fffbeb' },
                { label: 'Approved',    count: approvedGRNs.length,  color: '#22c55e', bg: '#dcfce7' },
                { label: 'This Month',  count: thisMonthIGNs.length, color: '#0891b2', bg: '#e0f2fe' },
              ].map(({ label, count, color, bg }) => (
                <div key={label} style={{ background: bg, borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 900, color }}>{count}</div>
                  <div style={{ fontSize: 9, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 2 }}>{label}</div>
                </div>
              ))}
            </div>
            {Object.entries(
              grns.reduce((b, g) => { const s = g.status || 'pending'; b[s] = (b[s] || 0) + 1; return b; }, {})
            ).sort((a, b) => b[1] - a[1]).map(([status, count]) => (
              <StatusRow key={status} cfg={IGN_CFG[status]} label={status} count={count} total={grns.length} />
            ))}
            {grns.length === 0 && <div style={{ textAlign: 'center', padding: '20px 0', color: '#94a3b8', fontSize: 13 }}>No IGNs</div>}
            {topSuppliers.length > 0 && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #f1f5f9' }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#94a3b8', marginBottom: 8 }}>Top Suppliers</div>
                {topSuppliers.map(([name, count], i) => (
                  <div key={name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', fontSize: 11, color: '#374151' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>{name}</span>
                    <span style={{ fontWeight: 800, color: CAT_COLORS[i % CAT_COLORS.length], flexShrink: 0 }}>{count} IGNs</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Inventory + Valuation */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <h3 style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', margin: 0 }}>Inventory Health</h3>
              <Link to="/stores/ledger" style={{ fontSize: 11, fontWeight: 700, color: '#6366f1', textDecoration: 'none' }}>Ledger</Link>
            </div>
            {/* Stock value prominently */}
            <div style={{ background: 'linear-gradient(135deg, #dcfce7 0%, #d1fae5 100%)', borderRadius: 12, padding: '12px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#16a34a', marginBottom: 2 }}>Total Stock Value</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: '#15803d', fontVariantNumeric: 'tabular-nums' }}>{inrCr(totalStockValue)}</div>
              </div>
              <IndianRupee size={28} style={{ color: '#22c55e', opacity: 0.6 }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
              {[
                { label: 'Total Items', count: totalItems,           color: '#64748b', bg: '#f8fafc' },
                { label: 'Low Stock',   count: lowStockItems.length, color: lowStockItems.length > 0 ? '#ef4444' : '#22c55e', bg: lowStockItems.length > 0 ? '#fee2e2' : '#dcfce7' },
                { label: 'Out of Stock',count: outOfStock.length,    color: outOfStock.length > 0 ? '#dc2626' : '#22c55e',    bg: outOfStock.length > 0 ? '#fee2e2' : '#dcfce7' },
              ].map(({ label, count, color, bg }) => (
                <div key={label} style={{ background: bg, borderRadius: 10, padding: '8px 6px', textAlign: 'center' }}>
                  <div style={{ fontSize: 16, fontWeight: 900, color }}>{count}</div>
                  <div style={{ fontSize: 9, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 2 }}>{label}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#94a3b8', marginBottom: 8 }}>By Category (₹ Value)</div>
            {categoryBreakdown.length === 0
              ? <div style={{ textAlign: 'center', padding: '10px 0', color: '#94a3b8', fontSize: 12 }}>No valuation data</div>
              : categoryBreakdown.map(([cat, { count, value }], i) => {
                  const w = categoryBreakdown[0][1].value > 0 ? (value / categoryBreakdown[0][1].value) * 100 : 0;
                  return (
                    <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid #f8fafc' }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: CAT_COLORS[i % CAT_COLORS.length], flexShrink: 0 }} />
                      <span style={{ fontSize: 11, color: '#374151', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat}</span>
                      <div style={{ width: 48, height: 3, borderRadius: 999, background: '#f1f5f9', flexShrink: 0 }}>
                        <div style={{ height: '100%', borderRadius: 999, background: CAT_COLORS[i % CAT_COLORS.length], width: `${w}%` }} />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#0f172a', minWidth: 52, textAlign: 'right' }}>{inrCr(value)}</span>
                    </div>
                  );
                })
            }
          </div>
        </div>

        {/* Recent MRS table */}
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
          <div style={{ padding: '18px 20px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9' }}>
            <h3 style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', margin: 0 }}>Recent Material Requisitions</h3>
            <Link to="/stores/mrs" style={{ fontSize: 12, fontWeight: 700, color: '#6366f1', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
              View All <ChevronRight size={13} />
            </Link>
          </div>
          {isLoading ? (
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[1,2,3,4,5].map(n => <div key={n} style={{ height: 44, background: '#f1f5f9', borderRadius: 10 }} />)}
            </div>
          ) : (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      {['MRS No.','Project','Requested By','Items','Created','Status',''].map(h => (
                        <th key={h} style={{ padding: '10px 16px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#94a3b8', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pageMRS.map(m => {
                      const cfg = MRS_CFG[m.status] || { label: m.status, color: '#94a3b8', bg: '#f8fafc' };
                      return (
                        <tr key={m.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                          <td style={{ padding: '11px 16px' }}>
                            <Link to="/stores/mrs" style={{ fontSize: 13, fontWeight: 700, color: '#6366f1', textDecoration: 'none', fontFamily: 'monospace' }}>
                              {m.serial_no_formatted || m.mrs_number || m.id?.slice(0, 8)}
                            </Link>
                          </td>
                          <td style={{ padding: '11px 16px', fontSize: 12, color: '#374151', fontWeight: 600, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.project_name || '—'}</td>
                          <td style={{ padding: '11px 16px', fontSize: 12, color: '#64748b' }}>{m.requested_by || m.created_by || '—'}</td>
                          <td style={{ padding: '11px 16px', fontSize: 12, color: '#64748b' }}>{m.items?.length || 0} item{(m.items?.length || 0) !== 1 ? 's' : ''}</td>
                          <td style={{ padding: '11px 16px', fontSize: 12, color: '#94a3b8' }}>{dayjs(m.created_at).format('DD MMM YYYY')}</td>
                          <td style={{ padding: '11px 16px' }}>
                            <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}22` }}>
                              {cfg.label}
                            </span>
                          </td>
                          <td style={{ padding: '11px 16px', textAlign: 'center' }}>
                            <Link to="/stores/mrs" style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid #e2e8f0', background: '#f8fafc', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', textDecoration: 'none' }}>
                              <ChevronRight size={13} />
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                    {recentMRS.length === 0 && (
                      <tr><td colSpan={7} style={{ padding: '40px 16px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                        No requisitions — <Link to="/stores/mrs" style={{ color: '#6366f1', fontWeight: 700, textDecoration: 'none' }}>create one</Link>
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              {recentMRS.length > PAGE_SIZE && (
                <div style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #f1f5f9' }}>
                  <span style={{ fontSize: 12, color: '#64748b' }}>Showing {Math.min((page-1)*PAGE_SIZE+1, recentMRS.length)}–{Math.min(page*PAGE_SIZE, recentMRS.length)} of {recentMRS.length}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => (
                      <button key={i+1} onClick={() => setPage(i+1)}
                        style={{ width: 30, height: 30, borderRadius: 7, border: `1px solid ${page===i+1?'#6366f1':'#e2e8f0'}`, background: page===i+1?'#6366f1':'#fff', color: page===i+1?'#fff':'#64748b', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                        {i+1}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Monthly Trend + Low Stock */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>

          {/* Monthly MRS + IGN Trend */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h3 style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', margin: 0 }}>MRS & IGN Activity (12 Months)</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 11 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#6366f1', fontWeight: 700 }}><span style={{ width: 10, height: 3, background: '#6366f1', borderRadius: 2, display: 'inline-block' }} />MRS</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#0891b2', fontWeight: 700 }}><span style={{ width: 10, height: 3, background: '#0891b2', borderRadius: 2, display: 'inline-block' }} />IGN</span>
              </div>
            </div>
            <div style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyTrend} margin={{ top: 4, right: 8, bottom: 0, left: 0 }} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip labelStyle={{ fontSize: 12, fontWeight: 700 }} contentStyle={{ border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 12 }} />
                  <Bar dataKey="mrs" name="MRS" fill="#6366f1" radius={[4,4,0,0]} maxBarSize={18} />
                  <Bar dataKey="ign" name="IGN" fill="#0891b2" radius={[4,4,0,0]} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginTop: 16, paddingTop: 16, borderTop: '1px solid #f1f5f9' }}>
              {[
                { label: 'Total MRS',      value: mrs.length },
                { label: 'Total IGNs',     value: grns.length },
                { label: 'MRS This Month', value: monthlyTrend[11]?.mrs || 0 },
                { label: 'IGN This Month', value: monthlyTrend[11]?.ign || 0 },
              ].map(({ label, value }) => (
                <div key={label}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#94a3b8', marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>{value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Low Stock Alerts */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <h3 style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', margin: 0 }}>Low Stock Alerts</h3>
              <Link to="/stores/ledger" style={{ fontSize: 11, fontWeight: 700, color: '#ef4444', textDecoration: 'none' }}>View All</Link>
            </div>
            {loadLS ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[1,2,3,4].map(n => <div key={n} style={{ height: 40, background: '#f1f5f9', borderRadius: 8 }} />)}
              </div>
            ) : lowStockItems.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 200, gap: 10 }}>
                <CheckCircle2 size={32} style={{ color: '#22c55e', opacity: 0.4 }} />
                <span style={{ fontSize: 13, color: '#94a3b8', fontWeight: 500 }}>All items well-stocked</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0, overflowY: 'auto', maxHeight: 320 }}>
                {lowStockItems.slice(0, 12).map((item, i) => {
                  const current = parseFloat(item.closing_stock ?? item.current_stock ?? 0);
                  const min     = parseFloat(item.reorder_level ?? item.min_stock ?? 0);
                  const pct     = min > 0 ? Math.min((current / min) * 100, 100) : 0;
                  return (
                    <div key={i} style={{ padding: '9px 0', borderBottom: '1px solid #f8fafc' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.material_name || '—'}</div>
                          <div style={{ fontSize: 10, color: '#94a3b8' }}>{item.category || '—'} · {item.unit || ''} · {item.project_name || ''}</div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 800, color: current === 0 ? '#dc2626' : '#f59e0b' }}>{current.toFixed(1)}</div>
                          <div style={{ fontSize: 10, color: '#94a3b8' }}>min: {min.toFixed(1)}</div>
                        </div>
                      </div>
                      <div style={{ height: 3, borderRadius: 999, background: '#fee2e2', marginTop: 4 }}>
                        <div style={{ height: '100%', borderRadius: 999, background: pct < 30 ? '#ef4444' : '#f59e0b', width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
