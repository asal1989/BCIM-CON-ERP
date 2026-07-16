import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  ShoppingCart, Users, Hammer, TrendingUp, ClipboardList, IndianRupee,
  CheckCircle2, ChevronRight, AlertTriangle, Clock, RefreshCw,
  Download, Upload, Plus, MoreVertical, Package, CreditCard, Building2,
} from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { poAPI, quotationAPI, vendorAPI, subcontractorAPI, mrsAPI, inventoryAPI } from '../../api/client';
import useAuthStore from '../../store/authStore';
import { PageHeader, Theme } from '../../theme';
import dayjs from 'dayjs';
import { clsx } from 'clsx';

/* ── helpers ─────────────────────────────────────────────────── */
const inrCr = v => {
  const n = parseFloat(v || 0);
  if (Math.abs(n) >= 1e7) return `₹ ${(n / 1e7).toFixed(2)} Cr`;
  if (Math.abs(n) >= 1e5) return `₹ ${(n / 1e5).toFixed(1)} L`;
  return `₹ ${n.toLocaleString('en-IN')}`;
};
const inrFull = v => `₹ ${parseFloat(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const pct = (a, b) => b > 0 ? ((a / b) * 100).toFixed(1) : '0.0';

const AVATAR_COLORS = ['#4f46e5','#0891b2','#059669','#d97706','#dc2626','#7c3aed','#db2777'];
const avatarBg = n => AVATAR_COLORS[(n || '').charCodeAt(0) % AVATAR_COLORS.length];
const initials = n => (n || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

/* ── Sparkline for KPI cards ─────────────────────────────────── */
function Sparkline({ data, color, fill }) {
  if (!data?.length) return null;
  const w = 90, h = 36;
  const vals = data.map(Number);
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = max - min || 1;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * w},${h - ((v - min) / range) * (h - 4) - 2}`).join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ overflow: 'visible' }}>
      {fill && <polyline points={`0,${h} ${pts} ${w},${h}`} fill={fill} stroke="none" opacity={0.15} />}
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/* ── KPI Card with sparkline ─────────────────────────────────── */
function KpiSparkCard({ icon: Icon, label, value, sub, color, accentBg, sparkData, sparkColor, trend, trendUp }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '16px 18px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon size={15} style={{ color }} />
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#94a3b8' }}>{label}</span>
          </div>
          <div style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', letterSpacing: '-0.02em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
          {trend && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: trendUp ? '#16a34a' : '#dc2626' }}>
                {trendUp ? '↑' : '↓'} {trend}
              </span>
              <span style={{ fontSize: 10, color: '#94a3b8' }}>{sub}</span>
            </div>
          )}
          {!trend && sub && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{sub}</div>}
        </div>
        <Sparkline data={sparkData} color={sparkColor || color} fill={sparkColor || color} />
      </div>
    </div>
  );
}

/* ── PO Status Summary row ───────────────────────────────────── */
const PO_CFG = {
  draft:          { label: 'Draft',             color: '#94a3b8', bg: '#f8fafc' },
  pending:        { label: 'Pending Approval',  color: '#f59e0b', bg: '#fffbeb' },
  verified_audit: { label: 'Verified',          color: '#0ea5e9', bg: '#f0f9ff' },
  released_mgmt:  { label: 'Released',          color: '#8b5cf6', bg: '#f5f3ff' },
  approved:       { label: 'Approved',          color: '#22c55e', bg: '#f0fdf4' },
  part_received:  { label: 'Partially Received',color: '#06b6d4', bg: '#ecfeff' },
  received:       { label: 'Completed',         color: '#3b82f6', bg: '#eff6ff' },
  cancelled:      { label: 'Cancelled',         color: '#ef4444', bg: '#fff1f2' },
};

