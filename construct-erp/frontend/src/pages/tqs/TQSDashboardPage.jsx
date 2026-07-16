import React, { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { motion, animate } from 'framer-motion';
import {
  AreaChart, Area, PieChart, Pie, Cell, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import { tqsBillsAPI, projectAPI, liabilityRegisterAPI } from '../../api/client';
import {
  FileText, Clock, CheckCircle2, AlertTriangle,
  Package, IndianRupee, ClipboardCheck, Warehouse,
  CreditCard, TrendingUp, ChevronRight, ArrowUpRight,
  Activity, LayoutDashboard, Landmark,
} from 'lucide-react';

const inr = (v) => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATUS_CONFIG = {
  pending:             { label: 'Pending',     color: '#D97706', bg: '#FFFBEB', icon: Clock },
  stores:              { label: 'Stores',      color: '#2563EB', bg: '#EFF6FF', icon: Warehouse },
  document_controller: { label: 'Doc Control', color: '#0891B2', bg: '#ECFEFF', icon: FileText },
  qs:                  { label: 'QS',          color: '#4F46E5', bg: '#EEF2FF', icon: ClipboardCheck },
  accounts:            { label: 'Accounts',    color: '#7C3AED', bg: '#F5F3FF', icon: CreditCard },
  partial:             { label: 'Partial Paid',color: '#0891B2', bg: '#ECFEFF', icon: CreditCard },
  procurement:         { label: 'Procurement', color: '#C2410C', bg: '#FFF7ED', icon: Package },
  paid:                { label: 'Paid',        color: '#059669', bg: '#ECFDF5', icon: CheckCircle2 },
};

const KPI_ACCENTS = [
  { accent: '#2563EB', iconBg: '#EFF6FF', iconColor: '#2563EB' },
  { accent: '#0891B2', iconBg: '#ECFEFF', iconColor: '#0891B2' },
  { accent: '#059669', iconBg: '#ECFDF5', iconColor: '#059669' },
  { accent: '#D97706', iconBg: '#FFFBEB', iconColor: '#D97706' },
  { accent: '#C2410C', iconBg: '#FFF7ED', iconColor: '#C2410C' },
  { accent: '#BE123C', iconBg: '#FFF1F2', iconColor: '#BE123C' },
];

function useAnimatedCounter(target, duration = 1.2) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const controls = animate(0, target, {
      duration,
      ease: 'easeOut',
      onUpdate: v => setValue(Math.round(v)),
    });
    return controls.stop;
  }, [target]);
  return value;
}

function KpiCard({ label, value, numericValue, sub, theme, icon: Icon, delay = 0, onClick }) {
  const count = useAnimatedCounter(numericValue || 0);
  const display = numericValue !== undefined
    ? (value.startsWith('₹') ? `₹${inr(count)}` : String(count))
    : value;
  const valueSize = display.length > 13 ? 14 : display.length > 10 ? 15 : 18;
  const defaultRoute = {
    'Total Bills': '/tqs/bills',
    'Invoice Value': '/tqs/bills',
    'Certified Amount': '/tqs/reports',
    'Advance Balance': '/tqs/liability-register',
    'Balance to Pay': '/tqs/liability-register',
    'Closing Balance': '/tqs/liability-register',
  }[label];
  const handleClick = onClick || (defaultRoute ? () => { window.location.href = defaultRoute; } : null);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.35, ease: 'easeOut' }}
      role={handleClick ? 'button' : undefined}
      tabIndex={handleClick ? 0 : undefined}
      onClick={handleClick}
      onKeyDown={e => {
        if (!handleClick) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
      whileHover={handleClick ? { y: -2 } : undefined}
      whileTap={handleClick ? { scale: 0.99 } : undefined}
      style={{
        background: '#fff',
        borderRadius: 10,
        padding: '10px 10px 9px',
        border: '1px solid #E2E8F0',
        borderLeft: `4px solid ${theme.accent}`,
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        minWidth: 0,
        overflow: 'hidden',
        cursor: handleClick ? 'pointer' : 'default',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <div className="dqs-kpi-icon" style={{
          width: 30, height: 30, borderRadius: 8,
          background: theme.iconBg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Icon size={16} color={theme.iconColor} />
        </div>
        <p style={{ fontSize: 9, fontWeight: 800, color: '#64748B', margin: 0, textTransform: 'uppercase', letterSpacing: 0.3, lineHeight: 1.18, overflowWrap: 'anywhere' }}>{label}</p>
      </div>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: valueSize, fontWeight: 850, color: '#0F172A', margin: 0, lineHeight: 1.08, letterSpacing: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'clip' }}>{display}</p>
        {sub && (
          <p style={{ fontSize: 9, color: '#94A3B8', marginTop: 5, display: 'flex', alignItems: 'center', gap: 3, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            <ArrowUpRight size={10} /> {sub}
          </p>
        )}
      </div>
    </motion.div>
  );
}

function Card({ children, style = {}, delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.35 }}
      style={{
        background: '#fff',
        borderRadius: 12,
        border: '1px solid #E2E8F0',
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        padding: 20,
        ...style,
      }}
    >
      {children}
    </motion.div>
  );
}

function CardTitle({ children, action }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
      <p style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', margin: 0 }}>{children}</p>
      {action}
    </div>
  );
}

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#1E293B', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 11, boxShadow: '0 4px 16px rgba(0,0,0,0.18)' }}>
      <p style={{ margin: '0 0 4px', fontWeight: 700, color: '#94A3B8', fontSize: 10 }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ margin: '2px 0', color: p.color, fontWeight: 600 }}>
          {p.name}: ₹{inr(p.value)}
        </p>
      ))}
    </div>
  );
};

