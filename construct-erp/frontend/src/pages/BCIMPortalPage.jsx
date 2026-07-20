// src/pages/BCIMPortalPage.jsx
import React, { useState, useEffect } from 'react';
import {
  Monitor, FileText, Share2, FilePlus2, Globe, Building2, Server,
  ArrowUpRight, Search, X,
} from 'lucide-react';

const T = {
  bg:      '#f0f4fb',
  bgMid:   '#e2eaf8',
  gold:    '#a97a10',
  goldLt:  '#c9a227',
  goldMd:  '#b8901a',
  border:  'rgba(0,0,0,0.09)',
  text:    '#0d1f42',
  muted:   '#4b6090',
  dim:     'rgba(0,0,0,0.35)',
};

const APPS = [
  {
    key: 'erp',
    name: 'Construction ERP',
    url: 'https://erp.bcim.in',
    display: 'erp.bcim.in',
    desc: 'Projects, finance, HR, payroll, procurement, QS and subcontractor management — all in one system.',
    icon: Monitor,
    tag: 'Core System',
    accent: '#1E56C8',
    category: 'core',
    thumb: '/app-erp.jpg',
  },
  {
    key: 'greythr',
    name: 'GreytHR',
    url: 'https://bcim.greythr.com',
    display: 'bcim.greythr.com',
    desc: 'Employee self-service for leave, attendance, salary slips and payroll.',
    icon: Building2,
    tag: 'HR & Payroll',
    accent: '#2563EB',
    category: 'core',
    thumb: '/app-greythr.jpg',
  },
  {
    key: 'senddrive',
    name: 'SendDrive',
    url: 'https://senddrive.bcim.in',
    display: 'senddrive.bcim.in',
    desc: 'Share large files and documents securely across teams and external stakeholders.',
    icon: Share2,
    tag: 'File Sharing',
    accent: '#0EA5E9',
    category: 'tools',
    thumb: '/app-senddrive.jpg',
  },
  {
    key: 'pdf',
    name: 'PDF Tools',
    url: 'https://pdf.bcim.in',
    display: 'pdf.bcim.in',
    desc: 'Convert, merge, compress and sign PDF documents instantly in the browser.',
    icon: FilePlus2,
    tag: 'Utilities',
    accent: '#EA580C',
    category: 'tools',
    thumb: '/app-pdf.jpg',
  },
  {
    key: 'website',
    name: 'Company Website',
    url: 'https://site.bcim.in',
    display: 'site.bcim.in',
    desc: "BCIM Engineering's public website — projects, open careers and contact information.",
    icon: Globe,
    tag: 'Public Site',
    accent: '#6366F1',
    category: 'web',
    thumb: '/app-website.jpg',
  },
  {
    key: 'bcimin',
    name: 'BCIM.IN',
    url: 'https://bcim.in',
    display: 'bcim.in',
    desc: 'Main company domain — corporate email, announcements and information hub.',
    icon: FileText,
    tag: 'Main Domain',
    accent: '#60A5FA',
    category: 'web',
    thumb: null,
  },
  {
    key: 'server',
    name: 'BCIM Server',
    url: 'https://bcim.ddns.net:8080',
    display: 'bcim.ddns.net:8080',
    desc: 'Internal network server — site monitoring, cameras and remote system access.',
    icon: Server,
    tag: 'Internal',
    accent: '#94A3B8',
    category: 'web',
    thumb: null,
  },
];

