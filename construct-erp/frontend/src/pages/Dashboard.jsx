// src/pages/Dashboard.jsx
import React, { Suspense, lazy, useMemo, useState, useEffect, useRef } from 'react';
import { motion, animate, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, PieChart, Pie, Cell,
  RadialBarChart, RadialBar, CartesianGrid,
} from 'recharts';
import {
  Building2, IndianRupee, Shield, Receipt, TrendingUp,
  AlertTriangle, ArrowRight, RefreshCw, Package, CheckCircle2,
  Clock, Wallet, FileWarning, HardHat, CalendarRange, FileText,
  ClipboardList, Zap, Activity, ChevronRight, TrendingDown,
  BarChart2, Users, Star,
} from 'lucide-react';
import {
  projectAPI, analyticsAPI, tqsBillsAPI,
} from '../api/client';
import useAuthStore from '../store/authStore';
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

// Managing-director roles see the unified approvals view AS their main dashboard.
const MD_DASHBOARD_ROLES = ['md', 'managing_director'];

const PIE_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#8b5cf6', '#ef4444'];

const GRADIENTS = [
  ['#667eea', '#764ba2'],
  ['#4facfe', '#00f2fe'],
  ['#43e97b', '#38f9d7'],
  ['#fa709a', '#fee140'],
  ['#f093fb', '#f5576c'],
  ['#a18cd1', '#fbc2eb'],
  ['#fccb90', '#d57eeb'],
  ['#a1c4fd', '#c2e9fb'],
];

const inr = (value) => {
  const n = parseFloat(value) || 0;
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const compactNumber = (value) => {
  const n = parseFloat(value) || 0;
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// Indian compact format: ₹12.5 Cr / ₹4.2 L / ₹50.3 K
const inrCompact = (value) => {
  const n = Math.abs(parseFloat(value) || 0);
  const sign = (parseFloat(value) || 0) < 0 ? '-' : '';
  if (n >= 1e7)  return `${sign}₹${(n / 1e7).toFixed(n >= 1e8 ? 1 : 2)} Cr`;
  if (n >= 1e5)  return `${sign}₹${(n / 1e5).toFixed(n >= 1e6 ? 1 : 2)} L`;
  if (n >= 1e3)  return `${sign}₹${(n / 1e3).toFixed(1)} K`;
  return `${sign}₹${n.toFixed(0)}`;
};

const relTime = (date) => {
  if (!date) return '—';
  const diff = Math.max(0, (Date.now() - new Date(date).getTime()) / 1000);
  if (diff < 5)    return 'just now';
  if (diff < 60)   return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`;
  return `${Math.floor(diff / 86400)} d ago`;
};

const toArray = (response) => {
  const data = response?.data;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  return [];
};

const getRangeBounds = (range) => {
  if (range === 'all') return { dateFrom: null, dateTo: null };
  const now = dayjs();
  const map = { '7d': 6, '30d': 29, '90d': 89, '1y': 364 };
  const days = map[range] ?? 29;
  return { dateFrom: now.subtract(days, 'day').format('YYYY-MM-DD'), dateTo: now.format('YYYY-MM-DD') };
};

// Animated counter
function AnimatedNumber({ target, prefix = '', suffix = '', format }) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    const controls = animate(0, parseFloat(target) || 0, {
      duration: 1.5, ease: 'easeOut',
      onUpdate: v => setVal(v),
    });
    return controls.stop;
  }, [target]);
  const display = format ? format(val) : Math.round(val);
  return <>{prefix}{display}{suffix}</>;
}

function DashLoader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', background: '#f6f8fb' }}>
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        style={{ width: 36, height: 36, border: '3px solid rgba(99,102,241,0.2)', borderTopColor: '#6366f1', borderRadius: '50%' }}
      />
    </div>
  );
}

// Skeleton placeholder shown while data is loading
function KpiSkeleton({ gradient }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #e5e7eb',
      borderTop: `3px solid ${gradient[0]}`,
      borderRadius: 10, padding: '16px 16px',
      boxShadow: '0 2px 8px rgba(15,23,42,0.06)', height: '100%',
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div style={{ width: 60, height: 9, background: '#eef2f7', borderRadius: 3, marginBottom: 8 }} className="skeleton-pulse" />
          <div style={{ width: 110, height: 20, background: '#eef2f7', borderRadius: 4, marginBottom: 8 }} className="skeleton-pulse" />
          <div style={{ width: 90, height: 10, background: '#f1f5f9', borderRadius: 3 }} className="skeleton-pulse" />
        </div>
        <div style={{ width: 36, height: 36, borderRadius: 8, background: '#eef2f7' }} className="skeleton-pulse" />
      </div>
      <div style={{ marginTop: 12, height: 2, background: '#eef2f7', borderRadius: 2 }} />
    </div>
  );
}

// Trend pill (▲ +12% / ▼ -4%)
function TrendPill({ delta, label = 'vs prev' }) {
  if (delta == null || isNaN(delta)) return null;
  const positive = delta >= 0;
  const tone = positive ? { c: '#15803d', bg: '#dcfce7', sym: '▲' } : { c: '#dc2626', bg: '#fee2e2', sym: '▼' };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      fontSize: 9, fontWeight: 800, color: tone.c, background: tone.bg,
      borderRadius: 4, padding: '1px 5px', letterSpacing: 0.2,
    }}>
      {tone.sym} {Math.abs(delta).toFixed(1)}% <span style={{ color: '#94a3b8', fontWeight: 600 }}>{label}</span>
    </span>
  );
}

// Executive KPI card — uses motion values so mousemove doesn't trigger React re-renders
function KpiCard({ title, value, rawValue, sub, gradient, icon: Icon, delay = 0, to, loading = false, deltaPct, compact = true }) {
  const ref = useRef(null);
  const rotX = useMotionValue(0);
  const rotY = useMotionValue(0);
  const springX = useSpring(rotX, { stiffness: 300, damping: 30 });
  const springY = useSpring(rotY, { stiffness: 300, damping: 30 });

  const handleMove = (e) => {
    const el = ref.current; if (!el) return;
    const rect = el.getBoundingClientRect();
    rotX.set(((e.clientY - rect.top) / rect.height - 0.5) * 12);
    rotY.set(((e.clientX - rect.left) / rect.width - 0.5) * -12);
  };
  const handleLeave = () => { rotX.set(0); rotY.set(0); };

  if (loading) return <KpiSkeleton gradient={gradient} />;

  const inner = (
    <motion.div
      ref={ref}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      style={{ rotateX: springX, rotateY: springY, transformStyle: 'preserve-3d', perspective: 800, height: '100%' }}
    >
      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay, duration: 0.5 }}
        whileHover={{ y: -3 }}
        style={{
          background: '#fff',
          border: '1px solid #e5e7eb',
          borderTop: `3px solid ${gradient[0]}`,
          borderRadius: 10, padding: '16px 16px', color: '#0f172a',
          position: 'relative', overflow: 'hidden',
          boxShadow: '0 2px 8px rgba(15,23,42,0.06)',
          height: '100%',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative', zIndex: 1 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <p style={{ fontSize: 9, fontWeight: 800, color: '#64748b', marginBottom: 6, letterSpacing: 0.7, textTransform: 'uppercase' }}>{title}</p>
            <p style={{ fontSize: 20, fontWeight: 900, margin: 0, lineHeight: 1.1, color: '#0f172a' }} title={rawValue !== undefined ? inr(rawValue) : undefined}>
              {rawValue !== undefined
                ? (compact
                    ? <AnimatedNumber target={rawValue} format={v => inrCompact(v)} />
                    : <AnimatedNumber target={rawValue} format={v => inr(v).replace('₹', '')} prefix="₹" />)
                : value}
            </p>
            {(sub || deltaPct != null) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
                {deltaPct != null && <TrendPill delta={deltaPct} />}
                {sub && <span style={{ fontSize: 10, color: '#94a3b8', lineHeight: 1.3 }}>{sub}</span>}
              </div>
            )}
          </div>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: `${gradient[0]}12`, border: `1px solid ${gradient[0]}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginLeft: 8 }}>
            <Icon size={18} color={gradient[0]} />
          </div>
        </div>
        <div style={{ marginTop: 12, height: 2, background: '#eef2f7', borderRadius: 2, position: 'relative', zIndex: 1 }}>
          <motion.div initial={{ width: 0 }} animate={{ width: '65%' }} transition={{ delay: delay + 0.4, duration: 1 }}
            style={{ height: '100%', background: gradient[0], borderRadius: 2, opacity: 0.65 }} />
        </div>
      </motion.div>
    </motion.div>
  );

  if (!to) return inner;
  return <Link to={to} style={{ textDecoration: 'none', display: 'block' }}>{inner}</Link>;
}

