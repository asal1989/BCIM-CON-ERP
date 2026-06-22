// src/pages/DashboardProfessional.jsx
// Enterprise-style executive dashboard organised by department.
// Neutral palette, dense KPI strip, section-based layout with tables + charts per department.
import React, { Suspense, lazy, useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell, Legend,
} from 'recharts';
import {
  Building2, Wallet, Receipt, Clock, ShieldCheck, HardHat,
  Package, FileText, AlertTriangle, RefreshCw, ChevronRight,
  TrendingUp, FileWarning, ClipboardList, Users, CheckCircle2,
  ArrowUpRight, ArrowDownRight, Activity, FileSpreadsheet,
} from 'lucide-react';
import { projectAPI, analyticsAPI, tqsBillsAPI } from '../api/client';
import useAuthStore from '../store/authStore';
import { useLanguage } from '../context/LanguageContext';
import dayjs from 'dayjs';

const PMDashboard           = lazy(() => import('./dashboards/PMDashboard'));
const SiteEngineerDashboard = lazy(() => import('./dashboards/SiteEngineerDashboard'));
const QSDashboard           = lazy(() => import('./dashboards/QSDashboard'));
const AccountsDashboard     = lazy(() => import('./dashboards/AccountsDashboard'));
const HRDashboard           = lazy(() => import('./dashboards/HRDashboard'));
const HSEDashboard          = lazy(() => import('./dashboards/HSEDashboard'));
const StoresDashboard       = lazy(() => import('./dashboards/StoresDashboard'));
const ProcurementDashboard  = lazy(() => import('./dashboards/ProcurementDashboard'));
const ApprovalsPage         = lazy(() => import('./approvals/ApprovalsPage'));

const MD_DASHBOARD_ROLES  = ['md', 'managing_director'];
const MD_DASHBOARD_EMAILS = ['stephen@bcim.in', 'it@bcim.in'];
const isMDDashboardUser = (u) => {
  if (!u) return false;
  const r = String(u.role || '').toLowerCase();
  return MD_DASHBOARD_ROLES.includes(r)
    || ['admin', 'super_admin'].includes(r)
    || MD_DASHBOARD_EMAILS.includes((u.email || '').toLowerCase());
};

const STATUS_COLORS = ['#1e40af', '#0e7490', '#16a34a', '#b45309', '#b91c1c'];

// ─── Helpers ───────────────────────────────────────────────────────────────
const inr = (v) => `₹${(parseFloat(v) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const inrCompact = (v) => {
  const n = Math.abs(parseFloat(v) || 0);
  const sign = (parseFloat(v) || 0) < 0 ? '-' : '';
  if (n >= 1e7)  return `${sign}₹${(n / 1e7).toFixed(n >= 1e8 ? 1 : 2)} Cr`;
  if (n >= 1e5)  return `${sign}₹${(n / 1e5).toFixed(n >= 1e6 ? 1 : 2)} L`;
  if (n >= 1e3)  return `${sign}₹${(n / 1e3).toFixed(1)} K`;
  return `${sign}₹${n.toFixed(0)}`;
};

const num = (v) => (parseFloat(v) || 0).toLocaleString('en-IN');

const relTime = (date) => {
  if (!date) return '—';
  const diff = Math.max(0, (Date.now() - new Date(date).getTime()) / 1000);
  if (diff < 5)    return 'just now';
  if (diff < 60)   return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`;
  return `${Math.floor(diff / 86400)} d ago`;
};

const toArray = (r) => Array.isArray(r?.data) ? r.data : (Array.isArray(r?.data?.data) ? r.data?.data : []);

const getRangeBounds = (range) => {
  if (range === 'all') return { dateFrom: null, dateTo: null };
  const now = dayjs();
  const map = { '7d': 6, '30d': 29, '90d': 89, '1y': 364 };
  const days = map[range] ?? 29;
  return { dateFrom: now.subtract(days, 'day').format('YYYY-MM-DD'), dateTo: now.format('YYYY-MM-DD') };
};

function DashLoader() {
  return (
    <div className="prof-loader">
      <div className="prof-spinner" />
      <span>Loading dashboard…</span>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="prof-tooltip">
      {label && <div className="prof-tooltip-label">{label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="prof-tooltip-row">
          <span className="prof-tooltip-dot" style={{ background: p.color }} />
          <span className="prof-tooltip-name">{p.name}</span>
          <span className="prof-tooltip-val">{typeof p.value === 'number' && Math.abs(p.value) >= 1000 ? inrCompact(p.value) : p.value}</span>
        </div>
      ))}
    </div>
  );
};

// ─── Small components ──────────────────────────────────────────────────────
const KPI_TONES = {
  default: { c: '#0f172a', accent: '#475569', glow: 'rgba(71,85,105,0.15)' },
  primary: { c: '#1e40af', accent: '#1e40af', glow: 'rgba(30,64,175,0.18)' },
  success: { c: '#15803d', accent: '#15803d', glow: 'rgba(21,128,61,0.18)' },
  warning: { c: '#b45309', accent: '#b45309', glow: 'rgba(180,83,9,0.18)' },
  danger:  { c: '#b91c1c', accent: '#b91c1c', glow: 'rgba(185,28,28,0.18)' },
  neutral: { c: '#475569', accent: '#94a3b8', glow: 'rgba(148,163,184,0.15)' },
};