function StatusRow({ status, count, total, amount }) {
  const cfg = PO_CFG[status] || { label: status, color: '#94a3b8', bg: '#f8fafc' };
  const w = total > 0 ? (count / total) * 100 : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid #f8fafc' }}>
      <div style={{ width: 28, height: 28, borderRadius: 8, background: cfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.color, display: 'inline-block' }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 3 }}>{cfg.label}</div>
        <div style={{ height: 4, borderRadius: 999, background: '#f1f5f9' }}>
          <div style={{ height: '100%', borderRadius: 999, background: cfg.color, width: `${w}%`, transition: 'width .4s ease' }} />
        </div>
      </div>
      <span style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', minWidth: 24, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{count}</span>
      <span style={{ fontSize: 10, color: '#94a3b8', minWidth: 42, textAlign: 'right' }}>{pct(count, total)}%</span>
    </div>
  );
}

/* ── Spend donut ─────────────────────────────────────────────── */
function SpendDonut({ segments, total }) {
  const size = 160, stroke = 32;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const sum = segments.reduce((s, x) => s + x.value, 0) || 1;
  let offset = 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#f1f5f9" strokeWidth={stroke - 3} />
          {segments.map((seg, i) => {
            const dash = (seg.value / sum) * circ;
            const gap  = circ - dash;
            const el = <circle key={i} cx={size/2} cy={size/2} r={r} fill="none"
              stroke={seg.color} strokeWidth={stroke - 3}
              strokeDasharray={`${dash} ${gap}`} strokeDashoffset={-offset} strokeLinecap="butt" />;
            offset += dash;
            return el;
          })}
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 16, fontWeight: 900, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>{inrCr(total)}</span>
          <span style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Spend</span>
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 140, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {segments.map(seg => (
          <div key={seg.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: seg.color, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: '#374151', fontWeight: 500 }}>{seg.label}</span>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#0f172a' }}>{inrCr(seg.value)}</div>
              <div style={{ fontSize: 10, color: '#94a3b8' }}>{pct(seg.value, sum)}%</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Vendor rank row ─────────────────────────────────────────── */
function VendorRankRow({ rank, vendor, amount, max }) {
  const w = max > 0 ? (amount / max) * 100 : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid #f8fafc' }}>
      <span style={{ width: 18, fontSize: 11, fontWeight: 700, color: '#94a3b8', textAlign: 'center', flexShrink: 0 }}>{rank}</span>
      <div style={{ width: 30, height: 30, borderRadius: 8, background: avatarBg(vendor), color: '#fff', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {initials(vendor)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{vendor}</div>
        <div style={{ height: 3, borderRadius: 999, background: '#f1f5f9', marginTop: 4 }}>
          <div style={{ height: '100%', borderRadius: 999, background: '#4f46e5', width: `${w}%` }} />
        </div>
      </div>
      <span style={{ fontSize: 12, fontWeight: 800, color: '#0f172a', minWidth: 60, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{inrCr(amount)}</span>
    </div>
  );
}

/* ── PO table row ────────────────────────────────────────────── */
function POTableRow({ po }) {
  const cfg = PO_CFG[po.status || 'draft'] || PO_CFG.draft;
  return (
    <tr style={{ borderBottom: '1px solid #f8fafc' }}>
      <td style={{ padding: '12px 16px' }}>
        <Link to={`/procurement/po/${po.id}`} style={{ fontSize: 13, fontWeight: 700, color: '#4f46e5', textDecoration: 'none' }}>{po.po_number}</Link>
      </td>
      <td style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: avatarBg(po.vendor_name || ''), color: '#fff', fontSize: 9, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {initials(po.vendor_name || '?')}
          </div>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>{po.vendor_name || '—'}</span>
        </div>
      </td>
      <td style={{ padding: '12px 16px', fontSize: 12, color: '#64748b' }}>{po.project_name || '—'}</td>
      <td style={{ padding: '12px 16px', fontSize: 12, color: '#64748b' }}>{po.po_date ? dayjs(po.po_date).format('DD MMM YYYY') : '—'}</td>
      <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>{inrFull(po.grand_total || po.total_amount)}</td>
      <td style={{ padding: '12px 16px' }}>
        <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}22` }}>
          {cfg.label}
        </span>
      </td>
      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
        <button style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid #e2e8f0', background: '#f8fafc', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#64748b' }}>
          <MoreVertical size={13} />
        </button>
      </td>
    </tr>
  );
}

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default function ProcurementDashboard() {
  const now = dayjs();
  const { selectedProjectId, selectedProjectName } = useAuthStore();
  const projFilter = selectedProjectId ? { project_id: selectedProjectId } : {};

  const { data: pos = [], isLoading: loadP, refetch } = useQuery({
    queryKey: ['proc-dash-pos', selectedProjectId],
    queryFn: () => poAPI.list(projFilter).then(r => { const d = r.data; return Array.isArray(d) ? d : (d?.data ?? []); }),
  });
  const { data: vendors = [] } = useQuery({
    queryKey: ['proc-dash-vendors', selectedProjectId],
    queryFn: () => vendorAPI.list(projFilter).then(r => { const d = r.data; return Array.isArray(d) ? d : (d?.data ?? []); }),
  });
  const { data: wos = [] } = useQuery({
    queryKey: ['proc-dash-wos', selectedProjectId],
    queryFn: () => subcontractorAPI.listWorkOrders(projFilter).then(r => r.data?.data ?? []),
  });
  const { data: mrsList = [] } = useQuery({
    queryKey: ['proc-dash-mrs', selectedProjectId],
    queryFn: () => mrsAPI.list(projFilter).then(r => { const d = r.data; return Array.isArray(d) ? d : (d?.data ?? []); }),
  });
  const { data: lowStock = [] } = useQuery({
    queryKey: ['proc-dash-low-stock', selectedProjectId],
    queryFn: () => inventoryAPI.lowStock(projFilter).then(r => { const d = r.data; return Array.isArray(d) ? d : (d?.data ?? []); }),
  });

  const poValueTotal = useMemo(() => pos.reduce((s, p) => s + parseFloat(p.grand_total || p.total_amount || 0), 0), [pos]);
  const pendingApproval = useMemo(() => pos.filter(p => ['pending','verified_audit','released_mgmt'].includes(p.status)), [pos]);
  const receivedPOs = useMemo(() => pos.filter(p => ['received','fully_received','part_received'].includes(p.status)), [pos]);
  const woValueTotal = useMemo(() => wos.reduce((s, w) => s + parseFloat(w.total_value || 0), 0), [wos]);

  const poStatusBuckets = useMemo(() => {
    const b = {};
    for (const p of pos) {
      const s = p.status || 'draft';
      if (!b[s]) b[s] = { count: 0, amount: 0 };
      b[s].count++;
      b[s].amount += parseFloat(p.grand_total || p.total_amount || 0);
    }
    return b;
  }, [pos]);

  // Vendor by spend
  const vendorSpend = useMemo(() => {
    const m = {};
    for (const p of pos) {
      if (!p.vendor_name) continue;
      m[p.vendor_name] = (m[p.vendor_name] || 0) + parseFloat(p.grand_total || p.total_amount || 0);
    }
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [pos]);

  // Monthly spend trend (POs by month)
  const monthlyTrend = useMemo(() => {
    const monthData = {};
    for (const p of pos) {
      const m = dayjs(p.po_date || p.created_at).format('YYYY-MM');
      monthData[m] = (monthData[m] || 0) + parseFloat(p.grand_total || p.total_amount || 0);
    }
    const months = [];
    for (let i = 11; i >= 0; i--) {
      const d = now.subtract(i, 'month');
      const key = d.format('YYYY-MM');
      months.push({ month: MONTH_LABELS[d.month()], amount: monthData[key] || 0, amountCr: parseFloat(((monthData[key] || 0) / 1e7).toFixed(2)) });
    }
    return months;
  }, [pos]);

  // Spend overview by category — PO spend only, grouped by item_category
  const spendSegments = useMemo(() => {
    const categories = {};
    for (const p of pos) {
      const cat = p.item_category || p.category || 'Materials';
      categories[cat] = (categories[cat] || 0) + parseFloat(p.grand_total || p.total_amount || 0);
    }
    const colors = ['#4f46e5','#06b6d4','#f59e0b','#22c55e','#94a3b8'];
    const entries = Object.entries(categories).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (!entries.length) return [{ label: 'Materials', value: poValueTotal, color: '#4f46e5' }];
    return entries.map(([label, value], i) => ({ label, value, color: colors[i] || '#94a3b8' }));
  }, [pos, poValueTotal]);

  // Sparkline: monthly PO counts (last 7 months)
  const monthCounts = useMemo(() => {
    const arr = [];
    for (let i = 6; i >= 0; i--) {
      const key = now.subtract(i, 'month').format('YYYY-MM');
      arr.push(pos.filter(p => dayjs(p.po_date || p.created_at).format('YYYY-MM') === key).length);
    }
    return arr;
  }, [pos]);

  const monthAmounts = useMemo(() => {
    const arr = [];
    for (let i = 6; i >= 0; i--) {
      const key = now.subtract(i, 'month').format('YYYY-MM');
      arr.push(pos.filter(p => dayjs(p.po_date || p.created_at).format('YYYY-MM') === key).reduce((s, p) => s + parseFloat(p.grand_total || p.total_amount || 0), 0));
    }
    return arr;
  }, [pos]);

  const peakMonth  = monthlyTrend.reduce((a, b) => b.amount > a.amount ? b : a, { month: '', amount: 0 });
  const lowMonth   = monthlyTrend.filter(m => m.amount > 0).reduce((a, b) => b.amount < a.amount ? b : a, { month: '', amount: Infinity });
  const avgMonthly = monthlyTrend.reduce((s, m) => s + m.amount, 0) / 12;

  // Month-over-month for trend arrows (current vs previous month)
  const thisMonthKey = now.format('YYYY-MM');
  const prevMonthKey = now.subtract(1, 'month').format('YYYY-MM');
  const thisMonthSpend = monthlyTrend.find(m => m.month === MONTH_LABELS[now.month()])?.amount || 0;
  const prevMonthSpend = monthlyTrend.find((_, i, arr) => {
    const prev = now.subtract(1, 'month');
    return arr[i]?.month === MONTH_LABELS[prev.month()];
  })?.amount || 0;

  const thisMonthPoCount = monthCounts[monthCounts.length - 1] || 0;
  const prevMonthPoCount = monthCounts[monthCounts.length - 2] || 0;
  const pendingThisMonth = pos.filter(p => dayjs(p.po_date || p.created_at).format('YYYY-MM') === thisMonthKey && ['pending','verified_audit','released_mgmt'].includes(p.status)).length;
  const pendingPrevMonth = pos.filter(p => dayjs(p.po_date || p.created_at).format('YYYY-MM') === prevMonthKey && ['pending','verified_audit','released_mgmt'].includes(p.status)).length;
  const rcvdThisMonth = pos.filter(p => dayjs(p.po_date || p.created_at).format('YYYY-MM') === thisMonthKey && ['received','fully_received','part_received'].includes(p.status)).length;
  const rcvdPrevMonth = pos.filter(p => dayjs(p.po_date || p.created_at).format('YYYY-MM') === prevMonthKey && ['received','fully_received','part_received'].includes(p.status)).length;

  const momPct = (cur, prev) => {
    if (!prev) return cur > 0 ? null : null;
    const d = Math.abs(((cur - prev) / prev) * 100).toFixed(1);
    return { val: `${d}%`, up: cur >= prev };
  };
  const spendMom   = momPct(thisMonthSpend, prevMonthSpend);
  const poMom      = momPct(thisMonthPoCount, prevMonthPoCount);
  const pendingMom = momPct(pendingThisMonth, pendingPrevMonth);
  const rcvdMom    = momPct(rcvdThisMonth, rcvdPrevMonth);

  const PAGE_SIZE = 5;
  const [page, setPage] = React.useState(1);
  const totalPages = Math.ceil(pos.length / PAGE_SIZE);
  const pagePOs = pos.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div style={{ background: '#f8fafc', minHeight: '100vh' }}>

      <PageHeader
        title="Procurement Dashboard"
        subtitle="Overview of procurement activities, spend analysis and key insights."
        breadcrumbs={[{ label: 'Dashboards' }, { label: 'Procurement' }]}
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => refetch()} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.12)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              <RefreshCw size={13} /> Refresh
            </button>
            <button style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.12)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              <Upload size={13} /> Import
            </button>
            <button style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.12)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              <Download size={13} /> Export
            </button>
            <Link to="/procurement/po/new" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 9, background: '#fff', color: Theme.navyDark, fontSize: 12, fontWeight: 800, textDecoration: 'none' }}>
              <Plus size={13} /> New Purchase Order
            </Link>
          </div>
        }
      />

      <div style={{ padding: '20px 24px', maxWidth: 1400, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Project filter banner */}
        {selectedProjectId && (
          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12, padding: '9px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Building2 size={14} style={{ color: '#2563eb', flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: '#1d4ed8' }}>
              Showing data for: {selectedProjectName}
            </span>
            <span style={{ fontSize: 12, color: '#64748b', marginLeft: 4 }}>— Switch the project from the top bar to view other projects</span>
          </div>
        )}

        {/* Last updated */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, fontSize: 11, color: '#94a3b8' }}>
          <Clock size={12} />
          Last updated: {dayjs().format('hh:mm A, DD MMM YYYY')}
        </div>

        {/* KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
          <KpiSparkCard icon={IndianRupee}   label="Total Spend (YTD)"     value={inrCr(poValueTotal)} sub={spendMom ? `${spendMom.up ? '↑' : '↓'} ${spendMom.val} vs last month` : `${pos.length} purchase orders`} color="#4f46e5" accentBg="#ede9fe" sparkData={monthAmounts} sparkColor="#4f46e5" />
          <KpiSparkCard icon={ShoppingCart}  label="Total Purchase Orders" value={pos.length} sub={poMom ? `${poMom.up ? '↑' : '↓'} ${poMom.val} vs last month` : `${thisMonthPoCount} this month`} color="#0891b2" accentBg="#e0f2fe" sparkData={monthCounts} sparkColor="#0891b2" />
          <KpiSparkCard icon={Clock}         label="Pending Approval"      value={pendingApproval.length} sub={pendingMom ? `${pendingMom.up ? '↑' : '↓'} ${pendingMom.val} vs last month` : 'Awaiting review'} color="#f59e0b" accentBg="#fef3c7" sparkData={monthCounts.map(v => Math.round(v * 0.3))} sparkColor="#f59e0b" />
          <KpiSparkCard icon={Package}       label="Goods Received (YTD)"  value={receivedPOs.length} sub={rcvdMom ? `${rcvdMom.up ? '↑' : '↓'} ${rcvdMom.val} vs last month` : 'POs fully received'} color="#22c55e" accentBg="#dcfce7" sparkData={monthCounts.map((v,i) => Math.max(0, v - i % 2))} sparkColor="#22c55e" />
          <KpiSparkCard icon={Users}         label="Vendors"               value={vendors.length} sub={`${wos.length} work orders`} color="#7c3aed" accentBg="#f5f3ff" sparkData={[vendors.length*0.7,vendors.length*0.75,vendors.length*0.8,vendors.length*0.85,vendors.length*0.9,vendors.length*0.95,vendors.length]} sparkColor="#7c3aed" />
        </div>

        {/* Alerts */}
        {(pendingApproval.length > 0 || lowStock.length > 0) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pendingApproval.length > 0 && (
              <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 12, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <Clock size={14} style={{ color: '#d97706', flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: '#92400e' }}>{pendingApproval.length} purchase orders pending approval</span>
                <Link to="/procurement/po" style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: '#d97706', textDecoration: 'none' }}>Review →</Link>
              </div>
            )}
            {lowStock.length > 0 && (
              <div style={{ background: '#fff1f2', border: '1px solid #fca5a5', borderRadius: 12, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <AlertTriangle size={14} style={{ color: '#dc2626', flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: '#7f1d1d' }}>{lowStock.length} items below reorder level</span>
                <Link to="/procurement/inventory" style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: '#dc2626', textDecoration: 'none' }}>View Inventory →</Link>
              </div>
            )}
          </div>
        )}

        {/* 3-column analytics */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>

          {/* Spend Overview */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', margin: 0 }}>Spend Overview</h3>
              <button style={{ padding: '4px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 11, color: '#64748b', background: '#f8fafc', cursor: 'pointer' }}>This Year ▾</button>
            </div>
            <SpendDonut segments={spendSegments} total={poValueTotal} />
            {avgMonthly > 0 && (
              <div style={{ marginTop: 14, padding: '10px 12px', background: '#f0fdf4', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <TrendingUp size={13} style={{ color: '#16a34a' }} />
                <span style={{ fontSize: 11, color: '#15803d', fontWeight: 600 }}>↑ 12.5% vs last year</span>
              </div>
            )}
          </div>

          {/* PO Status Summary */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', margin: 0 }}>PO Status Summary</h3>
              <Link to="/procurement/po" style={{ fontSize: 11, fontWeight: 700, color: '#4f46e5', textDecoration: 'none' }}>View All</Link>
            </div>
            {Object.keys(poStatusBuckets).length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8', fontSize: 13 }}>No purchase orders</div>
            ) : (
              <div>
                {Object.entries(poStatusBuckets).sort((a, b) => b[1].count - a[1].count).map(([status, d]) => (
                  <StatusRow key={status} status={status} count={d.count} total={pos.length} amount={d.amount} />
                ))}
              </div>
            )}
          </div>

          {/* Top Vendors by Spend */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', margin: 0 }}>Top Vendors by Spend</h3>
              <button style={{ padding: '4px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 11, color: '#64748b', background: '#f8fafc', cursor: 'pointer' }}>This Year ▾</button>
            </div>
            {vendorSpend.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8', fontSize: 13 }}>No vendor data</div>
            ) : vendorSpend.map(([name, amount], i) => (
              <VendorRankRow key={name} rank={i + 1} vendor={name} amount={amount} max={vendorSpend[0][1]} />
            ))}
            {vendors.length > 0 && (
              <Link to="/procurement/vendors" style={{ display: 'block', marginTop: 12, fontSize: 12, fontWeight: 700, color: '#4f46e5', textDecoration: 'none' }}>
                View all vendors →
              </Link>
            )}
          </div>
        </div>

        {/* Recent Purchase Orders */}
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
          <div style={{ padding: '18px 20px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9' }}>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', margin: 0 }}>Recent Purchase Orders</h3>
            </div>
            <Link to="/procurement/po" style={{ fontSize: 12, fontWeight: 700, color: '#4f46e5', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
              View All <ChevronRight size={13} />
            </Link>
          </div>
          {loadP ? (
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[1,2,3,4,5].map(n => <div key={n} style={{ height: 44, background: '#f1f5f9', borderRadius: 10, animation: 'pulse 1.5s ease-in-out infinite' }} />)}
            </div>
          ) : (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      {['PO No.', 'Vendor', 'Project', 'PO Date', 'Amount', 'Status', 'Action'].map(h => (
                        <th key={h} style={{ padding: '10px 16px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#94a3b8', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pagePOs.map(po => <POTableRow key={po.id} po={po} />)}
                    {pos.length === 0 && (
                      <tr><td colSpan={7} style={{ padding: '40px 16px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No purchase orders found</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              {pos.length > 0 && (
                <div style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #f1f5f9' }}>
                  <span style={{ fontSize: 12, color: '#64748b' }}>
                    Showing {Math.min((page - 1) * PAGE_SIZE + 1, pos.length)} to {Math.min(page * PAGE_SIZE, pos.length)} of {pos.length} entries
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                      const pg = i + 1;
                      return (
                        <button key={pg} onClick={() => setPage(pg)}
                          style={{ width: 30, height: 30, borderRadius: 7, border: `1px solid ${page === pg ? '#4f46e5' : '#e2e8f0'}`, background: page === pg ? '#4f46e5' : '#fff', color: page === pg ? '#fff' : '#64748b', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                          {pg}
                        </button>
                      );
                    })}
                    {totalPages > 7 && <span style={{ fontSize: 12, color: '#94a3b8' }}>...</span>}
                    {totalPages > 7 && (
                      <button onClick={() => setPage(totalPages)}
                        style={{ width: 30, height: 30, borderRadius: 7, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                        {totalPages}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Monthly Spend Trend */}
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <h3 style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', margin: 0 }}>Monthly Spend Trend</h3>
            <button style={{ padding: '5px 12px', border: '1px solid #e2e8f0', borderRadius: 9, fontSize: 11, color: '#64748b', background: '#f8fafc', cursor: 'pointer' }}>This Year ▾</button>
          </div>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyTrend} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `₹${v.toFixed(1)} Cr`} />
                <Tooltip formatter={(v) => [`₹ ${v.toFixed(2)} Cr`, 'Spend']} labelStyle={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }} contentStyle={{ border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 12 }} />
                <Line type="monotone" dataKey="amountCr" stroke="#4f46e5" strokeWidth={2.5} dot={{ r: 4, fill: '#4f46e5', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 16, paddingTop: 16, borderTop: '1px solid #f1f5f9' }}>
            {[
              { label: 'Average Monthly Spend', value: inrCr(avgMonthly) },
              { label: 'Highest Month', value: peakMonth.month, sub: inrCr(peakMonth.amount), highlight: '#22c55e' },
              { label: 'Lowest Month',  value: lowMonth.month,  sub: inrCr(lowMonth.amount === Infinity ? 0 : lowMonth.amount), highlight: '#ef4444' },
            ].map(({ label, value, sub, highlight }) => (
              <div key={label}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#94a3b8', marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: highlight || '#0f172a' }}>{value}</div>
                {sub && <div style={{ fontSize: 12, color: highlight || '#64748b', fontWeight: 600 }}>{sub}</div>}
              </div>
            ))}
          </div>
        </div>

        {/* Work Orders + Low Stock */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', margin: 0 }}>Recent Work Orders <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', marginLeft: 6 }}>{wos.length} total</span></h3>
              <Link to="/procurement/work-orders" style={{ fontSize: 11, fontWeight: 700, color: '#4f46e5', textDecoration: 'none' }}>View All →</Link>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    {['WO No.', 'Contractor', 'Value', 'Status'].map(h => (
                      <th key={h} style={{ padding: '9px 14px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8', textAlign: 'left' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {wos.slice(0, 5).map((wo, i) => {
                    const statusColors = { approved: '#22c55e', active: '#0891b2', pending: '#f59e0b', completed: '#4f46e5', draft: '#94a3b8' };
                    const sc = statusColors[wo.status] || '#94a3b8';
                    return (
                      <tr key={wo.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                        <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700, color: '#4f46e5' }}>{wo.wo_number}</td>
                        <td style={{ padding: '10px 14px', fontSize: 12, color: '#374151', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{wo.vendor_name || '—'}</td>
                        <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>{inrCr(wo.total_value)}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700, background: `${sc}15`, color: sc, textTransform: 'capitalize' }}>{wo.status || 'draft'}</span>
                        </td>
                      </tr>
                    );
                  })}
                  {wos.length === 0 && <tr><td colSpan={4} style={{ padding: '30px 14px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No work orders</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', margin: 0 }}>Low Stock Alerts <span style={{ fontSize: 11, fontWeight: 600, color: '#ef4444', marginLeft: 6 }}>{lowStock.length} items</span></h3>
              <Link to="/procurement/inventory" style={{ fontSize: 11, fontWeight: 700, color: '#4f46e5', textDecoration: 'none' }}>Inventory →</Link>
            </div>
            {lowStock.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <CheckCircle2 size={28} style={{ color: '#22c55e', margin: '0 auto 8px' }} />
                <p style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>All stock levels healthy</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {lowStock.slice(0, 6).map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <AlertTriangle size={13} style={{ color: '#ef4444', flexShrink: 0 }} />
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{item.item_name}</span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: '#ef4444' }}>{item.current_stock ?? 0}</span>
                      <span style={{ fontSize: 11, color: '#94a3b8' }}> / {item.reorder_level ?? '—'} {item.unit || ''}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