const FILTERS = [
  { id: 'all',   label: 'All Apps' },
  { id: 'core',  label: 'Core'     },
  { id: 'tools', label: 'Tools'    },
  { id: 'web',   label: 'Web'      },
];

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function AppCard({ app, delay }) {
  const [hovered, setHovered] = useState(false);
  const [imgErr, setImgErr]   = useState(false);
  const Icon = app.icon;
  const showThumb = app.thumb && !imgErr;

  return (
    <a
      href={app.url}
      target="_blank"
      rel="noopener noreferrer"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        textDecoration: 'none',
        background: '#ffffff',
        border: `1px solid ${hovered ? app.accent + '66' : T.border}`,
        borderRadius: 16,
        cursor: 'pointer',
        transition: 'all 0.22s ease',
        transform: hovered ? 'translateY(-4px)' : 'none',
        boxShadow: hovered
          ? `0 12px 36px rgba(0,0,0,0.13), 0 0 0 1px ${app.accent}33`
          : '0 1px 5px rgba(0,0,0,0.07)',
        animationDelay: `${delay}ms`,
        animation: 'bp-fadeUp 0.45s ease both',
        overflow: 'hidden',
      }}
    >
      {/* ── Thumbnail ── */}
      {showThumb ? (
        <div style={{ position: 'relative', height: 180, overflow: 'hidden', flexShrink: 0 }}>
          <img
            src={app.thumb}
            alt={app.name}
            onError={() => setImgErr(true)}
            style={{
              width: '100%', height: '100%', objectFit: 'cover',
              transition: 'transform 0.35s ease',
              transform: hovered ? 'scale(1.04)' : 'scale(1)',
              display: 'block',
            }}
          />
          {/* Tag overlay on image */}
          <span style={{
            position: 'absolute', top: 12, right: 12,
            fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
            padding: '4px 10px', borderRadius: 20,
            background: 'rgba(255,255,255,0.92)',
            border: `1px solid ${app.accent}40`,
            color: app.accent,
            backdropFilter: 'blur(6px)',
          }}>
            {app.tag}
          </span>
          {/* Bottom gradient fade */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: 48,
            background: 'linear-gradient(to top, rgba(255,255,255,0.6), transparent)',
          }} />
        </div>
      ) : (
        /* No-image fallback: coloured band */
        <div style={{
          height: 72, flexShrink: 0,
          background: `linear-gradient(135deg, ${app.accent}22 0%, ${app.accent}08 100%)`,
          borderBottom: `1px solid ${app.accent}18`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 20px',
        }}>
          <div style={{
            width: 42, height: 42, borderRadius: 11,
            background: app.accent + '20',
            border: `1px solid ${app.accent}35`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon size={19} color={app.accent} />
          </div>
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
            padding: '3px 10px', borderRadius: 20,
            background: app.accent + '18',
            border: `1px solid ${app.accent}30`,
            color: app.accent,
          }}>
            {app.tag}
          </span>
        </div>
      )}

      {/* ── Body ── */}
      <div style={{ padding: '18px 20px 20px', display: 'flex', flexDirection: 'column', flex: 1 }}>
        {/* Icon row (only when there's a thumb) */}
        {showThumb && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 9, flexShrink: 0,
              background: app.accent + '15',
              border: `1px solid ${app.accent}30`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon size={16} color={app.accent} />
            </div>
          </div>
        )}

        <div style={{ fontSize: 15.5, fontWeight: 700, color: T.text, marginBottom: 2, letterSpacing: '-0.2px' }}>
          {app.name}
        </div>
        <div style={{ fontSize: 11, fontFamily: 'ui-monospace, monospace', color: app.accent, opacity: 0.75, marginBottom: 9 }}>
          {app.display}
        </div>
        <div style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.65, flex: 1, marginBottom: 16 }}>
          {app.desc}
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', gap: 5,
          fontSize: 12, fontWeight: 700,
          color: hovered ? app.accent : T.dim,
          transition: 'color 0.18s',
        }}>
          Open app <ArrowUpRight size={13} />
        </div>
      </div>

      {/* Bottom accent bar on hover */}
      <div style={{
        height: 2.5,
        background: hovered
          ? `linear-gradient(90deg, transparent, ${app.accent}, transparent)`
          : 'transparent',
        transition: 'background 0.22s',
        flexShrink: 0,
      }} />
    </a>
  );
}