export default function DQSDashboardPage() {
  const navigate = useNavigate();

  const { data: bills = [] } = useQuery({
    queryKey: ['tqs-bills', 'dashboard'],
    queryFn: () => tqsBillsAPI.list({}).then(r => Array.isArray(r.data) ? r.data : (r.data?.data ?? [])),
    staleTime: 5 * 60 * 1000,
    refetchOnMount: 'always',
  });

  const { data: advancesData = [] } = useQuery({
    queryKey: ['tqs-advances', 'dashboard'],
    queryFn: () => tqsBillsAPI.listAdvances({}).then(r => r.data?.data ?? []),
    staleTime: 5 * 60 * 1000,
    refetchOnMount: 'always',
  });

  const { data: liabilityVendors = [] } = useQuery({
    queryKey: ['liability-summary', 'dashboard'],
    queryFn: () => liabilityRegisterAPI.summary({}).then(r => r.data ?? []),
    staleTime: 5 * 60 * 1000,
    refetchOnMount: 'always',
  });

  const totalBills        = bills.length;
  const pending           = bills.filter(b => b.workflow_status === 'pending').length;
  const inStores          = bills.filter(b => b.workflow_status === 'stores').length;
  const inDocControl      = bills.filter(b => b.workflow_status === 'document_controller').length;
  const inQS              = bills.filter(b => b.workflow_status === 'qs').length;
  // accounts + partial both mean "with accounts, awaiting payment"
  const inAccounts        = bills.filter(b => b.workflow_status === 'accounts' || b.workflow_status === 'partial').length;
  const inProcurement     = bills.filter(b => b.workflow_status === 'procurement').length;
  const paid              = bills.filter(b => b.workflow_status === 'paid').length;

  const totalInvoiceValue  = bills.reduce((s, b) => s + parseFloat(b.total_amount || 0), 0);
  // Use actual paid_amount from DB (sum across all bills)
  const totalPaid          = bills.reduce((s, b) => s + parseFloat(b.paid_amount || 0), 0);
  const totalCertified     = bills.reduce((s, b) => s + parseFloat(b.certified_net || 0), 0);

  const totalAdvancePaid      = advancesData.reduce((s, a) => s + parseFloat(a.amount || 0), 0);
  const totalAdvanceRecovered = advancesData.reduce((s, a) => s + parseFloat(a.recovered_amount || 0), 0);
  const advancePendingFromLiability = liabilityVendors.reduce((s, v) => s + parseFloat(v.total_advance_open || 0), 0);
  const totalAdvancePending   = liabilityVendors.length > 0
    ? advancePendingFromLiability
    : Math.max(0, totalAdvancePaid - totalAdvanceRecovered);

  const fallbackBillClosing = bills.reduce((s, b) => {
    if (b.workflow_status === 'paid') return s;
    const paidAmt = parseFloat(b.paid_amount || 0);
    const certified = parseFloat(b.certified_net);
    const fallbackNet = parseFloat(b.total_amount || 0)
      - parseFloat(b.tds_deduction || 0)
      - parseFloat(b.other_deductions || 0)
      - parseFloat(b.advance_recovered || 0)
      - paidAmt;
    const billNet = Number.isFinite(certified) ? certified - paidAmt : fallbackNet;
    return s + Math.max(0, billNet);
  }, 0) - totalAdvancePending;

  const liabilityClosing = liabilityVendors.reduce((s, v) => s + parseFloat(v.net_balance || 0), 0);
  const totalVendorClosing = liabilityVendors.length > 0 ? liabilityClosing : fallbackBillClosing;
  const totalVendorPayableFromLiability = liabilityVendors.reduce((s, v) => s + parseFloat(v.payable_balance || 0), 0);
  const totalVendorPayable = liabilityVendors.length > 0
    ? totalVendorPayableFromLiability
    : Math.max(0, fallbackBillClosing);
  const totalVendorAdvanceDrFromLiability = liabilityVendors.reduce((s, v) => s + parseFloat(v.advance_balance_dr || 0), 0);
  const totalVendorAdvanceDr = liabilityVendors.length > 0
    ? totalVendorAdvanceDrFromLiability
    : Math.max(0, -fallbackBillClosing);

  const collectionRate = totalCertified > 0
    ? Math.round(((totalPaid + totalAdvancePending) / totalCertified) * 100)
    : 0;

  const today = new Date();
  const overdue = bills.filter(b => {
    if (b.workflow_status === 'paid') return false;
    if (!b.certified_net || parseFloat(b.certified_net) <= 0) return false;
    // Overdue = certified but waiting > 30 days since QS certification
    const refDate = b.qs_certified_date || b.created_at;
    return refDate && (today - new Date(refDate)) / (1000 * 60 * 60 * 24) > 30;
  });

  const recent = [...bills].slice(0, 6);

  const pipeline = [
    { label: 'Pending',     value: pending,       key: 'pending',             ...STATUS_CONFIG.pending },
    { label: 'Stores',      value: inStores,       key: 'stores',              ...STATUS_CONFIG.stores },
    { label: 'Doc Control', value: inDocControl,   key: 'document_controller', ...STATUS_CONFIG.document_controller },
    { label: 'QS',          value: inQS,           key: 'qs',                  ...STATUS_CONFIG.qs },
    { label: 'Accounts',    value: inAccounts,     key: 'accounts',            ...STATUS_CONFIG.accounts },
    { label: 'Procurement', value: inProcurement,  key: 'procurement',         ...STATUS_CONFIG.procurement },
    { label: 'Paid',        value: paid,           key: 'paid',                ...STATUS_CONFIG.paid },
  ];

  const donutData = pipeline.filter(d => d.value > 0).map(d => ({ name: d.label, value: d.value, fill: d.color }));

  // ── Real monthly trend from actual bill dates ──────────────────────────────
  const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const monthlyMap = {};
  bills.forEach(b => {
    const dateStr = b.inv_date || b.created_at;
    if (!dateStr) return;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return;
    const yr = d.getFullYear();
    const mo = d.getMonth();
    const key = `${yr}-${String(mo).padStart(2, '0')}`;
    const label = `${MONTH_LABELS[mo]} '${String(yr).slice(2)}`;
    if (!monthlyMap[key]) monthlyMap[key] = { month: label, key, invoiced: 0, certified: 0, paid: 0 };
    monthlyMap[key].invoiced  += parseFloat(b.total_amount  || 0);
    monthlyMap[key].certified += parseFloat(b.certified_net || 0);
    monthlyMap[key].paid      += parseFloat(b.paid_amount   || 0);
  });
  const trendData = Object.values(monthlyMap)
    .sort((a, z) => a.key.localeCompare(z.key))
    .slice(-9); // last 9 months

  return (
    <div className="dqs-dashboard" style={{ background: '#F8FAFC', minHeight: '100vh' }}>
      <style>{`
        .dqs-dashboard {
          overflow-x: hidden;
        }
        .dqs-header {
          padding: 14px 20px !important;
        }
        .dqs-kpi-grid {
          grid-template-columns: repeat(6, minmax(0, 1fr)) !important;
          gap: 8px !important;
        }
        .dqs-content {
          padding: 12px 20px !important;
          max-width: 1280px !important;
        }
        .dqs-pipeline-grid {
          grid-template-columns: repeat(7, minmax(0, 1fr)) !important;
          gap: 7px !important;
        }
        .dqs-chart-grid {
          gap: 10px !important;
        }
        @media (max-width: 1180px) {
          .dqs-kpi-grid {
            grid-template-columns: repeat(6, minmax(0, 1fr)) !important;
          }
          .dqs-pipeline-grid {
            grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
          }
        }
        @media (max-width: 920px) {
          .dqs-kpi-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
          }
        }
        @media (max-width: 820px) {
          .dqs-header-top {
            align-items: flex-start !important;
            flex-direction: column !important;
            gap: 12px !important;
          }
          .dqs-kpi-grid,
          .dqs-pipeline-grid,
          .dqs-chart-grid,
          .dqs-bottom-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>

      {/* ── Header ── */}
      <div style={{
        background: '#fff',
        borderBottom: '1px solid #E2E8F0',
        padding: '18px 28px',
      }}>
        <div className="dqs-header-top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 9, background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <LayoutDashboard size={18} color="#4F46E5" />
            </div>
            <div>
              <h1 style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', margin: 0 }}>Bill Tracker Dashboard</h1>
              <p style={{ fontSize: 11, color: '#94A3B8', margin: '2px 0 0', fontWeight: 500 }}>Live invoice tracker · All departments</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {overdue.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '5px 12px' }}>
                <AlertTriangle size={12} color="#EF4444" />
                <span style={{ fontSize: 11, fontWeight: 600, color: '#DC2626' }}>{overdue.length} overdue</span>
              </div>
            )}
            <div style={{ fontSize: 11, fontWeight: 600, color: '#64748B', background: '#F1F5F9', borderRadius: 8, padding: '5px 12px', border: '1px solid #E2E8F0' }}>
              {totalBills} total bills
            </div>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="dqs-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12 }}>
          <KpiCard label="Total Bills"       value={String(totalBills)}             numericValue={totalBills}          sub="All invoices"              theme={KPI_ACCENTS[0]} icon={FileText}       delay={0}    onClick={() => navigate('/tqs/bills')} />
          <KpiCard label="Invoice Value"     value={`₹${inr(totalInvoiceValue)}`}   numericValue={totalInvoiceValue}   sub="Total invoiced"            theme={KPI_ACCENTS[1]} icon={IndianRupee}    delay={0.06} />
          <KpiCard label="Certified Amount"  value={`₹${inr(totalCertified)}`}      numericValue={totalCertified}      sub="QS certified"              theme={KPI_ACCENTS[2]} icon={ClipboardCheck} delay={0.12} />
          <KpiCard label="Advance Balance"   value={`₹${inr(totalAdvancePending)}`} numericValue={totalAdvancePending} sub={`of ₹${inr(totalAdvancePaid)} paid`} theme={KPI_ACCENTS[3]} icon={Landmark}  delay={0.18} />
          <KpiCard label="Balance to Pay"    value={`₹${inr(totalVendorPayable)}`}  numericValue={totalVendorPayable}  sub="Vendor Cr balances"        theme={KPI_ACCENTS[4]} icon={Clock}          delay={0.24} />
          <KpiCard
            label="Closing Balance"
            value={`₹${inr(Math.abs(totalVendorClosing))} ${totalVendorClosing >= 0 ? 'Cr' : 'Dr'}`}
            sub={totalVendorClosing >= 0 ? `Cr less Dr ₹${inr(totalVendorAdvanceDr)}` : 'Net advance Dr'}
            theme={KPI_ACCENTS[5]}
            icon={Activity}
            delay={0.30}
          />
        </div>
      </div>

      <div className="dqs-content" style={{ padding: '16px 28px', maxWidth: 1400, margin: '0 auto' }}>

        {/* ── Pipeline Status ── */}
        <div className="dqs-pipeline-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8, marginBottom: 16 }}>
          {pipeline.map((s, i) => (
            <motion.button
              key={s.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.28 + i * 0.04 }}
              onClick={() => navigate(`/tqs/bills?status=${s.key}`)}
              style={{
                background: '#fff',
                border: '1px solid #E2E8F0',
                borderTop: `3px solid ${s.color}`,
                borderRadius: 10,
                padding: '10px 7px 9px',
                textAlign: 'center',
                cursor: 'pointer',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                transition: 'box-shadow 0.15s, border-color 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'; }}
            >
              <p style={{ fontSize: 21, fontWeight: 800, color: s.color, margin: 0, lineHeight: 1 }}>{s.value}</p>
              <p style={{ fontSize: 9, color: '#64748B', marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 600, lineHeight: 1.15 }}>{s.label}</p>
              <div style={{ marginTop: 7, height: 2, background: '#F1F5F9', borderRadius: 1, overflow: 'hidden' }}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: totalBills > 0 ? `${Math.round((s.value / totalBills) * 100)}%` : '0%' }}
                  transition={{ delay: 0.4 + i * 0.05, duration: 0.8 }}
                  style={{ height: '100%', background: s.color, borderRadius: 1, opacity: 0.7 }}
                />
              </div>
            </motion.button>
          ))}
        </div>

        {/* ── Charts Row 1 ── */}
        <div className="dqs-chart-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14, marginBottom: 14 }}>

          <Card delay={0.35}>
            <CardTitle>Invoice vs Certified Trend</CardTitle>
            <ResponsiveContainer width="100%" height={210}>
              <AreaChart data={trendData} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="gI" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#4F46E5" stopOpacity={0.12} />
                    <stop offset="95%" stopColor="#4F46E5" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gC" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#059669" stopOpacity={0.12} />
                    <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gP" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#D97706" stopOpacity={0.12} />
                    <stop offset="95%" stopColor="#D97706" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} tickFormatter={v => `₹${inr(v)}`} width={72} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="invoiced"  stroke="#4F46E5" strokeWidth={2} fill="url(#gI)" dot={false} name="Invoiced" />
                <Area type="monotone" dataKey="certified" stroke="#059669" strokeWidth={2} fill="url(#gC)" dot={false} name="Certified" />
                <Area type="monotone" dataKey="paid"      stroke="#D97706" strokeWidth={2} fill="url(#gP)" dot={false} name="Paid" />
              </AreaChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', gap: 18, marginTop: 8 }}>
              {[['#4F46E5','Invoiced'],['#059669','Certified'],['#D97706','Paid']].map(([c,l]) => (
                <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 20, height: 2.5, background: c, borderRadius: 2 }} />
                  <span style={{ fontSize: 11, color: '#64748B', fontWeight: 500 }}>{l}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card delay={0.4}>
            <CardTitle>Pipeline Distribution</CardTitle>
            <ResponsiveContainer width="100%" height={170}>
              <PieChart>
                <Pie
                  data={donutData.length ? donutData : [{ name: 'No data', value: 1, fill: '#E2E8F0' }]}
                  cx="50%" cy="50%"
                  innerRadius={48} outerRadius={74}
                  paddingAngle={2}
                  dataKey="value"
                  animationBegin={250}
                  animationDuration={1000}
                >
                  {donutData.map((e, i) => <Cell key={i} fill={e.fill} stroke="none" />)}
                </Pie>
                <Tooltip formatter={(v, n) => [`${v} bills`, n]} contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #E2E8F0', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginTop: 4 }}>
              {donutData.map(d => (
                <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: d.fill, flexShrink: 0 }} />
                  <span style={{ fontSize: 10, color: '#64748B', fontWeight: 500 }}>{d.name} ({d.value})</span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* ── Charts Row 2 ── */}
        <div className="dqs-chart-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14, marginBottom: 14 }}>

          <Card delay={0.45}>
            <CardTitle>Monthly Invoice vs Certified</CardTitle>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={trendData} margin={{ top: 5, right: 10, left: 10, bottom: 0 }} barSize={14} barGap={3}>
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} tickFormatter={v => `₹${inr(v)}`} width={72} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="invoiced"  fill="#4F46E5" radius={[4, 4, 0, 0]} name="Invoiced" />
                <Bar dataKey="certified" fill="#059669" radius={[4, 4, 0, 0]} name="Certified" />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card delay={0.5}>
            <CardTitle>Collection Rate</CardTitle>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 180 }}>
              <div style={{ position: 'relative', width: 130, height: 130 }}>
                <svg width="130" height="130" style={{ transform: 'rotate(-90deg)' }}>
                  <circle cx="65" cy="65" r="52" fill="none" stroke="#F1F5F9" strokeWidth="12" />
                  <motion.circle
                    cx="65" cy="65" r="52"
                    fill="none"
                    stroke="#4F46E5"
                    strokeWidth="12"
                    strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 52}`}
                    initial={{ strokeDashoffset: 2 * Math.PI * 52 }}
                    animate={{ strokeDashoffset: 2 * Math.PI * 52 * (1 - collectionRate / 100) }}
                    transition={{ duration: 1.2, ease: 'easeOut', delay: 0.6 }}
                  />
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 26, fontWeight: 800, color: '#0F172A', lineHeight: 1 }}>{collectionRate}%</span>
                  <span style={{ fontSize: 10, color: '#94A3B8', fontWeight: 500, marginTop: 2 }}>collected</span>
                </div>
              </div>
              <div style={{ marginTop: 12, display: 'flex', gap: 12, borderTop: '1px solid #F1F5F9', paddingTop: 12, width: '100%', justifyContent: 'center' }}>
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#059669', margin: 0 }}>₹{inr(totalPaid)}</p>
                  <p style={{ fontSize: 10, color: '#94A3B8', margin: '2px 0 0', fontWeight: 500 }}>Paid</p>
                </div>
                <div style={{ width: 1, background: '#E2E8F0' }} />
                {totalAdvancePending > 0 && (
                  <>
                    <div style={{ textAlign: 'center' }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: '#D97706', margin: 0 }}>₹{inr(totalAdvancePending)}</p>
                      <p style={{ fontSize: 10, color: '#94A3B8', margin: '2px 0 0', fontWeight: 500 }}>Advance</p>
                    </div>
                    <div style={{ width: 1, background: '#E2E8F0' }} />
                  </>
                )}
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#0F172A', margin: 0 }}>₹{inr(totalCertified)}</p>
                  <p style={{ fontSize: 10, color: '#94A3B8', margin: '2px 0 0', fontWeight: 500 }}>Certified</p>
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* ── Bottom Row ── */}
        <div className="dqs-bottom-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 14 }}>

          <Card delay={0.55}>
            <CardTitle>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                Overdue Bills
                {overdue.length > 0 && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#DC2626', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 20, padding: '1px 7px' }}>
                    {overdue.length}
                  </span>
                )}
              </span>
            </CardTitle>

            {overdue.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#ECFDF5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' }}>
                  <CheckCircle2 size={22} color="#059669" />
                </div>
                <p style={{ fontSize: 13, color: '#0F172A', fontWeight: 700, margin: 0 }}>All on track</p>
                <p style={{ fontSize: 11, color: '#94A3B8', marginTop: 3 }}>No overdue payments</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
                {overdue.slice(0, 5).map((b, i) => (
                  <motion.button
                    key={b.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.6 + i * 0.04 }}
                    onClick={() => navigate(`/tqs/bills/${b.id}`)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, background: '#FEF2F2', border: '1px solid #FECACA', cursor: 'pointer', textAlign: 'left', width: '100%' }}
                  >
                    <AlertTriangle size={14} color="#EF4444" style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 12, fontWeight: 600, color: '#0F172A', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{(b.vendor_name || '').toUpperCase()}</p>
                      <p style={{ fontSize: 11, color: '#DC2626', margin: '1px 0 0', fontWeight: 600 }}>₹{inr(b.certified_net || b.total_amount)}</p>
                    </div>
                    <ChevronRight size={13} color="#94A3B8" />
                  </motion.button>
                ))}
              </div>
            )}
          </Card>

          <Card delay={0.6}>
            <CardTitle
              action={
                <button onClick={() => navigate('/tqs/bills')} style={{ fontSize: 11, color: '#4F46E5', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>
                  View all <ChevronRight size={13} />
                </button>
              }
            >
              Recent Bills
            </CardTitle>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 100px 90px', gap: 8, padding: '0 10px 8px', borderBottom: '1px solid #F1F5F9' }}>
              {['Vendor','Invoice #','Amount','Status'].map(h => (
                <span key={h} style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</span>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginTop: 3 }}>
              {recent.length === 0 ? (
                <p style={{ fontSize: 13, color: '#94A3B8', textAlign: 'center', padding: '24px 0' }}>No bills yet</p>
              ) : recent.map((b, i) => {
                const cfg = STATUS_CONFIG[b.workflow_status] || STATUS_CONFIG.pending;
                return (
                  <motion.button
                    key={b.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.65 + i * 0.04 }}
                    onClick={() => navigate(`/tqs/bills/${b.id}`)}
                    style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 100px 90px', gap: 8, padding: '9px 10px', borderRadius: 8, background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', alignItems: 'center', transition: 'background 0.1s' }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#F8FAFC'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{(b.vendor_name || '').toUpperCase()}</span>
                    <span style={{ fontSize: 11, color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>{b.inv_number || b.sl_number}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#0F172A' }}>₹{inr(b.total_amount)}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: cfg.color, background: cfg.bg, padding: '3px 8px', borderRadius: 20, textAlign: 'center', whiteSpace: 'nowrap', border: `1px solid ${cfg.color}33` }}>
                      {cfg.label}
                    </span>
                  </motion.button>
                );
              })}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
