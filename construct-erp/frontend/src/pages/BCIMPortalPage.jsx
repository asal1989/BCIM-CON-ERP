// src/pages/BCIMPortalPage.jsx
import React, { useState, useEffect } from 'react';
import {
  Monitor, FileText, Share2, FilePlus2, Globe, Building2, Server,
  ArrowUpRight, Search, X,
} from 'lucide-react';

/* ── Theme tokens (light) ──────────────────────────────── */
const T = {
  navy:    '#f0f4fb',
  navyMid: '#e2eaf8',
  gold:    '#a97a10',
  goldLt:  '#c9a227',
  goldMd:  '#b8901a',
  border:  'rgba(0,0,0,0.09)',
  text:    '#0d1f42',
  muted:   '#4b6090',
  dim:     'rgba(0,0,0,0.35)',
};

/* ── App definitions ───────────────────────────────────── */
const APPS = [
  {
    key: 'erp',
    name: 'Construction ERP',
    url: 'https://erp.bcim.in',
    display: 'erp.bcim.in',
    desc: 'Projects, finance, HR, payroll, procurement, QS and subcontractor management — all in one system.',
    icon: Monitor,
    tag: 'Core System',
    accent: '#4A7CF5',
    category: 'core',
  },
  {
    key: 'greythr',
    name: 'GreytHR',
    url: 'https://bcim.greythr.com',
    display: 'bcim.greythr.com',
    desc: 'Employee self-service for leave, attendance, salary slips and payroll.',
    icon: Building2,
    tag: 'HR & Payroll',
    accent: '#A78BFA',
    category: 'core',
  },
  {
    key: 'senddrive',
    name: 'SendDrive',
    url: 'https://senddrive.bcim.in',
    display: 'senddrive.bcim.in',
    desc: 'Share large files and documents securely across teams and external stakeholders.',
    icon: Share2,
    tag: 'File Sharing',
    accent: '#34D399',
    category: 'tools',
  },
  {
    key: 'pdf',
    name: 'PDF Tools',
    url: 'https://pdf.bcim.in',
    display: 'pdf.bcim.in',
    desc: 'Convert, merge, compress and sign PDF documents instantly in the browser.',
    icon: FilePlus2,
    tag: 'Utilities',
    accent: '#FB923C',
    category: 'tools',
  },
  {
    key: 'website',
    name: 'Company Website',
    url: 'https://site.bcim.in',
    display: 'site.bcim.in',
    desc: "BCIM Engineering's public website — projects, open careers and contact information.",
    icon: Globe,
    tag: 'Public Site',
    accent: '#818CF8',
    category: 'web',
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
  },
];

const FILTERS = [
  { id: 'all',  label: 'All Apps' },
  { id: 'core', label: 'Core'     },
  { id: 'tools',label: 'Tools'    },
  { id: 'web',  label: 'Web'      },
];

/* ── Greeting ──────────────────────────────────────────── */
function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/* ── AppCard ───────────────────────────────────────────── */
function AppCard({ app, delay }) {
  const [hovered, setHovered] = useState(false);
  const Icon = app.icon;

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
        background: hovered
          ? `linear-gradient(145deg, #e8eef8, #dce6f5)`
          : '#ffffff',
        border: `1px solid ${hovered ? app.accent + '55' : T.border}`,
        borderRadius: 14,
        padding: '22px 22px 20px',
        cursor: 'pointer',
        transition: 'all 0.22s ease',
        transform: hovered ? 'translateY(-3px)' : 'none',
        boxShadow: hovered ? `0 8px 28px rgba(0,0,0,0.1), 0 0 0 1px ${app.accent}33` : '0 1px 4px rgba(0,0,0,0.07)',
        animationDelay: `${delay}ms`,
        animation: 'bp-fadeUp 0.45s ease both',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Accent glow on hover */}
      {hovered && (
        <div style={{
          position: 'absolute', top: -40, right: -40,
          width: 120, height: 120, borderRadius: '50%',
          background: app.accent + '14',
          pointerEvents: 'none',
        }} />
      )}

      {/* Top row: icon + tag */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{
          width: 42, height: 42, borderRadius: 10, flexShrink: 0,
          background: app.accent + '18',
          border: `1px solid ${app.accent}35`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={18} color={app.accent} />
        </div>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
          padding: '3px 9px', borderRadius: 20,
          background: app.accent + '18',
          border: `1px solid ${app.accent}30`,
          color: app.accent,
        }}>
          {app.tag}
        </span>
      </div>

      {/* Name */}
      <div style={{ fontSize: 15.5, fontWeight: 700, color: T.text, marginBottom: 3, letterSpacing: '-0.2px' }}>
        {app.name}
      </div>

      {/* URL */}
      <div style={{ fontSize: 11, fontFamily: 'ui-monospace, monospace', color: app.accent, opacity: 0.7, marginBottom: 10 }}>
        {app.display}
      </div>

      {/* Desc */}
      <div style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.6, flex: 1, marginBottom: 18 }}>
        {app.desc}
      </div>

      {/* Open link */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: hovered ? 7 : 5,
        fontSize: 12, fontWeight: 700,
        color: hovered ? app.accent : T.dim,
        transition: 'all 0.18s',
      }}>
        Open app <ArrowUpRight size={13} />
      </div>

      {/* Bottom gold border on hover */}
      {hovered && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: 2,
          background: `linear-gradient(90deg, transparent, ${app.accent}, transparent)`,
        }} />
      )}
    </a>
  );
}