export default function BCIMPortalPage() {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const filtered = APPS.filter(a => {
    const fOk = filter === 'all' || a.category === filter;
    const q   = search.toLowerCase();
    const sOk = !q || a.name.toLowerCase().includes(q) || a.display.includes(q) || a.desc.toLowerCase().includes(q);
    return fOk && sOk;
  });

  return (
    <div style={{
      minHeight: '100vh',
      background: T.bg,
      fontFamily: "'Geist Variable', -apple-system, sans-serif",
      position: 'relative',
      overflow: 'hidden',
    }}>
      <style>{`
        @keyframes bp-fadeUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
        @keyframes bp-goldShimmer { 0% { background-position:0% 50%; } 100% { background-position:200% 50%; } }
        @keyframes bp-pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
      `}</style>

      {/* Grid overlay */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: `
          linear-gradient(rgba(0,0,0,0.035) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0,0,0,0.035) 1px, transparent 1px)
        `,
        backgroundSize: '52px 52px',
      }} />

      {/* Diagonal accent band */}
      <div style={{
        position: 'absolute', top: '-10%', right: '-5%',
        width: '40%', height: '130%',
        background: 'linear-gradient(180deg, #dce8ff 0%, #eef3fc 100%)',
        transform: 'skewX(-10deg)', opacity: 0.55, pointerEvents: 'none',
      }} />

      {/* Gold shimmer bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 3,
        background: `linear-gradient(90deg, ${T.gold}, ${T.goldLt}, ${T.goldMd}, ${T.gold})`,
        backgroundSize: '200% 100%',
        animation: mounted ? 'bp-goldShimmer 3s linear infinite' : 'none',
      }} />

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 1200, margin: '0 auto', padding: '48px 28px 72px' }}>

        {/* ── Header ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 48, animation: 'bp-fadeUp 0.4s ease both',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 48, height: 48, borderRadius: 10, overflow: 'hidden',
              background: '#fff', border: `1px solid ${T.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <img src="/bcim-logo.png" alt="BCIM" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 800, color: T.text, letterSpacing: '-0.3px', lineHeight: 1.1 }}>
                BCIM ENGINEERING
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: T.gold, marginTop: 2 }}>
                Private Limited
              </div>
            </div>
          </div>

          <div style={{ position: 'relative', width: 260 }}>
            <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: T.dim, pointerEvents: 'none' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search apps…"
              style={{
                width: '100%', padding: '9px 36px 9px 36px',
                background: '#fff', border: `1px solid ${T.border}`,
                borderRadius: 10, color: T.text, fontSize: 13,
                outline: 'none', fontFamily: 'inherit',
              }}
            />
            {search && (
              <button onClick={() => setSearch('')} style={{
                position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer', color: T.dim,
                display: 'flex', alignItems: 'center',
              }}>
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        {/* ── Hero ── */}
        <div style={{ marginBottom: 36, animation: 'bp-fadeUp 0.45s 0.05s ease both' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%', background: '#4ADE80',
              boxShadow: '0 0 6px #4ADE80',
              animation: 'bp-pulse 3s ease-in-out infinite',
              display: 'inline-block',
            }} />
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#6b8fc4' }}>
              All Applications
            </span>
          </div>
          <h1 style={{ fontSize: 'clamp(26px,3.5vw,40px)', fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1.1, color: T.text, marginBottom: 8 }}>
            {greeting()},&nbsp;
            <span style={{ background: `linear-gradient(90deg, ${T.gold}, ${T.goldLt})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              welcome back
            </span>
          </h1>
          <p style={{ fontSize: 14, color: T.muted, lineHeight: 1.6 }}>
            Every BCIM platform in one place — click any card to launch.
          </p>
        </div>

        {/* ── Filters ── */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 24, animation: 'bp-fadeUp 0.45s 0.1s ease both' }}>
          {FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              style={{
                padding: '7px 18px',
                background: filter === f.id ? `linear-gradient(135deg, ${T.bgMid}, #d4dffa)` : 'transparent',
                border: `1px solid ${filter === f.id ? T.gold + '88' : T.border}`,
                borderRadius: 8,
                color: filter === f.id ? T.gold : T.muted,
                fontSize: 12.5, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
                transition: 'all 0.18s',
                boxShadow: filter === f.id ? `0 0 12px ${T.gold}22` : 'none',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div style={{ height: 1, marginBottom: 28, background: `linear-gradient(90deg, ${T.gold}55, transparent)` }} />

        {/* ── Cards grid ── */}
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: T.muted, fontSize: 14 }}>
            No apps match your search.
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: 18,
          }}>
            {filtered.map((app, i) => (
              <AppCard key={app.key} app={app} delay={i * 55} />
            ))}
          </div>
        )}

        {/* ── Footer ── */}
        <div style={{
          marginTop: 60, paddingTop: 24,
          borderTop: `1px solid ${T.border}`,
          textAlign: 'center',
          fontSize: 11.5, color: T.dim, letterSpacing: '0.04em',
        }}>
          © {new Date().getFullYear()} BCIM Engineering Private Limited &nbsp;·&nbsp; ISO 9001, 14001 &amp; 45001 Certified
        </div>
      </div>
    </div>
  );
}
