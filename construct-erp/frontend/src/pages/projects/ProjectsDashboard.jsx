import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Building2, MapPin, Calendar, IndianRupee, Activity,
  Users, TrendingUp, Clock, CheckCircle2, AlertTriangle,
  LayoutGrid, List, Plus,
} from 'lucide-react';
import { projectAPI } from '../../api/client';
import { clsx } from 'clsx';
import dayjs from 'dayjs';

const crore = v => {
  const n = parseFloat(v || 0);
  if (Math.abs(n) >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
};
const fmt = d => d && dayjs(d).isValid() ? dayjs(d).format('DD MMM YYYY') : '—';

const STATUS_CFG = {
  active:    { label: 'Active',    bg: '#f0fdf4', text: '#16a34a', border: '#bbf7d0', dot: '#16a34a' },
  delayed:   { label: 'Delayed',   bg: '#fff1f2', text: '#e11d48', border: '#fecdd3', dot: '#e11d48' },
  planning:  { label: 'Planning',  bg: '#eff6ff', text: '#2563eb', border: '#bfdbfe', dot: '#2563eb' },
  on_hold:   { label: 'On Hold',   bg: '#fafafa', text: '#737373', border: '#e5e5e5', dot: '#a3a3a3' },
  completed: { label: 'Completed', bg: '#f0fdf4', text: '#15803d', border: '#86efac', dot: '#15803d' },
};

const KPI_TILES = [
  { label: 'Total Projects',   key: 'total',     icon: Building2,    grad: 'linear-gradient(135deg,#6366f1,#818cf8)', text: '#fff' },
  { label: 'Active',           key: 'active',    icon: Activity,     grad: 'linear-gradient(135deg,#22c55e,#4ade80)', text: '#fff' },
  { label: 'Delayed',          key: 'delayed',   icon: AlertTriangle,grad: 'linear-gradient(135deg,#ef4444,#f87171)', text: '#fff' },
  { label: 'Completed',        key: 'completed', icon: CheckCircle2, grad: 'linear-gradient(135deg,#14b8a6,#2dd4bf)', text: '#fff' },
  { label: 'On Hold',          key: 'on_hold',   icon: Clock,        grad: 'linear-gradient(135deg,#94a3b8,#cbd5e1)', text: '#fff' },
  { label: 'Planning',         key: 'planning',  icon: TrendingUp,   grad: 'linear-gradient(135deg,#3b82f6,#60a5fa)', text: '#fff' },
];

export default function ProjectsDashboard() {
  const navigate = useNavigate();
  const [view, setView] = useState('grid');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const { data, isLoading } = useQuery({
    queryKey: ['projects-dashboard'],
    queryFn: () => projectAPI.list({ limit: 200 }).then(r => r.data?.data ?? r.data ?? []),
    staleTime: 2 * 60 * 1000,
  });
  const projects = Array.isArray(data) ? data : (data?.projects ?? []);

  const counts = projects.reduce((acc, p) => {
    acc.total++;
    acc[p.status] = (acc[p.status] || 0) + 1;
    return acc;
  }, { total: 0 });

  const filtered = projects.filter(p => {
    const matchStatus = statusFilter === 'all' || p.status === statusFilter;
    const matchSearch = !search || p.name?.toLowerCase().includes(search.toLowerCase()) ||
                        p.location?.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '16px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>
              Projects
            </p>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', margin: 0 }}>Projects Dashboard</h1>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setView(v => v === 'grid' ? 'list' : 'grid')}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', fontSize: 13, color: '#475569', cursor: 'pointer' }}
            >
              {view === 'grid' ? <List size={14} /> : <LayoutGrid size={14} />}
              {view === 'grid' ? 'List' : 'Grid'}
            </button>
            <button
              onClick={() => navigate('/projects/new')}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, background: '#0ea5e9', border: 'none', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              <Plus size={14} /> New Project
            </button>
          </div>
        </div>
      </div>

      <div style={{ padding: '24px 28px' }}>
        {/* KPI tiles */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 14, marginBottom: 24 }}>
          {KPI_TILES.map(t => {
            const Icon = t.icon;
            return (
              <div
                key={t.key}
                onClick={() => setStatusFilter(t.key === 'total' ? 'all' : t.key)}
                style={{ background: t.grad, borderRadius: 14, padding: '16px 18px', cursor: 'pointer', position: 'relative', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.10)' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{t.label}</span>
                  <Icon size={16} color="rgba(255,255,255,0.75)" />
                </div>
                <div style={{ fontSize: 28, fontWeight: 800, color: '#fff', lineHeight: 1 }}>{counts[t.key] ?? 0}</div>
              </div>
            );
          })}
        </div>

        {/* Filter bar */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, alignItems: 'center' }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search projects..."
            style={{ flex: 1, maxWidth: 300, padding: '8px 14px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none' }}
          />
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            style={{ padding: '8px 14px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, color: '#475569', background: '#fff', cursor: 'pointer' }}
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="planning">Planning</option>
            <option value="delayed">Delayed</option>
            <option value="on_hold">On Hold</option>
            <option value="completed">Completed</option>
          </select>
          <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 4 }}>{filtered.length} projects</span>
        </div>

        {/* Projects */}
        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
            <div style={{ width: 32, height: 32, border: '3px solid #0ea5e9', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
            <Building2 size={40} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
            <p style={{ fontSize: 14 }}>No projects found</p>
          </div>
        ) : view === 'grid' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
            {filtered.map(p => <ProjectCard key={p.id} project={p} onClick={() => navigate(`/projects/${p.id}`)} />)}
          </div>
        ) : (
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  {['Project', 'Status', 'Location', 'Contract Value', 'Start', 'End'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((p, i) => {
                  const s = STATUS_CFG[p.status] || STATUS_CFG.planning;
                  return (
                    <tr key={p.id} onClick={() => navigate(`/projects/${p.id}`)}
                      style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer', background: i % 2 ? '#fafafa' : '#fff' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f0f9ff'}
                      onMouseLeave={e => e.currentTarget.style.background = i % 2 ? '#fafafa' : '#fff'}
                    >
                      <td style={{ padding: '12px 16px', fontWeight: 600, color: '#0f172a' }}>{p.name}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: s.bg, color: s.text, border: `1px solid ${s.border}` }}>{s.label}</span>
                      </td>
                      <td style={{ padding: '12px 16px', color: '#64748b' }}>{p.location || '—'}</td>
                      <td style={{ padding: '12px 16px', color: '#0f172a', fontWeight: 600, fontFamily: 'monospace' }}>{crore(p.contract_value)}</td>
                      <td style={{ padding: '12px 16px', color: '#64748b' }}>{fmt(p.start_date)}</td>
                      <td style={{ padding: '12px 16px', color: '#64748b' }}>{fmt(p.end_date)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function ProjectCard({ project: p, onClick }) {
  const s = STATUS_CFG[p.status] || STATUS_CFG.planning;
  const pct = Math.min(100, Math.max(0, parseFloat(p.overall_progress ?? p.progress_percent ?? 0)));
  return (
    <div
      onClick={onClick}
      style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', borderTop: `3px solid ${s.dot}`, padding: 20, cursor: 'pointer', transition: 'box-shadow 0.15s', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.10)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.06)'}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: '0 0 4px', lineHeight: 1.3 }}>{p.name}</p>
          {p.location && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#94a3b8', fontSize: 11 }}>
              <MapPin size={10} /> {p.location}
            </div>
          )}
        </div>
        <span style={{ flexShrink: 0, marginLeft: 8, padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700, background: s.bg, color: s.text, border: `1px solid ${s.border}`, textTransform: 'uppercase' }}>{s.label}</span>
      </div>

      {/* Progress */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 11, color: '#64748b' }}>Progress</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: s.dot }}>{pct.toFixed(0)}%</span>
        </div>
        <div style={{ height: 5, background: '#f1f5f9', borderRadius: 99, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: s.dot, borderRadius: 99, transition: 'width 0.4s' }} />
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div style={{ background: '#f8fafc', borderRadius: 8, padding: '8px 10px' }}>
          <p style={{ fontSize: 10, color: '#94a3b8', margin: '0 0 2px', textTransform: 'uppercase', fontWeight: 600 }}>Contract Value</p>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', margin: 0, fontFamily: 'monospace' }}>{crore(p.contract_value)}</p>
        </div>
        <div style={{ background: '#f8fafc', borderRadius: 8, padding: '8px 10px' }}>
          <p style={{ fontSize: 10, color: '#94a3b8', margin: '0 0 2px', textTransform: 'uppercase', fontWeight: 600 }}>Completion</p>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', margin: 0 }}>{fmt(p.end_date)}</p>
        </div>
      </div>
    </div>
  );
}