/* ── Main page ─────────────────────────────────────────── */
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
      background: T.navy,
      fontFamily: "'Inter', -apple-system, sans-serif",
      position: 'relative',
      overflow: 'hidden',
    }}>
      <style>{`
        @keyframes bp-fadeUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
        @keyframes bp-goldShimmer {
          0%   { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
        @keyframes bp-pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
      `}</style>

      {/* Grid pattern overlay */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: `
          linear-gradient(rgba(0,0,0,0.04) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0,0,0,0.04) 1px, transparent 1px)
        `,
        backgroundSize: '52px 52px',
      }} />

      {/* Diagonal accent */}
      <div style={{
        position: 'absolute', top: '-10%', right: '-5%',
        width: '40%', height: '130%',
        background: `linear-gradient(180deg, #dce8ff 0%, #eef3fc 100%)`,
        transform: 'skewX(-10deg)', opacity: 0.6, pointerEvents: 'none',
      }} />

      {/* Gold bar top */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 3,
        background: `linear-gradient(90deg, ${T.gold}, ${T.goldLt}, ${T.goldMd}, ${T.gold})`,
        backgroundSize: '200% 100%',
        animation: mounted ? 'bp-goldShimmer 3s linear infinite' : 'none',
      }} />

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 1160, margin: '0 auto', padding: '48px 28px 72px' }}>

        {/* ── Header ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 52,
          animation: 'bp-fadeUp 0.4s ease both',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 48, height: 48, borderRadius: 10, overflow: 'hidden',
              background: '#ffffff',
              border: `1px solid ${T.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <img src="/bcim-logo.png" alt="BCIM" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 800, color: T.text, letterSpacing: '-0.3px', lineHeight: 1.1 }}>
                BCIM ENGINEERING
              </div>
              <div style={{
                fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase',
                color: T.gold, marginTop: 2,
              }}>
                Private Limited
              </div>
            </div>
          </div>

          {/* Search */}
          <div style={{ position: 'relative', width: 260 }}>
            <Search size={14} style={{
              position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
              color: T.dim, pointerEvents: 'none',
            }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search apps…"
              style={{
                width: '100%', padding: '9px 36px 9px 36px',
                background: '#ffffff',
                border: `1px solid ${T.border}`,
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

        {/* ── Hero text ── */}
        <div style={{ marginBottom: 40, animation: 'bp-fadeUp 0.45s 0.05s ease both' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%', background: '#4ADE80',
              boxShadow: '0 0 6px #4ADE80',
              animation: 'bp-pulse 3s ease-in-out infinite',
              display: 'inline-block',
            }} />
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(130,165,255,0.8)' }}>
              All Applications
            </span>
          </div>
          <h1 style={{
            fontSize: 'clamp(26px,3.5vw,40px)', fontWeight: 800, letterSpacing: '-0.04em',
            lineHeight: 1.1, color: T.text, marginBottom: 8,
          }}>
            {greeting()},&nbsp;
            <span style={{
              background: `linear-gradient(90deg, ${T.gold}, ${T.goldLt})`,
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>
              welcome back
            </span>
          </h1>
          <p style={{ fontSize: 14, color: T.muted, lineHeight: 1.6 }}>
            Every BCIM platform in one place — click any card to launch.
          </p>
        </div>

        {/* ── Filter tabs ── */}
        <div style={{
          display: 'flex', gap: 6, marginBottom: 28,
          animation: 'bp-fadeUp 0.45s 0.1s ease both',
        }}>
          {FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              style={{
                padding: '7px 18px',
                background: filter === f.id ? `linear-gradient(135deg, ${T.navyMid}, #d4dffa)` : 'transparent',
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

        {/* ── Gold divider ── */}
        <div style={{
          height: 1, marginBottom: 28,
          background: `linear-gradient(90deg, ${T.gold}55, transparent)`,
        }} />

        {/* ── Cards grid ── */}
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: T.muted, fontSize: 14 }}>
            No apps match your search.
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: 14,
          }}>
            {filtered.map((app, i) => (
              <AppCard key={app.key} app={app} delay={i * 55} />
            ))}
          </div>
        )}

        {/* ── Footer ── */}
        <div style={{
          marginTop: 56, paddingTop: 24,
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
