import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, Link } from 'react-router-dom';
import {
  Building2, Plus, Search, MapPin, Activity, Briefcase,
  CheckCircle2, AlertTriangle, Users, RefreshCw,
  LayoutGrid, List, Calendar, IndianRupee, Upload, Download,
  MoreVertical, Share2, TrendingUp, Clock,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Cell,
  ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { projectAPI } from '../../api/client';
import { clsx } from 'clsx';
import TableActions from '../../components/common/TableActions';
import toast from 'react-hot-toast';
import { PageHeader, Theme } from '../../theme';
import dayjs from 'dayjs';

/* ── helpers ─────────────────────────────────────────────────── */
const crore = v => {
  const n = parseFloat(v || 0);
  if (Math.abs(n) >= 1e7) return `₹ ${(n / 1e7).toFixed(2)} Cr`;
  if (Math.abs(n) >= 1e5) return `₹ ${(n / 1e5).toFixed(2)} L`;
  return `₹ ${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
};
const fmtDate = d => d && dayjs(d).isValid() ? dayjs(d).format('DD MMM YYYY') : '—';

const AVATAR_COLORS = ['#4f46e5','#0891b2','#059669','#d97706','#dc2626','#7c3aed','#db2777','#ea580c'];
const avatarBg = n => AVATAR_COLORS[(n || '').charCodeAt(0) % AVATAR_COLORS.length];
const initials2 = n => (n || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

const STATUS = {
  active:    { label: 'Active',    bg: '#f0fdf4', text: '#16a34a', border: '#bbf7d0', dot: '#16a34a', accent: '#22c55e' },
  delayed:   { label: 'Delayed',   bg: '#fff1f2', text: '#e11d48', border: '#fecdd3', dot: '#e11d48', accent: '#ef4444' },
  planning:  { label: 'Planning',  bg: '#eff6ff', text: '#2563eb', border: '#bfdbfe', dot: '#2563eb', accent: '#3b82f6' },
  on_hold:   { label: 'On Hold',   bg: '#fafafa', text: '#737373', border: '#e5e5e5', dot: '#a3a3a3', accent: '#94a3b8' },
  completed: { label: 'Completed', bg: '#f0fdf4', text: '#15803d', border: '#86efac', dot: '#15803d', accent: '#14b8a6' },
};

const STATUS_TABS = ['all', 'active', 'planning', 'delayed', 'on_hold', 'completed'];

/* ── Sparkline for KPI ───────────────────────────────────────── */
function Sparkline({ data, color }) {
  if (!data?.length) return null;
  const w = 80, h = 32;
  const vals = data.map(Number);
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = max - min || 1;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * w},${h - ((v - min) / range) * (h - 4) - 2}`).join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/* ── KPI Card ─────────────────────────────────────────────────── */
function KpiCard({ icon: Icon, label, value, sub, trend, trendUp, color, accentBg, spark }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '18px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon size={16} style={{ color }} />
          </div>
          <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#94a3b8' }}>{label}</span>
        </div>
        <Sparkline data={spark} color={color} />
      </div>
      <div style={{ fontSize: 26, fontWeight: 900, color: '#0f172a', letterSpacing: '-0.02em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {trend && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: trendUp ? '#16a34a' : '#dc2626' }}>{trendUp ? '↑' : '↓'} {trend}</span>
          <span style={{ fontSize: 11, color: '#94a3b8' }}>{sub}</span>
        </div>
      )}
      {!trend && sub && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

/* ── Project Card ─────────────────────────────────────────────── */
function ProjectCard({ proj, onEdit, onDelete }) {
  const st  = (proj.status || 'active').toLowerCase();
  const cfg = STATUS[st] || STATUS.active;
  const pct = Math.max(0, Math.min(100, parseFloat(proj.progress_pct || 0)));
  const barColor = pct < 30 ? '#ef4444' : pct < 60 ? '#f59e0b' : cfg.accent;
  const overrun = parseFloat(proj.total_spent || 0) > parseFloat(proj.contract_value || 0);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', transition: 'box-shadow .15s, transform .15s', cursor: 'pointer' }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.09)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.05)'; e.currentTarget.style.transform = 'translateY(0)'; }}>

      {/* top accent bar */}
      <div style={{ height: 3, background: cfg.accent }} />

      <div style={{ padding: 16 }}>
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <Link to={`/projects/${proj.id}`} style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', textDecoration: 'none', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {proj.name}
            </Link>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
              {proj.city && <><MapPin size={10} /><span>{proj.city}</span></>}
              {proj.type && <><span>·</span><span style={{ textTransform: 'capitalize' }}>{proj.type}</span></>}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <span style={{ padding: '3px 9px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: cfg.bg, color: cfg.text, border: `1px solid ${cfg.border}`, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: cfg.dot }} />
              {cfg.label}
            </span>
            <div style={{ position: 'relative' }}>
              <button onClick={() => setMenuOpen(!menuOpen)} style={{ width: 26, height: 26, borderRadius: 7, border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                <MoreVertical size={13} />
              </button>
              {menuOpen && (
                <div style={{ position: 'absolute', right: 0, top: 30, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.1)', zIndex: 50, minWidth: 120, padding: 4 }}
                  onMouseLeave={() => setMenuOpen(false)}>
                  <button onClick={() => { setMenuOpen(false); onEdit(); }} style={{ width: '100%', padding: '7px 12px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#374151', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 7 }}>Edit</button>
                  <button onClick={() => { setMenuOpen(false); onDelete(); }} style={{ width: '100%', padding: '7px 12px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 7 }}>Delete</button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Contract + Spent */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 3 }}>Contract Value</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>{crore(proj.contract_value)}</div>
          </div>
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 3 }}>Spent</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: overrun ? '#ef4444' : '#0f172a', fontVariantNumeric: 'tabular-nums', display: 'flex', alignItems: 'center', gap: 4 }}>
              {crore(proj.total_spent)}
              {overrun && <AlertTriangle size={11} style={{ color: '#ef4444' }} />}
            </div>
          </div>
        </div>

        {/* Progress */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Progress</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: barColor, fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>
          </div>
          <div style={{ height: 6, borderRadius: 999, background: '#f1f5f9', overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 999, background: barColor, width: `${pct}%`, transition: 'width .4s ease' }} />
          </div>
        </div>

        {/* Dates */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
          {[['Start Date', proj.start_date], ['End Date', proj.end_date]].map(([l, v]) => (
            <div key={l}>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 3 }}>{l}</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#374151' }}>{fmtDate(v)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* PM footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderTop: '1px solid #f1f5f9', background: '#fafafa' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: 14, background: avatarBg(proj.pm_name || proj.name), color: '#fff', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {initials2(proj.pm_name || proj.name)}
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>{proj.pm_name || 'Unassigned'}</div>
            <div style={{ fontSize: 10, color: '#94a3b8' }}>Project Manager</div>
          </div>
        </div>
        <button style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#64748b' }}>
          <Share2 size={12} />
        </button>
      </div>
    </div>
  );
}

/* ── Spend donut ─────────────────────────────────────────────── */
function SpendDonut({ spent, total }) {
  const size = 140, stroke = 30;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const spentPct = total > 0 ? (spent / total) : 0;
  const remainingPct = 1 - spentPct;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <div style={{ position: 'relative' }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#f1f5f9" strokeWidth={stroke - 3} />
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#4f46e5"
            strokeWidth={stroke - 3} strokeDasharray={`${spentPct * circ} ${circ}`} strokeLinecap="butt" />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 18, fontWeight: 900, color: '#0f172a' }}>{Math.round(spentPct * 100)}%</span>
          <span style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Spent</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
        {[['Spent', crore(spent), '#4f46e5'], ['Remaining', crore(total - spent), '#e2e8f0']].map(([l, v, c]) => (
          <div key={l} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: c }} />
              <span style={{ fontSize: 12, color: '#64748b' }}>{l}</span>
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ProjectList() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [search,  setSearch]  = useState('');
  const [tab,     setTab]     = useState('all');
  const [view,    setView]    = useState('grid');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectAPI.list().then(r => { const d = r.data; return Array.isArray(d) ? d : (Array.isArray(d?.data) ? d.data : []); }),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  const deleteMut = useMutation({
    mutationFn: id => projectAPI.delete(id),
    onSuccess: () => { toast.success('Project deleted'); qc.invalidateQueries({ queryKey: ['projects'] }); },
    onError:   () => toast.error('Cannot delete — linked records exist.'),
  });

  const projects = data || [];

  const kpis = useMemo(() => ({
    total:      projects.length,
    active:     projects.filter(p => p.status === 'active').length,
    completed:  projects.filter(p => p.status === 'completed').length,
    delayed:    projects.filter(p => p.status === 'delayed').length,
    onHold:     projects.filter(p => p.status === 'on_hold').length,
    planning:   projects.filter(p => p.status === 'planning').length,
    totalValue: projects.reduce((s, p) => s + parseFloat(p.contract_value || 0), 0),
    totalSpent: projects.reduce((s, p) => s + parseFloat(p.total_spent    || 0), 0),
  }), [projects]);

  const tabCounts = useMemo(() => STATUS_TABS.reduce((acc, s) => {
    acc[s] = s === 'all' ? projects.length : projects.filter(p => p.status === s).length;
    return acc;
  }, {}), [projects]);

  const visible = useMemo(() => projects.filter(p => {
    if (tab !== 'all' && (p.status || 'active') !== tab) return false;
    if (!search) return true;
    return [p.name, p.project_code, p.city, p.type, p.pm_name]
      .some(v => (v || '').toLowerCase().includes(search.toLowerCase()));
  }), [projects, tab, search]);

  // Bar chart data for Active vs Total
  const barData = [
    { name: 'Active',    value: kpis.active,    fill: '#22c55e' },
    { name: 'Planning',  value: kpis.planning,  fill: '#3b82f6' },
    { name: 'Delayed',   value: kpis.delayed,   fill: '#ef4444' },
    { name: 'On Hold',   value: kpis.onHold,    fill: '#94a3b8' },
    { name: 'Completed', value: kpis.completed, fill: '#14b8a6' },
  ];

  const sparkBase = [kpis.total * 0.6, kpis.total * 0.7, kpis.total * 0.8, kpis.total * 0.85, kpis.total * 0.9, kpis.total * 0.95, kpis.total];

  return (
    <div style={{ background: '#f8fafc', minHeight: '100vh' }}>

      <PageHeader
        title="Projects"
        subtitle="Portfolio overview across all active and planned projects."
        breadcrumbs={[{ label: 'Overview' }, { label: 'Projects' }]}
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
            <button onClick={() => navigate('/projects/new')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 9, background: '#fff', color: Theme.navyDark, fontSize: 12, fontWeight: 800, border: 'none', cursor: 'pointer' }}>
              <Plus size={13} /> New Project
            </button>
          </div>
        }
      />

      <div style={{ padding: '20px 24px', maxWidth: 1400, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
          <KpiCard icon={Briefcase}     label="Total Projects"   value={kpis.total}           color="#4f46e5" accentBg="#ede9fe" trend="12% vs last month" trendUp sub="" spark={sparkBase} />
          <KpiCard icon={Activity}      label="Active Projects"  value={kpis.active}          color="#22c55e" accentBg="#dcfce7" trend="8% vs last month"  trendUp sub={`${kpis.planning} in planning`} spark={[2,3,kpis.active,kpis.active-1,kpis.active+1,kpis.active,kpis.active]} />
          <KpiCard icon={AlertTriangle} label="Delayed Projects" value={kpis.delayed}         color="#f59e0b" accentBg="#fef3c7" trend="5% vs last month"  trendUp={false} sub={`${kpis.delayed} Need attention`} spark={[1,2,1,3,2,kpis.delayed,kpis.delayed]} />
          <KpiCard icon={CheckCircle2}  label="Completed Projects" value={kpis.completed}     color="#14b8a6" accentBg="#f0fdfa" trend="18% vs last month" trendUp sub="This year" spark={[kpis.completed*0.5,kpis.completed*0.6,kpis.completed*0.7,kpis.completed*0.8,kpis.completed*0.9,kpis.completed,kpis.completed]} />
          <KpiCard icon={IndianRupee}   label="Portfolio Value"  value={crore(kpis.totalValue)} color="#4f46e5" accentBg="#ede9fe" trend="10% vs last month" trendUp sub={`Spent: ${crore(kpis.totalSpent)}`} spark={sparkBase} />
        </div>

        {/* Projects section */}
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 18, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>

          {/* Toolbar */}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', margin: 0 }}>Projects</h2>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ position: 'relative' }}>
                <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input
                  value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search projects..."
                  style={{ height: 34, border: '1px solid #e2e8f0', borderRadius: 10, background: '#f8fafc', paddingLeft: 28, paddingRight: 12, fontSize: 12, color: '#374151', outline: 'none', width: 200 }}
                />
              </div>
              <button onClick={() => setView('list')} style={{ width: 34, height: 34, borderRadius: 8, border: `1px solid ${view === 'list' ? '#4f46e5' : '#e2e8f0'}`, background: view === 'list' ? '#4f46e5' : '#fff', color: view === 'list' ? '#fff' : '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <List size={14} />
              </button>
              <button onClick={() => setView('grid')} style={{ width: 34, height: 34, borderRadius: 8, border: `1px solid ${view === 'grid' ? '#4f46e5' : '#e2e8f0'}`, background: view === 'grid' ? '#4f46e5' : '#fff', color: view === 'grid' ? '#fff' : '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <LayoutGrid size={14} />
              </button>
            </div>
          </div>

          {/* Filter tabs */}
          <div style={{ padding: '12px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
            {STATUS_TABS.map(s => {
              const label = s === 'all' ? 'All' : (STATUS[s]?.label || s);
              const cnt = tabCounts[s] || 0;
              const active = tab === s;
              return (
                <button key={s} onClick={() => setTab(s)}
                  style={{ height: 30, padding: '0 12px', borderRadius: 999, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'all .15s',
                    background: active ? '#4f46e5' : '#f1f5f9',
                    color: active ? '#fff' : '#475569' }}>
                  {label} <span style={{ opacity: .75 }}>{cnt}</span>
                </button>
              );
            })}
          </div>

          {/* Content */}
          {isLoading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14, padding: 20 }}>
              {[1,2,3,4].map(n => <div key={n} style={{ height: 280, borderRadius: 14, background: '#f1f5f9' }} />)}
            </div>
          ) : visible.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0' }}>
              <Building2 size={36} style={{ color: '#cbd5e1', margin: '0 auto 12px' }} />
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#64748b' }}>No Projects Found</h3>
              <p style={{ fontSize: 12, color: '#94a3b8', margin: '4px 0 20px' }}>Try adjusting your search or filters</p>
              <button onClick={() => navigate('/projects/new')} style={{ padding: '8px 20px', borderRadius: 10, background: '#4f46e5', color: '#fff', fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
                + New Project
              </button>
            </div>
          ) : view === 'grid' ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14, padding: 20 }}>
              {visible.map(proj => (
                <ProjectCard key={proj.id} proj={proj}
                  onEdit={() => navigate(`/projects/${proj.id}/edit`)}
                  onDelete={() => deleteMut.mutate(proj.id)} />
              ))}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    {['Project','Type','Location','Status','Contract Value','Spent','Progress','End Date','PM',''].map(h => (
                      <th key={h} style={{ padding: '10px 16px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#94a3b8', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((proj, i) => {
                    const st  = (proj.status || 'active').toLowerCase();
                    const cfg = STATUS[st] || STATUS.active;
                    const pct = Math.max(0, Math.min(100, parseFloat(proj.progress_pct || 0)));
                    return (
                      <tr key={proj.id} onClick={() => navigate(`/projects/${proj.id}`)}
                        style={{ borderBottom: '1px solid #f8fafc', cursor: 'pointer' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                        onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{proj.name}</div>
                          <div style={{ fontSize: 10, color: '#94a3b8' }}>{proj.project_code}</div>
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: 12, color: '#64748b', textTransform: 'capitalize' }}>{proj.type || '—'}</td>
                        <td style={{ padding: '12px 16px', fontSize: 12, color: '#64748b' }}>{proj.city || '—'}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{ padding: '3px 9px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: cfg.bg, color: cfg.text, border: `1px solid ${cfg.border}` }}>{cfg.label}</span>
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>{crore(proj.contract_value)}</td>
                        <td style={{ padding: '12px 16px', fontSize: 13, fontVariantNumeric: 'tabular-nums', color: parseFloat(proj.total_spent||0)>parseFloat(proj.contract_value||0)?'#ef4444':'#374151' }}>{crore(proj.total_spent)}</td>
                        <td style={{ padding: '12px 16px', minWidth: 120 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ flex: 1, height: 5, borderRadius: 999, background: '#f1f5f9' }}>
                              <div style={{ height: '100%', borderRadius: 999, background: cfg.accent, width: `${pct}%` }} />
                            </div>
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#374151', minWidth: 28, textAlign: 'right' }}>{pct}%</span>
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: 12, color: '#64748b' }}>{fmtDate(proj.end_date)}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ width: 24, height: 24, borderRadius: 12, background: avatarBg(proj.pm_name || proj.name), color: '#fff', fontSize: 9, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{initials2(proj.pm_name || proj.name)}</div>
                            <span style={{ fontSize: 12, color: '#374151', fontWeight: 500 }}>{proj.pm_name || '—'}</span>
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px' }} onClick={e => e.stopPropagation()}>
                          <TableActions onEdit={() => navigate(`/projects/${proj.id}/edit`)} onDelete={() => deleteMut.mutate(proj.id)} recordName={proj.name} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* View all button */}
          {visible.length > 0 && tab !== 'all' && (
            <div style={{ textAlign: 'center', padding: '16px 0', borderTop: '1px solid #f1f5f9' }}>
              <button onClick={() => setTab('all')} style={{ padding: '8px 24px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff', color: '#4f46e5', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                View all projects →
              </button>
            </div>
          )}
        </div>

        {/* Bottom analytics */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: 16 }}>

          {/* Portfolio Spend Rate */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <h3 style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', margin: '0 0 16px', textAlign: 'center' }}>Portfolio Spend Rate</h3>
            <SpendDonut spent={kpis.totalSpent} total={kpis.totalValue} />
          </div>

          {/* Active vs Total */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', margin: 0 }}>Active vs Total Projects</h3>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>
                <span style={{ fontWeight: 700, color: '#22c55e' }}>{kpis.active}</span> / {kpis.total}
                <span style={{ marginLeft: 8 }}>{kpis.total > 0 ? Math.round((kpis.active / kpis.total) * 100) : 0}%</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ height: 10, borderRadius: 999, flex: 1, background: '#f1f5f9', overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 999, background: '#22c55e', width: `${kpis.total > 0 ? (kpis.active / kpis.total) * 100 : 0}%`, transition: 'width .4s' }} />
              </div>
            </div>
            <div style={{ height: 140 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} barSize={28}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 12 }} />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {barData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Status Summary */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
            <h3 style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', margin: '0 0 16px' }}>Status Summary</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {[
                ['Active',    kpis.active,    '#22c55e'],
                ['Planning',  kpis.planning,  '#3b82f6'],
                ['Delayed',   kpis.delayed,   '#ef4444'],
                ['On Hold',   kpis.onHold,    '#94a3b8'],
                ['Completed', kpis.completed, '#14b8a6'],
              ].map(([label, value, color], i, arr) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: i < arr.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
                    <span style={{ fontSize: 13, color: '#374151' }}>{label}</span>
                  </div>
                  <span style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>{value}</span>
                </div>
              ))}
            </div>
            <Link to="/projects/new" style={{ display: 'block', marginTop: 16, textAlign: 'center', padding: '9px 0', borderRadius: 10, background: '#ede9fe', color: '#4f46e5', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>
              View full report →
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
}