// Glass section card
function GlassCard({ title, action, actionTo, children, delay = 0, style = {} }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.45 }}
      style={{
        background: 'rgba(255,255,255,0.88)',
        backdropFilter: 'blur(12px)',
        borderRadius: 14,
        border: '1px solid rgba(255,255,255,0.6)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
        padding: '16px 18px',
        ...style,
      }}
    >
      {(title || action) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          {title && (
            <p style={{ fontSize: 12, fontWeight: 800, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Activity size={13} color="#6366f1" /> {title}
            </p>
          )}
          {action && actionTo && (
            <Link to={actionTo} style={{ fontSize: 11, color: '#6366f1', textDecoration: 'none', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 3 }}>
              {action} <ChevronRight size={12} />
            </Link>
          )}
        </div>
      )}
      {children}
    </motion.div>
  );
}

function EmptyState({ text }) {
  return <div style={{ padding: '20px 0', textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>{text}</div>;
}

function ChartSkeleton({ height = 200 }) {
  return (
    <div style={{ height, padding: 8, display: 'flex', alignItems: 'flex-end', gap: 6 }}>
      {[0.55, 0.7, 0.45, 0.85, 0.6, 0.95, 0.7, 0.5, 0.8, 0.65].map((h, i) => (
        <div key={i} className="skeleton-pulse" style={{
          flex: 1, height: `${h * 100}%`,
          background: 'linear-gradient(180deg, #eef2f7, #f8fafc)',
          borderRadius: 4,
        }} />
      ))}
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'rgba(15,23,42,0.92)', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 11 }}>
      <p style={{ margin: 0, fontWeight: 600, marginBottom: 4 }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ margin: '2px 0', color: p.color }}>
          {p.name}: {typeof p.value === 'number' && p.value > 1000 ? `₹${compactNumber(p.value)}` : p.value}
        </p>
      ))}
    </div>
  );
};