function KPI({ label, value, sub, tone = 'default', icon: Icon, to, isCurrency = false, deltaPct, loading = false }) {
  const t = KPI_TONES[tone] || KPI_TONES.default;
  const ref = useRef(null);
  const rotX = useMotionValue(0);
  const rotY = useMotionValue(0);
  const shadowX = useMotionValue(0);
  const shadowY = useMotionValue(8);
  const springX = useSpring(rotX, { stiffness: 250, damping: 22 });
  const springY = useSpring(rotY, { stiffness: 250, damping: 22 });
  const shX = useSpring(shadowX, { stiffness: 250, damping: 22 });
  const shY = useSpring(shadowY, { stiffness: 250, damping: 22 });

  const handleMove = (e) => {
    const el = ref.current; if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;  // 0..1
    const py = (e.clientY - rect.top)  / rect.height; // 0..1
    rotX.set((py - 0.5) * -6);   // tilt up/down
    rotY.set((px - 0.5) *  6);   // tilt left/right
    shadowX.set((px - 0.5) * -10);
    shadowY.set(14 + (py - 0.5) * 4);
  };
  const handleLeave = () => { rotX.set(0); rotY.set(0); shadowX.set(0); shadowY.set(8); };

  const inner = (
    <motion.div
      ref={ref}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      className="prof-kpi-3d"
      style={{
        rotateX: springX,
        rotateY: springY,
        boxShadow: useTransform([shX, shY], ([x, y]) =>
          `${x}px ${y}px 24px -8px ${t.glow}, 0 1px 2px rgba(15,23,42,0.06), 0 0 0 1px rgba(15,23,42,0.04)`
        ),
        transformStyle: 'preserve-3d',
      }}
    >
      {/* Top highlight line for "etched" look */}
      <div className="prof-kpi-3d-highlight" />
      {/* Bottom accent bar (tone color) */}
      <div className="prof-kpi-3d-accent" style={{ background: `linear-gradient(90deg, ${t.accent}, ${t.accent}66)` }} />

      <div className="prof-kpi" style={{ transform: 'translateZ(0)' }}>
        <div className="prof-kpi-head">
          <span className="prof-kpi-label">{label}</span>
          {Icon && (
            <div className="prof-kpi-icon" style={{ background: `${t.accent}15`, color: t.accent }}>
              <Icon size={12} strokeWidth={2.2} />
            </div>
          )}
        </div>
        {loading ? <div className="prof-kpi-skeleton" /> : (
          <>
            <div className="prof-kpi-value" style={{ color: t.c }} title={isCurrency && typeof value === 'number' ? inr(value) : undefined}>
              {isCurrency && typeof value === 'number' ? inrCompact(value) : (typeof value === 'number' ? num(value) : value)}
            </div>
            {(sub || deltaPct != null) && (
              <div className="prof-kpi-sub">
                {deltaPct != null && (
                  <span className={`prof-delta ${deltaPct >= 0 ? 'up' : 'down'}`}>
                    {deltaPct >= 0 ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
                    {Math.abs(deltaPct).toFixed(1)}%
                  </span>
                )}
                {sub && <span>{sub}</span>}
              </div>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
  return to ? <Link to={to} className="prof-kpi-link">{inner}</Link> : <div className="prof-kpi-link">{inner}</div>;
}

function SectionHeader({ kicker, title, count, action, to }) {
  return (
    <div className="prof-section-header">
      <div>
        <div className="prof-section-kicker">{kicker}</div>
        <div className="prof-section-title">
          {title}
          {count != null && <span className="prof-section-count">{count}</span>}
        </div>
      </div>
      {action && to && (
        <Link to={to} className="prof-section-action">
          {action} <ChevronRight size={13} />
        </Link>
      )}
    </div>
  );
}

function Panel({ title, action, to, children, className = '' }) {
  return (
    <div className={`prof-panel ${className}`}>
      {(title || action) && (
        <div className="prof-panel-header">
          {title && <span className="prof-panel-title">{title}</span>}
          {action && to && (
            <Link to={to} className="prof-panel-action">
              {action} <ChevronRight size={11} />
            </Link>
          )}
        </div>
      )}
      <div className="prof-panel-body">{children}</div>
    </div>
  );
}

function EmptyRow({ text }) {
  return <div className="prof-empty">{text}</div>;
}

// ─── Main ──────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { user } = useAuthStore();
  const role = user?.role || '';
  const dept = (user?.department || '').toLowerCase();

  // Managing director, admins, and specific users see approvals embedded on dashboard.
  const isMdRole = isMDDashboardUser(user);

  // Role-based routing — skip for admin/super_admin/md/named emails
  if (!['super_admin', 'admin'].includes(role) && !isMdRole) {
    let RoleDash = null;
    if (role === 'project_manager')      RoleDash = PMDashboard;
    else if (role === 'site_engineer')   RoleDash = SiteEngineerDashboard;
    else if (role === 'qs_engineer')     RoleDash = QSDashboard;
    else if (role === 'accountant')      RoleDash = AccountsDashboard;
    else if (role === 'hr')              RoleDash = HRDashboard;
    else if (role === 'hse_officer')     RoleDash = HSEDashboard;
    else if (dept.includes('store'))     RoleDash = StoresDashboard;
    else if (dept.includes('procurement') || dept.includes('purchase')) RoleDash = ProcurementDashboard;
    if (RoleDash) return <Suspense fallback={<DashLoader />}><RoleDash /></Suspense>;
  }

  // ── State ──
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedProjectId, setSelectedProjectId] = useState('all');
  const [selectedDateRange, setSelectedDateRange] = useState('30d');
  const [selectedBusinessUnit, setSelectedBusinessUnit] = useState('all');
  const [lastRefreshed, setLastRefreshed] = useState(() => new Date());
  const [, forceTick] = useState(0);

  const handleRefresh = useCallback(() => {
    setRefreshKey(k => k + 1);
    setLastRefreshed(new Date());
  }, []);

  useEffect(() => {
    const id = setInterval(() => forceTick(t => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.key === 'r' || e.key === 'R') { e.preventDefault(); handleRefresh(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleRefresh]);

  const dateBounds = useMemo(() => getRangeBounds(selectedDateRange), [selectedDateRange]);
  const executiveParams = useMemo(() => ({
    project_id: selectedProjectId !== 'all' ? selectedProjectId : undefined,
    business_unit: selectedBusinessUnit !== 'all' ? selectedBusinessUnit : undefined,
    date_from: dateBounds.dateFrom || undefined,
    date_to: dateBounds.dateTo || undefined,
  }), [selectedProjectId, selectedBusinessUnit, dateBounds.dateFrom, dateBounds.dateTo]);

  const tqsBillsParams = useMemo(() => ({
    project_id: selectedProjectId !== 'all' ? selectedProjectId : undefined,
    from_date:  dateBounds.dateFrom || undefined,
    to_date:    dateBounds.dateTo   || undefined,
    limit:      500,
  }), [selectedProjectId, dateBounds.dateFrom, dateBounds.dateTo]);

  // ── Data ──
  const { data: dashboard, isLoading: dashboardLoading } = useQuery({
    queryKey: ['analytics-executive', refreshKey, executiveParams],
    queryFn: () => analyticsAPI.executive(executiveParams).then(r => r.data?.data || null).catch(() => null),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  const { data: companyProjects = [] } = useQuery({
    queryKey: ['dashboard-projects-fallback'],
    queryFn: () => projectAPI.list().then(toArray).catch(() => []),
    staleTime: 5 * 60 * 1000,
  });

  const { data: tqsBills = [] } = useQuery({
    queryKey: ['dashboard-tqs-bills', refreshKey, tqsBillsParams],
    queryFn: () => tqsBillsAPI.list(tqsBillsParams).then(r => Array.isArray(r.data) ? r.data : (r.data?.data ?? [])).catch(() => []),
    staleTime: 60 * 1000,
  });

  // ── Derived ──
  const filterOptions       = dashboard?.filters?.options || {};
  const projectOptions      = filterOptions.projects?.length ? filterOptions.projects : companyProjects.map(p => ({ id: p.id, name: p.name, project_code: p.project_code, type: p.type }));
  const businessUnitOptions = filterOptions.business_units?.length ? filterOptions.business_units : [...new Set(companyProjects.map(p => p.type).filter(Boolean))].sort();
  const dashboardKpis       = dashboard?.kpis || {};
  const dashboardCharts     = dashboard?.charts || {};
  const dashboardRecent     = dashboard?.recent || {};
  const dashboardWatchlists = dashboard?.watchlists || {};
  const dashboardPulse      = dashboard?.pulse || {};
  const dashboardExceptions = dashboard?.exceptions || [];

  const safeProjects = Array.isArray(dashboard?.projects) ? dashboard.projects : [];
  const safePayments = Array.isArray(dashboardRecent.payments)   ? dashboardRecent.payments   : [];
  const safeBills    = Array.isArray(dashboardRecent.ra_bills)   ? dashboardRecent.ra_bills   : [];
  const safeDocs     = Array.isArray(dashboardRecent.documents)  ? dashboardRecent.documents  : [];

  // Finance / QS
  const totalContractValue = dashboardKpis.total_contract_value ?? 0;
  const totalCertified     = dashboardKpis.total_certified ?? 0;
  const totalCollections   = dashboardKpis.total_collections ?? 0;
  const receivables        = dashboardKpis.receivables ?? (totalCertified - totalCollections);
  const pendingRABillCount = dashboardKpis.pending_ra_bills ?? 0;
  const pendingRAValue     = dashboardKpis.pending_ra_value ?? 0;
  const collectionRate     = totalCertified > 0 ? Math.round((totalCollections / totalCertified) * 100) : 0;
  const financeTrend       = dashboardCharts.finance_trend || [];

  // Projects
  const activeProjects    = dashboardKpis.active_projects ?? 0;
  const delayedProjects   = dashboardKpis.delayed_projects ?? 0;
  const completedProjects = dashboardKpis.completed_projects ?? 0;
  const planningProjects  = dashboardKpis.planning_projects ?? 0;
  const projectStatus     = dashboardCharts.project_status || [];
  const delayedWatchlist  = [...(dashboardWatchlists.delayed_projects || [])].slice(0, 6);

  // Procurement / Stores
  const lowStockCount       = dashboardKpis.low_stock_count ?? dashboardPulse?.procurement_stores?.low_stock_materials ?? 0;
  const overduePOCount      = dashboardPulse?.procurement_stores?.pos_requiring_attention ?? 0;
  const totalPOs            = dashboardPulse?.procurement_stores?.total_pos ?? 0;
  const pendingVendorBills  = dashboardPulse?.procurement_stores?.pending_vendor_bills ?? pendingRABillCount;
  const pendingVendorBillVal= dashboardPulse?.procurement_stores?.pending_vendor_bill_value ?? pendingRAValue;
  const topLowStock         = dashboardPulse?.procurement_stores?.top_low_stock_material || '—';

  // Quality / Safety / HR
  const safetyScore   = dashboardKpis.safety_score;
  const openIncidents = dashboardKpis.open_incidents ?? 0;
  const openRFIs      = dashboardKpis.open_rfis ?? 0;
  const openNCRs      = dashboardKpis.open_ncrs ?? 0;
  const expiringPermits = dashboardKpis.expiring_permits ?? 0;
  const totalPermits  = dashboardPulse?.quality_safety?.permits_count ?? expiringPermits;
  const workforceCount = dashboardKpis.workforce_count ?? 0;
  const documentsCount = dashboardKpis.documents_count ?? safeDocs.length;

  // DQS Bills
  const tqsTotalBills      = tqsBills.length;
  const tqsTotalInvoice    = tqsBills.reduce((s, b) => s + parseFloat(b.total_amount   || 0), 0);
  const tqsTotalCertified  = tqsBills.reduce((s, b) => s + parseFloat(b.certified_net  || 0), 0);
  const tqsTotalPaid       = tqsBills.reduce((s, b) => s + parseFloat(b.paid_amount    || 0), 0);
  const tqsBalance         = tqsTotalCertified - tqsTotalPaid;
  const tqsPaidCount       = tqsBills.filter(b => b.workflow_status === 'paid').length;
  const tqsPendingCount    = tqsBills.filter(b => b.workflow_status !== 'paid').length;
  const tqsRecent          = [...tqsBills].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)).slice(0, 5);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const dateRangeLabel = ({ all: 'All time', '7d': 'Last 7 days', '30d': 'Last 30 days', '90d': 'Last 90 days', '1y': 'Last 1 year' })[selectedDateRange];

  // ─── RENDER ───
  return (
    <div className="prof-dashboard">

      {/* ════════════════════ HEADER BAR ════════════════════ */}
      <header className="prof-header">
        <div className="prof-header-inner">
          <div className="prof-brand">
            <div className="prof-brand-mark">BCIM</div>
            <div className="prof-brand-text">
              <div className="prof-brand-title">Executive Dashboard</div>
              <div className="prof-brand-sub">{greeting}, {user?.name?.split(' ')[0] || 'Admin'} · {dayjs().format('dddd, D MMMM YYYY')}</div>
            </div>
          </div>

          <div className="prof-header-actions">
            <div className="prof-refresh-meta">
              {dashboardLoading && <span className="prof-mini-spinner" />}
              <span title={lastRefreshed.toLocaleString('en-IN')}>Updated {relTime(lastRefreshed)}</span>
            </div>
            <button onClick={handleRefresh} className="prof-refresh-btn" title="Refresh (R)">
              <RefreshCw size={13} /> Refresh
            </button>
          </div>
        </div>

        {/* Filter strip */}
        <div className="prof-filter-strip">
          <div className="prof-filter-group">
            <label>Project</label>
            <select value={selectedProjectId} onChange={e => setSelectedProjectId(e.target.value)}>
              <option value="all">All Projects ({projectOptions.length})</option>
              {projectOptions.map(p => <option key={p.id} value={p.id}>{p.project_code ? `${p.name} (${p.project_code})` : p.name}</option>)}
            </select>
          </div>
          <div className="prof-filter-group">
            <label>Date Range</label>
            <select value={selectedDateRange} onChange={e => setSelectedDateRange(e.target.value)}>
              <option value="all">All Time</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="90d">Last 90 Days</option>
              <option value="1y">Last 1 Year</option>
            </select>
          </div>
          {businessUnitOptions.length > 0 && (
            <div className="prof-filter-group">
              <label>Business Unit</label>
              <select value={selectedBusinessUnit} onChange={e => setSelectedBusinessUnit(e.target.value)}>
                <option value="all">All Units</option>
                {businessUnitOptions.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          )}
          <div className="prof-filter-spacer" />
          <div className="prof-filter-meta">Showing data for: <strong>{dateRangeLabel}</strong></div>
        </div>
      </header>

      {/* ════════════════════ EXCEPTIONS BAR ════════════════════ */}
      {dashboardExceptions.length > 0 && (
        <div className="prof-alerts">
          <AlertTriangle size={13} color="#b45309" />
          <span className="prof-alerts-label">Items needing attention:</span>
          <div className="prof-alerts-list">
            {dashboardExceptions.slice(0, 4).map(card => (
              <Link key={card.label} to={card.to} className="prof-alert-chip" style={{ borderColor: `${card.tone}66`, color: card.tone }}>
                {card.label} <strong style={{ marginLeft: 6 }}>{card.value}</strong>
              </Link>
            ))}
          </div>
        </div>
      )}

      <main className="prof-main">

        {/* ════════════════════ PENDING APPROVALS ════════════════════ */}
        {isMdRole && (
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '16px 18px', marginBottom: 18, boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }}>
            <Suspense fallback={<DashLoader />}>
              <ApprovalsPage embedded mdMode />
            </Suspense>
          </div>
        )}

        {/* ════════════════════ TOP KPI STRIP ════════════════════ */}
        <div className="prof-kpi-strip">
          <KPI label="Portfolio Value"   value={totalContractValue} isCurrency tone="primary" icon={Building2} to="/projects" sub={`${safeProjects.length} projects`} loading={dashboardLoading} />
          <KPI label="Certified Billing" value={totalCertified}     isCurrency icon={Receipt}    to="/qs/ra-bills" sub={`${pendingRABillCount} pending`} loading={dashboardLoading} />
          <KPI label="Collections"       value={totalCollections}   isCurrency tone="success" icon={Wallet}      to="/finance/payments" sub={`${collectionRate}% of certified`} loading={dashboardLoading} />
          <KPI label="Receivables"       value={receivables}        isCurrency tone={receivables > 0 ? 'danger' : 'success'} icon={Clock} to="/finance/payments" sub={receivables < 0 ? 'over-collected' : 'outstanding'} loading={dashboardLoading} />
          <KPI label="Active Projects"   value={activeProjects}     tone="default" icon={Activity} to="/projects" sub={`${delayedProjects} delayed`} loading={dashboardLoading} />
          <KPI label="Safety Score"      value={safetyScore != null ? `${Math.round(safetyScore)}/100` : 'N/A'} tone={safetyScore != null && safetyScore < 70 ? 'warning' : 'success'} icon={ShieldCheck} to="/hse" sub={`${openIncidents} incidents`} loading={dashboardLoading} />
        </div>

        {/* ════════════════════ FINANCE & QS ════════════════════ */}
        <section className="prof-section">
          <SectionHeader kicker="Department 01" title="Finance & Quantity Survey" action="Open Finance" to="/finance" />
          <div className="prof-section-grid prof-grid-2-1">
            {/* Chart */}
            <Panel title="Billing vs Collections trend" action="View report" to="/finance/reports">
              {financeTrend.length === 0 || financeTrend.every(i => !i.billed && !i.collected) ? (
                <EmptyRow text="No billing or collection data for the selected range" />
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={financeTrend} margin={{ top: 8, right: 14, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="profBill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#1e40af" stopOpacity={0.30} />
                        <stop offset="95%" stopColor="#1e40af" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="profCollect" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#15803d" stopOpacity={0.30} />
                        <stop offset="95%" stopColor="#15803d" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={{ stroke: '#cbd5e1' }} tickLine={false} />
                    <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => inrCompact(v).replace('₹','')} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11, color: '#475569' }} iconType="square" />
                    <Area type="monotone" dataKey="billed"    stroke="#1e40af" strokeWidth={2} fill="url(#profBill)"    name="Billed" />
                    <Area type="monotone" dataKey="collected" stroke="#15803d" strokeWidth={2} fill="url(#profCollect)" name="Collected" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </Panel>

            {/* Summary stats */}
            <Panel title="Financial summary">
              <table className="prof-table prof-table-stat">
                <tbody>
                  <tr><td>Pending RA Bills</td><td className="num">{pendingRABillCount}</td></tr>
                  <tr><td>Pending RA Value</td><td className="num">{inrCompact(pendingRAValue)}</td></tr>
                  <tr><td>Collection rate</td><td className="num"><strong style={{ color: collectionRate >= 70 ? '#15803d' : collectionRate >= 50 ? '#b45309' : '#b91c1c' }}>{collectionRate}%</strong></td></tr>
                  <tr><td>DQS Invoice value</td><td className="num">{inrCompact(tqsTotalInvoice)}</td></tr>
                  <tr><td>DQS Certified</td><td className="num">{inrCompact(tqsTotalCertified)}</td></tr>
                  <tr><td>DQS Paid</td><td className="num">{inrCompact(tqsTotalPaid)}</td></tr>
                  <tr className="highlight"><td>DQS Balance to pay</td><td className="num"><strong style={{ color: '#b91c1c' }}>{inrCompact(tqsBalance)}</strong></td></tr>
                </tbody>
              </table>
            </Panel>
          </div>

          {/* DQS recent bills */}
          <Panel title={`Recent DQS Vendor Bills (${tqsTotalBills} total · ${tqsPaidCount} paid · ${tqsPendingCount} pending)`} action="Open DQS" to="/tqs/bills">
            {tqsRecent.length === 0 ? <EmptyRow text="No recent vendor bills" /> : (
              <table className="prof-table">
                <thead>
                  <tr>
                    <th>Bill No.</th>
                    <th>Vendor</th>
                    <th>Project</th>
                    <th className="num">Invoice</th>
                    <th className="num">Certified</th>
                    <th className="num">Paid</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {tqsRecent.map(b => (
                    <tr key={b.id}>
                      <td><Link to={`/tqs/bills/${b.id}`} className="prof-link">{b.sl_number || b.bill_number || b.id?.slice(0,8)}</Link></td>
                      <td className="truncate">{b.vendor_name || '—'}</td>
                      <td className="truncate">{b.project_name || '—'}</td>
                      <td className="num">{inrCompact(b.total_amount)}</td>
                      <td className="num">{inrCompact(b.certified_net)}</td>
                      <td className="num">{inrCompact(b.paid_amount)}</td>
                      <td><span className={`prof-status prof-status-${b.workflow_status || 'pending'}`}>{b.workflow_status || 'pending'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
        </section>

        {/* ════════════════════ PROJECTS ════════════════════ */}
        <section className="prof-section">
          <SectionHeader kicker="Department 02" title="Projects & Planning" action="All Projects" to="/projects" />

          <div className="prof-mini-kpi-row">
            <KPI label="Active"     value={activeProjects}    tone="primary" />
            <KPI label="Delayed"    value={delayedProjects}   tone="danger" />
            <KPI label="Planning"   value={planningProjects}  tone="neutral" />
            <KPI label="Completed"  value={completedProjects} tone="success" />
          </div>

          <div className="prof-section-grid prof-grid-1-2">
            {/* Status pie */}
            <Panel title="Project status breakdown">
              {projectStatus.length === 0 ? <EmptyRow text="No project data" /> : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <ResponsiveContainer width="50%" height={170}>
                    <PieChart>
                      <Pie data={projectStatus} dataKey="value" innerRadius={36} outerRadius={62} paddingAngle={2}>
                        {projectStatus.map((_, i) => <Cell key={i} fill={STATUS_COLORS[i % STATUS_COLORS.length]} stroke="none" />)}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ flex: 1, display: 'grid', gap: 6 }}>
                    {projectStatus.map((it, i) => (
                      <div key={it.name} className="prof-legend-row">
                        <span style={{ width: 9, height: 9, borderRadius: 2, background: STATUS_COLORS[i % STATUS_COLORS.length] }} />
                        <span style={{ flex: 1, color: '#475569' }}>{it.name}</span>
                        <strong>{it.value}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Panel>

            {/* Delayed projects table */}
            <Panel title="Delayed projects watchlist" action="View all" to="/projects?filter=delayed">
              {delayedWatchlist.length === 0 ? <EmptyRow text="No delayed projects" /> : (
                <table className="prof-table">
                  <thead>
                    <tr><th>Project</th><th>City</th><th className="num">Contract</th><th className="num">Progress</th></tr>
                  </thead>
                  <tbody>
                    {delayedWatchlist.map(p => {
                      const pct = Math.max(0, Math.min(100, parseFloat(p.progress_pct || 0)));
                      return (
                        <tr key={p.id}>
                          <td><Link to={`/projects/${p.id}`} className="prof-link">{p.name}</Link></td>
                          <td>{p.city || '—'}</td>
                          <td className="num">{inrCompact(p.contract_value)}</td>
                          <td className="num">
                            <div className="prof-progress">
                              <div className="prof-progress-fill" style={{ width: `${pct}%`, background: pct < 30 ? '#b91c1c' : pct < 60 ? '#b45309' : '#15803d' }} />
                            </div>
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#475569' }}>{pct}%</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </Panel>
          </div>
        </section>

        {/* ════════════════════ PROCUREMENT & STORES ════════════════════ */}
        <section className="prof-section">
          <SectionHeader kicker="Department 03" title="Procurement & Stores" action="Inventory" to="/procurement/inventory" />

          <div className="prof-mini-kpi-row">
            <KPI label="Total Purchase Orders"     value={totalPOs}            tone="primary" icon={ClipboardList} />
            <KPI label="POs Needing Attention"     value={overduePOCount}      tone="warning" icon={AlertTriangle} to="/procurement/po" />
            <KPI label="Low-Stock Materials"       value={lowStockCount}       tone="danger"  icon={Package}       to="/procurement/inventory" />
            <KPI label="Pending Vendor Bills"      value={pendingVendorBills}  tone="default" icon={Receipt}       to="/tqs/bills" />
            <KPI label="Pending Vendor Bill Value" value={pendingVendorBillVal} isCurrency tone="default" icon={Wallet} to="/tqs/bills" />
            <KPI label="Top Low-Stock Item"        value={topLowStock}         tone="neutral" />
          </div>
        </section>

        {/* ════════════════════ QUALITY & SAFETY ════════════════════ */}
        <section className="prof-section">
          <SectionHeader kicker="Department 04" title="Quality, Safety & Documents" action="HSE" to="/hse" />

          <div className="prof-mini-kpi-row">
            <KPI label="Open Incidents"     value={openIncidents}                 tone={openIncidents > 0 ? 'warning' : 'success'} icon={AlertTriangle} to="/hse/incidents" />
            <KPI label="Expiring Permits"   value={expiringPermits}               tone="warning" icon={FileWarning} to="/hse/permits"   sub={`${totalPermits} permits on record`} />
            <KPI label="Open RFIs"          value={openRFIs}                      tone="default" icon={FileText}    to="/quality/rfi" />
            <KPI label="Open NCRs"          value={openNCRs}                      tone={openNCRs > 0 ? 'danger' : 'success'} icon={FileWarning} to="/quality/ncr" />
            <KPI label="Documents"          value={documentsCount}                tone="default" icon={FileSpreadsheet} to="/documents" />
            <KPI label="Workforce"          value={workforceCount}                tone="primary" icon={HardHat}      to="/hr/workers" />
          </div>
        </section>

        {/* ════════════════════ RECENT ACTIVITY ════════════════════ */}
        <section className="prof-section">
          <SectionHeader kicker="Activity" title="Recent activity across departments" />

          <div className="prof-section-grid prof-grid-1-1">
            <Panel title="Recent Payments" action="View all" to="/finance/payments">
              {safePayments.length === 0 ? <EmptyRow text="No payments recorded" /> : (
                <table className="prof-table">
                  <thead><tr><th>Date</th><th>Beneficiary</th><th>Type</th><th className="num">Amount</th></tr></thead>
                  <tbody>
                    {safePayments.slice(0, 5).map(p => (
                      <tr key={p.id}>
                        <td className="muted">{dayjs(p.payment_date || p.created_at).format('DD MMM')}</td>
                        <td className="truncate">{p.entity_name || p.project_name || 'Payment'}</td>
                        <td><span className="prof-tag prof-tag-success">{(p.payment_type || 'payment').toLowerCase()}</span></td>
                        <td className="num" title={inr(p.net_amount || p.amount)}>{inrCompact(p.net_amount || p.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>

            <Panel title="Recent RA Bills" action="View all" to="/qs/ra-bills">
              {safeBills.length === 0 ? <EmptyRow text="No RA bills" /> : (
                <table className="prof-table">
                  <thead><tr><th>Date</th><th>Project / Vendor</th><th>Status</th><th className="num">Amount</th></tr></thead>
                  <tbody>
                    {safeBills.slice(0, 5).map(b => (
                      <tr key={b.id}>
                        <td className="muted">{dayjs(b.created_at).format('DD MMM')}</td>
                        <td className="truncate">{b.project_name || b.vendor_name || '—'}</td>
                        <td><span className={`prof-tag prof-tag-${b.status || 'pending'}`}>{b.status || 'pending'}</span></td>
                        <td className="num">{inrCompact(b.amount || b.total_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>
          </div>
        </section>

        <div className="prof-footer">
          <span>BCIM Engineering ERP · v1.0 · Refreshed {relTime(lastRefreshed)}</span>
          <span>Press <kbd>R</kbd> to refresh</span>
        </div>
      </main>

      {/* ════════════════════ STYLES ════════════════════ */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        * { box-sizing: border-box; }

        .prof-dashboard {
          background: #f8fafc; min-height: 100vh;
          font-family: 'Inter','Segoe UI',-apple-system,sans-serif;
          color: #0f172a; font-size: 13px;
        }

        /* ── HEADER ── */
        .prof-header {
          background: #fff; border-bottom: 1px solid #e2e8f0;
          position: sticky; top: 0; z-index: 30;
        }
        .prof-header-inner {
          padding: 14px 28px; display: flex; align-items: center; justify-content: space-between;
          border-bottom: 1px solid #f1f5f9;
        }
        .prof-brand { display: flex; align-items: center; gap: 14px; }
        .prof-brand-mark {
          width: 42px; height: 42px; border-radius: 6px;
          background: #1e293b; color: #fff;
          display: flex; align-items: center; justify-content: center;
          font-weight: 900; font-size: 13px; letter-spacing: 0.5px;
        }
        .prof-brand-title { font-size: 16px; font-weight: 700; color: #0f172a; line-height: 1.1; }
        .prof-brand-sub   { font-size: 11px; color: #64748b; margin-top: 2px; }

        .prof-header-actions { display: flex; align-items: center; gap: 12px; }
        .prof-refresh-meta { font-size: 11px; color: #64748b; display: flex; align-items: center; gap: 6px; }
        .prof-mini-spinner {
          width: 12px; height: 12px; border: 2px solid #cbd5e1; border-top-color: #1e40af;
          border-radius: 50%; animation: prof-spin 1s linear infinite; display: inline-block;
        }
        .prof-refresh-btn {
          display: flex; align-items: center; gap: 5px;
          padding: 6px 14px; border: 1px solid #cbd5e1; background: #fff;
          border-radius: 4px; font-size: 12px; font-weight: 600; color: #334155; cursor: pointer;
          transition: all .12s;
        }
        .prof-refresh-btn:hover { border-color: #1e40af; color: #1e40af; }

        /* ── FILTER STRIP ── */
        .prof-filter-strip {
          padding: 10px 28px; display: flex; align-items: center; gap: 16px;
          background: #f8fafc; border-top: 1px solid #f1f5f9;
        }
        .prof-filter-group { display: flex; align-items: center; gap: 8px; }
        .prof-filter-group label { font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }
        .prof-filter-group select {
          height: 30px; min-width: 160px; padding: 0 26px 0 10px; border: 1px solid #cbd5e1;
          border-radius: 4px; background: #fff; font-size: 12px; color: #0f172a; font-family: inherit;
          outline: none; cursor: pointer;
        }
        .prof-filter-group select:focus { border-color: #1e40af; }
        .prof-filter-spacer { flex: 1; }
        .prof-filter-meta { font-size: 11px; color: #64748b; }
        .prof-filter-meta strong { color: #0f172a; font-weight: 700; }

        /* ── ALERTS ── */
        .prof-alerts {
          background: #fffbeb; border-bottom: 1px solid #fef3c7;
          padding: 8px 28px; display: flex; align-items: center; gap: 10px;
          font-size: 12px; flex-wrap: wrap;
        }
        .prof-alerts-label { font-weight: 700; color: #92400e; }
        .prof-alerts-list { display: flex; gap: 6px; flex-wrap: wrap; }
        .prof-alert-chip {
          padding: 3px 10px; border: 1px solid; border-radius: 999px;
          background: #fff; font-size: 11px; font-weight: 600; text-decoration: none;
        }
        .prof-alert-chip strong { font-weight: 800; }

        /* ── MAIN ── */
        .prof-main { padding: 20px 28px 40px; max-width: 1600px; margin: 0 auto; }

        /* ── TOP KPI STRIP — 3D cards with breathing room ── */
        .prof-kpi-strip {
          display: grid; grid-template-columns: repeat(6, minmax(0,1fr));
          gap: 12px; margin-bottom: 24px;
          perspective: 1200px;
        }
        @media (max-width: 1280px) { .prof-kpi-strip { grid-template-columns: repeat(3, minmax(0,1fr)); } }
        @media (max-width: 720px)  { .prof-kpi-strip { grid-template-columns: repeat(2, minmax(0,1fr)); } }
        @media (max-width: 480px)  { .prof-kpi-strip { grid-template-columns: 1fr; } }

        .prof-kpi-link { text-decoration: none; color: inherit; display: block; }

        /* 3D wrapper */
        .prof-kpi-3d {
          position: relative;
          background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
          border-radius: 10px;
          overflow: hidden;
          transform-origin: center center;
          will-change: transform, box-shadow;
          transition: background .15s;
        }
        .prof-kpi-3d::before {
          /* Glossy top sheen */
          content: '';
          position: absolute; top: 0; left: 0; right: 0; height: 40%;
          background: linear-gradient(180deg, rgba(255,255,255,0.7), rgba(255,255,255,0) 100%);
          pointer-events: none;
          border-radius: 10px 10px 0 0;
        }
        .prof-kpi-3d-highlight {
          position: absolute; top: 0; left: 8%; right: 8%; height: 1px;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.9), transparent);
          pointer-events: none;
        }
        .prof-kpi-3d-accent {
          position: absolute; bottom: 0; left: 0; right: 0; height: 3px;
          pointer-events: none;
          opacity: 0.85;
        }
        .prof-kpi-link:hover .prof-kpi-3d { background: linear-gradient(180deg, #ffffff 0%, #f1f5f9 100%); }

        .prof-kpi { padding: 14px 14px 16px; position: relative; }
        .prof-kpi-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
        .prof-kpi-label {
          font-size: 10px; font-weight: 700; color: #64748b;
          text-transform: uppercase; letter-spacing: 0.06em;
        }
        .prof-kpi-icon {
          width: 22px; height: 22px; border-radius: 6px;
          display: flex; align-items: center; justify-content: center;
          box-shadow: inset 0 -1px 0 rgba(0,0,0,0.05), 0 1px 0 rgba(255,255,255,0.6);
        }
        .prof-kpi-value {
          font-size: 22px; font-weight: 800; letter-spacing: -0.4px; line-height: 1.1;
          text-shadow: 0 1px 0 rgba(255,255,255,0.7);
        }
        .prof-kpi-sub { display: flex; align-items: center; gap: 6px; margin-top: 6px; font-size: 11px; color: #64748b; }
        .prof-delta { display: inline-flex; align-items: center; gap: 2px; font-weight: 700; font-size: 10px; padding: 1px 5px; border-radius: 3px; }
        .prof-delta.up   { color: #15803d; background: #dcfce7; }
        .prof-delta.down { color: #b91c1c; background: #fee2e2; }
        .prof-kpi-skeleton { height: 22px; width: 70%; background: linear-gradient(90deg,#e2e8f0 25%,#f1f5f9 50%,#e2e8f0 75%); background-size: 200% 100%; animation: prof-shimmer 1.4s infinite; border-radius: 3px; }

        /* ── SECTION ── */
        .prof-section { margin-bottom: 28px; }
        .prof-section-header {
          display: flex; align-items: flex-end; justify-content: space-between;
          margin-bottom: 12px; padding-bottom: 10px; border-bottom: 2px solid #e2e8f0;
        }
        .prof-section-kicker {
          font-size: 10px; font-weight: 800; color: #1e40af;
          text-transform: uppercase; letter-spacing: 0.12em; margin-bottom: 3px;
        }
        .prof-section-title { font-size: 17px; font-weight: 700; color: #0f172a; display: flex; align-items: center; gap: 10px; }
        .prof-section-count {
          background: #1e293b; color: #fff; font-size: 11px; font-weight: 700;
          padding: 1px 8px; border-radius: 999px;
        }
        .prof-section-action {
          font-size: 11px; font-weight: 700; color: #1e40af; text-decoration: none;
          display: flex; align-items: center; gap: 2px;
        }
        .prof-section-action:hover { text-decoration: underline; }

        .prof-section-grid { display: grid; gap: 14px; margin-bottom: 14px; }
        .prof-grid-2-1 { grid-template-columns: 2fr 1fr; }
        .prof-grid-1-2 { grid-template-columns: 1fr 2fr; }
        .prof-grid-1-1 { grid-template-columns: 1fr 1fr; }
        @media (max-width: 1024px) {
          .prof-grid-2-1, .prof-grid-1-2, .prof-grid-1-1 { grid-template-columns: 1fr; }
        }

        /* ── MINI KPI ROW (inside dept sections) — 3D too ── */
        .prof-mini-kpi-row {
          display: grid; grid-template-columns: repeat(6, minmax(0,1fr));
          gap: 10px; margin-bottom: 14px;
          perspective: 1200px;
        }
        @media (max-width: 1024px) { .prof-mini-kpi-row { grid-template-columns: repeat(3, minmax(0,1fr)); } }
        @media (max-width: 560px)  { .prof-mini-kpi-row { grid-template-columns: repeat(2, minmax(0,1fr)); } }

        /* ── PANEL ── */
        .prof-panel {
          background: #fff; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden;
          box-shadow: 0 1px 2px rgba(15,23,42,0.04);
        }
        .prof-panel-header {
          padding: 10px 14px; border-bottom: 1px solid #f1f5f9;
          display: flex; align-items: center; justify-content: space-between;
          background: #fafbfc;
        }
        .prof-panel-title {
          font-size: 11px; font-weight: 800; color: #334155;
          text-transform: uppercase; letter-spacing: 0.06em;
        }
        .prof-panel-action {
          font-size: 11px; color: #1e40af; text-decoration: none; font-weight: 600;
          display: flex; align-items: center; gap: 2px;
        }
        .prof-panel-action:hover { text-decoration: underline; }
        .prof-panel-body { padding: 12px 14px; }

        /* ── TABLES ── */
        .prof-table { width: 100%; border-collapse: collapse; font-size: 12px; }
        .prof-table thead th {
          text-align: left; padding: 6px 10px; border-bottom: 1px solid #cbd5e1;
          font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em;
          background: #f8fafc;
        }
        .prof-table thead th.num,
        .prof-table tbody td.num { text-align: right; font-variant-numeric: tabular-nums; }
        .prof-table tbody td {
          padding: 8px 10px; border-bottom: 1px solid #f1f5f9; color: #0f172a; vertical-align: middle;
        }
        .prof-table tbody tr:last-child td { border-bottom: none; }
        .prof-table tbody tr:hover { background: #f8fafc; }
        .prof-table .truncate { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .prof-table .muted { color: #94a3b8; font-size: 11px; }
        .prof-table-stat tbody td { padding: 6px 10px; font-size: 12px; }
        .prof-table-stat tbody td:first-child { color: #64748b; font-weight: 500; }
        .prof-table-stat tbody tr.highlight td { background: #f8fafc; font-weight: 700; }

        /* ── STATUS / TAGS ── */
        .prof-status, .prof-tag {
          display: inline-block; padding: 1px 8px; border-radius: 3px;
          font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em;
        }
        .prof-status-pending,   .prof-tag-pending   { background: #fef3c7; color: #92400e; }
        .prof-status-qs,        .prof-tag-qs        { background: #dbeafe; color: #1e40af; }
        .prof-status-accounts,  .prof-tag-accounts  { background: #ede9fe; color: #6d28d9; }
        .prof-status-paid,      .prof-tag-paid,
        .prof-tag-success                          { background: #dcfce7; color: #15803d; }
        .prof-status-rejected,  .prof-tag-rejected  { background: #fee2e2; color: #b91c1c; }
        .prof-status-procurement,
        .prof-status-qs_sign                       { background: #f1f5f9; color: #334155; }

        .prof-link { color: #1e40af; text-decoration: none; font-weight: 600; }
        .prof-link:hover { text-decoration: underline; }

        .prof-progress {
          display: inline-block; vertical-align: middle; width: 60px; height: 6px;
          background: #e2e8f0; border-radius: 999px; overflow: hidden; margin-right: 6px;
        }
        .prof-progress-fill { height: 100%; border-radius: 999px; }

        .prof-legend-row { display: flex; align-items: center; gap: 8px; font-size: 11px; }
        .prof-legend-row strong { color: #0f172a; font-weight: 700; }

        .prof-empty { padding: 24px 0; text-align: center; color: #94a3b8; font-size: 11px; font-style: italic; }

        /* ── FOOTER ── */
        .prof-footer {
          display: flex; justify-content: space-between; align-items: center;
          padding: 16px 0 0; margin-top: 12px; border-top: 1px solid #e2e8f0;
          font-size: 11px; color: #94a3b8;
        }
        .prof-footer kbd {
          padding: 1px 5px; border: 1px solid #cbd5e1; border-radius: 3px;
          background: #f1f5f9; font-family: inherit; font-size: 10px; font-weight: 700; color: #475569;
        }

        /* ── TOOLTIP ── */
        .prof-tooltip {
          background: #fff; border: 1px solid #cbd5e1; border-radius: 6px;
          padding: 8px 12px; box-shadow: 0 6px 18px rgba(15,23,42,0.12);
          font-size: 11px; min-width: 150px;
        }
        .prof-tooltip-label { font-weight: 700; color: #0f172a; margin-bottom: 4px; padding-bottom: 4px; border-bottom: 1px solid #f1f5f9; }
        .prof-tooltip-row { display: flex; align-items: center; gap: 6px; margin: 3px 0; }
        .prof-tooltip-dot { width: 8px; height: 8px; border-radius: 2px; }
        .prof-tooltip-name { color: #64748b; flex: 1; }
        .prof-tooltip-val { color: #0f172a; font-weight: 700; font-variant-numeric: tabular-nums; }

        /* ── LOADER ── */
        .prof-loader { display: flex; align-items: center; justify-content: center; gap: 10px; min-height: 60vh; color: #64748b; font-size: 13px; }
        .prof-spinner { width: 24px; height: 24px; border: 3px solid #cbd5e1; border-top-color: #1e40af; border-radius: 50%; animation: prof-spin 0.8s linear infinite; }

        @keyframes prof-spin { to { transform: rotate(360deg); } }
        @keyframes prof-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

        select option { background: #fff; color: #0f172a; }

        /* Print friendly */
        @media print {
          .prof-header-actions, .prof-refresh-btn, .prof-section-action, .prof-panel-action { display: none !important; }
          .prof-dashboard { background: #fff; }
          .prof-panel { box-shadow: none; }
        }
      `}</style>
    </div>
  );
}
