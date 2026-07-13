// src/pages/DashboardProfessional.jsx
import React, { Suspense, lazy, useMemo, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts';
import {
  Building2, Wallet, Receipt, Clock, ShieldCheck,
  Package, FileText, AlertTriangle, RefreshCw, ChevronRight,
  FileWarning, ClipboardList, CheckCircle2, Activity,
  FileSpreadsheet, Search, LayoutGrid, List, Upload,
  IndianRupee, HardHat, TrendingUp, Plus,
} from 'lucide-react';
import { projectAPI, analyticsAPI, tqsBillsAPI, procurementAdvanceAPI } from '../api/client';
import useAuthStore from '../store/authStore';
import { PageHeader, Theme } from '../theme';
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
  const navigate = useNavigate();
  const qc = useQueryClient();

  // Role-based routing
  if (!['super_admin', 'admin'].includes(role) && !isMdRole) {
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

  const [refreshKey, setRefreshKey] = useState(0);

  const executiveParams = useMemo(() => ({}), [refreshKey]);

  const { data: dashboard, isLoading: dashLoading } = useQuery({
    queryKey: ['analytics-executive', refreshKey],
    queryFn: () => analyticsAPI.executive({}).then(r => r.data?.data || null).catch(() => null),
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const { data: companyProjects = [] } = useQuery({
    queryKey: ['dashboard-projects-main'],
    queryFn: () => projectAPI.list().then(toArray).catch(() => []),
    staleTime: 5 * 60 * 1000,
  });

  const { data: tqsBills = [] } = useQuery({
    queryKey: ['dashboard-tqs-bills-main'],
    queryFn: () => tqsBillsAPI.list({ limit: 500 }).then(r => Array.isArray(r.data) ? r.data : (r.data?.data ?? [])).catch(() => []),
    staleTime: 60 * 1000,
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

  /* ── Render ── */
  return (
    <div style={{ background: '#f8fafc', minHeight: '100vh' }}>

      <PageHeader
        title="Executive Dashboard"
        subtitle={`${greeting}, ${user?.name?.split(' ')[0] || 'Admin'} · ${dayjs().format('dddd, D MMMM YYYY')}`}
        breadcrumbs={[{ label: 'BCIM ERP' }, { label: 'Executive Dashboard' }]}
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => setRefreshKey(k => k + 1)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.12)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              <RefreshCw size={13} /> Refresh
            </button>
            <Link to="/projects/new" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 9, background: '#fff', color: Theme.navyDark, fontSize: 12, fontWeight: 800, textDecoration: 'none' }}>
              <Plus size={13} /> New Project
            </Link>
          </div>
        }
      />

      <div style={{ padding: '20px 24px', maxWidth: 1400, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Last updated */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, fontSize: 11, color: '#94a3b8' }}>
          <Clock size={12} />
          {dashLoading ? 'Loading data…' : `Updated: ${dayjs().format('hh:mm A, DD MMM YYYY')}`}
        </div>

        {/* ── KPI Cards ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
          <KpiSparkCard icon={Building2}    label="Portfolio Value"   value={inrCr(totalContractValue)} sub={`${totalProjects} projects total`}                       color="#4f46e5" accentBg="#ede9fe" sparkData={billedSpark}                         to="/projects" />
          <KpiSparkCard icon={Receipt}      label="Certified Billing" value={inrCr(totalCertified)}     sub={`${kpis.pending_ra_bills ?? 0} bills pending`}          color="#0891b2" accentBg="#e0f2fe" sparkData={billedSpark}                         to="/qs/ra-bills" />
          <KpiSparkCard icon={Wallet}       label="Collections (YTD)" value={inrCr(totalCollections)}   sub={`${collectionRate}% collection rate`}                   color="#22c55e" accentBg="#dcfce7" sparkData={collectedSpark}                      to="/finance/payments" />
          <KpiSparkCard icon={IndianRupee}  label="Receivables"       value={inrCr(receivables)}        sub={receivables > 0 ? 'Outstanding from clients' : 'Fully collected'} color="#ef4444" accentBg="#fee2e2" sparkData={collectedSpark.map(v => Math.max(0, (billedSpark[0]||0) - v))} to="/finance/payments" />
          <KpiSparkCard icon={Activity}     label="Active Projects"   value={activeProjects}            sub={`${delayedProjects} delayed · ${planningProjects} planning`} color="#f59e0b" accentBg="#fef3c7" sparkData={[...Array(7)].map(() => activeProjects)} to="/projects" />
          <KpiSparkCard icon={ShieldCheck}  label="Safety Score"      value={safetyScore != null ? `${Math.round(safetyScore)}/100` : 'N/A'} sub={`${openIncidents} open incidents`} color={safetyScore != null && safetyScore < 70 ? '#f59e0b' : '#22c55e'} accentBg={safetyScore != null && safetyScore < 70 ? '#fef3c7' : '#dcfce7'} sparkData={[...Array(7)].map(() => safetyScore ?? 100)} to="/hse" />
        </div>

        {/* ── Alert banners ── */}
        {(delayedProjects > 0 || lowStockCount > 0 || overduePOs > 0 || pendingMDAdvances.length > 0) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pendingMDAdvances.length > 0 && (
              <div style={{ background: '#faf5ff', border: '1px solid #d8b4fe', borderRadius: 12, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <Wallet size={14} style={{ color: '#7c3aed', flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: '#5b21b6' }}>{pendingMDAdvances.length} advance voucher{pendingMDAdvances.length > 1 ? 's' : ''} awaiting your authorization</span>
                <button onClick={() => navigate('/procurement/advances')} style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: '#7c3aed', background: 'none', border: 'none', cursor: 'pointer' }}>Review →</button>
              </div>
            )}
            {delayedProjects > 0 && (
              <div style={{ background: '#fff1f2', border: '1px solid #fca5a5', borderRadius: 12, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <AlertTriangle size={14} style={{ color: '#dc2626', flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: '#7f1d1d' }}>{delayedProjects} project{delayedProjects > 1 ? 's' : ''} are behind schedule</span>
                <Link to="/projects" style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: '#dc2626', textDecoration: 'none' }}>View →</Link>
              </div>
            )}
            {lowStockCount > 0 && (
              <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 12, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <Package size={14} style={{ color: '#d97706', flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: '#92400e' }}>{lowStockCount} inventory item{lowStockCount > 1 ? 's' : ''} below reorder level</span>
                <Link to="/procurement/inventory" style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: '#d97706', textDecoration: 'none' }}>View Inventory →</Link>
              </div>
            )}
          </div>
        )}

        {/* ── Pending MD Approvals ── */}
        {isMdRole && (
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9' }}>
              <h3 style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', margin: 0 }}>Pending Approvals</h3>
            </div>
            <div style={{ padding: '4px 0' }}>
              <Suspense fallback={<DashLoader />}>
                <ApprovalsPage embedded mdMode />
              </Suspense>
            </div>
          </div>
        )}

        {/* ── 3-col analytics ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>

          {/* Finance Overview donut */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', margin: 0 }}>Finance Overview</h3>
              <Link to="/finance" style={{ fontSize: 11, fontWeight: 700, color: '#4f46e5', textDecoration: 'none' }}>Details →</Link>
            </div>
            {financeSegments.length === 0
              ? <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8', fontSize: 13 }}>No financial data</div>
              : <FinanceDonut segments={financeSegments} total={totalContractValue} />
            }
            <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, paddingTop: 12, borderTop: '1px solid #f1f5f9' }}>
              {[
                { label: 'Collection Rate', value: `${collectionRate}%`, color: collectionRate >= 70 ? '#22c55e' : '#ef4444' },
                { label: 'DQS Balance',     value: inrCr(tqsBalance),  color: '#ef4444' },
              ].map(({ label, value, color }) => (
                <div key={label}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 3 }}>{label}</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color }}>{value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Project Status bars */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', margin: 0 }}>Project Status</h3>
              <Link to="/projects" style={{ fontSize: 11, fontWeight: 700, color: '#4f46e5', textDecoration: 'none' }}>View All</Link>
            </div>
            {projStatusRows.length === 0
              ? <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8', fontSize: 13 }}>No projects</div>
              : projStatusRows.map(r => <StatusBar key={r.label} label={r.label} count={r.count} total={totalProjects} color={r.color} bg={r.bg} />)
            }
            {delayedWatch.length > 0 && (
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #f1f5f9' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#ef4444', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Delayed Projects</div>
                {delayedWatch.map(p => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f8fafc' }}>
                    <Link to={`/projects/${p.id}`} style={{ fontSize: 12, fontWeight: 600, color: '#374151', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>{p.name}</Link>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#ef4444', flexShrink: 0 }}>{parseFloat(p.progress_pct || 0).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Top Projects by Value */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', margin: 0 }}>Top Projects by Value</h3>
              <Link to="/projects" style={{ fontSize: 11, fontWeight: 700, color: '#4f46e5', textDecoration: 'none' }}>View All</Link>
            </div>
            {topProjects.length === 0
              ? <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8', fontSize: 13 }}>No projects</div>
              : topProjects.map((p, i) => (
                <ProjectRankRow key={p.id} rank={i + 1} name={p.name} value={parseFloat(p.contract_value || 0)} max={maxProjValue} pctVal={parseFloat(p.progress_pct || 0)} />
              ))
            }
          </div>
        </div>

        {/* ── Billing vs Collections Trend ── */}
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <h3 style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', margin: 0 }}>Billing vs Collections Trend</h3>
            <Link to="/finance/reports" style={{ fontSize: 11, fontWeight: 700, color: '#4f46e5', textDecoration: 'none' }}>View Report →</Link>
          </div>
          <div style={{ height: 220 }}>
            {financeTrend.length === 0 || financeTrend.every(m => !m.billed && !m.collected)
              ? <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8', fontSize: 13 }}>No billing data for selected range</div>
              : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={financeTrend} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="execBill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#4f46e5" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="execColl" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `₹${v}L`} />
                    <Tooltip formatter={(v, n) => [`₹ ${v} L`, n === 'billed' ? 'Billed' : 'Collected']} labelStyle={{ fontSize: 12, fontWeight: 700 }} contentStyle={{ border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 12 }} />
                    <Area type="monotone" dataKey="billed"    stroke="#4f46e5" strokeWidth={2.5} fill="url(#execBill)" dot={{ r: 3, fill: '#4f46e5', strokeWidth: 2, stroke: '#fff' }} />
                    <Area type="monotone" dataKey="collected" stroke="#22c55e" strokeWidth={2.5} fill="url(#execColl)" dot={{ r: 3, fill: '#22c55e', strokeWidth: 2, stroke: '#fff' }} />
                  </AreaChart>
                </ResponsiveContainer>
              )
            }
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginTop: 16, paddingTop: 16, borderTop: '1px solid #f1f5f9' }}>
            {[
              { label: 'Total Certified',    value: inrCr(totalCertified),   color: '#4f46e5' },
              { label: 'Total Collected',    value: inrCr(totalCollections),  color: '#22c55e' },
              { label: 'Receivables',        value: inrCr(receivables),       color: '#ef4444' },
              { label: 'DQS Vendor Balance', value: inrCr(tqsBalance),        color: '#f59e0b' },
            ].map(({ label, value, color }) => (
              <div key={label}>
                <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#94a3b8', marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 15, fontWeight: 800, color }}>{value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Projects Portfolio ── */}
        {companyProjects.length > 0 && <ProjectCards projects={companyProjects} />}

        {/* ── Procurement & Stores ── */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', margin: 0 }}>Procurement & Stores</h2>
            <Link to="/procurement/po" style={{ fontSize: 12, fontWeight: 700, color: '#4f46e5', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>View Procurement <ChevronRight size={13} /></Link>
          </div>

          {/* Procurement KPI mini row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
            {[
              { label: 'Total POs',        value: totalPOs,        color: '#4f46e5', bg: '#ede9fe', icon: ClipboardList },
              { label: 'POs Pending',      value: overduePOs,      color: '#f59e0b', bg: '#fef3c7', icon: Clock },
              { label: 'Low Stock Items',  value: lowStockCount,   color: '#ef4444', bg: '#fee2e2', icon: Package },
              { label: 'Workforce',        value: workforceCount,  color: '#0891b2', bg: '#e0f2fe', icon: HardHat },
              { label: 'DQS Bills',        value: tqsBills.length, color: '#7c3aed', bg: '#f5f3ff', icon: Receipt },
            ].map(({ label, value, color, bg, icon: Icon }) => (
              <div key={label} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon size={13} style={{ color }} />
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</span>
                </div>
                <div style={{ fontSize: 22, fontWeight: 900, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {/* Low Stock */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', margin: 0 }}>Low Stock Alerts <span style={{ fontSize: 11, fontWeight: 600, color: '#ef4444', marginLeft: 6 }}>{lowStockCount} items</span></h3>
                <Link to="/procurement/inventory" style={{ fontSize: 11, fontWeight: 700, color: '#4f46e5', textDecoration: 'none' }}>Inventory →</Link>
              </div>
              <div style={{ padding: 16 }}>
                {safeLowStock.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '32px 0' }}>
                    <CheckCircle2 size={28} style={{ color: '#22c55e', margin: '0 auto 8px', display: 'block' }} />
                    <p style={{ fontSize: 13, color: '#64748b', fontWeight: 600, margin: 0 }}>All stock levels healthy</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {safeLowStock.map((item, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                          <AlertTriangle size={13} style={{ color: '#ef4444', flexShrink: 0 }} />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.material_name}</div>
                            <div style={{ fontSize: 10, color: '#94a3b8' }}>{item.project_name || '—'}</div>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <span style={{ fontSize: 13, fontWeight: 800, color: '#ef4444' }}>{parseFloat(item.closing_stock || 0).toFixed(1)}</span>
                          <span style={{ fontSize: 11, color: '#94a3b8' }}> / {parseFloat(item.reorder_level || 0).toFixed(1)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Recent POs */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', margin: 0 }}>Recent Purchase Orders</h3>
                <Link to="/procurement/po" style={{ fontSize: 11, fontWeight: 700, color: '#4f46e5', textDecoration: 'none' }}>View All →</Link>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      {['PO No.', 'Project', 'Date', 'Value', 'Status'].map(h => (
                        <th key={h} style={{ padding: '9px 14px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {safePOs.length === 0
                      ? <tr><td colSpan={5} style={{ padding: '30px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No purchase orders</td></tr>
                      : safePOs.map((po, i) => {
                        const s = String(po.status || 'pending').toLowerCase();
                        const sc = s === 'approved' || s === 'received' || s === 'fully_received' ? '#22c55e' : s === 'rejected' || s === 'cancelled' ? '#ef4444' : '#f59e0b';
                        return (
                          <tr key={po.id} style={{ borderBottom: i < safePOs.length - 1 ? '1px solid #f8fafc' : 'none' }}>
                            <td style={{ padding: '11px 14px', fontSize: 12, fontWeight: 700, color: '#4f46e5' }}>{po.po_number || '—'}</td>
                            <td style={{ padding: '11px 14px', fontSize: 12, color: '#64748b', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{po.project_name || '—'}</td>
                            <td style={{ padding: '11px 14px', fontSize: 12, color: '#94a3b8', whiteSpace: 'nowrap' }}>{po.po_date ? dayjs(po.po_date).format('DD MMM') : '—'}</td>
                            <td style={{ padding: '11px 14px', fontSize: 12, fontWeight: 700, color: '#0f172a', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{inrCr(po.order_value)}</td>
                            <td style={{ padding: '11px 14px' }}>
                              <span style={{ padding: '2px 9px', borderRadius: 999, fontSize: 10, fontWeight: 700, background: `${sc}18`, color: sc, textTransform: 'capitalize' }}>{s}</span>
                            </td>
                          </tr>
                        );
                      })
                    }
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* ── Quality, Safety & HSE ── */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', margin: 0 }}>Quality, Safety & HSE</h2>
            <Link to="/hse" style={{ fontSize: 12, fontWeight: 700, color: '#4f46e5', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>HSE Dashboard <ChevronRight size={13} /></Link>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
            {[
              { label: 'Safety Score',   value: safetyScore != null ? `${Math.round(safetyScore)}/100` : 'N/A', color: safetyScore != null && safetyScore < 70 ? '#f59e0b' : '#22c55e', bg: safetyScore != null && safetyScore < 70 ? '#fef3c7' : '#dcfce7', icon: ShieldCheck },
              { label: 'Open Incidents', value: openIncidents, color: openIncidents > 0 ? '#ef4444' : '#22c55e', bg: openIncidents > 0 ? '#fee2e2' : '#dcfce7', icon: AlertTriangle },
              { label: 'Expiring Permits',value: expiringPermits, color: '#f59e0b', bg: '#fef3c7', icon: FileWarning },
              { label: 'Open RFIs',      value: openRFIs,      color: '#0891b2', bg: '#e0f2fe', icon: FileText },
              { label: 'Open NCRs',      value: openNCRs,      color: openNCRs > 0 ? '#ef4444' : '#22c55e', bg: openNCRs > 0 ? '#fee2e2' : '#dcfce7', icon: FileWarning },
              { label: 'Documents',      value: kpis.documents_count ?? 0, color: '#7c3aed', bg: '#f5f3ff', icon: FileSpreadsheet },
            ].map(({ label, value, color, bg, icon: Icon }) => (
              <div key={label} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon size={13} style={{ color }} />
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</span>
                </div>
                <div style={{ fontSize: 22, fontWeight: 900, color, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {/* Recent Incidents */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', margin: 0 }}>Recent HSE Incidents</h3>
                <Link to="/hse/incidents" style={{ fontSize: 11, fontWeight: 700, color: '#4f46e5', textDecoration: 'none' }}>View All →</Link>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      {['Date', 'Project', 'Type', 'Severity', 'Status'].map(h => (
                        <th key={h} style={{ padding: '9px 14px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {safeIncidents.length === 0
                      ? <tr><td colSpan={5} style={{ padding: '30px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No incidents recorded</td></tr>
                      : safeIncidents.map((inc, i) => {
                        const sev = String(inc.severity || '').toLowerCase();
                        const sc  = sev === 'high' || sev === 'critical' ? '#ef4444' : sev === 'medium' ? '#f59e0b' : '#22c55e';
                        const open = !['closed','resolved'].includes(String(inc.status||'').toLowerCase());
                        return (
                          <tr key={inc.id} style={{ borderBottom: i < safeIncidents.length - 1 ? '1px solid #f8fafc' : 'none' }}>
                            <td style={{ padding: '10px 14px', fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>{inc.incident_date ? dayjs(inc.incident_date).format('DD MMM') : '—'}</td>
                            <td style={{ padding: '10px 14px', fontSize: 12, color: '#374151', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inc.project_name || '—'}</td>
                            <td style={{ padding: '10px 14px', fontSize: 11, color: '#64748b', textTransform: 'capitalize' }}>{(inc.incident_type || '').replace(/_/g,' ') || '—'}</td>
                            <td style={{ padding: '10px 14px' }}><span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700, background: `${sc}18`, color: sc }}>{inc.severity || '—'}</span></td>
                            <td style={{ padding: '10px 14px' }}><span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700, background: open ? '#fef3c7' : '#dcfce7', color: open ? '#d97706' : '#15803d' }}>{inc.status || 'open'}</span></td>
                          </tr>
                        );
                      })
                    }
                  </tbody>
                </table>
              </div>
            </div>

            {/* Open RFIs & NCRs */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', margin: 0 }}>Open Quality Items <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, marginLeft: 6 }}>{safeRFIs.length} RFIs · {safeNCRs.length} NCRs</span></h3>
                <Link to="/quality/rfi" style={{ fontSize: 11, fontWeight: 700, color: '#4f46e5', textDecoration: 'none' }}>RFIs →</Link>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      {['Type', 'Number', 'Project', 'Activity', 'Status'].map(h => (
                        <th key={h} style={{ padding: '9px 14px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {safeRFIs.length === 0 && safeNCRs.length === 0
                      ? <tr><td colSpan={5} style={{ padding: '30px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No open quality items</td></tr>
                      : [...safeRFIs.map(r => ({ ...r, _type: 'RFI' })), ...safeNCRs.map(n => ({ ...n, _type: 'NCR' }))].slice(0, 8).map((item, i, arr) => (
                        <tr key={item.id} style={{ borderBottom: i < arr.length - 1 ? '1px solid #f8fafc' : 'none' }}>
                          <td style={{ padding: '10px 14px' }}>
                            <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700, background: item._type === 'RFI' ? '#dbeafe' : '#fee2e2', color: item._type === 'RFI' ? '#1e40af' : '#b91c1c' }}>{item._type}</span>
                          </td>
                          <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700, color: '#4f46e5' }}>{item.rfi_number || item.ncr_number || '—'}</td>
                          <td style={{ padding: '10px 14px', fontSize: 11, color: '#64748b', maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.project_name || '—'}</td>
                          <td style={{ padding: '10px 14px', fontSize: 11, color: '#374151', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.activity_name || item.title || '—'}</td>
                          <td style={{ padding: '10px 14px' }}><span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700, background: '#fef3c7', color: '#d97706' }}>{item.status || 'open'}</span></td>
                        </tr>
                      ))
                    }
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* ── Recent Activity ── */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', margin: 0 }}>Recent Activity</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {/* Recent Payments */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', margin: 0 }}>Recent Payments</h3>
                <Link to="/finance/payments" style={{ fontSize: 11, fontWeight: 700, color: '#4f46e5', textDecoration: 'none' }}>View All →</Link>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      {['Date', 'Beneficiary', 'Type', 'Amount'].map(h => (
                        <th key={h} style={{ padding: '9px 14px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8', textAlign: h === 'Amount' ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {safePayments.length === 0
                      ? <tr><td colSpan={4} style={{ padding: '30px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No payments recorded</td></tr>
                      : safePayments.map((p, i) => (
                        <tr key={p.id} style={{ borderBottom: i < safePayments.length - 1 ? '1px solid #f8fafc' : 'none' }}>
                          <td style={{ padding: '10px 14px', fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>{dayjs(p.payment_date || p.created_at).format('DD MMM')}</td>
                          <td style={{ padding: '10px 14px', fontSize: 12, color: '#374151', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.entity_name || p.project_name || 'Payment'}</td>
                          <td style={{ padding: '10px 14px' }}><span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700, background: '#dcfce7', color: '#15803d' }}>{(p.payment_type || 'payment').replace(/_/g,' ')}</span></td>
                          <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 800, color: '#22c55e', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{inrCr(p.net_amount || p.amount)}</td>
                        </tr>
                      ))
                    }
                  </tbody>
                </table>
              </div>
            </div>

            {/* Recent RA Bills */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', margin: 0 }}>Recent RA Bills</h3>
                <Link to="/qs/ra-bills" style={{ fontSize: 11, fontWeight: 700, color: '#4f46e5', textDecoration: 'none' }}>View All →</Link>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      {['Date', 'Project', 'Status', 'Value'].map(h => (
                        <th key={h} style={{ padding: '9px 14px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8', textAlign: h === 'Value' ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {safeBills.length === 0
                      ? <tr><td colSpan={4} style={{ padding: '30px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No RA bills</td></tr>
                      : safeBills.map((b, i) => {
                        const s = String(b.status || 'pending').toLowerCase();
                        const sc = s === 'paid' || s === 'certified' ? '#22c55e' : s === 'rejected' ? '#ef4444' : '#f59e0b';
                        return (
                          <tr key={b.id} style={{ borderBottom: i < safeBills.length - 1 ? '1px solid #f8fafc' : 'none' }}>
                            <td style={{ padding: '10px 14px', fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>{dayjs(b.bill_date || b.created_at).format('DD MMM')}</td>
                            <td style={{ padding: '10px 14px', fontSize: 12, color: '#374151', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.project_name || '—'}</td>
                            <td style={{ padding: '10px 14px' }}><span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700, background: `${sc}18`, color: sc }}>{s}</span></td>
                            <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 800, color: '#0f172a', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{inrCr(b.bill_value || b.net_payable || b.gross_amount)}</td>
                          </tr>
                        );
                      })
                    }
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 16, borderTop: '1px solid #e2e8f0', fontSize: 11, color: '#94a3b8' }}>
          <span>BCIM Engineering ERP · Executive Dashboard · {dayjs().format('D MMMM YYYY')}</span>
          <span>Press <kbd style={{ padding: '1px 5px', border: '1px solid #cbd5e1', borderRadius: 3, background: '#f1f5f9', fontSize: 10 }}>R</kbd> to refresh</span>
        </div>
      </div>
    </div>
  );
}
