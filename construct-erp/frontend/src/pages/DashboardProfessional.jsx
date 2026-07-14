// src/pages/DashboardProfessional.jsx
import React, { Suspense, lazy, useMemo, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import {
  Building2, Wallet, Receipt, Clock, ShieldCheck,
  Package, FileText, AlertTriangle, RefreshCw, ChevronRight,
  FileWarning, ClipboardList, CheckCircle2, Activity,
  FileSpreadsheet, Search, LayoutGrid, List,
  IndianRupee, HardHat, Plus, Settings, Calendar,
  ChevronDown, Zap, Users, BarChart2, Clipboard,
  TrendingUp, ShoppingCart, Boxes, FileCheck, FilePlus,
} from 'lucide-react';
import { projectAPI, analyticsAPI, tqsBillsAPI, procurementAdvanceAPI } from '../api/client';
import useAuthStore from '../store/authStore';
import { Theme } from '../theme';
import toast from 'react-hot-toast';
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
const MD_DASHBOARD_EMAILS = ['stephen@bcim.in'];
const isMDDashboardUser = (u) => {
  if (!u) return false;
  const r = String(u.role || '').toLowerCase();
  return MD_DASHBOARD_ROLES.includes(r)
    || ['admin', 'super_admin'].includes(r)
    || MD_DASHBOARD_EMAILS.includes((u.email || '').toLowerCase());
};

/* ── Helpers ──────────────────────────────────────────────────────── */
const inrCr = (v) => {
  const n = Math.abs(parseFloat(v) || 0);
  const sign = (parseFloat(v) || 0) < 0 ? '-' : '';
  if (n >= 1e7) return `${sign}₹${(n / 1e7).toFixed(n >= 1e8 ? 1 : 2)} Cr`;
  if (n >= 1e5) return `${sign}₹${(n / 1e5).toFixed(1)} L`;
  if (n >= 1e3) return `${sign}₹${(n / 1e3).toFixed(1)} K`;
  return `${sign}₹${n.toFixed(0)}`;
};
const inrFull = (v) => `₹ ${parseFloat(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const pct = (a, b) => (b > 0 ? ((a / b) * 100).toFixed(1) : '0.0');
const fmtDate = (d) => d && dayjs(d).isValid() ? dayjs(d).format('DD MMM YYYY') : '—';

const AVATAR_COLORS = ['#4f46e5','#0891b2','#059669','#d97706','#dc2626','#7c3aed','#db2777','#ea580c'];
const avatarBg  = (n) => AVATAR_COLORS[(n || '').charCodeAt(0) % AVATAR_COLORS.length];
const initials2 = (n) => (n || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
const toArray   = (r) => Array.isArray(r?.data) ? r.data : (Array.isArray(r?.data?.data) ? r.data.data : []);

/* ── Sparkline ────────────────────────────────────────────────────── */
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

/* ── KPI Spark Card ───────────────────────────────────────────────── */
function KpiSparkCard({ icon: Icon, label, value, sub, color, accentBg, sparkData, trendLabel, trendUp, to }) {
  const inner = (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '16px 18px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', gap: 2, height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon size={15} style={{ color }} />
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#94a3b8' }}>{label}</span>
          </div>
          <div style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', letterSpacing: '-0.02em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
          {trendLabel && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 5 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: trendUp ? '#16a34a' : '#dc2626' }}>
                {trendUp ? '↑' : '↓'} {trendLabel}
              </span>
            </div>
          )}
          {!trendLabel && sub && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 5 }}>{sub}</div>}
        </div>
        <Sparkline data={sparkData} color={color} fill={color} />
      </div>
    </div>
  );
  return to
    ? <Link to={to} style={{ textDecoration: 'none', display: 'block' }}>{inner}</Link>
    : inner;
}

/* ── Status bar row ───────────────────────────────────────────────── */
function StatusBar({ label, count, total, color, bg }) {
  const w = total > 0 ? (count / total) * 100 : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid #f8fafc' }}>
      <div style={{ width: 28, height: 28, borderRadius: 8, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 3 }}>{label}</div>
        <div style={{ height: 4, borderRadius: 999, background: '#f1f5f9' }}>
          <div style={{ height: '100%', borderRadius: 999, background: color, width: `${w}%`, transition: 'width .4s ease' }} />
        </div>
      </div>
      <span style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', minWidth: 24, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{count}</span>
      <span style={{ fontSize: 10, color: '#94a3b8', minWidth: 36, textAlign: 'right' }}>{pct(count, total)}%</span>
    </div>
  );
}

/* ── Finance Donut ────────────────────────────────────────────────── */
function FinanceDonut({ segments, total }) {
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
          <span style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Portfolio</span>
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

/* ── Project rank row ─────────────────────────────────────────────── */
function ProjectRankRow({ rank, name, value, max, pctVal }) {
  const w = max > 0 ? (value / max) * 100 : 0;
  const barColor = pctVal < 30 ? '#ef4444' : pctVal < 60 ? '#f59e0b' : '#22c55e';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid #f8fafc' }}>
      <span style={{ width: 18, fontSize: 11, fontWeight: 700, color: '#94a3b8', textAlign: 'center', flexShrink: 0 }}>{rank}</span>
      <div style={{ width: 30, height: 30, borderRadius: 8, background: avatarBg(name), color: '#fff', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {initials2(name)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
        <div style={{ height: 3, borderRadius: 999, background: '#f1f5f9', marginTop: 4 }}>
          <div style={{ height: '100%', borderRadius: 999, background: barColor, width: `${w}%` }} />
        </div>
      </div>
      <span style={{ fontSize: 12, fontWeight: 800, color: '#0f172a', minWidth: 60, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{inrCr(value)}</span>
    </div>
  );
}

/* ── Project Cards ────────────────────────────────────────────────── */
const PROJ_STATUS_CFG = {
  active:    { label: 'Active',    bg: '#f0fdf4', text: '#16a34a', border: '#bbf7d0', dot: '#16a34a' },
  delayed:   { label: 'Delayed',   bg: '#fff1f2', text: '#e11d48', border: '#fecdd3', dot: '#e11d48' },
  planning:  { label: 'Planning',  bg: '#eff6ff', text: '#2563eb', border: '#bfdbfe', dot: '#2563eb' },
  on_hold:   { label: 'On Hold',   bg: '#fafafa', text: '#737373', border: '#e5e5e5', dot: '#a3a3a3' },
  completed: { label: 'Completed', bg: '#f0fdf4', text: '#15803d', border: '#86efac', dot: '#15803d' },
};

function ProjectCards({ projects }) {
  const [search, setSearch] = useState('');
  const [tab, setTab]       = useState('all');
  const [gridView, setGridView] = useState(true);

  const counts = useMemo(() => {
    const c = { all: projects.length };
    for (const p of projects) {
      const s = (p.status || 'active').toLowerCase();
      c[s] = (c[s] || 0) + 1;
    }
    return c;
  }, [projects]);

  const TABS = [
    { key: 'all',       label: 'All' },
    { key: 'active',    label: 'Active' },
    { key: 'planning',  label: 'Planning' },
    { key: 'delayed',   label: 'Delayed' },
    { key: 'on_hold',   label: 'On Hold' },
    { key: 'completed', label: 'Completed' },
  ].filter(t => t.key === 'all' || counts[t.key] > 0);

  const visible = projects.filter(p => {
    const s = (p.status || '').toLowerCase();
    if (tab !== 'all' && s !== tab) return false;
    if (!search) return true;
    return [p.name, p.project_code, p.city, p.type, p.pm_name]
      .some(v => (v || '').toLowerCase().includes(search.toLowerCase()));
  });

  const inrCrP = v => { const n = Number(v||0); if(n>=1e7) return `₹${(n/1e7).toFixed(2)} Cr`; if(n>=1e5) return `₹${(n/1e5).toFixed(1)} L`; return `₹${n.toLocaleString('en-IN')}`; };

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
      {/* Header */}
      <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', margin: 0 }}>Projects Portfolio <span style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', marginLeft: 6 }}>{counts.all} projects</span></h3>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search projects..."
              style={{ height: 32, border: '1px solid #e2e8f0', borderRadius: 9, background: '#f8fafc', paddingLeft: 28, paddingRight: 12, fontSize: 12, color: '#374151', outline: 'none', width: 180 }} />
          </div>
          <button onClick={() => setGridView(true)}  style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${gridView ? '#4f46e5' : '#e2e8f0'}`, background: gridView ? '#4f46e5' : '#fff', color: gridView ? '#fff' : '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><LayoutGrid size={13} /></button>
          <button onClick={() => setGridView(false)} style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${!gridView ? '#4f46e5' : '#e2e8f0'}`, background: !gridView ? '#4f46e5' : '#fff', color: !gridView ? '#fff' : '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><List size={13} /></button>
          <Link to="/projects" style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 9, background: '#ede9fe', color: '#4f46e5', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>
            View All <ChevronRight size={12} />
          </Link>
        </div>
      </div>

      {/* Status tabs */}
      <div style={{ padding: '10px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ height: 28, padding: '0 12px', borderRadius: 999, border: 'none', fontSize: 11, fontWeight: 700, cursor: 'pointer', background: tab === t.key ? '#4f46e5' : '#f1f5f9', color: tab === t.key ? '#fff' : '#475569' }}>
            {t.label} <span style={{ opacity: .75 }}>{counts[t.key] || 0}</span>
          </button>
        ))}
      </div>

      <div style={{ padding: '16px 20px' }}>
        {visible.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: '#94a3b8', fontSize: 13 }}>No projects found</div>
        ) : gridView ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
            {visible.map(p => {
              const st  = (p.status || 'active').toLowerCase();
              const cfg = PROJ_STATUS_CFG[st] || PROJ_STATUS_CFG.active;
              const pctN = Math.max(0, Math.min(100, parseFloat(p.progress_pct || 0)));
              const bar  = pctN < 30 ? '#ef4444' : pctN < 60 ? '#f59e0b' : '#22c55e';
              return (
                <Link key={p.id} to={`/projects/${p.id}`} style={{ textDecoration: 'none' }}>
                  <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 14, transition: 'box-shadow .15s, transform .15s' }}
                    onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.10)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                    onMouseLeave={e => { e.currentTarget.style.boxShadow = ''; e.currentTarget.style.transform = ''; }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 170 }}>{p.name}</div>
                        <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>{p.type || p.project_code || '—'}</div>
                      </div>
                      <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700, background: cfg.bg, color: cfg.text, border: `1px solid ${cfg.border}` }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: cfg.dot, display: 'inline-block' }} />
                        {cfg.label}
                      </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                      {[['CONTRACT', inrCrP(p.contract_value)], ['SPENT', inrCrP(p.total_spent)]].map(([l, v]) => (
                        <div key={l}>
                          <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.1em', marginBottom: 2 }}>{l}</div>
                          <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>{v}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, height: 5, borderRadius: 999, background: '#f1f5f9', overflow: 'hidden' }}>
                          <div style={{ width: `${pctN}%`, height: '100%', borderRadius: 999, background: bar }} />
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 800, color: '#374151', minWidth: 28, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{pctN}%</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', borderTop: '1px solid #f1f5f9', paddingTop: 8 }}>
                      <div style={{ width: 24, height: 24, borderRadius: 12, background: avatarBg(p.pm_name || p.name), color: '#fff', fontSize: 9, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginRight: 7 }}>
                        {initials2(p.pm_name || p.name)}
                      </div>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#374151' }}>{p.pm_name || 'Unassigned'}</div>
                        <div style={{ fontSize: 10, color: '#94a3b8' }}>PM · Ends {fmtDate(p.end_date)}</div>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  {['Project', 'Type', 'Status', 'Contract Value', 'Spent', 'Progress', 'End Date', 'PM'].map(h => (
                    <th key={h} style={{ padding: '9px 12px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((p, i) => {
                  const st  = (p.status || 'active').toLowerCase();
                  const cfg = PROJ_STATUS_CFG[st] || PROJ_STATUS_CFG.active;
                  const pctN = Math.max(0, Math.min(100, parseFloat(p.progress_pct || 0)));
                  const bar = pctN < 30 ? '#ef4444' : pctN < 60 ? '#f59e0b' : '#22c55e';
                  return (
                    <tr key={p.id} style={{ borderBottom: i < visible.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                      <td style={{ padding: '11px 12px' }}>
                        <Link to={`/projects/${p.id}`} style={{ fontWeight: 700, color: '#4f46e5', textDecoration: 'none' }}>{p.name}</Link>
                        {p.project_code && <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>{p.project_code}</div>}
                      </td>
                      <td style={{ padding: '11px 12px', color: '#64748b' }}>{p.type || '—'}</td>
                      <td style={{ padding: '11px 12px' }}>
                        <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700, background: cfg.bg, color: cfg.text, border: `1px solid ${cfg.border}` }}>{cfg.label}</span>
                      </td>
                      <td style={{ padding: '11px 12px', fontWeight: 700, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>{inrCrP(p.contract_value)}</td>
                      <td style={{ padding: '11px 12px', fontVariantNumeric: 'tabular-nums', color: '#374151' }}>{inrCrP(p.total_spent)}</td>
                      <td style={{ padding: '11px 12px', minWidth: 120 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <div style={{ flex: 1, height: 4, borderRadius: 999, background: '#f1f5f9' }}>
                            <div style={{ width: `${pctN}%`, height: '100%', borderRadius: 999, background: bar }} />
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#374151', minWidth: 28 }}>{pctN}%</span>
                        </div>
                      </td>
                      <td style={{ padding: '11px 12px', color: '#64748b', whiteSpace: 'nowrap' }}>{fmtDate(p.end_date)}</td>
                      <td style={{ padding: '11px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 22, height: 22, borderRadius: 11, background: avatarBg(p.pm_name || p.name), color: '#fff', fontSize: 8, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{initials2(p.pm_name || p.name)}</div>
                          <span style={{ color: '#374151', fontWeight: 500 }}>{p.pm_name || '—'}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── DashLoader ───────────────────────────────────────────────────── */
function DashLoader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: '60vh', color: '#64748b', fontSize: 13 }}>
      <div style={{ width: 24, height: 24, border: '3px solid #e2e8f0', borderTopColor: '#4f46e5', borderRadius: '50%', animation: 'exec-spin .8s linear infinite' }} />
      Loading dashboard…
      <style>{`@keyframes exec-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

/* ── Main ─────────────────────────────────────────────────────────── */
export default function Dashboard() {
  const { user } = useAuthStore();
  const role = user?.role || '';
  const dept = (user?.department || '').toLowerCase();
  const isMdRole = isMDDashboardUser(user);
  const isStrictMd = MD_DASHBOARD_ROLES.includes(String(role).toLowerCase()) || MD_DASHBOARD_EMAILS.includes((user?.email || '').toLowerCase());
  const navigate = useNavigate();
  const qc = useQueryClient();

  // All hooks must be called unconditionally before any early return (Rules of Hooks)
  const [refreshKey, setRefreshKey] = useState(0);

  const isAdminOrMd = ['super_admin', 'admin'].includes(role) || isMdRole;

  const { data: dashboard, isLoading: dashLoading } = useQuery({
    queryKey: ['analytics-executive', refreshKey],
    queryFn: () => analyticsAPI.executive({}).then(r => r.data?.data || null).catch(() => null),
    staleTime: 0,
    refetchOnMount: 'always',
    enabled: isAdminOrMd,
  });

  const { data: companyProjects = [] } = useQuery({
    queryKey: ['dashboard-projects-main'],
    queryFn: () => projectAPI.list().then(toArray).catch(() => []),
    staleTime: 5 * 60 * 1000,
    enabled: isAdminOrMd,
  });

  const { data: tqsBills = [] } = useQuery({
    queryKey: ['dashboard-tqs-bills-main'],
    queryFn: () => tqsBillsAPI.list({ limit: 500 }).then(r => Array.isArray(r.data) ? r.data : (r.data?.data ?? [])).catch(() => []),
    staleTime: 60 * 1000,
    enabled: isAdminOrMd,
  });

  const { data: pendingMDAdvances = [] } = useQuery({
    queryKey: ['md-pending-advances', refreshKey],
    queryFn: () => procurementAdvanceAPI.list({ approval_status: 'procurement_approved' }).then(r => r.data?.data ?? []),
    enabled: isMdRole,
    staleTime: 0,
  });

  const advanceMDMut = useMutation({
    mutationFn: (id) => procurementAdvanceAPI.approveMD(id),
    onSuccess: () => {
      toast.success('Advance voucher authorized');
      qc.invalidateQueries({ queryKey: ['md-pending-advances'] });
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Authorization failed'),
  });

  // Role-based routing — after all hooks
  if (!isAdminOrMd) {
    let RoleDash = null;
    if (role === 'project_manager')      RoleDash = PMDashboard;
    else if (role === 'site_engineer')   RoleDash = SiteEngineerDashboard;
    else if (role === 'qs_engineer')     RoleDash = QSDashboard;
    else if (role === 'accountant')      RoleDash = AccountsDashboard;
    else if (['hr', 'hr_admin', 'hr_manager'].includes(role)) RoleDash = HRDashboard;
    else if (role === 'hse_officer')     RoleDash = HSEDashboard;
    else if (dept.includes('store'))     RoleDash = StoresDashboard;
    else if (dept.includes('procurement') || dept.includes('purchase')) RoleDash = ProcurementDashboard;
    if (RoleDash) return <Suspense fallback={<DashLoader />}><RoleDash /></Suspense>;
  }

  const executiveParams = {};

  /* ── Derived ── */
  const kpis    = dashboard?.kpis    || {};
  const charts  = dashboard?.charts  || {};
  const recent  = dashboard?.recent  || {};
  const pulse   = dashboard?.pulse   || {};
  const watch   = dashboard?.watchlists || {};

  const totalContractValue = kpis.total_contract_value ?? 0;
  const totalCertified     = kpis.total_certified      ?? 0;
  const totalCollections   = kpis.total_collections    ?? 0;
  const receivables        = kpis.receivables           ?? 0;
  const activeProjects     = kpis.active_projects       ?? 0;
  const delayedProjects    = kpis.delayed_projects      ?? 0;
  const completedProjects  = kpis.completed_projects    ?? 0;
  const planningProjects   = kpis.planning_projects     ?? 0;
  const safetyScore        = kpis.safety_score;
  const openIncidents      = kpis.open_incidents        ?? 0;
  const openRFIs           = kpis.open_rfis             ?? 0;
  const openNCRs           = kpis.open_ncrs             ?? 0;
  const expiringPermits    = kpis.expiring_permits      ?? 0;
  const lowStockCount      = kpis.low_stock_count       ?? 0;
  const workforceCount     = kpis.workforce_count       ?? 0;
  const collectionRate     = totalCertified > 0 ? Math.round((totalCollections / totalCertified) * 100) : 0;

  const financeTrend   = charts.finance_trend  || [];
  const projectStatus  = charts.project_status || [];
  const totalBudget    = kpis.total_budget ?? 0;
  const totalSpent     = kpis.total_spent  ?? 0;
  const totalProjects  = activeProjects + delayedProjects + completedProjects + planningProjects;

  // TQS
  const tqsTotalInvoice   = tqsBills.reduce((s, b) => s + parseFloat(b.total_amount || 0), 0);
  const tqsTotalCertified = tqsBills.reduce((s, b) => s + parseFloat(b.certified_net || 0), 0);
  const tqsTotalPaid      = tqsBills.reduce((s, b) => s + parseFloat(b.paid_amount   || 0), 0);
  const tqsBalance        = tqsTotalCertified - tqsTotalPaid;

  // Sparklines from finance trend
  const billedSpark    = financeTrend.map(m => m.billed    || 0);
  const collectedSpark = financeTrend.map(m => m.collected || 0);

  // Finance donut segments
  const financeSegments = [
    { label: 'Collected',    value: totalCollections,             color: '#22c55e' },
    { label: 'Receivables',  value: Math.max(0, receivables),     color: '#ef4444' },
    { label: 'Uncertified',  value: Math.max(0, totalContractValue - totalCertified), color: '#94a3b8' },
  ].filter(s => s.value > 0);

  // Project status bars
  const projStatusRows = [
    { label: 'Active',    count: activeProjects,    color: '#22c55e', bg: '#f0fdf4' },
    { label: 'Delayed',   count: delayedProjects,   color: '#ef4444', bg: '#fff1f2' },
    { label: 'Planning',  count: planningProjects,  color: '#3b82f6', bg: '#eff6ff' },
    { label: 'Completed', count: completedProjects, color: '#8b5cf6', bg: '#f5f3ff' },
  ].filter(r => r.count > 0);

  // Top projects by contract value
  const topProjects = useMemo(() =>
    [...companyProjects].sort((a, b) => parseFloat(b.contract_value || 0) - parseFloat(a.contract_value || 0)).slice(0, 5),
    [companyProjects]
  );
  const maxProjValue = topProjects[0] ? parseFloat(topProjects[0].contract_value || 0) : 1;

  // Recent data
  const safePayments  = Array.isArray(recent.payments)        ? recent.payments.slice(0, 6)  : [];
  const safeBills     = Array.isArray(recent.ra_bills)        ? recent.ra_bills.slice(0, 6)  : [];
  const safePOs       = Array.isArray(recent.purchase_orders) ? recent.purchase_orders.slice(0, 6) : [];
  const safeIncidents = Array.isArray(recent.incidents)       ? recent.incidents.slice(0, 5) : [];
  const safeRFIs      = Array.isArray(recent.rfis)            ? recent.rfis.slice(0, 4)      : [];
  const safeNCRs      = Array.isArray(recent.ncrs)            ? recent.ncrs.slice(0, 4)      : [];
  const safeDocs      = Array.isArray(recent.documents)       ? recent.documents.slice(0, 5) : [];
  const safeLowStock  = Array.isArray(pulse.procurement_stores?.low_stock_items) ? pulse.procurement_stores.low_stock_items.slice(0, 6) : [];
  const delayedWatch  = Array.isArray(watch.delayed_projects)  ? watch.delayed_projects.slice(0, 5) : [];

  const overduePOs = pulse.procurement_stores?.pos_requiring_attention ?? 0;
  const totalPOs   = pulse.procurement_stores?.total_pos ?? 0;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  /* ── Derived extras ── */
  const overdueTasks = openIncidents + openRFIs + openNCRs + delayedProjects;
  const avgProgress  = companyProjects.length > 0
    ? Math.round(companyProjects.reduce((s, p) => s + parseFloat(p.progress_pct || 0), 0) / companyProjects.length)
    : 0;

  const upcomingMilestones = useMemo(() =>
    [...companyProjects]
      .filter(p => p.end_date && dayjs(p.end_date).isAfter(dayjs()))
      .sort((a, b) => dayjs(a.end_date).unix() - dayjs(b.end_date).unix())
      .slice(0, 4),
    [companyProjects]
  );

  // Blend recent activity feed: payments + ra_bills + POs, sorted by date desc
  const activityFeed = useMemo(() => {
    const items = [
      ...safePayments.map(p => ({ ...p, _kind: 'payment',  _date: p.payment_date || p.created_at, _label: p.entity_name || 'Payment', _sub: `${(p.payment_type||'').replace(/_/g,' ')} · ${inrCr(p.net_amount||p.amount)}` })),
      ...safePOs.map(po  => ({ ...po,  _kind: 'po',        _date: po.po_date || po.created_at,    _label: po.po_number || 'Purchase Order', _sub: `${po.project_name||''} · ${inrCr(po.order_value)}` })),
      ...safeBills.map(b  => ({ ...b,   _kind: 'bill',      _date: b.bill_date || b.created_at,    _label: b.bill_number || 'RA Bill', _sub: `${b.project_name||''} · ${(b.status||'').replace(/_/g,' ')}` })),
    ];
    return items.sort((a, b) => dayjs(b._date).unix() - dayjs(a._date).unix()).slice(0, 8);
  }, [safePayments, safePOs, safeBills]);

  const KIND_CFG = {
    payment: { icon: Wallet,    bg: '#dcfce7', color: '#16a34a' },
    po:      { icon: ShoppingCart, bg: '#dbeafe', color: '#2563eb' },
    bill:    { icon: FileCheck,  bg: '#fef3c7', color: '#d97706' },
  };

  /* ── Status badge helper ── */
  const projStatusBadge = (status) => {
    const s = (status||'active').toLowerCase();
    if (s === 'active')    return { label: 'On Track', bg: '#dcfce7', color: '#15803d' };
    if (s === 'delayed')   return { label: 'Delayed',  bg: '#fee2e2', color: '#b91c1c' };
    if (s === 'planning')  return { label: 'Planning', bg: '#dbeafe', color: '#1d4ed8' };
    if (s === 'on_hold')   return { label: 'At Risk',  bg: '#fef3c7', color: '#d97706' };
    if (s === 'completed') return { label: 'Completed',bg: '#f3e8ff', color: '#6d28d9' };
    return { label: 'Active', bg: '#dcfce7', color: '#15803d' };
  };

  /* ── Donut ── */
  const donutSize = 140, donutStroke = 28;
  const donutR    = (donutSize - donutStroke) / 2;
  const donutCirc = 2 * Math.PI * donutR;
  const donutSum  = financeSegments.reduce((s, x) => s + x.value, 0) || 1;
  let   donutOff  = 0;

  /* ── Work progress circle ── */
  const circR    = 58;
  const circCirc = 2 * Math.PI * circR;
  const circDash = (avgProgress / 100) * circCirc;

  /* ── Render ── */
  return (
    <div style={{ background: '#f1f5f9', minHeight: '100vh', fontFamily: 'system-ui,-apple-system,sans-serif' }}>

      {/* ── Page Header ── */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '16px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0 }}>Dashboard</h1>
          <p style={{ fontSize: 13, color: '#64748b', margin: '2px 0 0' }}>Overview of your project performance and key metrics</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', fontSize: 13, color: '#374151', cursor: 'default', userSelect: 'none' }}>
            <Calendar size={14} style={{ color: '#64748b' }} />
            <span>{dayjs().subtract(12, 'day').format('DD MMM YYYY')} – {dayjs().format('DD MMM YYYY')}</span>
            <ChevronDown size={13} style={{ color: '#64748b' }} />
          </div>
          <button onClick={() => setRefreshKey(k => k + 1)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 8, background: '#3b82f6', color: '#fff', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
            <Settings size={14} /> Customize
          </button>
        </div>
      </div>

      <div style={{ padding: '20px 28px', maxWidth: 1600, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>

        {/* ── 6 KPI Cards ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 14 }}>
          {[
            { label: 'Total Projects',   value: totalProjects,           sub: `${activeProjects} Active Projects`,    icon: Building2,    iconBg: '#ede9fe', iconColor: '#4f46e5', trend: `${activeProjects > 0 ? `+${activeProjects}` : '0'} active`, trendUp: true },
            { label: 'Budget (All Projects)', value: inrCr(totalContractValue), sub: 'Total Budget',                icon: Wallet,       iconBg: '#dbeafe', iconColor: '#2563eb', trend: 'Total contract value', trendUp: true },
            { label: 'Cost Incurred',    value: inrCr(totalCertified),   sub: `${pct(totalCertified, totalContractValue)}% of Budget`, icon: Receipt, iconBg: '#dcfce7', iconColor: '#16a34a', trend: `${pct(totalCertified, totalContractValue)}% of Budget`, trendUp: true },
            { label: 'Commitments',      value: inrCr(tqsTotalCertified),sub: `${pct(tqsTotalCertified, totalContractValue)}% of Budget`, icon: ClipboardList, iconBg: '#fef3c7', iconColor: '#d97706', trend: `${pct(tqsTotalCertified, totalContractValue)}% of Budget`, trendUp: true },
            { label: 'Expected Cost',    value: inrCr(totalCertified + tqsTotalCertified), sub: `${pct(totalCertified + tqsTotalCertified, totalContractValue)}% of Budget`, icon: TrendingUp, iconBg: '#f0fdf4', iconColor: '#15803d', trend: `${pct(totalCertified + tqsTotalCertified, totalContractValue)}% of Budget`, trendUp: false },
            { label: 'Overdue Tasks',    value: overdueTasks,            sub: 'Requires Attention',                  icon: AlertTriangle, iconBg: '#fee2e2', iconColor: '#dc2626', trend: overdueTasks > 0 ? `${overdueTasks} issues open` : 'All clear', trendUp: false },
          ].map(({ label, value, sub, icon: Icon, iconBg, iconColor, trend, trendUp }) => (
            <div key={label} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '16px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>{label}</span>
                <div style={{ width: 34, height: 34, borderRadius: 9, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={16} style={{ color: iconColor }} />
                </div>
              </div>
              <div style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', fontVariantNumeric: 'tabular-nums', lineHeight: 1, marginBottom: 6 }}>{value}</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>{sub}</div>
              {trend && (
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: trendUp ? '#16a34a' : '#dc2626' }}>
                  <span>{trendUp ? '↑' : '↓'}</span>
                  <span>{trend}</span>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ── Pending Approvals (right after KPI cards) ── */}
        {isMdRole && (
          <div style={{ background: '#fff', border: '2px solid #3b82f6', borderRadius: 16, overflow: 'hidden', boxShadow: '0 4px 16px rgba(59,130,246,0.10)' }}>
            {/* Card header */}
            <div style={{ padding: '16px 24px', borderBottom: '1px solid #e2e8f0', background: 'linear-gradient(90deg,#eff6ff 0%,#fff 100%)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ClipboardList size={18} style={{ color: '#fff' }} />
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', lineHeight: 1.2 }}>Pending Approvals</div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Items awaiting your review & action</div>
                </div>
              </div>
              <Link to="/approvals" style={{ fontSize: 12, fontWeight: 700, color: '#3b82f6', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                View All <ChevronRight size={14} />
              </Link>
            </div>
            {/* Embedded approvals list — inner header suppressed */}
            <div style={{ padding: '0 8px 8px' }}>
              <Suspense fallback={<DashLoader />}>
                <ApprovalsPage embedded mdMode={false} hideHeader />
              </Suspense>
            </div>
          </div>
        )}

        {/* ── Main 3-col row ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '5fr 4fr 3fr', gap: 16 }}>

          {/* Project Performance Table */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', margin: 0 }}>Project Performance</h3>
              <Link to="/projects" style={{ fontSize: 12, fontWeight: 600, color: '#3b82f6', textDecoration: 'none' }}>View All Projects</Link>
            </div>
            <div style={{ overflowX: 'auto', flex: 1 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    {['Project Name', 'Overall Progress', 'Budget', 'Due Date', 'Status'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#94a3b8', textAlign: 'left', whiteSpace: 'nowrap', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {companyProjects.length === 0
                    ? <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>No projects found</td></tr>
                    : companyProjects.slice(0, 6).map((p, i) => {
                      const pctN  = Math.max(0, Math.min(100, parseFloat(p.progress_pct || 0)));
                      const barC  = pctN < 30 ? '#ef4444' : pctN < 60 ? '#f59e0b' : '#3b82f6';
                      const badge = projStatusBadge(p.status);
                      return (
                        <tr key={p.id} style={{ borderBottom: '1px solid #f8fafc' }}
                          onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                          onMouseLeave={e => e.currentTarget.style.background = ''}>
                          <td style={{ padding: '12px 14px', maxWidth: 180 }}>
                            <Link to={`/projects/${p.id}`} style={{ fontWeight: 700, color: '#0f172a', textDecoration: 'none', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</Link>
                            {p.project_code && <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>{p.project_code}</div>}
                          </td>
                          <td style={{ padding: '12px 14px', minWidth: 130 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ flex: 1, height: 6, borderRadius: 999, background: '#e2e8f0', overflow: 'hidden' }}>
                                <div style={{ width: `${pctN}%`, height: '100%', borderRadius: 999, background: barC, transition: 'width .4s' }} />
                              </div>
                              <span style={{ fontSize: 11, fontWeight: 700, color: '#374151', minWidth: 28, fontVariantNumeric: 'tabular-nums' }}>{pctN}%</span>
                            </div>
                          </td>
                          <td style={{ padding: '12px 14px', fontWeight: 700, color: '#0f172a', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{inrCr(p.contract_value)}</td>
                          <td style={{ padding: '12px 14px', color: '#64748b', whiteSpace: 'nowrap' }}>{p.end_date ? dayjs(p.end_date).format('DD MMM YYYY') : '—'}</td>
                          <td style={{ padding: '12px 14px' }}>
                            <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: 10, fontWeight: 700, background: badge.bg, color: badge.color, whiteSpace: 'nowrap' }}>{badge.label}</span>
                          </td>
                        </tr>
                      );
                    })
                  }
                </tbody>
              </table>
            </div>
          </div>

          {/* Budget vs Cost Line Chart */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.05)', padding: 20, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', margin: 0 }}>Budget vs Spent</h3>
              <Link to="/procurement/budget-control" style={{ fontSize: 12, fontWeight: 600, color: '#3b82f6', textDecoration: 'none' }}>Report →</Link>
            </div>

            {/* Big number comparison */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
              <div style={{ background: '#eff6ff', borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Total Budget</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: '#1e40af', fontVariantNumeric: 'tabular-nums' }}>{inrCr(totalBudget)}</div>
              </div>
              <div style={{ background: '#f0fdf4', borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#16a34a', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Total Spent</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: '#15803d', fontVariantNumeric: 'tabular-nums' }}>{inrCr(totalSpent)}</div>
              </div>
            </div>

            {/* Progress bar */}
            {(() => {
              const spentPct = totalBudget > 0 ? Math.min(100, Math.round((totalSpent / totalBudget) * 100)) : 0;
              const remaining = Math.max(0, totalBudget - totalSpent);
              const overBudget = totalSpent > totalBudget;
              return (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 11, fontWeight: 600 }}>
                    <span style={{ color: '#64748b' }}>Utilisation</span>
                    <span style={{ color: overBudget ? '#dc2626' : '#0f172a' }}>{spentPct}%</span>
                  </div>
                  <div style={{ height: 10, background: '#e2e8f0', borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${spentPct}%`, background: overBudget ? '#ef4444' : spentPct > 80 ? '#f59e0b' : '#22c55e', borderRadius: 999, transition: 'width .4s' }} />
                  </div>
                  <div style={{ marginTop: 6, fontSize: 11, color: '#64748b' }}>
                    {overBudget
                      ? <span style={{ color: '#dc2626', fontWeight: 600 }}>Over budget by {inrCr(totalSpent - totalBudget)}</span>
                      : <span>Remaining: <strong style={{ color: '#0f172a' }}>{inrCr(remaining)}</strong></span>
                    }
                  </div>
                </div>
              );
            })()}

            {/* Bottom stats */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, paddingTop: 14, borderTop: '1px solid #f1f5f9', marginTop: 'auto' }}>
              {[
                { label: 'Total Certified', value: inrCr(totalCertified),  color: '#3b82f6' },
                { label: 'Collections',     value: inrCr(totalCollections), color: '#22c55e' },
                { label: 'Receivables',     value: inrCr(receivables),      color: '#ef4444' },
                { label: 'DQS Balance',     value: inrCr(tqsBalance),       color: '#f59e0b' },
              ].map(({ label, value, color }) => (
                <div key={label}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', marginBottom: 2 }}>{label}</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Actions + Alerts */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Quick Actions */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.05)', padding: '16px 20px' }}>
              <h3 style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', margin: '0 0 14px' }}>Quick Actions</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                {[
                  { label: 'Create MRS',    icon: Clipboard,    to: '/stores/mrs',                     bg: '#ede9fe', color: '#4f46e5' },
                  { label: 'Create PO',     icon: ShoppingCart, to: '/procurement/po',                 bg: '#dbeafe', color: '#2563eb' },
                  { label: 'Material Issue',icon: Boxes,        to: '/stores/issue',                   bg: '#dcfce7', color: '#16a34a' },
                  { label: 'Add Expense',   icon: FileCheck,    to: '/accounts/banking/petty-cash',    bg: '#fef3c7', color: '#d97706' },
                  { label: 'Create BOQ',    icon: FilePlus,     to: '/qs/boq',                         bg: '#f0fdf4', color: '#15803d' },
                  { label: 'Daily Report',  icon: FileText,     to: '/planning/dpr-console',           bg: '#fdf2f8', color: '#9d174d' },
                ].map(({ label, icon: Icon, to, bg, color }) => (
                  <Link key={label} to={to} style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, padding: '12px 6px', borderRadius: 10, border: '1px solid #f1f5f9', background: '#fafafa', transition: 'box-shadow .15s' }}
                    onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)'; e.currentTarget.style.background = '#fff'; }}
                    onMouseLeave={e => { e.currentTarget.style.boxShadow = ''; e.currentTarget.style.background = '#fafafa'; }}>
                    <div style={{ width: 38, height: 38, borderRadius: 10, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon size={17} style={{ color }} />
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 600, color: '#374151', textAlign: 'center', lineHeight: 1.3 }}>{label}</span>
                  </Link>
                ))}
              </div>
            </div>

            {/* Alerts & Notifications */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.05)', padding: '16px 20px', flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <h3 style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', margin: 0 }}>Alerts & Notifications</h3>
                <Link to="/projects" style={{ fontSize: 11, fontWeight: 600, color: '#3b82f6', textDecoration: 'none' }}>View All</Link>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {pendingMDAdvances.length > 0 && (
                  <div style={{ display: 'flex', gap: 10, padding: '10px 12px', borderRadius: 9, background: '#faf5ff', border: '1px solid #e9d5ff' }}>
                    <Wallet size={14} style={{ color: '#7c3aed', flexShrink: 0, marginTop: 1 }} />
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#1e1b4b' }}>{pendingMDAdvances.length} advance voucher{pendingMDAdvances.length > 1 ? 's' : ''} pending</div>
                      <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>Awaiting MD authorization</div>
                    </div>
                  </div>
                )}
                {lowStockCount > 0 && (
                  <div style={{ display: 'flex', gap: 10, padding: '10px 12px', borderRadius: 9, background: '#fffbeb', border: '1px solid #fde68a' }}>
                    <AlertTriangle size={14} style={{ color: '#d97706', flexShrink: 0, marginTop: 1 }} />
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#451a03' }}>Material delivery delayed</div>
                      <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>{lowStockCount} items below reorder level</div>
                    </div>
                  </div>
                )}
                {totalContractValue > 0 && totalCertified / totalContractValue > 0.8 && (
                  <div style={{ display: 'flex', gap: 10, padding: '10px 12px', borderRadius: 9, background: '#fff1f2', border: '1px solid #fecdd3' }}>
                    <AlertTriangle size={14} style={{ color: '#dc2626', flexShrink: 0, marginTop: 1 }} />
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#450a0a' }}>Budget threshold exceeded</div>
                      <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>{pct(totalCertified, totalContractValue)}% of budget utilized</div>
                    </div>
                  </div>
                )}
                {pendingMDAdvances.length === 0 && (
                  <div style={{ display: 'flex', gap: 10, padding: '10px 12px', borderRadius: 9, background: '#eff6ff', border: '1px solid #bfdbfe' }}>
                    <ClipboardList size={14} style={{ color: '#2563eb', flexShrink: 0, marginTop: 1 }} />
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#1e3a5f' }}>Pending Approvals</div>
                      <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>MRS requests awaiting approval</div>
                    </div>
                  </div>
                )}
                {delayedProjects > 0 && (
                  <div style={{ display: 'flex', gap: 10, padding: '10px 12px', borderRadius: 9, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                    <Clock size={14} style={{ color: '#64748b', flexShrink: 0, marginTop: 1 }} />
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#0f172a' }}>Site inspection due</div>
                      <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>{delayedProjects} project{delayedProjects > 1 ? 's' : ''} behind schedule</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Bottom 5-col row ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14 }}>

          {/* Cost Breakdown Donut */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.05)', padding: '16px 18px' }}>
            <h3 style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', margin: '0 0 14px' }}>Cost Breakdown</h3>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
              <div style={{ position: 'relative' }}>
                <svg width={donutSize} height={donutSize} style={{ transform: 'rotate(-90deg)' }}>
                  <circle cx={donutSize/2} cy={donutSize/2} r={donutR} fill="none" stroke="#f1f5f9" strokeWidth={donutStroke - 4} />
                  {financeSegments.length === 0
                    ? <circle cx={donutSize/2} cy={donutSize/2} r={donutR} fill="none" stroke="#e2e8f0" strokeWidth={donutStroke - 4} />
                    : financeSegments.map((seg, i) => {
                      const dash = (seg.value / donutSum) * donutCirc;
                      const el   = <circle key={i} cx={donutSize/2} cy={donutSize/2} r={donutR} fill="none"
                        stroke={seg.color} strokeWidth={donutStroke - 4}
                        strokeDasharray={`${dash} ${donutCirc - dash}`} strokeDashoffset={-donutOff} />;
                      donutOff += dash;
                      return el;
                    })
                  }
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ fontSize: 14, fontWeight: 900, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>{inrCr(totalContractValue)}</div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.05em' }}>Total Cost</div>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {financeSegments.map(seg => (
                <div key={seg.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: seg.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: '#374151' }}>{seg.label}</span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>{pct(seg.value, donutSum)}%</span>
                    <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 4 }}>{inrCr(seg.value)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Work Progress Summary */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.05)', padding: '16px 18px' }}>
            <h3 style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', margin: '0 0 14px' }}>Work Progress Summary</h3>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
              <div style={{ position: 'relative' }}>
                <svg width={130} height={130} style={{ transform: 'rotate(-90deg)' }}>
                  <circle cx={65} cy={65} r={circR} fill="none" stroke="#e2e8f0" strokeWidth={10} />
                  <circle cx={65} cy={65} r={circR} fill="none" stroke="#3b82f6" strokeWidth={10}
                    strokeDasharray={`${circDash} ${circCirc - circDash}`} strokeLinecap="round" />
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#0f172a' }}>{avgProgress}%</div>
                  <div style={{ fontSize: 9, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.05em' }}>Avg Progress</div>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { label: 'Completed Projects',  count: completedProjects, color: '#3b82f6' },
                { label: 'Active Projects',      count: activeProjects,    color: '#22c55e' },
                { label: 'Pending / Planning',   count: planningProjects,  color: '#f59e0b' },
                { label: 'Total Projects',       count: totalProjects,     color: '#94a3b8', bold: true },
              ].map(({ label, count, color, bold }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: bold ? 8 : 0, borderTop: bold ? '1px solid #f1f5f9' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: '#374151', fontWeight: bold ? 700 : 400 }}>{label}</span>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 800, color: bold ? '#0f172a' : color, fontVariantNumeric: 'tabular-nums' }}>{count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Activities */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.05)', padding: '16px 18px', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <h3 style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', margin: 0 }}>Recent Activities</h3>
              <Link to="/finance/payments" style={{ fontSize: 11, fontWeight: 600, color: '#3b82f6', textDecoration: 'none' }}>View All</Link>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {activityFeed.length === 0
                ? <div style={{ textAlign: 'center', padding: '24px 0', color: '#94a3b8', fontSize: 12 }}>No recent activity</div>
                : activityFeed.map((item, i) => {
                  const cfg = KIND_CFG[item._kind] || KIND_CFG.payment;
                  const Icon = cfg.icon;
                  return (
                    <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <div style={{ width: 30, height: 30, borderRadius: 8, background: cfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Icon size={13} style={{ color: cfg.color }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item._label}</div>
                        <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item._sub}</div>
                      </div>
                      <div style={{ fontSize: 10, color: '#94a3b8', flexShrink: 0, marginTop: 2 }}>{item._date ? dayjs(item._date).fromNow ? dayjs().diff(dayjs(item._date), 'hour') + 'h ago' : dayjs(item._date).format('DD MMM') : ''}</div>
                    </div>
                  );
                })
              }
            </div>
          </div>

          {/* Upcoming Milestones */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.05)', padding: '16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <h3 style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', margin: 0 }}>Upcoming Milestones</h3>
              <Link to="/projects" style={{ fontSize: 11, fontWeight: 600, color: '#3b82f6', textDecoration: 'none' }}>View All</Link>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {upcomingMilestones.length === 0
                ? <div style={{ textAlign: 'center', padding: '24px 0', color: '#94a3b8', fontSize: 12 }}>No upcoming milestones</div>
                : upcomingMilestones.map(p => {
                  const daysLeft = dayjs(p.end_date).diff(dayjs(), 'day');
                  const monthName = dayjs(p.end_date).format('MMM').toUpperCase();
                  const dayNum   = dayjs(p.end_date).format('DD');
                  const urgency  = daysLeft < 7 ? '#dc2626' : daysLeft < 30 ? '#d97706' : '#16a34a';
                  return (
                    <div key={p.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <div style={{ width: 42, flexShrink: 0, borderRadius: 9, overflow: 'hidden', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                        <div style={{ background: '#3b82f6', color: '#fff', fontSize: 9, fontWeight: 800, padding: '2px 0', letterSpacing: '.05em' }}>{monthName}</div>
                        <div style={{ fontSize: 16, fontWeight: 900, color: '#0f172a', padding: '2px 0' }}>{dayNum}</div>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                        <div style={{ fontSize: 10, color: '#64748b', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.project_code || p.type || 'Project'}</div>
                        <div style={{ marginTop: 4, fontSize: 10, fontWeight: 700, color: urgency }}>{daysLeft} Days Left</div>
                      </div>
                    </div>
                  );
                })
              }
            </div>
          </div>

          {/* Key Stats */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.05)', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h3 style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', margin: 0 }}>Key Statistics</h3>
            {[
              { label: 'Workforce',     value: workforceCount,  icon: Users,     color: '#2563eb', bg: '#dbeafe' },
              { label: 'Safety Score',  value: safetyScore != null ? `${Math.round(safetyScore)}%` : 'N/A', icon: ShieldCheck, color: safetyScore != null && safetyScore >= 70 ? '#16a34a' : '#d97706', bg: safetyScore != null && safetyScore >= 70 ? '#dcfce7' : '#fef3c7' },
              { label: 'DQS Bills',     value: tqsBills.length, icon: FileCheck,color: '#7c3aed', bg: '#f5f3ff' },
              { label: 'Open Incidents',value: openIncidents,  icon: AlertTriangle, color: openIncidents > 0 ? '#dc2626' : '#16a34a', bg: openIncidents > 0 ? '#fee2e2' : '#dcfce7' },
              { label: 'Collection Rate',value: `${collectionRate}%`, icon: BarChart2, color: collectionRate >= 70 ? '#16a34a' : '#d97706', bg: collectionRate >= 70 ? '#dcfce7' : '#fef3c7' },
              { label: 'Open RFIs & NCRs', value: openRFIs + openNCRs, icon: FileWarning, color: (openRFIs + openNCRs) > 0 ? '#d97706' : '#16a34a', bg: (openRFIs + openNCRs) > 0 ? '#fef3c7' : '#dcfce7' },
            ].map(({ label, value, icon: Icon, color, bg }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon size={14} style={{ color }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>{label}</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Projects Portfolio (full grid) ── */}
        {companyProjects.length > 0 && <ProjectCards projects={companyProjects} />}

      </div>
    </div>
  );
}