function PulseRow({ icon: Icon, label, value, sub, color = '#6366f1' }) {
  return (
    <motion.div
      whileHover={{ x: 4 }}
      style={{ display: 'flex', alignItems: 'center', gap: 10, border: `1px solid ${color}22`, borderRadius: 10, padding: '9px 10px', background: `${color}08` }}
    >
      <div style={{ width: 32, height: 32, borderRadius: 9, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={15} color={color} />
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#0f172a' }}>{label}</div>
        <div style={{ fontSize: 10, color: '#64748b', marginTop: 1 }}>{sub}</div>
      </div>
      <div style={{ fontSize: 16, fontWeight: 900, color }}>{value}</div>
    </motion.div>
  );
}

export default function Dashboard() {
  const { user } = useAuthStore();
  const role = user?.role || '';
  const dept = (user?.department || '').toLowerCase();

  // Managing director (and users with dashboard-embedded approvals) see the full
  // executive dashboard with their pending approvals embedded near the top.
  const DASHBOARD_APPROVALS_EMAILS = ['stephen@bcim.in', 'it@bcim.in'];
  const isMdRole = MD_DASHBOARD_ROLES.includes(String(role).toLowerCase())
    || DASHBOARD_APPROVALS_EMAILS.includes(user?.email?.toLowerCase());

  if (!['super_admin', 'admin'].includes(role) && !isMdRole) {
    let RoleDash = null;
    if (role === 'project_manager') RoleDash = PMDashboard;
    else if (role === 'site_engineer') RoleDash = SiteEngineerDashboard;
    else if (role === 'qs_engineer') RoleDash = QSDashboard;
    else if (role === 'accountant') RoleDash = AccountsDashboard;
    else if (role === 'hr') RoleDash = HRDashboard;
    else if (role === 'hse_officer') RoleDash = HSEDashboard;
    else if (dept.includes('store')) RoleDash = StoresDashboard;
    else if (dept.includes('procurement') || dept.includes('purchase')) RoleDash = ProcurementDashboard;
    if (RoleDash) return <Suspense fallback={<DashLoader />}><RoleDash /></Suspense>;
  }

  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedProjectId, setSelectedProjectId] = useState('all');
  const [selectedDateRange, setSelectedDateRange] = useState('30d');
  const [selectedBusinessUnit, setSelectedBusinessUnit] = useState('all');
  const [lastRefreshed, setLastRefreshed] = useState(() => new Date());
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [, forceTick] = useState(0);

  const handleRefresh = React.useCallback(() => {
    setRefreshKey(k => k + 1);
    setLastRefreshed(new Date());
  }, []);

  // Tick every 30 s so "X min ago" updates
  useEffect(() => {
    const id = setInterval(() => forceTick(t => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  // Auto-refresh every 2 min when enabled
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(handleRefresh, 120000);
    return () => clearInterval(id);
  }, [autoRefresh, handleRefresh]);

  // Press 'R' to refresh (ignore when typing)
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
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

  const { data: dashboard, isLoading: dashboardLoading } = useQuery({
    queryKey: ['analytics-executive', refreshKey, executiveParams],
    queryFn: () => analyticsAPI.executive(executiveParams).then((r) => r.data?.data || null).catch(() => null),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  const { data: companyProjects = [] } = useQuery({
    queryKey: ['dashboard-projects-fallback'],
    queryFn: () => projectAPI.list().then((r) => toArray(r)).catch(() => []),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // DQS bills respect the same filters (project + date range) and cap result size
  const tqsBillsParams = useMemo(() => ({
    project_id: selectedProjectId !== 'all' ? selectedProjectId : undefined,
    from_date:  dateBounds.dateFrom || undefined,
    to_date:    dateBounds.dateTo   || undefined,
    limit:      500,
  }), [selectedProjectId, dateBounds.dateFrom, dateBounds.dateTo]);

  const { data: tqsBills = [] } = useQuery({
    queryKey: ['dashboard-tqs-bills', refreshKey, tqsBillsParams],
    queryFn: () => tqsBillsAPI.list(tqsBillsParams).then(r => Array.isArray(r.data) ? r.data : (r.data?.data ?? [])).catch(() => []),
    staleTime: 60 * 1000, // 1 minute
  });

  const dashboardProjects   = dashboard?.projects || [];
  const filterOptions       = dashboard?.filters?.options || {};
  const projectOptions      = filterOptions.projects?.length ? filterOptions.projects : companyProjects.map(p => ({ id: p.id, name: p.name, project_code: p.project_code, type: p.type }));
  const businessUnitOptions = filterOptions.business_units?.length ? filterOptions.business_units : [...new Set(companyProjects.map(p => p.type).filter(Boolean))].sort();
  const dashboardKpis       = dashboard?.kpis || {};
  const dashboardCharts     = dashboard?.charts || {};
  const dashboardRecent     = dashboard?.recent || {};
  const dashboardWatchlists = dashboard?.watchlists || {};
  const dashboardPulse      = dashboard?.pulse || {};
  const dashboardExceptions = dashboard?.exceptions || [];

  const safeProjects  = Array.isArray(dashboardProjects) ? dashboardProjects : [];
  const safeRABills   = Array.isArray(dashboardRecent.ra_bills) ? dashboardRecent.ra_bills : [];
  const safePayments  = Array.isArray(dashboardRecent.payments) ? dashboardRecent.payments : [];
  const safeDocs      = Array.isArray(dashboardRecent.documents) ? dashboardRecent.documents : [];

  const lowStockCount         = dashboardKpis.low_stock_count ?? dashboardPulse?.procurement_stores?.low_stock_materials ?? 0;
  const workforceCount        = dashboardKpis.workforce_count ?? 0;
  const openIncidents         = dashboardKpis.open_incidents ?? 0;
  const expiringPermits       = dashboardKpis.expiring_permits ?? 0;
  const openRFIs              = dashboardKpis.open_rfis ?? 0;
  const openNCRs              = dashboardKpis.open_ncrs ?? 0;
  const safetyScore           = dashboardKpis.safety_score;
  const activeProjects        = dashboardKpis.active_projects ?? 0;
  const delayedProjects       = dashboardKpis.delayed_projects ?? 0;
  const completedProjects     = dashboardKpis.completed_projects ?? 0;
  const planningProjects      = dashboardKpis.planning_projects ?? 0;
  const totalContractValue    = dashboardKpis.total_contract_value ?? 0;
  const totalCertified        = dashboardKpis.total_certified ?? 0;
  const pendingRABillCount    = dashboardKpis.pending_ra_bills ?? 0;
  const pendingRAValue        = dashboardKpis.pending_ra_value ?? 0;
  const totalCollections      = dashboardKpis.total_collections ?? 0;
  const receivables           = dashboardKpis.receivables ?? (totalCertified - totalCollections);
  const documentsCount        = dashboardKpis.documents_count ?? safeDocs.length;
  const financeTrendData      = dashboardCharts.finance_trend || [];
  const projectStatusData     = dashboardCharts.project_status || [];
  const delayedWatchlist      = [...(dashboardWatchlists.delayed_projects || [])].slice(0, 5);
  const recentBills           = [...safeRABills].slice(0, 5);
  const recentPayments        = [...safePayments].slice(0, 5);
  const recentDocuments       = [...safeDocs].slice(0, 4);
  const topLowStock           = dashboardPulse?.procurement_stores?.top_low_stock_material || 'No critical material';
  const overduePOCount        = dashboardPulse?.procurement_stores?.pos_requiring_attention ?? 0;
  const totalPurchaseOrders   = dashboardPulse?.procurement_stores?.total_pos ?? 0;
  const totalDocuments        = dashboardPulse?.procurement_stores?.open_documents ?? documentsCount;
  const registeredWorkforce   = dashboardPulse?.documents_workforce?.workforce_count ?? workforceCount;
  const completedProjectsCount = dashboardPulse?.documents_workforce?.completed_projects ?? completedProjects;
  const totalPermits          = dashboardPulse?.quality_safety?.permits_count ?? expiringPermits;
  const totalRFICount         = dashboardPulse?.quality_safety?.rfi_count ?? openRFIs;
  const totalNCRCount         = dashboardPulse?.quality_safety?.ncr_count ?? openNCRs;
  const pendingVendorBills    = dashboardPulse?.procurement_stores?.pending_vendor_bills ?? pendingRABillCount;
  const pendingVendorBillValue = dashboardPulse?.procurement_stores?.pending_vendor_bill_value ?? pendingRAValue;
  const safetyScoreValue      = dashboardPulse?.quality_safety?.safety_score ?? safetyScore;
  const collectionRate        = totalCertified > 0 ? Math.round((totalCollections / totalCertified) * 100) : 0;

  // DQS bills stats
  const tqsTotalBills      = tqsBills.length;
  const tqsTotalInvoice    = tqsBills.reduce((s, b) => s + parseFloat(b.total_amount || 0), 0);
  const tqsTotalCertified  = tqsBills.reduce((s, b) => s + parseFloat(b.certified_net || 0), 0);
  const tqsTotalPaid       = tqsBills.reduce((s, b) => s + parseFloat(b.paid_amount || 0), 0);
  const tqsBalance         = tqsTotalCertified - tqsTotalPaid;
  const tqsPaid            = tqsBills.filter(b => b.workflow_status === 'paid').length;
  const tqsPending         = tqsBills.filter(b => b.workflow_status !== 'paid').length;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  // Composite health score (0–100)
  const healthScore = useMemo(() => {
    const coll = Math.min(100, Math.max(0, collectionRate));
    const projDelayPct = activeProjects > 0 ? (delayedProjects / activeProjects) * 100 : 0;
    const proj = Math.max(0, 100 - projDelayPct);
    const safe = safetyScore != null ? Math.min(100, Math.max(0, safetyScore)) : 70;
    const qIssues = (openRFIs || 0) + (openNCRs || 0);
    const qual = Math.max(0, 100 - qIssues * 5);
    return Math.round(0.4 * coll + 0.3 * proj + 0.15 * safe + 0.15 * qual);
  }, [collectionRate, activeProjects, delayedProjects, safetyScore, openRFIs, openNCRs]);

  const healthTone = healthScore >= 80 ? '#10b981'
                    : healthScore >= 60 ? '#f59e0b'
                    : '#ef4444';
  const healthLabel = healthScore >= 80 ? 'Healthy'
                     : healthScore >= 60 ? 'Watch'
                     : 'At risk';

  const filtersActive = selectedProjectId !== 'all' || selectedDateRange !== 'all' || selectedBusinessUnit !== 'all';

  return (
    <div className="bento-page" style={{ background: '#f6f8fb', minHeight: '100vh', fontFamily: "'Inter',-apple-system,sans-serif" }}>

      {/* ════════════════════ TOP BAR ════════════════════ */}
      <div style={{ position: 'relative', zIndex: 10, borderBottom: '1px solid #e5e7eb', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <motion.div animate={{ rotate: [0, 360] }} transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
            style={{ width: 34, height: 34, borderRadius: 9, background: '#eef2ff', border: '1px solid #c7d2fe', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Zap size={16} color="#4f46e5" />
          </motion.div>
          <div>
            <div style={{ fontSize: 9, color: '#64748b', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Executive Command Centre</div>
            <h1 style={{ fontSize: 15, fontWeight: 900, color: '#0f172a', margin: 0 }}>{greeting}, {user?.name?.split(' ')[0] || 'Admin'}</h1>
            <p style={{ fontSize: 10, color: '#94a3b8', margin: 0 }}>{dayjs().format('dddd, D MMMM YYYY')} · Portfolio wide view</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Last refreshed + auto-toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: '#94a3b8' }}>
            {dashboardLoading && (
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                style={{ width: 12, height: 12, border: '2px solid rgba(99,102,241,0.3)', borderTopColor: '#6366f1', borderRadius: '50%' }} />
            )}
            <span title={lastRefreshed.toLocaleString('en-IN')}>Updated {relTime(lastRefreshed)}</span>
            <button
              onClick={() => setAutoRefresh(a => !a)}
              title={autoRefresh ? 'Auto-refresh on (every 2 min) — click to disable' : 'Click to auto-refresh every 2 min'}
              style={{
                padding: '2px 8px', borderRadius: 999,
                border: `1px solid ${autoRefresh ? '#a7f3d0' : '#e5e7eb'}`,
                background: autoRefresh ? '#dcfce7' : '#fff',
                color: autoRefresh ? '#15803d' : '#64748b',
                fontSize: 9, fontWeight: 800, cursor: 'pointer', letterSpacing: 0.3, textTransform: 'uppercase',
              }}
            >
              {autoRefresh ? '● Live' : 'Live'}
            </button>
          </div>
          <Link to="/projects" style={{ textDecoration: 'none' }}>
            <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
              style={{ padding: '7px 14px', background: '#4f46e5', border: 'none', borderRadius: 8, color: '#fff', fontSize: 11, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
              <Building2 size={13} /> All Projects
            </motion.button>
          </Link>
          <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
            onClick={handleRefresh}
            title="Refresh (R)"
            style={{ width: 32, height: 32, borderRadius: 8, background: '#fff', border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <RefreshCw size={13} color="#64748b" />
          </motion.button>
        </div>
      </div>

      <div style={{ position: 'relative', zIndex: 1, padding: '20px 24px', maxWidth: 1800, margin: '0 auto' }}>

        {/* Filters */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 14px', marginBottom: 18, boxShadow: '0 1px 3px rgba(15,23,42,0.05)' }}>
          <div className="dash-filter-grid">
            {[
              { label: 'Project', value: selectedProjectId, onChange: setSelectedProjectId, options: [{ value: 'all', label: 'All Projects' }, ...projectOptions.map(p => ({ value: p.id, label: p.project_code ? `${p.name} (${p.project_code})` : p.name }))] },
              { label: 'Date Range', value: selectedDateRange, onChange: setSelectedDateRange, options: [{ value: 'all', label: 'All Time' }, { value: '7d', label: 'Last 7 Days' }, { value: '30d', label: 'Last 30 Days' }, { value: '90d', label: 'Last 90 Days' }, { value: '1y', label: 'Last 1 Year' }] },
              { label: 'Business Unit', value: selectedBusinessUnit, onChange: setSelectedBusinessUnit, options: [{ value: 'all', label: 'All Units' }, ...businessUnitOptions.map(u => ({ value: u, label: u }))], hidden: businessUnitOptions.length === 0 },
            ].filter(f => !f.hidden).map(f => (
              <label key={f.label} style={{ display: 'grid', gap: 4, minWidth: 0 }}>
                <span style={{ fontSize: 9, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{f.label}</span>
                <select value={f.value} onChange={e => f.onChange(e.target.value)}
                  style={{ height: 32, borderRadius: 8, border: '1px solid #dbe3ef', padding: '0 10px', background: '#f8fafc', color: '#0f172a', fontSize: 12, fontWeight: 600, outline: 'none', minWidth: 0 }}>
                  {f.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
            ))}
          </div>
        </motion.div>

        {/* Active filter chips */}
        {(selectedProjectId !== 'all' || selectedDateRange !== 'all' || selectedBusinessUnit !== 'all') && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>Active filters:</span>
            {selectedProjectId !== 'all' && (() => {
              const p = projectOptions.find(x => x.id === selectedProjectId);
              return (
                <button onClick={() => setSelectedProjectId('all')}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', border: '1px solid #c7d2fe', background: '#eef2ff', color: '#4338ca', borderRadius: 999, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
                  Project: {p ? (p.project_code || p.name) : selectedProjectId} <span style={{ opacity: 0.6 }}>✕</span>
                </button>
              );
            })()}
            {selectedDateRange !== 'all' && (
              <button onClick={() => setSelectedDateRange('all')}
                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', border: '1px solid #fed7aa', background: '#fff7ed', color: '#c2410c', borderRadius: 999, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
                {({ '7d': 'Last 7 Days', '30d': 'Last 30 Days', '90d': 'Last 90 Days', '1y': 'Last 1 Year' })[selectedDateRange] || selectedDateRange} <span style={{ opacity: 0.6 }}>✕</span>
              </button>
            )}
            {selectedBusinessUnit !== 'all' && (
              <button onClick={() => setSelectedBusinessUnit('all')}
                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#15803d', borderRadius: 999, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
                Unit: {selectedBusinessUnit} <span style={{ opacity: 0.6 }}>✕</span>
              </button>
            )}
            <button onClick={() => { setSelectedProjectId('all'); setSelectedDateRange('all'); setSelectedBusinessUnit('all'); }}
              style={{ padding: '3px 8px', border: '1px solid #e5e7eb', background: '#fff', color: '#64748b', borderRadius: 999, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
              Clear all
            </button>
          </div>
        )}

        {/* Managing Director — pending approvals embedded at top of dashboard */}
        {isMdRole && (
          <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e8edf3', padding: '16px 18px', marginBottom: 18, boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }}>
            <Suspense fallback={<DashLoader />}>
              <ApprovalsPage embedded />
            </Suspense>
          </div>
        )}

        {/* KPI Cards — row 1 */}
        <div className="dash-kpi-grid" style={{ marginBottom: 14 }}>
          <KpiCard title="Portfolio Value"    rawValue={totalContractValue} sub={`${safeProjects.length} projects`} gradient={GRADIENTS[0]} icon={IndianRupee}  delay={0}    to="/projects" loading={dashboardLoading} />
          <KpiCard title="Certified Billing"  rawValue={totalCertified}     sub={`${pendingRABillCount} bills pending`} gradient={GRADIENTS[1]} icon={Receipt}    delay={0.07} to="/qs/ra-bills" loading={dashboardLoading} />
          <KpiCard title="Collections"        rawValue={totalCollections}   sub={`${inrCompact(receivables)} ${receivables < 0 ? 'over-collected' : 'receivable'}`} gradient={GRADIENTS[2]} icon={Wallet}     delay={0.14} to="/finance/payments" loading={dashboardLoading} />
          <KpiCard title="Pending RA Value"   rawValue={pendingRAValue}     sub={`${pendingRABillCount} pending bills`} gradient={GRADIENTS[3]} icon={Clock}      delay={0.21} to="/qs/ra-bills" loading={dashboardLoading} />
        </div>

        {/* KPI Cards — row 2 */}
        <div className="dash-kpi-grid" style={{ marginBottom: 18 }}>
          <KpiCard title="Active Projects"  value={activeProjects}  sub={`${delayedProjects} delayed · ${planningProjects} planning`} gradient={GRADIENTS[4]} icon={Building2}   delay={0.28} to="/projects" loading={dashboardLoading} />
          <KpiCard title="Safety Score"     value={safetyScore != null ? `${Math.round(safetyScore)}/100` : 'N/A'} sub={`${openIncidents} open incidents`} gradient={GRADIENTS[5]} icon={Shield}      delay={0.35} to="/hse/incidents" loading={dashboardLoading} />
          <KpiCard title="Quality Issues"   value={openRFIs + openNCRs} sub={`${openRFIs} RFIs · ${openNCRs} NCRs`} gradient={GRADIENTS[6]} icon={FileWarning}  delay={0.42} to="/quality" loading={dashboardLoading} />
          <KpiCard title="Workforce"        value={workforceCount} sub={`${documentsCount} documents`} gradient={GRADIENTS[7]} icon={HardHat}      delay={0.49} to="/hr/workers" loading={dashboardLoading} />
        </div>

        {/* DQS Bills Summary Row */}
        <div className="dash-kpi-grid" style={{ marginBottom: 14 }}>
          <KpiCard title="DQS Total Bills"     value={String(tqsTotalBills)}          sub={`${tqsPaid} paid · ${tqsPending} pending`}  gradient={['#f7971e','#ffd200']} icon={FileText}      delay={0.56} to="/tqs" />
          <KpiCard title="DQS Invoice Value"   rawValue={tqsTotalInvoice}             sub="Total vendor invoices"                       gradient={['#11998e','#38ef7d']} icon={IndianRupee}    delay={0.6}  to="/tqs/bills" />
          <KpiCard title="DQS Certified"       rawValue={tqsTotalCertified}           sub="QS certified amount"                         gradient={['#6a11cb','#2575fc']} icon={ClipboardList}  delay={0.64} to="/tqs/bills" />
          <KpiCard title="DQS Balance to Pay"  rawValue={tqsBalance}                  sub="Outstanding vendor payments"                 gradient={['#f953c6','#b91d73']} icon={Clock}          delay={0.68} to="/tqs/bills" />
        </div>

        {/* Charts row 1 */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 14, marginBottom: 14 }}>

          {/* Area chart */}
          <GlassCard title="Billing vs Collections Trend" delay={0.3}>
            {dashboardLoading ? (
              <ChartSkeleton height={200} />
            ) : !financeTrendData.length || financeTrendData.every(i => i.billed === 0 && i.collected === 0) ? (
              <EmptyState text="No billing or collection data for selected range" />
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={financeTrendData}>
                  <defs>
                    <linearGradient id="gBill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gCollect" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 9 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="billed" stroke="#6366f1" strokeWidth={2.5} fill="url(#gBill)" name="Billed" />
                  <Area type="monotone" dataKey="collected" stroke="#10b981" strokeWidth={2.5} fill="url(#gCollect)" name="Collected" />
                </AreaChart>
              </ResponsiveContainer>
            )}
            <div style={{ display: 'flex', gap: 16, marginTop: 6 }}>
              {[['#6366f1', 'Billed'], ['#10b981', 'Collected']].map(([c, l]) => (
                <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 18, height: 2.5, background: c, borderRadius: 2 }} />
                  <span style={{ fontSize: 10, color: '#64748b' }}>{l}</span>
                </div>
              ))}
            </div>
          </GlassCard>

          {/* Project status donut */}
          <GlassCard title="Project Status" action="View All" actionTo="/projects" delay={0.35}>
            {dashboardLoading ? <ChartSkeleton height={150} /> :
             projectStatusData.length === 0 ? <EmptyState text="No project data" /> : (
              <>
                <ResponsiveContainer width="100%" height={150}>
                  <PieChart>
                    <Pie data={projectStatusData} dataKey="value" innerRadius={40} outerRadius={65} paddingAngle={3} animationBegin={400} animationDuration={1000}>
                      {projectStatusData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="none" />)}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ display: 'grid', gap: 5 }}>
                  {projectStatusData.map((item, i) => (
                    <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: PIE_COLORS[i % PIE_COLORS.length], flexShrink: 0 }} />
                      <span style={{ color: '#64748b' }}>{item.name}</span>
                      <strong style={{ marginLeft: 'auto', color: '#0f172a' }}>{item.value}</strong>
                    </div>
                  ))}
                </div>
              </>
            )}
          </GlassCard>

          {/* Collection rate radial */}
          <GlassCard title="Collection Rate" delay={0.4}>
            <div style={{ position: 'relative', height: 150 }}>
              <ResponsiveContainer width="100%" height={150}>
                <RadialBarChart cx="50%" cy="50%" innerRadius="45%" outerRadius="85%"
                  data={[{ name: 'Collected', value: collectionRate, fill: '#10b981' }, { name: 'Target', value: 100, fill: '#e2e8f0' }]}
                  startAngle={180} endAngle={-180}>
                  <RadialBar dataKey="value" cornerRadius={6} animationBegin={500} animationDuration={1200} />
                </RadialBarChart>
              </ResponsiveContainer>
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center' }}>
                <p style={{ fontSize: 26, fontWeight: 800, color: '#10b981', margin: 0 }}>{collectionRate}%</p>
                <p style={{ fontSize: 9, color: '#94a3b8', margin: 0 }}>of certified</p>
              </div>
            </div>
            <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                <span style={{ color: '#64748b' }}>Certified</span>
                <strong style={{ color: '#0f172a' }} title={inr(totalCertified)}>{inrCompact(totalCertified)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                <span style={{ color: '#64748b' }}>Collected</span>
                <strong style={{ color: '#10b981' }} title={inr(totalCollections)}>{inrCompact(totalCollections)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                <span style={{ color: '#64748b' }}>Outstanding</span>
                <strong style={{ color: '#ef4444' }} title={inr(receivables)}>{inrCompact(receivables)}</strong>
              </div>
            </div>
          </GlassCard>
        </div>

        {/* Exceptions + Delayed watchlist row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr 1.2fr', gap: 14, marginBottom: 14 }}>

          {/* Exceptions */}
          <GlassCard title="Exceptions & Alerts" delay={0.45}>
            <div style={{ display: 'grid', gap: 7 }}>
              {dashboardExceptions.length === 0 ? <EmptyState text="No exceptions" /> : dashboardExceptions.map((card) => (
                <Link key={card.label} to={card.to} style={{ textDecoration: 'none', border: `1px solid ${card.tone}33`, borderRadius: 10, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, background: `${card.tone}08` }}>
                  <motion.span animate={{ scale: [1, 1.3, 1] }} transition={{ duration: 2, repeat: Infinity }}
                    style={{ width: 8, height: 8, borderRadius: '50%', background: card.tone, flexShrink: 0 }} />
                  <span style={{ color: '#334155', fontSize: 12, fontWeight: 600 }}>{card.label}</span>
                  <span style={{ marginLeft: 'auto', color: '#0f172a', fontSize: 15, fontWeight: 800 }}>{card.value}</span>
                </Link>
              ))}
            </div>
          </GlassCard>

          {/* Delayed projects */}
          <GlassCard title="Delayed Projects Watchlist" action="View All" actionTo="/projects" delay={0.5}>
            {delayedWatchlist.length === 0 ? <EmptyState text="No delayed projects" /> : (
              <div style={{ display: 'grid', gap: 8 }}>
                {delayedWatchlist.map((project) => {
                  const progress = Math.max(0, Math.min(100, parseFloat(project.progress_pct || 0)));
                  return (
                    <motion.div key={project.id} whileHover={{ x: 3 }}
                      style={{ border: '1px solid #fde7c7', borderRadius: 10, padding: '10px 12px', background: '#fff7ed' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                        <strong style={{ color: '#0f172a', fontSize: 12 }}>{project.name}</strong>
                        <span style={{ fontSize: 10, color: '#f59e0b', fontWeight: 800 }}>{progress}%</span>
                      </div>
                      <div style={{ height: 4, borderRadius: 999, background: '#fde7c7', overflow: 'hidden', marginBottom: 4 }}>
                        <motion.div initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ duration: 1, delay: 0.6 }}
                          style={{ height: '100%', background: 'linear-gradient(90deg,#f59e0b,#ef4444)' }} />
                      </div>
                      <div style={{ fontSize: 10, color: '#64748b' }}>{project.city || 'City not set'} · {inrCompact(project.contract_value)}</div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </GlassCard>

          {/* Recent Payments */}
          <GlassCard title="Recent Payments" action="View All" actionTo="/finance/payments" delay={0.55}>
            {recentPayments.length === 0 ? <EmptyState text="No payments recorded" /> : (
              <div style={{ display: 'grid', gap: 6 }}>
                {recentPayments.map((payment) => (
                  <motion.div key={payment.id} whileHover={{ x: 3 }}
                    style={{ border: '1px solid #d1fae5', borderRadius: 10, padding: '8px 12px', background: '#ecfdf5' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{payment.entity_name || payment.project_name || 'Payment'}</div>
                        <div style={{ fontSize: 10, color: '#64748b', marginTop: 1 }}>{dayjs(payment.payment_date || payment.created_at).format('DD MMM YYYY')}</div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 800, color: '#0f172a' }} title={inr(payment.net_amount || payment.amount)}>{inrCompact(payment.net_amount || payment.amount)}</div>
                        <div style={{ fontSize: 9, color: '#10b981', fontWeight: 800, textTransform: 'uppercase' }}>{payment.payment_type || 'payment'}</div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </GlassCard>
        </div>

        {/* Bottom pulse row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>

          <GlassCard title="Procurement & Stores Pulse" action="Inventory" actionTo="/procurement/inventory" delay={0.6}>
            <div style={{ display: 'grid', gap: 7 }}>
              <PulseRow icon={ClipboardList} label="POs Requiring Attention" value={overduePOCount}      sub={`${totalPurchaseOrders} total orders`}     color="#f97316" />
              <PulseRow icon={Package}       label="Low Stock Materials"      value={lowStockCount}       sub={topLowStock}                                color="#ef4444" />
              <PulseRow icon={Receipt}       label="Pending Vendor Bills"     value={pendingVendorBills}  sub={inrCompact(pendingVendorBillValue)}         color="#8b5cf6" />
              <PulseRow icon={Building2}     label="Open Documents"           value={totalDocuments}      sub={`${recentDocuments.length} recent uploads`} color="#06b6d4" />
            </div>
          </GlassCard>

          <GlassCard title="Quality & Safety Pulse" action="HSE" actionTo="/hse" delay={0.65}>
            <div style={{ display: 'grid', gap: 7 }}>
              <PulseRow icon={Shield}        label="Safety Score"       value={safetyScoreValue != null ? `${Math.round(safetyScoreValue)}` : 'N/A'} sub={`${openIncidents} open incidents`}   color="#10b981" />
              <PulseRow icon={AlertTriangle} label="Expiring Permits"   value={expiringPermits}  sub={`${totalPermits} permits on record`}           color="#f59e0b" />
              <PulseRow icon={FileWarning}   label="Open NCRs"          value={openNCRs}         sub={`${totalNCRCount} total NCR entries`}           color="#ef4444" />
              <PulseRow icon={CheckCircle2}  label="Open RFIs"          value={openRFIs}         sub={`${totalRFICount} total RFI entries`}           color="#6366f1" />
            </div>
          </GlassCard>

          <GlassCard title="Documents & Workforce" action="Documents" actionTo="/documents" delay={0.7}>
            {recentDocuments.length === 0 ? <EmptyState text="No recent documents" /> : (
              <div style={{ display: 'grid', gap: 6 }}>
                {recentDocuments.map((doc) => (
                  <motion.div key={doc.id} whileHover={{ x: 3 }}
                    style={{ border: '1px solid #e8edf3', borderRadius: 9, padding: '7px 10px', background: '#f8fafc' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 28, height: 28, borderRadius: 7, background: '#eef2ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <FileText size={13} color="#6366f1" />
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{doc.file_name}</div>
                        <div style={{ fontSize: 10, color: '#64748b', marginTop: 1 }}>{doc.module || 'general'} · {dayjs(doc.created_at).format('DD MMM')}</div>
                      </div>
                    </div>
                  </motion.div>
                ))}
                <div style={{ marginTop: 6, paddingTop: 8, borderTop: '1px solid #f1f5f9', display: 'grid', gap: 6 }}>
                  <PulseRow icon={HardHat}      label="Registered Workforce"  value={registeredWorkforce}      sub="active worker records" color="#6366f1" />
                  <PulseRow icon={CalendarRange} label="Completed Projects"    value={completedProjectsCount}   sub="closed deliveries"     color="#10b981" />
                </div>
              </div>
            )}
          </GlassCard>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        * { box-sizing: border-box; }
        select option { background: #1e293b; color: #fff; }

        /* Responsive filter row: 3 cols on desktop, 2 on tablet, 1 on phone */
        .dash-filter-grid {
          display: grid;
          gap: 10px;
          align-items: end;
          grid-template-columns: minmax(0,1.6fr) minmax(0,0.7fr) minmax(0,0.7fr);
        }
        @media (max-width: 900px) {
          .dash-filter-grid { grid-template-columns: 1fr 1fr; }
        }
        @media (max-width: 560px) {
          .dash-filter-grid { grid-template-columns: 1fr; }
        }

        /* Responsive KPI grid: 4 → 3 → 2 → 1 */
        .dash-kpi-grid {
          display: grid;
          gap: 14px;
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }
        @media (max-width: 1180px) {
          .dash-kpi-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        }
        @media (max-width: 900px) {
          .dash-kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (max-width: 560px) {
          .dash-kpi-grid { grid-template-columns: 1fr; }
        }

        /* Skeleton shimmer */
        @keyframes skeleton-pulse {
          0%   { opacity: 1; }
          50%  { opacity: 0.5; }
          100% { opacity: 1; }
        }
        .skeleton-pulse { animation: skeleton-pulse 1.4s ease-in-out infinite; }
      `}</style>
    </div>
  );
}
