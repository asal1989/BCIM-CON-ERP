// src/pages/sc/SCDashboard.jsx — Work Order Dashboard (redesigned to match Procurement Dashboard)
import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import useAuthStore from '../../store/authStore';
import { Link } from 'react-router-dom';
import {
  Users, Briefcase, Receipt, IndianRupee, AlertTriangle,
  Clock, CheckCircle2, TrendingUp, ChevronRight, Building2,
  Wallet, RefreshCw, Download, Upload, Plus, MoreVertical,
  CalendarDays, HardHat,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { scAPI, projectAPI } from '../../api/client';
import { PageHeader, Theme } from '../../theme';
import dayjs from 'dayjs';

/* ── helpers ─────────────────────────────────────────────────── */
const inrCr = v => {
  const n = parseFloat(v || 0);
  if (Math.abs(n) >= 1e7) return `₹ ${(n / 1e7).toFixed(2)} Cr`;
  if (Math.abs(n) >= 1e5) return `₹ ${(n / 1e5).toFixed(1)} L`;
  return `₹ ${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
};
const inrFull = v => `₹ ${parseFloat(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pctOf = (a, b) => b > 0 ? ((a / b) * 100).toFixed(1) : '0.0';

const AVATAR_COLORS = ['#f97316','#0891b2','#4f46e5','#059669','#dc2626','#7c3aed','#db2777','#d97706'];
const avatarBg = n => AVATAR_COLORS[(n || '').charCodeAt(0) % AVATAR_COLORS.length];
const initials = n => (n || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/* ── WO status config ────────────────────────────────────────── */
const WO_CFG = {
  draft:      { label: 'Draft',                 color: '#94a3b8', bg: '#f8fafc' },
  pending:    { label: 'Pending',               color: '#f59e0b', bg: '#fffbeb' },
  submitted:  { label: 'Procurement Approved',  color: '#0ea5e9', bg: '#f0f9ff' },
  approved:   { label: 'MD Authorized',         color: '#22c55e', bg: '#f0fdf4' },
  active:     { label: 'Active',                color: '#06b6d4', bg: '#ecfeff' },
  completed:  { label: 'Completed',             color: '#4f46e5', bg: '#eff6ff' },
  terminated: { label: 'Terminated',            color: '#ef4444', bg: '#fff1f2' },
  closed:     { label: 'Closed',                color: '#64748b', bg: '#f8fafc' },
  rejected:   { label: 'Rejected',              color: '#ef4444', bg: '#fff1f2' },
};

const BILL_CFG = {
  draft:        { color: '#94a3b8', bg: '#f8fafc' },
  submitted:    { color: '#f59e0b', bg: '#fffbeb' },
  under_review: { color: '#0ea5e9', bg: '#f0f9ff' },
  approved:     { color: '#22c55e', bg: '#f0fdf4' },
  paid:         { color: '#16a34a', bg: '#f0fdf4' },
  rejected:     { color: '#ef4444', bg: '#fff1f2' },
};

/* ── Sparkline ───────────────────────────────────────────────── */
function Sparkline({ data, color }) {
  if (!data?.length) return null;
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
          {sub && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 5 }}>{sub}</div>}
        </div>
        <Sparkline data={sparkData} color={color} />
      </div>
    </div>
  );
}

/* ── WO Status Summary row ───────────────────────────────────── */
function StatusRow({ status, count, total }) {
  const cfg = WO_CFG[status] || { label: status, color: '#94a3b8', bg: '#f8fafc' };
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
      <span style={{ fontSize: 10, color: '#94a3b8', minWidth: 42, textAlign: 'right' }}>{pctOf(count, total)}%</span>
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
          <span style={{ fontSize: 15, fontWeight: 900, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>{inrCr(total)}</span>
          <span style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Value</span>
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 140, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {segments.map(seg => (
          <div key={seg.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: seg.color, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: '#374151', fontWeight: 500 }}>{seg.label}</span>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#0f172a' }}>{inrCr(seg.value)}</div>
              <div style={{ fontSize: 10, color: '#94a3b8' }}>{pctOf(seg.value, sum)}%</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Contractor rank row ─────────────────────────────────────── */
function ContractorRankRow({ rank, name, amount, max }) {
  const w = max > 0 ? (amount / max) * 100 : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid #f8fafc' }}>
      <span style={{ width: 18, fontSize: 11, fontWeight: 700, color: '#94a3b8', textAlign: 'center', flexShrink: 0 }}>{rank}</span>
      <div style={{ width: 30, height: 30, borderRadius: 8, background: avatarBg(name), color: '#fff', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {initials(name)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
        <div style={{ height: 3, borderRadius: 999, background: '#f1f5f9', marginTop: 4 }}>
          <div style={{ height: '100%', borderRadius: 999, background: '#f97316', width: `${w}%` }} />
        </div>
      </div>
      <span style={{ fontSize: 12, fontWeight: 800, color: '#0f172a', minWidth: 60, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{inrCr(amount)}</span>
    </div>
  );
}

/* ── WO table row ────────────────────────────────────────────── */
function WOTableRow({ wo }) {
  const cfg = WO_CFG[wo.status || 'draft'] || WO_CFG.draft;
  return (
    <tr style={{ borderBottom: '1px solid #f8fafc' }}>
      <td style={{ padding: '12px 16px' }}>
        <Link to="/sc/work-orders" style={{ fontSize: 13, fontWeight: 700, color: '#f97316', textDecoration: 'none' }}>{wo.wo_number}</Link>
      </td>
      <td style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: avatarBg(wo.sc_name || wo.vendor_name || ''), color: '#fff', fontSize: 9, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {initials(wo.sc_name || wo.vendor_name || '?')}
          </div>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>{wo.sc_name || wo.vendor_name || '—'}</span>
        </div>
      </td>
      <td style={{ padding: '12px 16px', fontSize: 12, color: '#64748b' }}>{wo.project_name || '—'}</td>
      <td style={{ padding: '12px 16px', fontSize: 12, color: '#64748b' }}>{wo.wo_date ? dayjs(wo.wo_date).format('DD MMM YYYY') : '—'}</td>
      <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>{inrFull(wo.total_value)}</td>
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

export default function SCDashboard() {
  const now = dayjs();
  const { selectedProjectId, selectedProjectName } = useAuthStore();
  const projFilter = selectedProjectId ? { project_id: selectedProjectId } : {};

  const { data: dash, isLoading, refetch } = useQuery({
    queryKey: ['sc-dashboard', selectedProjectId],
    queryFn: () => scAPI.dashboard({ project_id: selectedProjectId || undefined }).then(r => r.data?.data ?? r.data ?? {}),
    staleTime: 0, refetchOnMount: 'always',
  });

  const d   = dash || {};
  const wo  = d.work_orders || {};
  const fin = d.financials  || {};
  const sc  = d.subcontractors || {};
  const adv = d.advances    || {};
  const recentWOs   = d.recent_work_orders || [];
  const recentBills = d.recent_bills || [];
  const billStatus  = d.bill_status  || [];
  const byProject   = d.by_project   || [];

  const contractValue  = parseFloat(wo.total_value || 0);
  const totalBilled    = parseFloat(fin.total_billed    || 0);
  const totalPaid      = parseFloat(fin.total_paid      || 0);
  const outstanding    = parseFloat(fin.outstanding     || 0);
  const retentionHeld  = parseFloat(fin.retention_held  || 0);
  const advancePaid    = parseFloat(adv.total_paid      || 0);
  const advanceBalance = parseFloat(adv.balance         || 0);

  // WO status buckets from recent WOs
  const woStatusBuckets = useMemo(() => {
    const b = {};
    for (const w of recentWOs) {
      const s = w.status || 'draft';
      if (!b[s]) b[s] = 0;
      b[s]++;
    }
    // Also use dashboard counts if available
    if (wo.active   && !b.active)    b.active    = wo.active;
    if (wo.pending  && !b.pending)   b.pending   = wo.pending;
    if (wo.approved && !b.approved)  b.approved  = wo.approved;
    return b;
  }, [recentWOs, wo]);

  const totalWOCount = Object.values(woStatusBuckets).reduce((s, v) => s + v, 0) || wo.total || 0;

  // Bill status buckets
  const billBuckets = useMemo(() => {
    const m = {};
    for (const r of billStatus) {
      m[r.status] = { count: parseInt(r.count || 0), amount: parseFloat(r.amount || 0) };
    }
    return m;
  }, [billStatus]);
  const totalBillCount = Object.values(billBuckets).reduce((s, v) => s + v.count, 0);

  // Spend donut by project
  const spendSegments = useMemo(() => {
    const colors = ['#f97316','#4f46e5','#0891b2','#22c55e','#94a3b8'];
    const rows = [...byProject].sort((a, b) => b.contract_value - a.contract_value).slice(0, 5);
    if (!rows.length && contractValue > 0) return [{ label: 'Total', value: contractValue, color: '#f97316' }];
    return rows.map((p, i) => ({ label: p.project_name || `Project ${i+1}`, value: parseFloat(p.contract_value || 0), color: colors[i] || '#94a3b8' }));
  }, [byProject, contractValue]);

  // Top contractors by WO value
  const contractorSpend = useMemo(() => {
    const m = {};
    for (const w of recentWOs) {
      const name = w.sc_name || w.vendor_name;
      if (!name) continue;
      m[name] = (m[name] || 0) + parseFloat(w.total_value || 0);
    }
    // Fill from byProject contractor data if available
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [recentWOs]);

  // Monthly billing trend
  const monthlyTrend = useMemo(() => {
    const monthData = {};
    for (const b of recentBills) {
      const m = dayjs(b.bill_date || b.created_at).format('YYYY-MM');
      monthData[m] = (monthData[m] || 0) + parseFloat(b.net_payable || 0);
    }
    const months = [];
    for (let i = 11; i >= 0; i--) {
      const d = now.subtract(i, 'month');
      const key = d.format('YYYY-MM');
      months.push({ month: MONTH_LABELS[d.month()], amountCr: parseFloat(((monthData[key] || 0) / 1e7).toFixed(2)), amount: monthData[key] || 0 });
    }
    return months;
  }, [recentBills]);

  // Sparkline data
  const monthlyWOCounts = useMemo(() => {
    const arr = [];
    for (let i = 6; i >= 0; i--) {
      const key = now.subtract(i, 'month').format('YYYY-MM');
      arr.push(recentWOs.filter(w => dayjs(w.wo_date || w.created_at).format('YYYY-MM') === key).length);
    }
    return arr.length ? arr : [0, 1, 0, 1, 1, 0, (wo.total || 0)];
  }, [recentWOs, wo.total]);

  const monthlyBillAmounts = useMemo(() => monthlyTrend.slice(-7).map(m => m.amount), [monthlyTrend]);

  const peakMonth  = monthlyTrend.reduce((a, b) => b.amount > a.amount ? b : a, { month: '', amount: 0 });
  const lowMonth   = monthlyTrend.filter(m => m.amount > 0).reduce((a, b) => b.amount < a.amount ? b : a, { month: '', amount: Infinity });
  const avgMonthly = monthlyTrend.reduce((s, m) => s + m.amount, 0) / 12;

  const pendingApprovalCount = (billStatus.find(r => r.status === 'submitted')?.count || 0)
                             + (billStatus.find(r => r.status === 'under_review')?.count || 0);

  const PAGE_SIZE = 5;
  const [page, setPage] = React.useState(1);
  const totalPages = Math.ceil(recentWOs.length / PAGE_SIZE);
  const pageWOs = recentWOs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div style={{ background: '#f8fafc', minHeight: '100vh' }}>

      <PageHeader
        title="Work Order Dashboard"
        subtitle="Overview of subcontractor work orders, billing, payments & retention."
        breadcrumbs={[{ label: 'Subcontractors' }, { label: 'Dashboard' }]}
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => refetch()} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.12)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              <RefreshCw size={13} /> Refresh
            </button>
            <Link to="/sc/bill-preparation" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.12)', color: '#fff', fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
              <Receipt size={13} /> Raise Bill
            </Link>
            <Link to="/sc/work-orders" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 9, background: '#fff', color: Theme.navyDark, fontSize: 12, fontWeight: 800, textDecoration: 'none' }}>
              <Plus size={13} /> New Work Order
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
            <span style={{ fontSize: 12, color: '#64748b', marginLeft: 4 }}>— Switch the project from the top bar to view others</span>
          </div>
        )}

        {/* Last updated */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, fontSize: 11, color: '#94a3b8' }}>
          <Clock size={12} /> Last updated: {dayjs().format('hh:mm A, DD MMM YYYY')}
        </div>

        {/* KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
          <KpiSparkCard icon={IndianRupee}   label="Contract Value (WO)"  value={inrCr(contractValue)}  color="#f97316" accentBg="#fff7ed" sparkData={monthlyWOCounts.map(v => v * (contractValue / (totalWOCount || 1)))} sub={`${wo.total || 0} work orders`} />
          <KpiSparkCard icon={Receipt}       label="Total Billed"         value={inrCr(totalBilled)}    color="#4f46e5" accentBg="#ede9fe" sparkData={monthlyBillAmounts} sub={`${totalBillCount} SC bills`} />
          <KpiSparkCard icon={Wallet}        label="Amount Paid"          value={inrCr(totalPaid)}      color="#22c55e" accentBg="#dcfce7" sparkData={monthlyBillAmounts.map(v => v * 0.8)} sub={`${pctOf(totalPaid, totalBilled)}% of billed`} />
          <KpiSparkCard icon={AlertTriangle} label="Outstanding"          value={inrCr(outstanding)}    color="#f59e0b" accentBg="#fef3c7" sparkData={[outstanding*0.6,outstanding*0.7,outstanding*0.8,outstanding*0.9,outstanding,outstanding*0.95,outstanding]} sub="Approved, unpaid" />
          <KpiSparkCard icon={Users}         label="Subcontractors"       value={sc.active || sc.total || 0} color="#0891b2" accentBg="#e0f2fe" sparkData={[sc.total*0.7,sc.total*0.8,sc.total*0.85,sc.total*0.9,sc.active,sc.active,sc.active||sc.total||0]} sub={`${sc.total || 0} total registered`} />
        </div>

        {/* Alerts */}
        {(outstanding > 0 || pendingApprovalCount > 0) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {outstanding > 0 && (
              <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 12, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <AlertTriangle size={14} style={{ color: '#d97706', flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: '#92400e' }}>{inrCr(outstanding)} outstanding — {Math.round(100 - parseFloat(pctOf(totalPaid, totalBilled)))}% of billed pending payment</span>
                <Link to="/sc/payments" style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: '#d97706', textDecoration: 'none' }}>Record Payment →</Link>
              </div>
            )}
            {pendingApprovalCount > 0 && (
              <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <Clock size={14} style={{ color: '#2563eb', flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: '#1e40af' }}>{pendingApprovalCount} SC bill{pendingApprovalCount > 1 ? 's' : ''} pending approval</span>
                <Link to="/sc/bill-approval" style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: '#2563eb', textDecoration: 'none' }}>Review →</Link>
              </div>
            )}
          </div>
        )}

        {/* 3-column analytics */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>

          {/* WO Value by Project (Spend Overview) */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', margin: 0 }}>WO Value by Project</h3>
            </div>
            {spendSegments.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8', fontSize: 13 }}>No data</div>
            ) : (
              <SpendDonut segments={spendSegments} total={contractValue} />
            )}
            <div style={{ marginTop: 14, padding: '10px 12px', background: '#fff7ed', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
              <TrendingUp size={13} style={{ color: '#ea580c' }} />
              <span style={{ fontSize: 11, color: '#c2410c', fontWeight: 600 }}>
                {pctOf(totalBilled, contractValue)}% of contract value billed
              </span>
            </div>
          </div>

          {/* WO Status Summary */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', margin: 0 }}>WO Status Summary</h3>
              <Link to="/sc/work-orders" style={{ fontSize: 11, fontWeight: 700, color: '#f97316', textDecoration: 'none' }}>View All</Link>
            </div>
            {Object.keys(woStatusBuckets).length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8', fontSize: 13 }}>No work orders</div>
            ) : (
              <div>
                {Object.entries(woStatusBuckets).sort((a, b) => b[1] - a[1]).map(([status, count]) => (
                  <StatusRow key={status} status={status} count={count} total={totalWOCount} />
                ))}
              </div>
            )}
          </div>

          {/* Top Contractors by WO Value */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', margin: 0 }}>Top Contractors by Value</h3>
            </div>
            {contractorSpend.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8', fontSize: 13 }}>No contractor data</div>
            ) : contractorSpend.map(([name, amount], i) => (
              <ContractorRankRow key={name} rank={i + 1} name={name} amount={amount} max={contractorSpend[0][1]} />
            ))}
            <Link to="/sc/work-orders" style={{ display: 'block', marginTop: 12, fontSize: 12, fontWeight: 700, color: '#f97316', textDecoration: 'none' }}>
              View all contractors →
            </Link>
          </div>
        </div>

        {/* Recent Work Orders table */}
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
          <div style={{ padding: '18px 20px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9' }}>
            <h3 style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', margin: 0 }}>Recent Work Orders</h3>
            <Link to="/sc/work-orders" style={{ fontSize: 12, fontWeight: 700, color: '#f97316', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
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
                      {['WO No.', 'Contractor', 'Project', 'WO Date', 'Value', 'Status', 'Action'].map(h => (
                        <th key={h} style={{ padding: '10px 16px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#94a3b8', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pageWOs.map(wo => <WOTableRow key={wo.id} wo={wo} />)}
                    {recentWOs.length === 0 && (
                      <tr><td colSpan={7} style={{ padding: '40px 16px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                        No work orders — <Link to="/sc/work-orders" style={{ color: '#f97316', fontWeight: 700, textDecoration: 'none' }}>create one</Link>
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              {recentWOs.length > PAGE_SIZE && (
                <div style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #f1f5f9' }}>
                  <span style={{ fontSize: 12, color: '#64748b' }}>
                    Showing {Math.min((page-1)*PAGE_SIZE+1, recentWOs.length)} to {Math.min(page*PAGE_SIZE, recentWOs.length)} of {recentWOs.length}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                      const pg = i + 1;
                      return (
                        <button key={pg} onClick={() => setPage(pg)}
                          style={{ width: 30, height: 30, borderRadius: 7, border: `1px solid ${page===pg?'#f97316':'#e2e8f0'}`, background: page===pg?'#f97316':'#fff', color: page===pg?'#fff':'#64748b', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                          {pg}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Monthly Billing Trend + Bill Status */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>

          {/* Monthly Trend */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h3 style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', margin: 0 }}>Monthly Billing Trend</h3>
            </div>
            <div style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthlyTrend} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `₹${v.toFixed(1)} Cr`} />
                  <Tooltip formatter={v => [`₹ ${v.toFixed(2)} Cr`, 'Billed']} labelStyle={{ fontSize: 12, fontWeight: 700 }} contentStyle={{ border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 12 }} />
                  <Line type="monotone" dataKey="amountCr" stroke="#f97316" strokeWidth={2.5} dot={{ r: 4, fill: '#f97316', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 16, paddingTop: 16, borderTop: '1px solid #f1f5f9' }}>
              {[
                { label: 'Avg Monthly Billing', value: inrCr(avgMonthly) },
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

          {/* Bill Status + Finance Summary */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
            <h3 style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', margin: '0 0 16px' }}>Financial Summary</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {[
                { label: 'Contract Value',   value: inrCr(contractValue),   color: '#f97316' },
                { label: 'Total Billed',     value: inrCr(totalBilled),     color: '#4f46e5' },
                { label: 'Amount Paid',      value: inrCr(totalPaid),       color: '#22c55e' },
                { label: 'Outstanding',      value: inrCr(outstanding),     color: outstanding > 0 ? '#f59e0b' : '#94a3b8' },
                { label: 'Retention Held',   value: inrCr(retentionHeld),   color: '#64748b' },
                { label: 'Advance Paid',     value: inrCr(advancePaid),     color: '#7c3aed' },
                { label: 'Advance Balance',  value: inrCr(advanceBalance),  color: advanceBalance > 0 ? '#f59e0b' : '#22c55e' },
              ].map(({ label, value, color }, i, arr) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderBottom: i < arr.length-1 ? '1px solid #f8fafc' : 'none' }}>
                  <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>{label}</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
                </div>
              ))}
            </div>
            <Link to="/sc/bill-approval" style={{ display: 'block', marginTop: 16, textAlign: 'center', padding: '9px 0', borderRadius: 10, background: '#fff7ed', color: '#ea580c', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>
              View all bills →
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
}
